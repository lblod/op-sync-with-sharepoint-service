import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
} from "mu";
import { updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  ERROR_URI_PREFIX,
  PREFIXES,
  JOBS_GRAPH,
  ERROR_TYPE,
  DELTA_ERROR_TYPE,
  ERROR_CREATOR_URI,
} from "../env-config.js";

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
