import { querySudo as query } from "@lblod/mu-auth-sudo";
import { sparqlEscapeUri } from "mu";
import {
  MU_AUTH_ENDPOINT,
  USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS,
  VIRTUOSO_ENDPOINT,
  SHAREPOINT_UUID_FIELD_NAME,
  PREFIXES,
} from "../../env-config";
import { loadConfiguration } from "../../lib/utils";
import {
  getAuthenticated,
  querySharepointList,
  spGetWithRetry,
  spUpdateWithRetry,
  spSetReadOnlyWithRetry,
} from "../../lib/sharepoint-helpers";

const CONFIG = loadConfiguration();

export async function runHealingTask() {
  try {
    const sp = getAuthenticated();

    const started = new Date();

    console.log(`starting at ${started}`);

    // When initial syncing or healing, we want to match data already present in the sharepoint list to
    // data from our database. But in the case of initial syncing or if admin units are manually added
    // afterwards (for ex. when onboarding new types of admin units), the matchingUuid we normally use
    // is not yet uploaded to the list. We need an other way of doing the matching in the meantime.
    // To do this, we'll agree on a matching field to map data of the list to data of our db and
    // to upload the matching uuid used in the configuration. It's this uuid that will then be used
    // to sync data.
    // We do it like that, in two steps, because the initial mapping field could afterwards be updated in OP,
    // and the matching would be broken. It's why we prefer relying on a truly fixed value for "routine" matching

    const initialMatchingObject = CONFIG.objects.find((object) =>
      object.mappings.find((mapping) => mapping.isInitialMatchingMapping)
    );
    const initialMatchingMapping = initialMatchingObject.mappings.find(
      (mapping) => mapping.isInitialMatchingMapping
    );

    // 1. Get all matching info in OP
    const besturenMatchingInfo = await getBesturenMatchingInfo(
      initialMatchingObject.pathToMatchingUuid,
      initialMatchingMapping.op
    );

    // 2. Get all lines where matching info is missing in Sharepoint
    const missingMatchingUuidInSharepoint = await spGetWithRetry(sp, {
      fields: initialMatchingMapping.sl,
      where: `${SHAREPOINT_UUID_FIELD_NAME} = ''`,
    });

    // 3. Try to get matching field info in OP
    const matchingRowsToSync = [];

    missingMatchingUuidInSharepoint.forEach((res) => {
      const matchingValue = res.getAttribute(initialMatchingMapping.sl);
      const opMatch = besturenMatchingInfo.find(
        (info) => info.matchingValue == matchingValue
      );

      if (opMatch) {
        matchingRowsToSync.push({
          matchingValue,
          matchingUuid: opMatch.matchingUuid,
        });
      }
    });

    // 4. Insert the matching uuid when a match has been found
    console.log(
      `Syncing ${matchingRowsToSync.length} matching values to the sharepoint list (this might take a while)...`
    );
    for (const row of matchingRowsToSync) {
      const insertionInstructions = {};
      insertionInstructions[SHAREPOINT_UUID_FIELD_NAME] = row.matchingUuid;

      await spSetReadOnlyWithRetry(sp, SHAREPOINT_UUID_FIELD_NAME, false);
      await spUpdateWithRetry(sp, insertionInstructions, {
        where: `${initialMatchingMapping.sl} = '${row.matchingValue}'`,
      });
      await spSetReadOnlyWithRetry(sp, SHAREPOINT_UUID_FIELD_NAME, true);
    }
    console.log("...Done");

    let accumulatedDiffs = { inserts: [], deletes: [] };

    // Some explanation:
    // The triples to push to heal in sharepoint should be equal to
    // - whose ?p match the properties defined in the CONFIG AND
    // - who match any of the configured types AND
    // - (should NOT reside exclusively in the sharepoint list) XOR (reside in a set of predfined graphs)
    //
    // In the first step, we build this set (say set A), looking for triples matching the above conditions for a specic ?p.
    // (For performance reasons, we split it up.)
    // In the second step we fetch all triples matching ?p in the sharepoint list. (set B)
    //
    // With this result, we have a complete picture for a specific ?p to caclulating the difference.
    // The addtions are A\B, and removals are B\A
    for (const configObject of CONFIG.objects) {
      // 1. Get source data following mapping config
      const sourceData = await getSourceData(configObject);

      // 2. Get sharepoint data for that property
      const sharepointData = await getSharepointData(configObject, sp);

      // 3. Calculate a diff (only on the properties defined in the config file)
      console.log("Calculating diffs, this may take a while");
      const diffs = diffTriplesData(sourceData, sharepointData);

      accumulatedDiffs.deletes = [
        ...accumulatedDiffs.deletes,
        ...diffs.deletes,
      ];
      accumulatedDiffs.inserts = [
        ...accumulatedDiffs.inserts,
        ...diffs.inserts,
      ];
    }

    // 4. Sync that diff to the sharepoint list : deletes & inserts

    // Deletes: it should be rather easy: insert with value being '' for each delete line
    let deletesQueryParams = [];
    for (const del of accumulatedDiffs.deletes) {
      // If the sharepoint value is already empty and we still got the instruction to delete it
      // (because we have a different value locally), no need to insert an empty value over an already empty field
      if (del.originalResult.getAttribute(del.originalMapping.sl)) {
        const queryParam = {
          matchingUuid: del.originalResult.getAttribute(
            SHAREPOINT_UUID_FIELD_NAME
          ),
          value: "",
          sharepointField: del.originalMapping.sl,
        };
        deletesQueryParams.push(queryParam);
      }
    }

    if (deletesQueryParams.length) {
      console.log("Deleting", deletesQueryParams.length, "values...");
      await querySharepointList(sp, deletesQueryParams);
      console.log("...done");
    }

    // Inserts: for existing lines -> regular add, for new lines -> new line creation
    let insertsQueryParams = [];
    for (const insert of accumulatedDiffs.inserts) {
      const queryParam = {
        matchingUuid: insert.originalTriple.matchingUuid.value,
        value: insert.originalTriple.o.value,
        sharepointField: insert.originalMapping.sl,
      };
      insertsQueryParams.push(queryParam);
    }

    if (insertsQueryParams.length) {
      console.log("Inserting", insertsQueryParams.length, "values...");
      await querySharepointList(sp, insertsQueryParams);
      console.log("...done");
    }

    console.log(`started at ${started}`);
    console.log(`ending at ${new Date()}`);
  } catch (e) {
    console.error(e);
    throw e;
  }
}

async function getBesturenMatchingInfo(pathToMatchingUuid, predicatePathArray) {
  // We limit the source graphs to avoid also including producers graphs that could not be up-to-date,
  // depending on when the healing runs, as well as other graphs is need be
  const graphsFilter = constructGraphsFilter();
  const predicatePath = constructPredicatePath(predicatePathArray);

  const queryString = `
    ${PREFIXES}

    SELECT DISTINCT ?matchingUuid ?matchingValue WHERE {
      ${pathToMatchingUuid}

      GRAPH ?graph {
        ?s ${predicatePath} ?matchingValue .
      }

      ${graphsFilter}
    }
  `;

  const result = await query(queryString);
  if (result.results.bindings.length) {
    return result.results.bindings.map((binding) => {
      return {
        matchingUuid: binding.matchingUuid.value,
        matchingValue: binding.matchingValue.value,
      };
    });
  } else {
    return [];
  }
}

/*
 * Gets the triples for a property, which are considered 'Ground Truth'
 */
async function getSourceData(configObject) {
  let sourceData = [];
  for (const mapping of configObject.mappings) {
    const scopedSourceData = await getScopedSourceTriples(
      configObject,
      mapping
    );

    const diffs = diffTriplesData(scopedSourceData, sourceData);
    sourceData = [...sourceData, ...diffs.inserts];
  }

  return sourceData;
}

/*
 * Gets the source data for a property for predefined graphs
 */
async function getScopedSourceTriples(configObject, mapping) {
  // We limit the source graphs to avoid also including producers graphs that could not be up-to-date,
  // depending on when the healing runs, as well as other graphs is need be
  const graphsFilter = constructGraphsFilter();
  const predicatePath = constructPredicatePath(mapping.op);

  // We highly rely on the configuration for this. The variables ?s and ?matchingUuid are used in the config
  // and reused in the query.
  const selectFromDatabase = `
    SELECT DISTINCT ?s ?o ?matchingUuid WHERE {
      GRAPH ?graph {
        ?s a ${sparqlEscapeUri(configObject.type)}.
      }

      ?s ${predicatePath} ?o .

      ${configObject.pathToMatchingUuid}

      ${graphsFilter}
    }
  `;

  // Note: this might explose memory, but now, a paginated fetch is extremely slow. (because sorting)
  const endpoint = USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS
    ? VIRTUOSO_ENDPOINT
    : MU_AUTH_ENDPOINT;

  console.log(`Hitting database ${endpoint} with expensive query`);

  const result = await query(
    selectFromDatabase,
    {},
    { sparqlEndpoint: endpoint, mayRetry: true }
  );

  return reformatQueryResult(result, mapping);
}

/*
 * Gets the data in the sharepoint list for a specific property
 */
async function getSharepointData(configObject, sp) {
  let sharepointData = [];

  for (const mapping of configObject.mappings) {
    const scopedSharepointData = await spGetWithRetry(sp, {
      fields: `${SHAREPOINT_UUID_FIELD_NAME},${mapping.sl}`,
    });

    const formattedScopedSharepointData = reformatSharepointData(
      scopedSharepointData,
      mapping
    );
    const diffs = diffTriplesData(
      formattedScopedSharepointData,
      sharepointData
    );

    sharepointData = [...sharepointData, ...diffs.inserts];
  }

  return sharepointData;
}

function diffTriplesData(target, source) {
  // Note: this only works correctly if triples have same lexical notation.
  // So think about it, when copy pasting :-)
  const diff = { inserts: [], deletes: [] };

  const targetHash = target.reduce((acc, curr) => {
    acc[curr.stringifiedSharepointData] = curr;
    return acc;
  }, {});

  const sourceHash = source.reduce((acc, curr) => {
    acc[curr.stringifiedSharepointData] = curr;
    return acc;
  }, {});

  diff.inserts = target.filter(
    (data) => !sourceHash[data.stringifiedSharepointData]
  );
  diff.deletes = source.filter(
    (data) => !targetHash[data.stringifiedSharepointData]
  );

  return diff;
}

function reformatQueryResult(result, mapping) {
  let triplesData = [];

  if (
    result.results &&
    result.results.bindings &&
    result.results.bindings.length
  ) {
    const triples = result.results.bindings;
    triplesData = triples.map((t) => {
      return {
        stringifiedSharepointData: stringifyTriplestoreData(t, mapping),
        originalTriple: t,
        originalMapping: mapping,
      };
    });
  }
  return triplesData;
}

function stringifyTriplestoreData(t, mapping) {
  return `${mapping.sl} ${t.matchingUuid.value} ${t.o.value}`;
}

function reformatSharepointData(result, mapping) {
  return result.map((res) => {
    return {
      stringifiedSharepointData: stringifySharepointData(res, mapping),
      originalResult: res,
      originalMapping: mapping,
    };
  });
}

function stringifySharepointData(res, mapping) {
  return `${mapping.sl} ${res.getAttribute(
    SHAREPOINT_UUID_FIELD_NAME
  )} ${res.getAttribute(mapping.sl)}`;
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
