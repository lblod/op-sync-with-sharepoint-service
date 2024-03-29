import { uuid, sparqlEscapeString, sparqlEscapeUri } from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import { PREFIXES, ERROR_URI_PREFIX, ERROR_TYPE } from "../env-config";
import { parseResult } from "./utils";

export async function loadError(subject) {
  const queryError = `
    ${PREFIXES}
    SELECT DISTINCT ?graph ?error ?message WHERE {
      GRAPH ?graph {
        BIND(${sparqlEscapeUri(subject)} as ?error)
        ?error oslc:message ?message.
        optional { ?error dct:created ?created }
      }
    }
  `;
  return parseResult(await query(queryError))[0];
}

export async function createError(graph, message) {
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;
  const created = new Date();

  const queryError = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(graph)}{
        ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)};
          mu:uuid ${id};
          dct:created ${sparqlEscapeDateTime(created)};
          oslc:message ${sparqlEscapeString(message)}.
      }
    }
  `;

  await update(queryError);
  return await loadError(uri);
}

export async function removeError(error) {
  const queryError = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ?error a ?errorType;
          mu:uuid ?uuid;
          dct:created ?created;
          oscl:message ?message.
      }
    }
    WHERE {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(error.error)} as ?error)
        ?error a ?errorType;
          mu:uuid ?uuid;
          oslc:message ?message.
        OPTIONAL { ?error dct:created ?created }
      }
    }`;
  await update(queryError);
}
