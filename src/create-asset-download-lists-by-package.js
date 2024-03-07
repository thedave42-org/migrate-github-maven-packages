import axios from 'axios';
import fs from 'fs';
import xml2js from 'xml2js';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import { Octokit } from "@octokit/core";

// Create xml2js parser
const parser = new xml2js.Parser();

// Set the organization
const org = process.env.FROM_ORG;

// Get the credentials
const options = {
    headers: {
        Authorization: `Bearer ${process.env.FROM_ORG_PAT}`,
        Accept: 'application/xml' // or 'text/xml'
    }
};

// Initialize Octokit
const octokit = new Octokit({
    auth: process.env.FROM_ORG_PAT,
});

// Create method to recursively get all the versions of a package
const fetchFiles = async (pkg, version, files = null, cursor = null,) => {
    const query = `
        query { 
            repository(owner:"${pkg.owner.login}", name:"${pkg.repository.name}") { 
                packages(names: ["${pkg.name}"], first: 1) {
                    nodes {
                        name
                        version(version: "${version}") {
                            files(first: 100, after: ${JSON.stringify(cursor)}) {
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
        files = await fetchFiles(pkg, version, files, pageInfo.endCursor);
    }

    return files;
}

(async () => {
    const response = await octokit.request(`GET /orgs/${org}/packages?package_type=maven`);
    const packages = response.data;

    // Loop through each object in the array
    packages.forEach(async (pkg) => {
        // Construct the URL
        const baseUrl = process.env.GITHUB_MAVEN_URL;
        const fullName = pkg.repository.full_name;
        const name = pkg.name.split('.').join('/');
        const packageUrl = `${baseUrl}${fullName}/${name}/maven-metadata.xml`;

        // Download the maven-metadata.xml file with the version list
        const versionList = await axios.get(packageUrl, options);

        const pkgFileData = {
            name: pkg.name,
            repository: pkg.repository.name,
            owner: pkg.owner.login,
            repositoryFullName: pkg.repository.full_name,
            metadataURl: packageUrl,
            metadataXml: versionList.data,
            versions: []
        };

        const metadataXml = await parser.parseStringPromise(versionList.data);
        const versions = metadataXml.metadata.versioning[0].versions[0].version;
        let files = [];

        for (let i = 0; i < versions.length; i++) {
            const version = versions[i];
            console.log(pkg.name, version);

            // Fetch all files
            files = await fetchFiles(pkg, version, files);
            const versionData = {
                version: version,
                files: files
            };

            // if the version contain the word SNAPSHOT, download the maven-metadata.xml file with file list
            let versionList = null;
            if (version.includes('SNAPSHOT')) {
                const packageVersionUrl = `${baseUrl}${fullName}/${name}/${version}/maven-metadata.xml`;
                versionList = await axios.get(packageVersionUrl, options);
                versionData.snapshotMetadataUrl = packageVersionUrl;
                versionData.snapshotMetadataXml = versionList.data;
            }
            pkgFileData.versions.push(versionData);

            console.log(`Package: ${pkg.name} Version: ${version} has been processed.`);        
        };

        // Create a JSON file named pkg.name.json with the files
        fs.writeFileSync(`../${pkg.name}.json`, JSON.stringify(pkgFileData, null, 2));
        console.log(`Package: ${pkg.name} is complete processing.`);
    });
})();