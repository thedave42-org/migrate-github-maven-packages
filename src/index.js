const axios = require('axios');
const path = require('path');
const xml2js = require('xml2js');
require('dotenv').config();
import { Octokit } from "@octokit/core";

// Read the JSON file
const data = fs.readFileSync('../maven-packages.json');
const packages = JSON.parse(data);

// Get the credentials
const options = {
    headers: {
        Authorization: `Bearer ${process.env.FROM_ORG_PAT}`,
        Accept: 'application/xml' // or 'text/xml'
    }
};

// Initialize Octokit
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

// Loop through each object in the array
packages.forEach(async (pkg) => {
    // Construct the URL
    const baseUrl = process.env.GITHUB_MAVEN_URL;
    const fullName = pkg.repository.full_name;
    const name = pkg.name.split('.').join('/');
    const packageUrl = `${baseUrl}/${fullName}/${name}/maven-metadata.xml`;

    // Download the maven-metadata.xml file
    const versionList = await axios.get(packageUrl, options);
    fs.writeFileSync('maven-metadata.xml', versionList.data);

    // Read the list of versions from maven-metadata.xml
    const data = fs.readFileSync('maven-metadata.xml');
    xml2js.parseString(data, (err, result) => {
        if (err) throw err;

        const versions = result.metadata.versioning[0].versions[0].version;
        versions.forEach(async (version) => {
            console.log(pkg.name, version);
            const packageVersionUrl = `${baseUrl}/${fullName}/${name}/${version}/maven-metadata.xml`;
            console.log(packageVersionUrl);
            const query = `
            query { 
                repository(owner:"${pkg.owner.login}", name:"${pkg.repository.name}") { 
                packages(names: ["${pkg.name}"], first: 1) {
                    nodes {
                    name
                    version(version: "${version}") {
                        files(first: 1) {
                        nodes {
                            name
                            url
                        }
                        }
                    }
                    }
                }
                }
            }`;
    
            // Make the GraphQL request
            const response = await octokit.graphql(query);
            console.log(response);     
        });
    });
});