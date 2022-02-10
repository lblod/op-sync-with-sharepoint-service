
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

// Assumptions on the config : in the path, ?s is the subject of the delta and ?sharepointId the id
export async function getSharepointId(enrichedDelta) {
  // It'll be the same id even if we have multiple configs
  const pathToSharepointId = enrichedDelta.relevantConfigs[0].pathToSharepointId;

  const queryGetSharepointId = `
    SELECT DISTINCT ?sharepointId WHERE {
      ${pathToSharepointId}
      VALUES ?s {
        ${sparqlEscapeUri(enrichedDelta.delta.subject.value)} 
      }
    }
    LIMIT 1
  `;

  const result = await query(queryGetSharepointId);

  if (result.results.bindings.length) {
    return result.results.bindings[0].sharepointId.value;
  } else {
    console.log(`Resource ${subject} has no sharepointId linked.`);
    return [];
  }
}
