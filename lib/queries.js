
import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';

export async function getTypes(subject) {
  const queryGetType = `
    SELECT DISTINCT ?type WHERE {
      ${sparqlEscapeUri(subject)} a ?type .
    }
  `;

  const result = await query(queryGetType);

  if (result.results.bindings.length) {
    return result.results.bindings.map(binding => binding.type.value);
  } else {
    console.log(`Resource ${subject} has no type.`);
    return [];
  }
}

// Assumptions on the config : in the path, ?s is the subject of the delta and ?bestuurUuid the id
export async function getBestuurUuid(pathToBestuurUuid, subject, sharepointFields) {
  const queryGetSharepointId = `
    SELECT DISTINCT ?bestuurUuid WHERE {
      ${pathToBestuurUuid}
      VALUES ?s {
        ${sparqlEscapeUri(subject)}
      }
    }
    LIMIT 1
  `;

  const result = await query(queryGetSharepointId);

  if (result.results.bindings.length) {
    return result.results.bindings[0].bestuurUuid.value;
  } else {
    console.log(`Resource ${subject} has no bestuurUuid linked when following mapping for field(s) ${sharepointFields}.`);
    return null;
  }
}
