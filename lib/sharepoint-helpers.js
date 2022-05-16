import { getQueryParams } from './delta-processing';
import {
  USERNAME,
  PASSWORD,
  SITE,
  LIST,
  SHAREPOINT_UUID_FIELD_NAME
} from '../config';

const $SP = require("sharepointplus/dist");

/**
 * Update the sharepoint list linked to some deltas.
 * The order is important : we should first process the deletes and only once it's done the inserts.
 *
 * @param {Array} deltas The deltas from which to deduce the query params
 */
export async function updateSharepointList(deletes, inserts) {
  try {
    const deletesQueryParams = await getQueryParams(deletes);
    const insertsQueryParams = await getQueryParams(inserts);

    console.log('deletesQueryParams', deletesQueryParams);
    console.log('insertsQueryParams', insertsQueryParams);

    const credentialOptions = {
      username: USERNAME,
      password: PASSWORD
    };
    const sp = $SP().auth(credentialOptions);

    for (let index = 0; index < insertsQueryParams.length; index++) {
      const insertsQueryParam = insertsQueryParams[index];
      const bestuurUuid = insertsQueryParam.bestuurUuid;

      const bestuurUuidExistsInList = await bestuurUuidExistsInSharepointList(sp, bestuurUuid);

      // If it's a new bestuur, create the row we'll update afterwards
      if (!bestuurUuidExistsInList) {
        await createNewRow(sp, bestuurUuid);
      }

      await updateRow(sp, insertsQueryParam);
    }
  } catch (e) {
    console.log('Error: ', e);
  }
}

/**
 * Checks if a uuid already exists in the sharepoint list or not.
 * 
 * @param {Object} sp The sharepoint connection
 * @param {string} bestuurUuid The uuid to look for
 * @returns True if the uuid is found in the sharepoint list, false otherwise
 */
async function bestuurUuidExistsInSharepointList(sp, bestuurUuid) {
  const res = await sp.list(LIST, SITE).get({
    fields: SHAREPOINT_UUID_FIELD_NAME,
    where: `${SHAREPOINT_UUID_FIELD_NAME} = '${bestuurUuid}'`
  });

  if (res.length) {
    return true;
  } else {
    return false;
  }
}

/**
 * Create a new row in the sharepoint list based on a uuid
 * 
 * @param {Object} sp The sharepoint connection
 * @param {string} bestuurUuid The uuid of the row to create
 */
async function createNewRow(sp, bestuurUuid) {
  const newListInstructions = {};
  newListInstructions[SHAREPOINT_UUID_FIELD_NAME] = bestuurUuid;

  await sp.list(LIST, SITE).add(newListInstructions);
}

/**
 * Update a row according the changes received in the deltas
 * 
 * @param {Object} sp The sharepoint connection
 * @param {Object} insertsQueryParam Information about the data to update
 */
async function updateRow(sp, insertsQueryParam) {
  const insertionInstructions = {};
  insertionInstructions[insertsQueryParam.sharepointField] = insertsQueryParam.value;

  await sp.list(LIST, SITE).update(
    insertionInstructions,
    { where: `${SHAREPOINT_UUID_FIELD_NAME} = '${insertsQueryParam.bestuurUuid}'` }
  );
}
