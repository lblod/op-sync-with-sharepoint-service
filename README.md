
<a name="readme-top"></a>

<br />
<div align="center">
  <h1 align="center">op-sync-with-sharepoint-service/h1>
  <p align="center">
    Service that syncs data from OP to defined read-only Sharepoint lists.
    <br />
    <a href="https://github.com/lblod/op-sync-with-sharepoint-service/issues">Report Bug</a>
    ·
    <a href="https://github.com/lblod/op-sync-with-sharepoint-service/pulls">Open PR</a>
  </p>
</div>


## 📖 Description

This service uses parts of the code of the [delta-producer-publication-graph-maintainer](https://github.com/lblod/delta-producer-publication-graph-maintainer), mostly to handle the initial sync and the healing.
However it's not based on the same assumptions. Here, we have a defined "consumer" that we control. We don't put some
data to be available at the responsability of the consumer. Because of that specificity, we don't need to have and maintain a publication graph, which simplifies parts of the code.

We have three different sync ways:
- Initial sync: happens only once, when the sync is setup. It does a big diff to see what data needs to be deleted or inserted in the list. This job is created by an instance of [delta-producer-background-jobs-initiator](https://github.com/lblod/delta-producer-background-jobs-initiator)
- Healing: on a regular basis, checks the diff between the list and our database and correct it if it finds errors. [delta-producer-background-jobs-initiator](https://github.com/lblod/delta-producer-background-jobs-initiator)
- Delta sync: everytime there is a change in the database, we receive a delta message from the [deltanotifier](https://github.com/mu-semtech/delta-notifier)

### 📦 Related services

This service relies on deltas to get triggered, and jobs are initiated by the delta-producer-background-jobs-initiator. Its implementation is highly inspired of the delta-producer-publication-graph-maintainer. The following services are closely related to this one:

- [delta-notifier](https://github.com/mu-semtech/delta-notifier)
- [delta-producer-background-jobs-initiator](https://github.com/lblod/delta-producer-background-jobs-initiator)
- [delta-producer-publication-graph-maintainer](https://github.com/lblod/delta-producer-publication-graph-maintainer)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## ⏩ Quick setup

### 🐋 Docker-compose.yml
```yaml
  sync-with-sharepoint:
    image: lblod/op-sync-with-sharepoint-service
    environment:
      INITIAL_SYNC_JOB_OPERATION: "http://redpencil.data.gift/id/jobs/concept/JobOperation/sp-sync/initialSyncing/example"
      HEALING_JOB_OPERATION: "http://redpencil.data.gift/id/jobs/concept/JobOperation/sp-sync/healingOperation/example"
      USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS: "true"
      USERNAME: '<user@name>'
      PASSWORD: '<pwd>'
      SITE: '<site>'
      LIST: '<list>'
      SHAREPOINT_URI_FIELD_NAME: 'fieldName'
    links:
      - db:database
    volumes:
      - ./config/sharepoint/sync/organizations/:/config/
    labels:
	  - "logging=true"
    restart: always
    logging: *default-logging
```

### 🗒️ Config

#### Delta notifier

Add the following rules. One for the job graph, and then one per graph where we store data that needs to be synced to the sharepoint list.

```js
  {
    match: {
      graph: {
        type: 'uri',
        value: 'http://mu.semte.ch/graphs/jobs'
      }
    },
    callback: {
      url: 'http://organizations-sync-with-sharepoint/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 1000,
      ignoreFromSelf: true,
      optOutMuScopeIds: [ "http://redpencil.data.gift/id/concept/muScope/deltas/initialSync" ]
    }
  },
  {
    match: {
      graph: {
        type: 'uri',
        value: 'http://mu.semte.ch/graphs/shared'
      }
    },
    callback: {
      url: 'http://organizations-sync-with-sharepoint/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 1000,
      ignoreFromSelf: true,
      optOutMuScopeIds: [ "http://redpencil.data.gift/id/concept/muScope/deltas/initialSync" ]
    }
  },
  {
    match: {
      graph: {
        type: 'uri',
        value: 'http://mu.semte.ch/graphs/administrative-unit'
      }
    },
    callback: {
      url: 'http://organizations-sync-with-sharepoint/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 1000,
      ignoreFromSelf: true,
      optOutMuScopeIds: [ "http://redpencil.data.gift/id/concept/muScope/deltas/initialSync" ]
    }
  }
```

#### Jobs controller configuration

As new jobs are added, the jobs controller also needs to be configured

```json
  "http://redpencil.data.gift/id/jobs/concept/JobOperation/sp-sync/initialSyncing/example": {
    "tasksConfiguration": [
      {
        "currentOperation": null,
        "nextOperation": "http://redpencil.data.gift/id/jobs/concept/TaskOperation/sp-sync/initialSyncing",
        "nextIndex": "0"
      }
    ]
  },
  "http://redpencil.data.gift/id/jobs/concept/JobOperation/sp-sync/healingOperation/example": {
    "tasksConfiguration": [
      {
        "currentOperation": null,
        "nextOperation": "http://redpencil.data.gift/id/jobs/concept/TaskOperation/sp-sync/healing",
        "nextIndex": "0"
      }
    ]
  }
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>


## 🔑 Environment variables

| ENV  | description | default | required |
|---|---|---|---|
| INITIAL_SYNC_JOB_OPERATION | URI of the job operation for the intial sync | | X |
| HEALING_JOB_OPERATION | URI of the job operation for the healing | | X |
| USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS | Bypass mu-auth for selects that are too heavy  | `false` | |
| USERNAME | Username used to login to the sharepoint list | | X |
| PASSWORD | Password used to login to the sharepoint list | | X |
| SITE | Uri of the sharepoint site where the list is stored | | X |
| LIST | Name of the list to update | | X |
| SHAREPOINT_URI_FIELD_NAME | Name of the sharepoint list field where we store the URI of the administrative unit, used to map local data to sharepoint data | | X |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Configuration

You manage the definition of how to map sharepoint fields to our triplestore properties by creating a folder containing json files with config options. A basic option has been given above, here is a more advanced configuration to fit your needs.

#### Mapping configuration

This configuration file, mounted in the docker-compose snippet, indicates how to sync data from the application to the sharepoint list. You can find below a very minimal example of configuration. Here are some explanations on the meaning of the properties:
- `sourceGraphs`: the array of graphs in which the data to update to the list reside in
- `objects`: the mapping objects to consider when mapping data from the two different sources
  - `type`: the type of the resource in the triplestore
  - `mappings`: the different properties of the resource that we want to map
    - `op`: the URI of the property
    - `sl`: the (technical and hidden) name of the field in the sharepoint list
  - `pathToMatchingUri`: the path from the resource to the URI used to match triplestore resources to

`/config/sharepoint/sync/example/config.json`
```json
{
  "sourceGraphs": [
    "http://mu.semte.ch/graphs/public"
  ],
  "objects": [
    {
      "type": "http://data.vlaanderen.be/ns/besluit#Bestuurseenheid",
      "mappings": [
        {
          "op": ["http://www.w3.org/2004/02/skos/core#prefLabel"],
          "sl": "Title",
        },
        {
          "op": ["http://www.w3.org/ns/regorg#orgStatus", "http://www.w3.org/2004/02/skos/core#prefLabel"],
          "sl": "Organisatiestatus"
        }
      ],
      "pathToMatchingUri": "?s a <http://data.vlaanderen.be/ns/besluit#Bestuurseenheid> . BIND (?s as ?matchingUri)"
    }
  ]
}
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>
