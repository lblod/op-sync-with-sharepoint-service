import { getTypes, getSharepointId } from './queries';

/**
 * Gets the query params from the received deltas.
 * A query param object contains the id of the object in the Sharepoint, the value
 * that is updated and the fields it should be updated to.
 *
 * @param {Array} deltas The deltas from which to deduce the query params
 * @returns {Array} For each delta, the associated query params
 */
export async function getQueryParams(deltas) {
  const queryParams = [];
  if (deltas.length) {
    for (let i = 0; i < deltas.length; i++) {
      const enrichedDelta = await enrichDelta(deltas[i]);

      if (enrichedDelta.relevantConfigs.length) {
        const prefix = enrichedDelta.delta.predicate.value;
        const sharepointFields = enrichedDelta.relevantConfigs
          .map(config => {
            return config.mappings.find(mapping => mapping.op == prefix);
          })
          .map(config => config.sl);

        const sharepointId = await getSharepointId(enrichedDelta);
        const value = enrichedDelta.delta.object.value;
        const queryParam = {
          sharepointId,
          value,
          sharepointFields
        };
        queryParams.push(queryParam);
      }
    }
  }

  return queryParams;
}

/**
 * Enriches the deltas with useful info to get the query params
 * 
 * @param {Object} delta The delta to enrich
 * @returns {Object} The delta enriched with the types of its subject and configuration related to it
 */
async function enrichDelta(delta) {
  const enrichedDeltaWithTypes = await enrichDeltaWithTypes(delta);
  const finalEnrichedDelta = enrichDeltaWithRelevantConfigs(enrichedDeltaWithTypes);
  return finalEnrichedDelta;
}

async function enrichDeltaWithTypes(delta) {
  return {
    delta: delta,
    types: await getTypes(delta.subject.value)
  };
}

function enrichDeltaWithRelevantConfigs(delta) {
  const relevantTypes = delta.types.filter(type => CONFIG.objects.map(t => t.type).includes(type));
  if (relevantTypes) {
    let relevantConfigs = [];
    relevantTypes.forEach(type => {
      const relevantConfig = CONFIG.objects.find(object => object.type == type)
      relevantConfigs.push(relevantConfig);
    });
    delta.relevantConfigs = relevantConfigs;
  } else {
    delta.relevantConfigs = [];
  }
  return delta;
}