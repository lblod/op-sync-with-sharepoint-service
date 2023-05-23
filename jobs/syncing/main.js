import {
  storeError,
} from "../../lib/utils";
import { updateSharepointList } from '../../lib/sharepoint-helpers';

// TODO Make a job/task from it, as the healing pipeline ?
// Could be handy to know what data has been synced if we would store it somewhere, maybe overkill

export async function executeSyncingTask(deltaPayload) {
  try {
    const deletes = flatten(delta.map(changeSet => changeSet.deletes));
    const inserts = flatten(delta.map(changeSet => changeSet.inserts));

    if (deletes.length || inserts.length) {
      updateSharepointList(deletes, inserts);
    } else {
      console.log("No deletes or inserts in the deltas, skipping.");
    }
  } catch (error) {
    const errorMsg = `Error while syncing delta ${deltaPayload}: ${error}`;
    console.error(errorMsg);
    await storeError(errorMsg);
    throw error;
  }
}
