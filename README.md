migrate-github-maven-packages

GitHub Maven url: https://maven.pkg.github.com/OWNER/REPOSITORY

base url: https://maven.pkg.github.com/

github maven name: com.issc29.javaapp.actions-java-example

baseurl / groupid as directory / artifact id

url: https://maven.pkg.github.com/octodemo/actions-java-example/com/issc29/javaapp/actions-java-example/maven-metadata.xml

curl -L -H "Accept: application/vnd.github+json" -H "Authorization: Bearer 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" https://maven.pkg.github.com/octodemo/actions-java-example/com/issc29/javaapp/actions-java-example/maven-metadata.xml

1. use the gh cli like this - gh api "orgs/octodemo/packages?package_type=maven" - to get a json of the packages that exist in an org and then save that response as a file
2. create a nodejs app that reads a json file, and loops through each of the objects within the array.  An example of that json file is here #file:maven-packages.json
3. for each item as the loop runs we will create a url and download a maven-metadata.xml file
4. The url will be created from from the base url read from the environment variable GITHUB_MAVEN_URL, the repository.full_name from the downloaded json file, and the name from the downloaded json file. The name must be split into an array based on the separator . and the joined back together into a string with the seperator /. Finally the filename "/maven-metadata.xml" should be appended to create the full url.
5. Then use the url to download and save the file maven-metadata.xml
6. read the list of versions from maven-metadata.xml. The list of versions is available within the <versions> tag. An example of the structure of maven-metadata is available in #file:maven-metadata.xml
