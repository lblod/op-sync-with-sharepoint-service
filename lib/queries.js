import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import {
  constructPredicatePath,
} from "./utils";
import { CONFIG } from "../env-config"

export async function getTypes(subject) {
  const fromSourceGraphsStatements = CONFIG.sourceGraphs.map((sourceGraph) =>
    `FROM ${sparqlEscapeUri(sourceGraph)}`
  ).join('\n');

  const queryGetType = `
    SELECT DISTINCT ?type
    ${fromSourceGraphsStatements}
    WHERE {
      ${sparqlEscapeUri(subject)} a ?type .
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

// Assumptions on the config : in the path, ?s is the subject of the delta and ?matchingUri the URI used to map data
export async function getMatchingUris(
  pathToMatchingUri,
  subject,
  sharepointFields
) {
  const queryGetSharepointUri = `
    SELECT DISTINCT ?matchingUri WHERE {
      ${pathToMatchingUri}
      VALUES ?s {
        ${sparqlEscapeUri(subject)}
      }
    }
  `;

  const result = await query(queryGetSharepointUri);

  if (result.results.bindings.length) {
    return result.results.bindings.map((res) => res.matchingUri.value);
  } else {
    console.log(
      `Resource ${subject} has no matchingUri linked when following mapping for field(s) ${sharepointFields}.`
    );
    return null;
  }
}

export async function getValuesFromPath(subject, path) {
  let queryFilter = `VALUES ?s { ${sparqlEscapeUri(subject)} }`;

  const fromSourceGraphsStatements = CONFIG.sourceGraphs.map((sourceGraph) =>
    `FROM ${sparqlEscapeUri(sourceGraph)}`
  ).join('\n');

  const queryGetValue = `
    SELECT DISTINCT ?o
    ${fromSourceGraphsStatements}
    WHERE {
      ?s ${constructPredicatePath(path)} ?o .
      ${queryFilter}
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
    return "";
  }
}
