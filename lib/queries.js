import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { CONFIG } from "../env-config";

export async function getTypes(subject) {
  const graphsFilter = constructGraphsFilter();

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

  const pathInAndOutOfSourceGraphs = constructPathInAndOutOfSourceGraphs(path);

  const graphsFilter = constructGraphsFilter();

  const queryGetValue = `
    SELECT DISTINCT ?value WHERE {
      ${pathInAndOutOfSourceGraphs}
      ${queryFilter}
      ${graphsFilter}
    }
  `;

  const result = await query(queryGetValue);

  if (result.results.bindings.length) {
    return result.results.bindings.map((res) => res.value.value);
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

function constructGraphsFilter() {
  const escapedSourceGraphs = CONFIG.sourceGraphs.map((sourceGraph) =>
    sparqlEscapeUri(sourceGraph)
  );
  const graphsFilterStr = `FILTER(?graph IN ( ${escapedSourceGraphs.join(
    ", "
  )}))`;
  return graphsFilterStr;
}

function constructPredicatePath(arrayPath) {
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
 * We need to get only the values that are in the predefined source graphs.
 * But sometime the paths spead accross multiple graphs, so we split the path
 * to be able to force the ?value to be in our source graphs.
 *
 * Examples:
 *   1. Only one value in the path ["http://www.w3.org/2004/02/skos/core#prefLabel"]
 *      Output will be:
 *        ```
 *        GRAPH ?graph {
 *          ?subject <http://www.w3.org/2004/02/skos/core#prefLabel> ?value .
 *        }
 *        ```
 *   2. More than one value in the path
 *      ["http://www.w3.org/ns/org#classification", "http://www.w3.org/2004/02/skos/core#prefLabel"]
 *      We only set the latest part of the path in the graph, the rest could be spread over multiple graphs
 *      Output will be:
 *        ```
 *        ?subject <http://www.w3.org/ns/org#classification> ?resource .
 *        GRAPH ?graph {
 *          ?resource <http://www.w3.org/2004/02/skos/core#prefLabel> ?value .
 *        }
 *        ```
 */
function constructPathInAndOutOfSourceGraphs(path) {
  // Deep copy of the path to avoid modifying the config object
  const clonedPath = JSON.parse(JSON.stringify(path))
  const pathPortionInSourceGraphs = constructPredicatePath([clonedPath.pop()]);
  const pathPotentiallyOutsideSourceGraphs = constructPredicatePath(clonedPath);

  let pathInAndOutOfSourceGraphs;
  if (pathPotentiallyOutsideSourceGraphs.length) {
    pathInAndOutOfSourceGraphs = `
      ${sparqlEscapeUri(
        subject
      )} ${pathPotentiallyOutsideSourceGraphs} ?resource .

      GRAPH ?graph {
        ?resource ${pathPortionInSourceGraphs} ?value .
      }
    `;
  } else {
    pathInAndOutOfSourceGraphs = `
      GRAPH ?graph {
        ${sparqlEscapeUri(subject)} ${pathPortionInSourceGraphs} ?value .
      }
    `;
  }
  return pathInAndOutOfSourceGraphs;
}
