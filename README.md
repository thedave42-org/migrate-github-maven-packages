# GitHub Packages Maven Migrator

The repository provides an IssueOps based tool for migrating Maven packages between two GitHub Organization.  It is a template repository which will allow you to create a private version of itself under your control.  The tool works by having you create issues in the GitHub repo based on a form template where you specify the source and destination Organizations.  The tool will initially run a check to gather a list of packages in your source Organization and provide a list of those packages that you can select for migration. The tool will let you know if the correct location exists in the destination Organization for you to be able to migrate the package.

