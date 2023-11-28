import {
  storeError,
} from "../../lib/utils";
import { updateSharepointList } from '../../lib/sharepoint-helpers';
import { flatten } from "lodash";

export async function executeSyncingTask(delta) {
  try {
    const deletes = flatten(delta.map(changeSet => changeSet.deletes));
    const inserts = flatten(delta.map(changeSet => changeSet.inserts));

    if (deletes.length || inserts.length) {
      await updateSharepointList(deletes, inserts);
    } else {
      console.log("No deletes or inserts in the deltas, skipping.");
    }
  } catch (error) {
    const errorMsg = `Error while syncing delta ${delta}: ${error}`;
    console.error(errorMsg);
    await storeError(errorMsg);
    throw error;
  }
}
