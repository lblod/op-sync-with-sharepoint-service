import { getQueryParams } from "./delta-processing";
import {
  USERNAME,
  PASSWORD,
  SITE,
  LIST,
  RETRY,
  RETRY_MAX_ATTEMPTS,
  RETRY_TIMEOUT_INCREMENT_FACTOR,
} from "../env-config";
import {
  getMatchingFieldName
} from "./utils";
import { createError } from "./error";

const $SP = require("sharepointplus/dist");
const MATCHING_FIELD_NAME = getMatchingFieldName();

/**
 * Verifies that the config is valid by calling a callback method
 */
export async function isSharepointConfigValid(callback) {
  const res = await callback();
  if (!res) {
    console.log(
      "[STARTUP ERROR] Unable to do basic operation, is the configuration correct?"
    );
  } else {
    console.log("Configuration seems OK :)");
  }
}

export function getAuthenticated() {
  const credentialOptions = {
    username: USERNAME,
    password: PASSWORD,
  };
  return $SP().auth(credentialOptions);
}

/**
 * Gets the info of the configured list.
 */
export async function getListInfo() {
  try {
    const sp = getAuthenticated();
    return await sp.list(LIST, SITE).info();
  } catch (e) {
    console.log("Error: ", e);
    createError(e.error ? e.error : e);
    return null;
  }
}

/**
 * Update the sharepoint list by applying a series of deletes and inserts.
 * The order is important : we should first process the deletes and only once it's done the inserts.
 *
 * @param {Array} deletes The delete deltas to process
 * @param {Array} inserts The insert deltas to process
 */
export async function updateSharepointList(deletes, inserts) {
  try {
    const deletesQueryParams = await getQueryParams(deletes, {
      isDeletion: true,
    });
    const insertsQueryParams = await getQueryParams(inserts);

    const sp = getAuthenticated();

    if (deletesQueryParams.length) {
      await querySharepointList(sp, deletesQueryParams);
    }

    if (insertsQueryParams.length) {
      await querySharepointList(sp, insertsQueryParams);
    }
  } catch (e) {
    console.log("Error: ", e);
    createError(e);
  }
}

/**
 * Construct and send queries to the sharepoint list to update its content
 *
 * @param {Object} sp The sharepoint connection
 * @param {*} queryParams The parameters to construct the query to the sharepoint
 */
export async function querySharepointList(sp, queryParams) {
  const matchingUris = queryParams.map((param) => param.matchingUri);
  const uniqueMatchingUris = [...new Set(matchingUris)];

  for (let index = 0; index < uniqueMatchingUris.length; index++) {
    const queryParamsToProcess = queryParams.filter(
      (param) => param.matchingUri == uniqueMatchingUris[index]
    );
    const matchingUriExistsInList = await matchingUriExistsInSharepointList(
      sp,
      uniqueMatchingUris[index]
    );

    // If it's a new resource, create the row we'll update afterwards
    if (!matchingUriExistsInList) {
      await createNewRow(sp, uniqueMatchingUris[index]);
    }

    await updateRow(sp, uniqueMatchingUris[index], queryParamsToProcess);
    console.log("Update status:", index + 1, "/", uniqueMatchingUris.length, " rows queried.");
  }
}

/**
 * Checks if a uuid already exists in the sharepoint list or not.
 *
 * @param {Object} sp The sharepoint connection
 * @param {string} matchingUri The uri to look for
 * @returns True if the uuid is found in the sharepoint list, false otherwise
 */
async function matchingUriExistsInSharepointList(sp, matchingUri) {
  const res = await spGetWithRetry(sp, {
    fields: MATCHING_FIELD_NAME,
    where: `${MATCHING_FIELD_NAME} = '${matchingUri}'`,
  });

  if (res.length) {
    return true;
  } else {
    return false;
  }
}

/**
 * Create a new row in the sharepoint list based on a uri
 * Comes with a retry mechanism
 *
 * @param {Object} sp The sharepoint connection
 * @param {string} matchingUri The uri of the row to create
 */
async function createNewRow(sp, matchingUri) {
  if (!matchingUri) {
    console.log("No matching uuid provided, skipping creating new row");
  } else {
    const newListInstructions = {};
    newListInstructions[MATCHING_FIELD_NAME] = matchingUri;

    await spSetReadOnlyWithRetry(sp, MATCHING_FIELD_NAME, false);
    await spAddWithRetry(sp, newListInstructions);
    await spSetReadOnlyWithRetry(sp, MATCHING_FIELD_NAME, true);
  }
}

/**
 * Update a row according the changes received in the deltas
 * Comes with a retry mechanism
 *
 * @param {Object} sp The sharepoint connection
 * @param {string} matchingUri The uri of the row to update
 * @param {Array} queryParams Information about the data to update
 */
async function updateRow(sp, matchingUri, queryParams) {
  console.log('Updating row ', matchingUri, ' with query params', queryParams);
  if (!matchingUri) {
    console.log(
      `No matching uuid provided for ${queryParams.length} query params, not updating those rows`
    );
  } else {
    const insertionInstructions = {};

    queryParams.forEach((queryParam) => {
      insertionInstructions[queryParam.sharepointField] = queryParam.value;
    });

    await spSetReadOnlyWithRetry(sp, MATCHING_FIELD_NAME, false);
    await spUpdateWithRetry(sp, insertionInstructions, {
      where: `${MATCHING_FIELD_NAME} = '${matchingUri}'`,
    });
    await spSetReadOnlyWithRetry(sp, MATCHING_FIELD_NAME, true);
  }
}

// -------------------------------------------------
// -------- Operations with retry ------------------
// -------------------------------------------------

export async function spGetWithRetry(sp, params, attempt = 0) {
  try {
    const list = await sp.list(LIST, SITE);
    return await list.get(params);
  } catch (e) {
    if (mayRetry(e, attempt)) {
      attempt += 1;

      const sleepTime = nextAttemptTimeout(attempt);
      console.log(`Sleeping ${sleepTime} ms before next attempt`);
      await new Promise((r) => setTimeout(r, sleepTime));

      return await spGetWithRetry(sp, params, attempt);
    } else {
      console.log(`Failed sp get call for params ${JSON.stringify(params)}`);
      throw e;
    }
  }
}

export async function spSetReadOnlyWithRetry(
  sp,
  uuidFieldName,
  isReadOnly,
  attempt = 0
) {
  try {
    const list = await sp.list(LIST, SITE);
    const res = await list.setReadOnly(uuidFieldName, isReadOnly);
    return res;
  } catch (e) {
    if (mayRetry(e, attempt)) {
      attempt += 1;

      const sleepTime = nextAttemptTimeout(attempt);
      console.log(`Sleeping ${sleepTime} ms before next attempt`);
      await new Promise((r) => setTimeout(r, sleepTime));

      return await spSetReadOnlyWithRetry(
        sp,
        uuidFieldName,
        isReadOnly,
        attempt
      );
    } else {
      console.log(
        `Failed sp set read only call for uuid field name ${uuidFieldName} and value ${isReadOnly}`
      );
      throw e;
    }
  }
}

export async function spAddWithRetry(sp, newListInstructions, attempt = 0) {
  try {
    const list = await sp.list(LIST, SITE);
    return await list.add(newListInstructions);
  } catch (e) {
    if (mayRetry(e, attempt)) {
      attempt += 1;

      const sleepTime = nextAttemptTimeout(attempt);
      console.log(`Sleeping ${sleepTime} ms before next attempt`);
      await new Promise((r) => setTimeout(r, sleepTime));

      return await spAddWithRetry(sp, newListInstructions, attempt);
    } else {
      console.log(
        `Failed sp add call for instructions ${JSON.stringify(
          newListInstructions
        )}`
      );
      throw e;
    }
  }
}

export async function spUpdateWithRetry(
  sp,
  insertionInstructions,
  params = null,
  attempt = 0
) {
  try {
    const list = await sp.list(LIST, SITE);
    console.log("Updating with retry instructions", insertionInstructions, ' and params ', params);
    if (params) {
      return await list.update(insertionInstructions, params);
    } else {
      return await list.update(insertionInstructions);
    }
  } catch (e) {
    if (mayRetry(e, attempt)) {
      attempt += 1;

      const sleepTime = nextAttemptTimeout(attempt);
      console.log(`Sleeping ${sleepTime} ms before next attempt`);
      await new Promise((r) => setTimeout(r, sleepTime));

      return await spUpdateWithRetry(sp, insertionInstructions, attempt);
    } else {
      console.log(
        `Failed sp add call for instructions ${JSON.stringify(
          insertionInstructions
        )}`
      );
      throw e;
    }
  }
}

// Courtesy to https://github.com/lblod/mu-auth-sudo for the retry mechanism
function mayRetry(error, attempt) {
  console.log(
    `RETRY Checking retry allowed for attempt: ${attempt} and error: `,
    error
  );

  let mayRetry = false;

  if (!RETRY) {
    mayRetry = false;
  } else if (attempt < RETRY_MAX_ATTEMPTS) {
    mayRetry = true;
  }

  console.log(`Retry allowed? ${mayRetry}`);

  return mayRetry;
}

function nextAttemptTimeout(attempt) {
  // Expected to be milliseconds
  return Math.round(Math.exp(RETRY_TIMEOUT_INCREMENT_FACTOR * attempt + 10));
}

export async function flushData() {
  const sp = getAuthenticated();
  await sp.list(LIST, SITE).remove({where: `${MATCHING_FIELD_NAME} <> ""`});
}
