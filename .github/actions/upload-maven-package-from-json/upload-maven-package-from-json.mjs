import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import axios from 'axios';
import crypto from 'crypto';
import fs, { exists } from 'fs';
import xml2js from 'xml2js';
import path from 'path';
import { Octokit } from "@octokit/core";
import * as core from '@actions/core';
import consoleStamp from 'console-stamp';
import { argv } from 'node:process';

// Create xml2js parser
const parser = new xml2js.Parser();

// Set the organization
const fromToken = (process.env.FROM_ORG_PAT != undefined && process.env.FROM_ORG_PAT != '') ? process.env.FROM_ORG_PAT : core.getInput('from-org-pat');
const toToken = (process.env.TO_ORG_PAT != undefined && process.env.TO_ORG_PAT != '') ? process.env.TO_ORG_PAT : core.getInput('to-org-pat');
const baseUrl = (process.env.GITHUB_MAVEN_URL != undefined && process.env.GITHUB_MAVEN_URL != '') ? process.env.GITHUB_MAVEN_URL : core.getInput('github-maven-url');
const graphQlQuerySize = (process.env.GRAPHQL_QUERY_SIZE != undefined && process.env.GRAPHQL_QUERY_SIZE != '') ? process.env.GRAPHQL_QUERY_SIZE : core.getInput('graphql-query-size');
const graphQLQueryDelay = (process.env.GRAPHQL_QUERY_DELAY != undefined && process.env.GRAPHQL_QUERY_DELAY != '') ? process.env.GRAPHQL_QUERY_DELAY : core.getInput('graphql-query-delay');
const packageImportJsonFile = (argv[2] != undefined) ? argv[2] : core.getInput('package-import-json-file');
const rootDirectory = process.env.GITHUB_WORKSPACE;

// Exit with error message if there is no packageImportJsonFile
if (packageImportJsonFile == '') {
    console.error(`Usage: node ${argv[1].split(path.sep).pop()} <package-import-json-file>`);
    process.exit(1);
}

// Add a timestamp to the console logs when not running in Actions
if (core.getInput('from-org-pat') === '') {
    consoleStamp(console, {
        format: ':date(yyyy/mm/dd HH:MM:ss.l)'
    });
}

// Variable to hold page number for recusion
let pageNumber = 0;

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

const hashFile = (path) => {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(path);
    hash.update(data);
    return hash.digest('hex');
};

const signatureTypes = ['md5', 'sha1', 'sha256'];

const isSignatureFile = (fileName) => {
    return signatureTypes.some(type => fileName.toLowerCase().endsWith(type));
};

const isSnapshot = (versionName) => {
    return versionName.includes('SNAPSHOT');
};

const downloadFile = async (fileUrl, filePath, token) => {
    const writer = fs.createWriteStream(filePath);

    const fileResponse = await axios.get(fileUrl, {
        responseType: 'stream',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    fileResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', (error) => {
            fs.unlinkSync(filePath);
            reject(error);
        });
    });
    return fileResponse;
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
                            files(first: ${graphQlQuerySize}, after: ${JSON.stringify(cursor)}, orderBy: {field: CREATED_AT, direction: ASC}) {
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

const removeSignatureTypesFromMavenVersionMetadata = (mavenVersionMetadata) => {
    const xml = fs.readFileSync(mavenVersionMetadata, 'utf8');
    
    // Parse XML to JS object
    xml2js.parseString(xml, (err, result) => {
        if (err) {
            throw err;
        }
    
        // Filter snapshotVersions
        result.metadata.versioning[0].snapshotVersions[0].snapshotVersion = result.metadata.versioning[0].snapshotVersions[0].snapshotVersion.filter(snapshotVersion => {
            return !signatureTypes.some(type => snapshotVersion.extension[0].includes(type));
        });
    
        // Convert JS object back to XML
        const builder = new xml2js.Builder();
        const xml = builder.buildObject(result);
    
        // Write updated XML back to the file
        fs.writeFileSync(mavenVersionMetadata, xml);
    });
}

const retryUpload = async (uploadUrl, fileStream, headers, maxRetries = 5, retryDelay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const uploadResponse = await axios.put(uploadUrl, fileStream, headers);
            //console.log(`\t${i+1}: File uploaded.`);
            return uploadResponse;
        } catch (error) {
            console.error(`Upload failed. Attempt ${i + 1} of ${maxRetries}. Retrying in ${retryDelay}ms...`);
            if (i < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    throw new Error('Upload failed after maximum retries.');
}

(async () => {
    // This might need to change based on input files being too large
    const packageImportJson = JSON.parse(fs.readFileSync(packageImportJsonFile, 'utf8'));

    // Check if the repository already exists in the target organization
    const repoExists = await toOctokit.request('GET /repos/{owner}/{repo}', {
        owner: packageImportJson.toOwner,
        repo: packageImportJson.repository,
    }).then(() => {
        return true;
    }).catch(() => {
        return false;
    });

    // If the repository does not exist, log that and exit
    if (!repoExists) {
        console.error(`The repository ${packageImportJson.repository} does not exist in the organization ${packageImportJson.toOwner}.`);
        console.error(`Please migrate the repository from the organization ${packageImportJson.owner} to the organization ${packageImportJson.toOwner} before importing the package.`);
        core.setOutput('error', `The repository ${packageImportJson.repository} does not exist in the organization ${packageImportJson.toOwner}. Please migrate the repository from the organization ${packageImportJson.owner} to the organization ${packageImportJson.toOwner} before importing the package.`);
        process.exit(1);
    }

    console.log(`The repository ${packageImportJson.repository} exists in the organization ${packageImportJson.toOwner}.`);
    console.log(`Starting import of ${packageImportJson.versions.length} versions...`);

    // Use downloadFile to download maven-metadata.xml file from source repository
    const mavenMetadataUrl = `${baseUrl}/${packageImportJson.repositoryFullName}/${packageImportJson.name.replace('.', '/')}/maven-metadata.xml`;
    try {
        await downloadFile(mavenMetadataUrl, `${rootDirectory}/maven-metadata.xml`, fromToken);
    }
    catch (error) {
        console.error(`Error downloading maven-metadata.xml file from ${mavenMetadataUrl}.`);
        console.error(error);
        process.exit(1);
    }

    let files = [];

    const results = {
        filesUploaded: 0,
        filesExistAndMatch: 0,
        filesExistAndNoMatch: 0,
        signatureAssetInSource: 0
    };

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

        let metadataVersionFile, metadataVersionFilePath, mavenMetadataVersionUrl;

        if (isSnapshot(version.version)) {
            // Use downloadFile to download the maven-metadata.xml for the version
            metadataVersionFile = `maven-metadata-${version.version}.xml`;
            metadataVersionFilePath = `${rootDirectory}/${metadataVersionFile}`;
            mavenMetadataVersionUrl = `${baseUrl}/${packageImportJson.repositoryFullName}/${packageImportJson.name.replaceAll('.', '/')}/${version.version}/maven-metadata.xml`;
            try {
                await downloadFile(mavenMetadataVersionUrl, metadataVersionFile, fromToken);
            }
            catch (error) {
                console.error(`Error downloading version maven-metadata.xml file from ${mavenMetadataVersionUrl}.`);
                console.error(error);
            }
        }

        // Get the files for the package version
        files = [];
        files = await fetchFileAssetUrls(pkg, version.version, files);
        const numberOfFiles = files.length;

        // Log the files
        console.log(`Version ${version.version} has ${numberOfFiles} files.  Starting migration of files...`);

        // For loop to loop through the files
        for (let j = 0; j < numberOfFiles; j++) {
            let fileResponse;
            let file = files[j];
            let fileName = file.name;
            let uploadUrl = `${baseUrl}/${packageImportJson.toOwner}/${packageImportJson.repository}/${packageImportJson.name.replaceAll('.', '/')}/${version.version}/${fileName}`;
            let filePath = `${rootDirectory}/${fileName}`;

            try {
                fileResponse = await downloadFile(file.url, filePath, fromToken);
            } catch (error) {
                files = [];
                console.log(`\tRefreshing download tokens...`);
                files = await fetchFileAssetUrls(pkg, version.version, files);
                console.log(`\tTokens refreshed. Version ${version.version} has ${files.length} files.`);
                file = files[j];
                fileName = file.name;
                uploadUrl = `${baseUrl}/${packageImportJson.toOwner}/${packageImportJson.repository}/${packageImportJson.name.replaceAll('.', '/')}/${version.version}/${fileName}`;
                filePath = `${rootDirectory}/${fileName}`;
                fileResponse = await downloadFile(file.url, filePath, fromToken);
            }

            try {
                const downloadPath = `${filePath}_download`;
                let downloadResult;
                try {
                    downloadResult = await downloadFile(uploadUrl, downloadPath, toToken);
                } catch (error) {
                    fs.unlinkSync(downloadPath);
                    throw error;
                }

                // Compare the hashes of the downloaded file and the local file
                const downloadHash = hashFile(downloadPath);
                const localHash = hashFile(filePath);

                if (downloadHash === localHash) {
                    console.log(`\t${j + 1}: ${fileName} not uploaded. File already exists and is the same.`);
                    results.filesExistAndMatch++;
                } else {
                    console.log(`\t${j + 1}: ${fileName} not uploaded. File already exists but is different.`);
                    results.filesExistAndNoMatch++;
                }

                // Delete the downloaded file
                fs.unlinkSync(downloadPath);
            } catch (error) {
                try {
                    // If the file is not found, upload the file
                    const fileStream = fs.createReadStream(filePath);

                    //const uploadResponse = await axios.put(uploadUrl, fileStream, {
                    const uploadResponse = await retryUpload(uploadUrl, fileStream, {
                        headers: {
                            Authorization: `Bearer ${toToken}`,
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': fs.statSync(filePath).size
                        }
                    });

                    console.log(`\t${j + 1}: ${fileName} uploaded. (${fs.statSync(filePath).size} bytes)`);
                    results.filesUploaded++;
                }
                catch (error) {
                    console.log(`\t${j + 1}: ${fileName} failed to upload.`);
                }
            }

            if (isSignatureFile(fileName)) {
                results.signatureAssetInSource++;
            }

            //Delete the file
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`\t\tFailed to delete local copy of ${fileName}`);
                    console.error(err);
                }
            });
        }

        if (isSnapshot(version.version)) {
            // Remove the signatureTypes from the version metadata file and upload to the destination repository
            try {
                removeSignatureTypesFromMavenVersionMetadata(metadataVersionFilePath);

                console.log(`\tMaven version metadata for version ${version.version} updated.`);

                const metadataVersionUploadUrl = `${baseUrl}/${packageImportJson.toOwner}/${packageImportJson.repository}/${packageImportJson.name.replaceAll('.', '/')}/${version.version}/maven-metadata.xml`;
                const metadataVersionFileStream = fs.createReadStream(metadataVersionFilePath);

                const uploadResponse = await retryUpload(metadataVersionUploadUrl, metadataVersionFileStream, {
                    headers: {
                        Authorization: `Bearer ${toToken}`,
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': fs.statSync(metadataVersionFilePath).size
                    }
                });

                console.log(`\tVersion metadata for ${version.version} uploaded.`);

                //Delete the file
                fs.unlink(metadataVersionFilePath, (err) => {
                    if (err) {
                        console.error(`\t\tFailed to delete local copy of ${metadataVersionFilePath}`);
                        console.error(err);
                    }
                });
            }
            catch (error) {
                console.error(`\t${metadataVersionFile} failed to upload.`);
                console.error(error);
            }

        }

        fs.unlink(`${rootDirectory}/maven-metadata.xml`, (err) => {
            if (err) {
                console.error(`\tFailed to delete local copy of maven-metadata.xml`);
                console.error(err);
            }
        });
        
        console.log(`Version ${version.version} migration complete.`);
    }

    core.setOutput('results', results);
})();
