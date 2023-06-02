export const LOG_INCOMING_DELTA = process.env.LOG_INCOMING_DELTA || false;

export const PREFIXES = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX oslc: <http://open-services.net/ns/core#>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dbpedia: <http://dbpedia.org/resource/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX generiek: <https://data.vlaanderen.be/ns/generiek#>
`;

export const ERROR_URI_PREFIX = "http://redpencil.data.gift/id/jobs/error/";

export const JOBS_GRAPH =
  process.env.JOBS_GRAPH || "http://mu.semte.ch/graphs/system/jobs";
export const JOB_TYPE = "http://vocab.deri.ie/cogs#Job";
export const TASK_TYPE = "http://redpencil.data.gift/vocabularies/tasks/Task";

export const STATUS_BUSY =
  "http://redpencil.data.gift/id/concept/JobStatus/busy";
export const STATUS_SCHEDULED =
  "http://redpencil.data.gift/id/concept/JobStatus/scheduled";
export const STATUS_SUCCESS =
  "http://redpencil.data.gift/id/concept/JobStatus/success";
export const STATUS_FAILED =
  "http://redpencil.data.gift/id/concept/JobStatus/failed";

export const ERROR_TYPE = "http://open-services.net/ns/core#Error";
export const DELTA_ERROR_TYPE =
  "http://redpencil.data.gift/vocabularies/deltas/Error";
export const ERROR_CREATOR_URI =
  process.env.ERROR_CREATOR_URI ||
  "http://lblod.data.gift/services/op-sync-with-sharepoint";

//task operation of interest
export const INITIAL_SYNC_TASK_OPERATION =
  "http://redpencil.data.gift/id/jobs/concept/TaskOperation/sp-sync/initialSyncing";
export const HEALING_TASK_OPERATION =
  "http://redpencil.data.gift/id/jobs/concept/TaskOperation/sp-sync/healing";

export const QUEUE_POLL_INTERVAL = process.env.QUEUE_POLL_INTERVAL || 60000;

// Mainly for debugging purposes
export const WAIT_FOR_INITIAL_SYNC =
  process.env.WAIT_FOR_INITIAL_SYNC == "false" ? false : true;

if (!process.env.INITIAL_SYNC_JOB_OPERATION)
  throw `Expected 'INITIAL_SYNC_JOB_OPERATION' should be provided.`;
export const INITIAL_SYNC_JOB_OPERATION =
  process.env.INITIAL_SYNC_JOB_OPERATION;

if (!process.env.HEALING_JOB_OPERATION)
  throw `Expected 'HEALING_JOB_OPERATION' should be provided.`;
export const HEALING_JOB_OPERATION = process.env.HEALING_JOB_OPERATION;

/*
 * START EXPERIMENTAL FEATURES
 */

// SKIP MU_AUTH
export const USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS =
  process.env.USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS == "true" ? true : false;
export const VIRTUOSO_ENDPOINT =
  process.VIRTUOSO_ENDPOINT || "http://triplestore:8890/sparql";
export const MU_AUTH_ENDPOINT =
  process.MU_AUTH_ENDPOINT || "http://db:8890/sparql";

/*
 * END EXPERIMENTAL FEATURES
 */

// Sharepoint credentials

if (!process.env.USERNAME) throw `Expected 'USERNAME' to be provided.`;
export const USERNAME = process.env.USERNAME;

if (!process.env.PASSWORD) throw `Expected 'PASSWORD' to be provided.`;
export const PASSWORD = process.env.PASSWORD;

// Sharepoint list info

if (!process.env.LIST) throw `Expected 'LIST' to be provided.`;
export const LIST = process.env.LIST;

if (!process.env.SITE) throw `Expected 'SITE' to be provided.`;
export const SITE = process.env.SITE;

if (!process.env.SHAREPOINT_UUID_FIELD_NAME)
  throw `Expected 'SITE' to be provided.`;
export const SHAREPOINT_UUID_FIELD_NAME =
  process.env.SHAREPOINT_UUID_FIELD_NAME;

// Retry mechanism

export const RETRY = process.env.RETRY == "false" ? false : true;
export const RETRY_MAX_ATTEMPTS = parseInt(process.env.RETRY_MAX_ATTEMPTS || 3);
export const RETRY_TIMEOUT_INCREMENT_FACTOR = parseFloat(
  process.env.RETRY_TIMEOUT_INCREMENT_FACTOR || 0.3
);
