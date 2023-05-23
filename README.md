# op-sync-with-sharepoint-service

Service that syncs data from OP to defined read-only Sharepoint lists.

This service uses parts of the code of the [delta-producer-publication-graph-maintainer](https://github.com/lblod/delta-producer-publication-graph-maintainer), mostly to handle the initial sync and the healing.
However it's not based on the same assumptions. Here, we have a defined "consumer" that we control. We don't put some
data to be available at the responsability of the consumer. Because of that specificity, we don't need to have and maintain a publication graph, which simplifies parts of the code.

We have three different sync ways:
- Initial sync: happens only once, when the sync is setup. It ensures that we have a way of matching data of our database with data of the sharepoint list, and then does a big diff to see what data needs to be deletes or inserted in the list. This job is created by an instance of [delta-producer-background-jobs-initiator](https://github.com/lblod/delta-producer-background-jobs-initiator)
- Healing: on a regular basis, checks the diff between the list and our database and correct it if it finds errors. [delta-producer-background-jobs-initiator](https://github.com/lblod/delta-producer-background-jobs-initiator)
- Delta sync: everytime there is a change in the database, we receive a delta message from the [deltanotifier](https://github.com/mu-semtech/delta-notifier)

## How to

Add the following to your stack:

```
  sync-with-sharepoint:
    image: lblod/op-sync-with-sharepoint-service
    environment:
      USERNAME: '<user@name>'
      PASSWORD: '<pwd>'
      SITE: '<site>'
      LIST: '<list>'
      SHAREPOINT_UUID_FIELD_NAME: 'fieldName'
      SOURCE_GRAPHS: 'http://mu.semte.ch/graphs/graph-1,http://mu.semte.ch/graphs/graph-2'
    links:
      - db:database
```