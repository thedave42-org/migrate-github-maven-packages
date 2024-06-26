# GitHub Packages Maven Migrator

The repository provides an IssueOps based tool for migrating Maven packages between two GitHub Organization.  It is a template repository which will allow you to create a private version of itself under your control.  The tool works by having you create issues in the GitHub repo based on a form template where you specify the source and destination Organizations.  The tool will initially run a check to gather a list of packages in your source Organization and provide a list of those packages that you can select for migration. The tool will let you know if the correct location exists in the destination Organization for you to be able to migrate the package.

### Setup

To get started using the tool you can select to use the repository as a template and create it in either the destination or source organizaiton.  The tool requires two personal access tokens - one with read access to the source Organization and a second token with write access to the destination Organization.  The tokens can either be set up in the GitHub UI directly by [editing the Actions Secrets in the repositories settings](../../settings/secrets/actions), or you can use the `set-pats` scripts provided in this repository in the `scripts` folder.  These use the [GitHub CLI](https://cli.github.com/) to setup the secrets and do not require access to the Settings tab in the UI.

> Note: Currently the API used to migrate the packages require a Classic PAT

The token used for the source Organization needs to be named `FROM_ORG_PAT` and should have the following permissions:

![image](https://github.com/thedave42-org/migrate-github-maven-packages/assets/50186003/e15aaad1-6a4b-4e52-a5b2-ad1d4dcf9cc6)

The token used for the destination Organization needs to be named `TO_ORG_PAT` and should have the following permissions:

![image](https://github.com/thedave42-org/migrate-github-maven-packages/assets/50186003/a4de7b03-5cb3-469d-b16c-f342b161dac3)

### How to use

To start a migration create a new Issue using the [template for a Maven Migration](../../issues/new?template=maven-migration.yml).  Fill out the source and destination organizations, and create the Issue.  The issue will start an Actions workflow that will do an inventory of all the Maven packages in your source organization and update the body of the issue with a list of those packages.  The migration is controlled by adding labels to the Issue.  To migrate packages between organizations, select the packages from the list you like to migrate and add the label `start-migration` to the Issue.  This will start a new action workflow that will begin the migration process.  During the migration the Issue will be updated with the label `in-progress`, and as each package migration completes a status will be added as a comment to the Issue.  When all selected packages have finished migrating, the workflow will post the migration logs for each package as another comment on the Issue.
