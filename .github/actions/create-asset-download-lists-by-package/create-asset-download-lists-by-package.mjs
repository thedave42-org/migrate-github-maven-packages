import axios from 'axios';
import fs from 'fs';
import xml2js from 'xml2js';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import { Octokit } from "@octokit/core";
import * as core from '@actions/core';
import bjson from 'big-json';
import consoleStamp from 'console-stamp';

// Add a timestamp to the console logs
consoleStamp(console, { 
    format: ':date(yyyy/mm/dd HH:MM:ss.l)' 
});

// Create a variable to store the list of created JSON files
const createdFiles = [];

// Create xml2js parser
const parser = new xml2js.Parser();

// Set the organization
const org = (process.env.FROM_ORG != undefined) ? process.env.FROM_ORG : core.getInput('from-org');
const token = (process.env.FROM_ORG_PAT != undefined) ? process.env.FROM_ORG_PAT : core.getInput('from-org-pat');
const baseUrl = (process.env.GITHUB_MAVEN_URL != undefined) ? process.env.GITHUB_MAVEN_URL : core.getInput('github-maven-url');
const graphQlQuerySize = (process.env.GRAPHQL_QUERY_SIZE != undefined) ? process.env.GRAPHQL_QUERY_SIZE : core.getInput('graphql-query-size');
const graphQLQueryDelay = (process.env.GRAPHQL_QUERY_DELAY != undefined) ? process.env.GRAPHQL_QUERY_DELAY : core.getInput('graphql-query-delay');
const rootDirectory = process.env.GITHUB_WORKSPACE;

// Variable to hold page number for recusion
let pageNumber = 0;

// Set the options for the axios request
const options = {
    headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/xml' // or 'text/xml'
    }
};

// Initialize Octokit
const octokit = new Octokit({
    auth: token,
});

// Create a method that waits for a specified number of milliseconds
const wait = (ms) => {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};


// Create method to recursively get all the versions of a package
const fetchFileNames = async (pkg, version, files = null, cursor = null,) => {
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
    const response = await octokit.graphql(query);

    // Log the files
    response.repository.packages.nodes[0].version.files.nodes.forEach(file => {
        files.push(file);
    });

    // If there are more pages, fetch the next page
    const pageInfo = response.repository.packages.nodes[0].version.files.pageInfo;
    if (pageInfo.hasNextPage) {
        console.log(`\t\t\tFetching page ${++pageNumber} of files for version ${version} of package ${pkg.name}.`);
        await wait(graphQLQueryDelay);
        files = await fetchFileNames(pkg, version, files, pageInfo.endCursor);
    }

    return files;
}

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
    const response = await octokit.graphql(query);

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
    // Get a list of all Maven packages from a GitHub organization
    const response = await octokit.request(`GET /orgs/${org}/packages?package_type=maven`);
    const packages = response.data;

    // Loop through each package in the array
    for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        // Construct the URL to retrieve the maven-metadata.xml file
        const fullName = pkg.repository.full_name;
        const name = pkg.name.split('.').join('/');
        const packageUrl = `${baseUrl}/${fullName}/${name}/maven-metadata.xml`;

        // Download the maven-metadata.xml file with the version list
        const versionList = await axios.get(packageUrl, options);

        // Create a JSON object to store the package data
        const pkgFileData = {
            name: pkg.name,
            repository: pkg.repository.name,
            owner: pkg.owner.login,
            repositoryFullName: pkg.repository.full_name,
            metadataUrl: packageUrl,
            versions: []
        };

        // Get a list of the versions from the maven-metadata.xml file
        const metadataXml = await parser.parseStringPromise(versionList.data);
        const versions = metadataXml.metadata.versioning[0].versions[0].version;
        let files = [];

        console.log(`Starting processing of package ${pkg.name}. Found ${versions.length} versions.`);

        // Loop through each version in the array and find its file assets
        for (let i = 0; i < versions.length; i++) {
            const version = versions[i];

            console.log(`\tStarting version ${version} of package ${pkg.name}...`); 

            // Get all the file assets for the version
            pageNumber = 1;
            files = [];
            files = await fetchFileNames(pkg, version, files);
            const versionData = {
                version: version,
                files: files
            };

            // if the version contain the word SNAPSHOT, download the maven-metadata.xml file with file list
            let versionList = null;
            if (version.includes('SNAPSHOT')) {
                const packageVersionUrl = `${baseUrl}/${fullName}/${name}/${version}/maven-metadata.xml`;
                //versionList = await axios.get(packageVersionUrl, options);
                versionData.snapshotMetadataUrl = packageVersionUrl;
            }

            // Add the version asset data to the package data
            pkgFileData.versions.push(versionData);

            console.log(`\tVersion ${version} of package ${pkg.name} has been processed. Found ${versionData.files.length} files.`);        
        };

        // Create a JSON file named pkg.name.json with the files
        const fileName = `${rootDirectory}/${pkg.name}.json`;
        const outputStream = fs.createWriteStream(fileName);

        const stringifyStream = bjson.createStringifyStream({
            body: pkgFileData
        });
    
        const writeData = (d) => {
            let result = outputStream.write(d);
            if (!result) {
                outputStream.once('drain', writeData);
            }
        }
    
        stringifyStream.on('data', (chunk) => {
            writeData(chunk);
        });
    
        stringifyStream.on('end',  () => {
            outputStream.end();
        });

        createdFiles.push(fileName);
        console.log(`Package ${pkg.name} is complete processing.`);
    };
    
    // Set the list of created JSON files as the Action output
    core.setOutput('packages', JSON.stringify(createdFiles));
})();