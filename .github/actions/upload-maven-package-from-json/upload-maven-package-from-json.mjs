import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import axios from 'axios';
import fs from 'fs';
import xml2js from 'xml2js';
import path from 'path';
import { Octokit } from "@octokit/core";
import * as core from '@actions/core';
import bjson from 'big-json';
import consoleStamp from 'console-stamp';
import { argv } from 'node:process';
import { PassThrough } from 'stream';

// Create xml2js parser
const parser = new xml2js.Parser();

// Set the organization
const fromToken = (process.env.FROM_ORG_PAT != undefined) ? process.env.FROM_ORG_PAT : core.getInput('from-org-pat');
const toOrg = (process.env.TO_ORG != undefined) ? process.env.TO_ORG : core.getInput('to-org');
const toToken = (process.env.TO_ORG_PAT != undefined) ? process.env.TO_ORG_PAT : core.getInput('to-org-pat');
const baseUrl = (process.env.GITHUB_MAVEN_URL != undefined) ? process.env.GITHUB_MAVEN_URL : core.getInput('github-maven-url');
const graphQlQuerySize = (process.env.GRAPHQL_QUERY_SIZE != undefined) ? process.env.GRAPHQL_QUERY_SIZE : core.getInput('graphql-query-size');
const graphQLQueryDelay = (process.env.GRAPHQL_QUERY_DELAY != undefined) ? process.env.GRAPHQL_QUERY_DELAY : core.getInput('graphql-query-delay');
const packageImportJsonFile = (argv[2] != undefined) ? argv[2] : core.getInput('package-import-json-file');
const rootDirectory = process.env.GITHUB_WORKSPACE;

// Exit with error message if there is no packageImportJsonFile
if (packageImportJsonFile == '') {
    console.error(`Usage: node ${argv[1].split(path.sep).pop()} <package-import-json-file>`);
    process.exit(1);
}

// Add a timestamp to the console logs
consoleStamp(console, { 
    format: ':date(yyyy/mm/dd HH:MM:ss.l)' 
});

// Variable to hold page number for recusion
let pageNumber = 0;

// Set the options for the axios request
const fromOptions = {
    headers: {
        Authorization: `Bearer ${fromToken}`,
        Accept: 'application/xml' // or 'text/xml'
    }
};

const toOptions = {
    headers: {
        Authorization: `Bearer ${toToken}`,
        Accept: 'application/xml' // or 'text/xml'
    }
};

// Initialize Octokit
const fromOctokit = new Octokit({
    auth: fromToken,
});

const toOctokit = new Octokit({
    auth: toToken,
});

// Create a method that waits for a specified number of milliseconds
const wait = (ms) => {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};

// Create method to recursively get all the versions of a package
const fetchFileAssetUrls = async (pkg, version, files = null, cursor = null,) => {
    const query = `
        query { 
            repository(owner:"${pkg.owner.login}", name:"${pkg.repository.name}") { 
                packages(names: ["${pkg.name}"], first: 1) {
                    nodes {
                        name
                        version(version: "${version}") {
                            files(first: ${graphQlQuerySize}, after: ${JSON.stringify(cursor)}) {
                                nodes {
                                    name
                                    url
                                }    
                                pageInfo {
                                    endCursor
                                    hasNextPage
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    // Make the GraphQL request
    const response = await fromOctokit.graphql(query);

    // Log the files
    response.repository.packages.nodes[0].version.files.nodes.forEach(file => {
        files.push(file);
    });

    // If there are more pages, fetch the next page
    const pageInfo = response.repository.packages.nodes[0].version.files.pageInfo;
    if (pageInfo.hasNextPage) {
        await wait(graphQLQueryDelay);
        files = await fetchFileAssetUrls(pkg, version, files, pageInfo.endCursor);
    }

    return files;
}

(async () => {
    // This might need to change based on input files being too large
    const packageImportJson = JSON.parse(fs.readFileSync(packageImportJsonFile, 'utf8'));

    // Check if the repository already exists in the target organization
    const repoExists = await toOctokit.request('GET /repos/{owner}/{repo}', {
        owner: toOrg,
        repo: packageImportJson.repository,
    }).then(() => {
        return true;
    }).catch(() => {
        return false;
    });
    
    // If the repository does not exist, log that and exit
    if (!repoExists) {
        console.error(`The repository ${packageImportJson.repository} does not exist in the organization ${toOrg}.`);
        console.error(`Please migrate the repository from the organization ${packageImportJson.owner} to the organization ${toOrg} before importing the package.`);
        core.setOutput('error', `The repository ${packageImportJson.repository} does not exist in the organization ${toOrg}. Please migrate the repository from the organization ${packageImportJson.owner} to the organization ${toOrg} before importing the package.`);
        process.exit(1);
    }

    console.log(`The repository ${packageImportJson.repository} exists in the organization ${toOrg}.`);
    console.log(`Starting import of ${packageImportJson.versions.length} versions...`);
    let files = [];

    // Use a for loop to loop through the versions
    for (let i = 0; i < packageImportJson.versions.length; i++) {
        const version = packageImportJson.versions[i];
        const pkg = {
            owner: {
                login: packageImportJson.owner
            },
            repository: {
                name: packageImportJson.repository
            },
            name: packageImportJson.name
        };

        // Get the files for the package version
        files = [];
        files = await fetchFileAssetUrls(pkg, version.version, files);

        // Log the files
        console.log(`\tVersion ${version.version} has ${files.length} files.`);

        // For loop to loop through the files
        for (let j = 0; j < files.length; j++) {
            const file = files[j];
            const fileUrl = file.url;
            const fileName = file.name;
            const uploadUrl = `${baseUrl}/${toOrg}/${packageImportJson.repository}/${packageImportJson.name.replace('.', '/')}/${version.version}/${fileName}`;
            const filePath = `${rootDirectory}/${fileName}`;

            const writer = fs.createWriteStream(filePath);

            const fileResponse = await axios.get(fileUrl, {
                responseType: 'stream',
                headers: {
                    Authorization: `Bearer ${fromToken}`
                }
            });
            
            fileResponse.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            // Upload the file
            const fileStream = fs.createReadStream(filePath);
            
            const uploadResponse = await axios.put(uploadUrl, fileStream, {
                headers: {
                    Authorization: `Bearer ${toToken}`,
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': fileResponse.headers['content-length']
                }
            });

            console.log(`\t\t${j+1} file${(j>0)?'s':''} copied. ${fileName}`)
            
            // Delete the file
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`\t\tFailed to delete local copy of ${fileName}`);
                    console.error(err);
                }
            });
        }
    }
})();