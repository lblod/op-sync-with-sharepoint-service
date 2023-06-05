import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import {
  constructGraphsFilter,
  constructPathInAndOutOfSourceGraphs,
} from "./utils";

export async function getTypes(subject) {
  const graphsFilter = constructGraphsFilter("graph");

  const queryGetType = `
    SELECT DISTINCT ?type WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(subject)} a ?type .
      }
      ${graphsFilter}
    }
  `;

  const result = await query(queryGetType);

  if (result.results.bindings.length) {
    return result.results.bindings.map((binding) => binding.type.value);
  } else {
    console.log(`Resource ${subject} has no type.`);
    return [];
  }
}

// Assumptions on the config : in the path, ?s is the subject of the delta and ?matchingUuid the id
export async function getMatchingUuids(
  pathToMatchingUuid,
  subject,
  sharepointFields
) {
  const queryGetSharepointId = `
    SELECT DISTINCT ?matchingUuid WHERE {
      ${pathToMatchingUuid}
      VALUES ?s {
        ${sparqlEscapeUri(subject)}
      }
    }
  `;

  const result = await query(queryGetSharepointId);

  if (result.results.bindings.length) {
    return result.results.bindings.map((res) => res.matchingUuid.value);
  } else {
    console.log(
      `Resource ${subject} has no matchingUuid linked when following mapping for field(s) ${sharepointFields}.`
    );
    return null;
  }
}

export async function getValuesFromPath(subject, path, filter) {
  let queryFilter = "";
  if (filter) {
    queryFilter = `BIND(${sparqlEscapeUri(subject)} as ?s) \n ${filter}`;
  }

  const pathInAndOutOfSourceGraphs = constructPathInAndOutOfSourceGraphs(
    path,
    "graph"
  );
  const graphsFilter = constructGraphsFilter("graph");

  const queryGetValue = `
    SELECT DISTINCT ?o WHERE {
      ${pathInAndOutOfSourceGraphs}
      ${queryFilter}
      ${graphsFilter}
    }
  `;

  const result = await query(queryGetValue);

  if (result.results.bindings.length) {
    return result.results.bindings.map((res) => res.o.value);
  } else {
    console.log(
      `Resource ${subject} has no value for path ${[
        ...pathPotentiallyOutsideSourceGraphs,
        ...pathPortionInSourceGraphs,
      ]}.`
    );
    return null;
  }
}
