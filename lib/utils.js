import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
} from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  HEALING_JOB_OPERATION,
  HEALING_TASK_OPERATION,
  INITIAL_SYNC_JOB_OPERATION,
  INITIAL_SYNC_TASK_OPERATION,
  JOB_TYPE,
  PREFIXES,
  STATUS_BUSY,
  STATUS_SCHEDULED,
  STATUS_SUCCESS,
  TASK_TYPE,
  CONFIG,
  ERROR_URI_PREFIX,
  JOBS_GRAPH,
  ERROR_TYPE,
  DELTA_ERROR_TYPE,
  ERROR_CREATOR_URI,
} from "../env-config.js";
import { Delta } from "./delta";

export async function doesDeltaContainNewTaskToProcess(deltaPayload) {
  const entries = new Delta(deltaPayload).getInsertsFor(
    "http://www.w3.org/ns/adms#status",
    STATUS_SCHEDULED
  );
  let containsNewTask = false;

  for (let entry of entries) {
    if (await isNewTaskOfInterest(entry)) {
      containsNewTask = true;
    }
  }

  return containsNewTask;
}

export async function hasInitialSyncRun() {
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?job WHERE {
      GRAPH ?g {
        ?job a ${sparqlEscapeUri(JOB_TYPE)};
          task:operation ${sparqlEscapeUri(INITIAL_SYNC_JOB_OPERATION)};
          adms:status ${sparqlEscapeUri(STATUS_SUCCESS)}.
      }
    }
  `;
  const result = await query(queryString);
  return result.results.bindings.length;
}

export async function isBlockingJobActive() {
  const queryString = `
    ${PREFIXES}
    SELECT DISTINCT ?job WHERE {
      GRAPH ?g {
        ?job a ${sparqlEscapeUri(JOB_TYPE)};
          task:operation ?operation;
          adms:status ?status.
      }
      FILTER( ?status IN (
        ${sparqlEscapeUri(STATUS_SCHEDULED)},
        ${sparqlEscapeUri(STATUS_BUSY)}
      ))
      FILTER( ?operation IN (
        ${sparqlEscapeUri(INITIAL_SYNC_JOB_OPERATION)},
        ${sparqlEscapeUri(HEALING_JOB_OPERATION)}
      ))
    }
  `;
  const result = await query(queryString);
  return result.results.bindings.length;
}

async function isNewTaskOfInterest(taskUri) {
  const queryString = `
    ${PREFIXES}

    SELECT DISTINCT ?job ?task WHERE {
      BIND(${sparqlEscapeUri(taskUri)} as ?task)
      GRAPH ?g {
        ?job a ${sparqlEscapeUri(JOB_TYPE)};
          task:operation ?jobOperation.

        ?task dct:isPartOf ?job;
          a ${sparqlEscapeUri(TASK_TYPE)};
          task:operation ?taskOperation;
          adms:status ${sparqlEscapeUri(STATUS_SCHEDULED)}.
      }
      FILTER( ?taskOperation IN (
        ${sparqlEscapeUri(INITIAL_SYNC_TASK_OPERATION)},
        ${sparqlEscapeUri(HEALING_TASK_OPERATION)}
      ))
      FILTER( ?jobOperation IN (
        ${sparqlEscapeUri(INITIAL_SYNC_JOB_OPERATION)},
        ${sparqlEscapeUri(HEALING_JOB_OPERATION)}
      ))
    }
  `;

  const result = await query(queryString);
  return result.results.bindings.length > 0;
}

export async function isInitialSyncOrHealingJobScheduled() {
  const queryString = `
    ${PREFIXES}

    SELECT DISTINCT ?job ?task WHERE {
      GRAPH ?g {
        ?job a ${sparqlEscapeUri(JOB_TYPE)};
          task:operation ?jobOperation.

        ?task dct:isPartOf ?job;
          a ${sparqlEscapeUri(TASK_TYPE)};
          task:operation ?taskOperation;
          adms:status ${sparqlEscapeUri(STATUS_SCHEDULED)}.
      }
      FILTER( ?taskOperation IN (
        ${sparqlEscapeUri(INITIAL_SYNC_TASK_OPERATION)},
        ${sparqlEscapeUri(HEALING_TASK_OPERATION)}
      ))
      FILTER( ?jobOperation IN (
        ${sparqlEscapeUri(INITIAL_SYNC_JOB_OPERATION)},
        ${sparqlEscapeUri(HEALING_JOB_OPERATION)}
      ))
    }
  `;

  const result = await query(queryString);
  return result.results.bindings.length > 0;
}

/**
 * Constructs a string to embed in a SPARQL query to filter on source graphs
 * provided via the configuration.
 *
 * @param {String} graphName Name of the graph variable
 * @returns A SPARQL filter on the source graphs
 */
export function constructGraphsFilter(graphName) {
  const escapedSourceGraphs = CONFIG.sourceGraphs.map((sourceGraph) =>
    sparqlEscapeUri(sourceGraph)
  );
  const graphsFilterStr = `FILTER(?${graphName} IN ( ${escapedSourceGraphs.join(
    ", "
  )}))`;
  return graphsFilterStr;
}

/**
 * We need to get only the values that are in the predefined source graphs.
 * But sometime the paths spead accross multiple graphs, so we split the path
 * to be able to force the ?value to be in our source graphs.
 *
 * Examples:
 *   1. Only one value in the path ["http://www.w3.org/2004/02/skos/core#prefLabel"]
 *      Output will be:
 *        ```
 *        GRAPH ?graph {
 *          ?subject <http://www.w3.org/2004/02/skos/core#prefLabel> ?o .
 *        }
 *        ```
 *   2. More than one value in the path
 *      ["http://www.w3.org/ns/org#classification", "http://www.w3.org/2004/02/skos/core#prefLabel"]
 *      We only set the latest part of the path in the graph, the rest could be spread over multiple graphs
 *      Output will be:
 *        ```
 *        ?subject <http://www.w3.org/ns/org#classification> ?intermediaryResource .
 *        GRAPH ?graph {
 *          ?intermediaryResource <http://www.w3.org/2004/02/skos/core#prefLabel> ?o .
 *        }
 *        ```
 */
export function constructPathInAndOutOfSourceGraphs(
  path,
  graphName,
  subject = ""
) {
  // Deep copy of the path to avoid modifying the config object
  const clonedPath = JSON.parse(JSON.stringify(path));
  const pathPortionInSourceGraphs = constructPredicatePath([clonedPath.pop()]);
  const pathPotentiallyOutsideSourceGraphs = constructPredicatePath(clonedPath);

  let pathInAndOutOfSourceGraphs;
  if (pathPotentiallyOutsideSourceGraphs.length) {
    pathInAndOutOfSourceGraphs = `
      ${
        subject ? sparqlEscapeUri(subject) : "?s"
      } ${pathPotentiallyOutsideSourceGraphs} ?intermediaryResource .

      GRAPH ?${graphName} {
        ?intermediaryResource ${pathPortionInSourceGraphs} ?o .
      }
    `;
  } else {
    pathInAndOutOfSourceGraphs = `
      GRAPH ?${graphName} {
        ${sparqlEscapeUri(subject)} ${pathPortionInSourceGraphs} ?o .
      }
    `;
  }
  return pathInAndOutOfSourceGraphs;
}

export function constructPredicatePath(arrayPath) {
  let stringifiedPath = arrayPath.map((predicate) => {
    if (predicate[0] == "^") {
      return `^${sparqlEscapeUri(predicate.slice(1))}`;
    } else {
      return `${sparqlEscapeUri(predicate)}`;
    }
  });
  stringifiedPath = stringifiedPath.join("/");
  return stringifiedPath;
}

/**
 * convert results of select query to an array of objects.
 * courtesy: Niels Vandekeybus & Felix
 * @method parseResult
 * @return {Array}
 */
export function parseResult(result) {
  if (!(result.results && result.results.bindings.length)) return [];

  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    bindingKeys.forEach((key) => {
      if (
        row[key] &&
        row[key].datatype == "http://www.w3.org/2001/XMLSchema#integer" &&
        row[key].value
      ) {
        obj[key] = parseInt(row[key].value);
      } else if (
        row[key] &&
        row[key].datatype == "http://www.w3.org/2001/XMLSchema#dateTime" &&
        row[key].value
      ) {
        obj[key] = new Date(row[key].value);
      } else obj[key] = row[key] ? row[key].value : undefined;
    });
    return obj;
  });
}

export async function storeError(errorMsg) {
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
    ${PREFIXES}

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOBS_GRAPH)}{
        ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(
    ERROR_TYPE
  )}, ${sparqlEscapeUri(DELTA_ERROR_TYPE)};
          mu:uuid ${sparqlEscapeString(id)};
          dct:subject "Sync with sharepoint service" ;
          oslc:message ${sparqlEscapeString(errorMsg)};
          dct:created ${sparqlEscapeDateTime(new Date().toISOString())} ;
          dct:creator ${sparqlEscapeUri(ERROR_CREATOR_URI)} .
      }
    }
  `;

  await update(queryError);
}

export function loadConfiguration() {
  const CONFIG = require("/config/config.json");

  // Make sure it is 'syntactically' correct
  if (!CONFIG.objects || !CONFIG.objects.length) {
    throw "No correct mapping objects found!";
  } else if (!CONFIG.sourceGraphs || !CONFIG.sourceGraphs.length) {
    throw "No correct source graphs found!";
  } else {
    for (const object of CONFIG.objects) {
      if (!object.type) {
        throw `No type found for ${JSON.stringify(object)}`;
      } else if (!object.pathToMatchingUuid) {
        throw `No pathToMatchingUuid found for ${JSON.stringify(object)}`;
      } else if (!object.mappings || !object.mappings.length) {
        throw `No mappings found to match with Sharepoint for ${JSON.stringify(
          object
        )}`;
      }
    }
  }
  return CONFIG;
}
