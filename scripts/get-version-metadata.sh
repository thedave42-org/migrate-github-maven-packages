source .env

GH_TOKEN=$FROM_ORG_PAT

# `${baseUrl}/${fullName}/${name}/maven-metadata.xml`
# Download metadata.xml: https://maven.pkg.github.com/jidicula/maven-minimal/com/mycompany/app/maven-minimal/maven-metadata.xml
# note this is the metadata.xml for the package.
# Upload metadata.xml: https://maven.pkg.github.com/jidicula/maven-minimal/com/mycompany/app/maven-minimal/1.0-SNAPSHOT/maven-metadata.xml

echo $GH_TOKEN

# curl -X GET "https://maven.pkg.github.com/octodemo/java-springboot-demo/net/codejava/salesmanager/maven-metadata.xml" \
#   -H "Accept: application/vnd.github+json" \
#   -H "Authorization bearer $GH_TOKEN" \
#   -H "X-GitHub-Api-Version: 2022-11-28" \
#   -o maven

curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $FROM_ORG_PAT" \
  https://maven.pkg.github.com/octodemo/java-springboot-demo/net/codejava/salesmanager/maven-metadata.xml \
  -o maven-metadata.xml

curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $FROM_ORG_PAT" \
  https://maven.pkg.github.com/octodemo/java-springboot-demo/net/codejava/salesmanager/0.0.6-SNAPSHOT/maven-metadata.xml \
  -o maven-metadata-0.0.6-SNAPSHOT.xml
