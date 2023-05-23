import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";

export async function getTypes(subject) {
  const queryGetType = `
    SELECT DISTINCT ?type WHERE {
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

  let stringPath = path.map((path) => {
    if (path[0] == "^") {
      return `^<${path.slice(1)}>`;
    } else {
      return `<${path}>`;
    }
  });
  stringPath = stringPath.join("/");

  const queryGetValue = `
    SELECT DISTINCT ?value WHERE {
      ${sparqlEscapeUri(subject)} ${stringPath} ?value .
      ${queryFilter}
    }
  `;

  const result = await query(queryGetValue);

  if (result.results.bindings.length) {
    return result.results.bindings.map((res) => res.value.value);
  } else {
    console.log(`Resource ${subject} has no value for path ${stringPath}.`);
    return null;
  }
}
