import axios from 'axios';
import fs from 'fs';
import xml2js from 'xml2js';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import { Octokit } from "@octokit/core";
import * as core from '@actions/core';
import bjson from 'big-json';
import consoleStamp from 'console-stamp';
import { argv } from 'node:process';

// Add a timestamp to the console logs
consoleStamp(console, { 
    format: ':date(yyyy/mm/dd HH:MM:ss.l)' 
});

// Create xml2js parser
const parser = new xml2js.Parser();

// Set the organization
const org = (process.env.FROM_ORG != undefined) ? process.env.FROM_ORG : core.getInput('from-org');
const token = (process.env.FROM_ORG_PAT != undefined) ? process.env.FROM_ORG_PAT : core.getInput('from-org-pat');
const baseUrl = (process.env.GITHUB_MAVEN_URL != undefined) ? process.env.GITHUB_MAVEN_URL : core.getInput('github-maven-url');
const graphQlQuerySize = (process.env.GRAPHQL_QUERY_SIZE != undefined) ? process.env.GRAPHQL_QUERY_SIZE : core.getInput('graphql-query-size');
const graphQLQueryDelay = (process.env.GRAPHQL_QUERY_DELAY != undefined) ? process.env.GRAPHQL_QUERY_DELAY : core.getInput('graphql-query-delay');
const packageImportJsonFile = (argv[2] != undefined) ? argv[2] : core.getInput('package-import-json-file');
const rootDirectory = process.env.GITHUB_WORKSPACE;

// Exit with error message if there is no packageImportJsonFile
if (packageImportJsonFile == '') {
    console.error('No package-import.json file specified.');
    process.exit(1);
}

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
    const packageImportJson = JSON.parse(fs.readFileSync(packageImportJsonFile, 'utf8'));

})();