import { querySudo as query } from "@lblod/mu-auth-sudo";
import { sparqlEscapeUri } from "mu";
import {
  CONFIG,
  MU_AUTH_ENDPOINT,
  USE_VIRTUOSO_FOR_EXPENSIVE_SELECTS,
  VIRTUOSO_ENDPOINT,
} from "../../env-config";
import {
  getAuthenticated,
  querySharepointList,
  spGetWithRetry,
} from "../../lib/sharepoint-helpers";
import {
  constructPredicatePath,
  getMatchingFieldName
} from "../../lib/utils";

const MATCHING_FIELD_NAME = getMatchingFieldName();

export async function runHealingTask() {
  try {
    const sp = getAuthenticated();
    const started = new Date();
    console.log(`starting at ${started}`);

    // Updating data of the sharepoint list, mapping on fixed ID

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

    let deletesQueryParams = [];
    for (const del of accumulatedDiffs.deletes) {
      // If the sharepoint value is already empty and we still got the instruction to delete it
      // (because we have a different value locally), no need to insert an empty value over an already empty field
      if (del.originalResult.getAttribute(del.originalMapping.sl)) {
        const queryParam = {
          matchingUri: del.originalResult.getAttribute(
            MATCHING_FIELD_NAME
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

    let insertsQueryParams = [];
    for (const insert of accumulatedDiffs.inserts) {
      const queryParam = {
        matchingUri: insert.originalTriple.matchingUri.value,
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
  const fromSourceGraphsStatements = CONFIG.sourceGraphs.map((sourceGraph) =>
    `FROM ${sparqlEscapeUri(sourceGraph)}`
  ).join('\n');

  // We highly rely on the configuration for this. The variables ?s and ?matchingUri are used in the config
  // and reused in the query.
  const selectFromDatabase = `
    SELECT DISTINCT ?s ?o ?matchingUri
    ${fromSourceGraphsStatements}
    WHERE {
      ?s a ${sparqlEscapeUri(configObject.type)} .

      ?s ${constructPredicatePath(mapping.op)} ?o .

      ${configObject.pathToMatchingUri}
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
      fields: `${MATCHING_FIELD_NAME},${mapping.sl}`,
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

/**
 * Makes a diff of two datasets. Both datasets are formatted in a way that allows us to compare them easily:
 * `sharepointFieldName matchingUriValue fieldValue`
 * @param {Array} source Triples from our database
 * @param {Array} target Data from the sharepoint
 * @returns Set of deletes and inserts to execute on the sharepoint list to sync it with our triplestore
 */
function diffTriplesData(source, target) {
  // Note: this only works correctly if triples have same lexical notation.
  // So think about it, when copy pasting :-)
  const diff = { inserts: [], deletes: [] };

  const sourceHash = source.reduce((acc, curr) => {
    acc[curr.stringifiedSharepointData] = curr;
    return acc;
  }, {});

  const targetHash = target.reduce((acc, curr) => {
    acc[curr.stringifiedSharepointData] = curr;
    return acc;
  }, {});

  diff.inserts = source.filter(
    (data) => !targetHash[data.stringifiedSharepointData]
  );
  diff.deletes = target.filter(
    (data) => !sourceHash[data.stringifiedSharepointData]
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
  return `${mapping.sl} ${t.matchingUri.value} ${t.o.value}`;
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
    MATCHING_FIELD_NAME
  )} ${res.getAttribute(mapping.sl)}`;
}
