# GitHub Packages Maven Migrator

The repository provides an IssueOps based tool for migrating Maven packages between two GitHub Organization.  It is a template repository which will allow you to create a private version of itself under your control.  The tool works by having you create issues in the GitHub repo based on a form template where you specify the source and destination Organizations.  The tool will initially run a check to gather a list of packages in your source Organization and provide a list of those packages that you can select for migration. The tool will let you know if the correct location exists in the destination Organization for you to be able to migrate the package.

### Setup

To get started using the tool you need to provide it with a personal access token with read access to the source Organization and a second token with write access to the destination Organization.  The tokens can either be set up in the GitHub UI directly by going to [editing the Actions Secrets in the repositories settings](/settings/secrets/actions).

> Note: Currently the API used to migrate the packages require a Classic PAT

The token used for the source Organization needs to be named `FROM_ORG_PAT` and should have the following permissions:

![image](https://github.com/thedave42-org/migrate-github-maven-packages/assets/50186003/e15aaad1-6a4b-4e52-a5b2-ad1d4dcf9cc6)

The token used for the destination Organization needs to be named `TO_ORG_PAT` and should have the following permissions:

![image](https://github.com/thedave42-org/migrate-github-maven-packages/assets/50186003/a4de7b03-5cb3-469d-b16c-f342b161dac3)


