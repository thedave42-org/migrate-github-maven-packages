@echo off

where /q gh
if %errorlevel% neq 0 (
    echo GitHub CLI (gh) could not be found. Please install it before running this script.
    exit /b
)
echo This script will set the FROM_ORG_PAT and TO_ORG_PAT secrets.
echo For the FROM_ORG_PAT, a PAT with the following permissions is required:
echo repo:status, read:packages
set /p FROM_ORG_PAT="Enter the FROM_ORG_PAT: "
echo For the TO_ORG_PAT, a PAT with the following permissions is required:
echo write:packages
set /p TO_ORG_PAT="Enter the TO_ORG_PAT: "
echo %FROM_ORG_PAT% | gh secret set FROM_ORG_PAT
echo %TO_ORG_PAT% | gh secret set TO_ORG_PAT