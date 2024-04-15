#!/bin/bash

if ! command -v gh &> /dev/null
then
    echo "GitHub CLI (gh) could not be found. Please install it before running this script."
    exit
fi

echo "This script will set the FROM_ORG_PAT and TO_ORG_PAT secrets."
echo "For the FROM_ORG_PAT, a PAT with the following permissions is required:"
echo "repo:status, read:packages"
echo "Enter the FROM_ORG_PAT:"
read FROM_ORG_PAT
echo "For the TO_ORG_PAT, a PAT with the following permissions is required:"
echo "write:packages"
echo "Enter the TO_ORG_PAT:"
read TO_ORG_PAT

echo "$FROM_ORG_PAT" | gh secret set FROM_ORG_PAT
echo "$TO_ORG_PAT" | gh secret set TO_ORG_PAT