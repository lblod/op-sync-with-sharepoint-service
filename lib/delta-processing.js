import { getTypes, getMatchingUuids, getValuesFromPath } from './queries';
const CONFIG = require('/config/mappings.json');

/**
 * Gets the query params from the received deltas.
 * A query param object contains the id of the object in the Sharepoint, the value
 * that is updated and the fields it should be updated to.
 *
 * @param {Array} deltas The deltas from which to deduce the query params
 * @param {Object} params Parameters to take into account, such as :
 *                        - isDeletion : true if we are deleting a value, implies
 *                                       that the value will be an empty string
 * @returns {Array} For each delta, the associated query params, which are objects with :
 *                  - matchingUuids : the uuids of the linked resources
 *                  - value : value to insert in the sharepoint list.
 *                             Empty string for deletion, value found in the db for insert
 *                  - sharepointField : the field in the sharepoint list in which we will insert the value
 */
export async function getQueryParams(deltas, params) {
  const queryParams = [];
  if (deltas.length) {
    for (let i = 0; i < deltas.length; i++) {
      const enrichedDelta = await enrichDelta(deltas[i]);

      const subject = enrichedDelta.delta.subject.value;
      const prefix = enrichedDelta.delta.predicate.value;

      for (let index = 0; index < enrichedDelta.relevantConfigs.length; index++) {
        const config = enrichedDelta.relevantConfigs[index];
        const matchingMappings = config.mappings.filter(mapping => mapping.op[0] == prefix);
        for (let matchingMapping of matchingMappings) {
          const sharepointField = matchingMapping && matchingMapping.sl;
          const value = await getValue(params, subject, matchingMapping);

          if (sharepointField) {
            const matchingUuids = await getMatchingUuids(config.pathToMatchingUuid, subject, sharepointField);
            if (matchingUuids && matchingUuids.length > 0 && value) {
              matchingUuids.forEach(matchingUuid => {
                const queryParam = {
                  matchingUuid,
                  value,
                  sharepointField
                };
                queryParams.push(queryParam);
              });
            }
          }
        }
      }
    }
  }

  return queryParams;
}

/**
 * Enriches the delta with useful info to get the query params
 * 
 * @param {Object} delta The delta to enrich
 * @returns {Object} The delta enriched with the types of its subject and configuration related to it
 */
async function enrichDelta(delta) {
  const enrichedDeltaWithTypes = await enrichDeltaWithTypes(delta);
  const finalEnrichedDelta = enrichDeltaWithRelevantConfigs(enrichedDeltaWithTypes);
  return finalEnrichedDelta;
}

/**
 * Enriches the delta with the type(s) of the subject
 *
 * @param {Object} delta The delta to enrich
 * @returns {Object} The delta enriched with the types of its subject
 */
async function enrichDeltaWithTypes(delta) {
  return {
    delta: delta,
    types: await getTypes(delta.subject.value)
  };
}

/**
 * Enriches the delta with the configuration it matches with, based on its type(s)
 *
 * @param {Object} delta The delta to enrich
 * @returns {Object} The delta enriched with the configuration related to it
 */
function enrichDeltaWithRelevantConfigs(delta) {
  const relevantTypes = delta.types.filter(type => CONFIG.objects.map(t => t.type).includes(type));
  if (relevantTypes) {
    let relevantConfigs = [];
    relevantTypes.forEach(type => {
      const relevantConfig = CONFIG.objects.filter(object => object.type == type);
      relevantConfigs.push(...relevantConfig);
    });
    delta.relevantConfigs = relevantConfigs;
  } else {
    delta.relevantConfigs = [];
  }
  return delta;
}

/**
 * Get the value to be inserted in the sharepoint list.
 * We take the one from the db and not from the deltas to always
 * be able to use the `queryFilter` parameter in the configuration.
 *
 * @param {Object} params Parameters to take into account, such as :
 *                        - isDeletion : true if we are deleting a value, implies
 *                                       that the value will be an empty string
 * @param {string} subject The subject that has its value updated
 * @param {Object} mapping The matching configuration mapping
 * @returns {string} The value to insert
 */
async function getValue(params, subject, mapping) {
  let value;
  if (params && params.isDeletion) {
    value = '';
  } else if (mapping && mapping.op.length > 0) {
    const result = await getValuesFromPath(subject, mapping.op, mapping.queryFilter);
    if (result) {
      value = result.join(',');
    }
  }
  return value;
}
