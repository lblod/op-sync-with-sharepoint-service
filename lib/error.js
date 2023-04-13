import { updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import { ERROR_TYPE, ERROR_URI_PREFIX, JOBS_GRAPH, SERVICE_NAME } from '../config';

export async function createError(errorMsg) {
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX oslc: <http://open-services.net/ns/core#>
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(JOBS_GRAPH)} {
        ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)} ;
          mu:uuid ${sparqlEscapeString(id)} ;
          oslc:message ${sparqlEscapeString('[' + SERVICE_NAME + '] ' + errorMsg)} .
      }
    }
  `;

  await update(queryError);
}
