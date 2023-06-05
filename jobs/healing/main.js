import { querySudo as query } from "@lblod/mu-auth-sudo";
import { sparqlEscapeUri } from "mu";
import {
  HEALING_JOB_OPERATION,
  HEALING_TASK_OPERATION,
  INITIAL_SYNC_JOB_OPERATION,
  INITIAL_SYNC_TASK_OPERATION,
  JOB_TYPE,
  PREFIXES,
  STATUS_BUSY,
  STATUS_FAILED,
  STATUS_SCHEDULED,
  STATUS_SUCCESS,
  TASK_TYPE,
} from "../../env-config";
import { appendTaskError, loadTask, updateTaskStatus } from "../../lib/task";
import { parseResult, storeError } from "../../lib/utils";
import { runHealingTask } from "./pipeline-healing";

export async function executeHealingTask() {
  try {
    const initialSyncTaskUri = await getTaskUri(
      INITIAL_SYNC_JOB_OPERATION,
      INITIAL_SYNC_TASK_OPERATION,
      STATUS_SCHEDULED
    );
    const healingTaskUri = await getTaskUri(
      HEALING_JOB_OPERATION,
      HEALING_TASK_OPERATION,
      STATUS_SCHEDULED
    );

    let delta = { inserts: [], deletes: [] };

    if (initialSyncTaskUri || healingTaskUri) {
      const task = await loadTask(initialSyncTaskUri || healingTaskUri);
      try {
        await updateTaskStatus(task, STATUS_BUSY);
        delta = await runHealingTask(task, initialSyncTaskUri ? true : false);
        await updateTaskStatus(task, STATUS_SUCCESS);
      } catch (e) {
        await appendTaskError(task, e.message || e);
        await updateTaskStatus(task, STATUS_FAILED);
        throw e;
      }
    }

    return delta;
  } catch (e) {
    console.error(e);
    await storeError(e);
    throw e;
  }
}

async function getTaskUri(jobOperationUri, taskOperationUri, statusUri) {
  const queryString = `
    ${PREFIXES}

    SELECT DISTINCT ?task WHERE {
      GRAPH ?g {
        ?job a ${sparqlEscapeUri(JOB_TYPE)};
          task:operation ${sparqlEscapeUri(jobOperationUri)}.

        ?task dct:isPartOf ?job;
          a ${sparqlEscapeUri(TASK_TYPE)};
          task:operation ${sparqlEscapeUri(taskOperationUri)};
          adms:status ${sparqlEscapeUri(statusUri)}.
      }
    }
  `;

  const results = parseResult(await query(queryString));

  if (results.length) {
    return results[0].task;
  } else return null;
}
