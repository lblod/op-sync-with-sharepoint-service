import bodyParser from "body-parser";
import { app, errorHandler } from "mu";
import { LOG_INCOMING_DELTA, WAIT_FOR_INITIAL_SYNC } from "./env-config";
import { executeHealingTask } from "./jobs/healing/main";
import { executeSyncingTask } from "./jobs/syncing/main";
import {
  doesDeltaContainNewTaskToProcess,
  hasInitialSyncRun,
  isBlockingJobActive,
  isInitialSyncOrHealingJobScheduled,
} from "./jobs/utils";
import { ProcessingQueue } from "./lib/processing-queue";
import { storeError } from "./lib/utils";
import { isSharepointConfigValid, getListInfo } from "./lib/sharepoint-helpers";

app.use(
  bodyParser.json({
    type: function (req) {
      return /^application\/json/.test(req.get("content-type"));
    },
    limit: "500mb",
  })
);

const producerQueue = new ProcessingQueue();

// Checks if sharepoint config is valid on startup (aka if we can log in and read a list)
isSharepointConfigValid(getListInfo);

// The services takes a while to start and can miss the background job initiating the initial sync
isInitialSyncOrHealingJobScheduled().then(result => {
  if (result) {
    console.log('Executing initial sync or healing job created before startup');
    startInitialSyncOrHealing();
  } else {
    console.log('No initial sync or healing job pending');
  }
});

app.post("/delta", async function (req, res) {
  try {
    const body = req.body;

    if (LOG_INCOMING_DELTA) {
      console.log(`Receiving delta ${JSON.stringify(body)}`);
    }

    if (await doesDeltaContainNewTaskToProcess(body)) {
      startInitialSyncOrHealing();
    } else if (await isBlockingJobActive()) {
      // Durig the healing and the inital sync, we want as few as much moving parts,
      // If a delta comes in while the healing process is busy, this might yield inconsistent/difficult to troubleshoot results.
      // Suppose:
      //  - healing produces statement S1 at t1: "REMOVE <foo> <bar> <baz>."
      //  - random service produces statement S2 at t2: "ADD <foo> <bar> <baz>."
      //  - Suppose S1 and S2 are about the same resource and S2 gets processed before S2 (Because, e.g. healing takes more time)
      //  This would result in out of sync data between our triplestore and the sharepoint list, which affects the clients information too.
      //  In our case, this would be fixed by the next healing though.
      console.info("Blocking jobs are active, skipping incoming deltas");
    } else if (WAIT_FOR_INITIAL_SYNC && !(await hasInitialSyncRun())) {
      // To sync data consistently and correctly, an initial sync needs to have run.
      // It ensures we have a common fixed value that we can map on (triplestore/sharepoint list) for each resource that needs to be synced.
      // Note: WAIT_FOR_INITIAL_SYNC is mainly meant for debugging purposes, defaults to true
      console.info("Initial sync did not run yet, skipping incoming deltas");
    } else {
      // Normal operation mode: syncing incoming data with configured sharepoint list
      // Put in a queue, because we want to make sure to have them ordered.
      producerQueue.addJob(async () => await executeSyncingTask(body));
    }
    res.status(202).send();
  } catch (error) {
    console.error(error);
    await storeError(error);
    res.status(500).send();
  }
});

function startInitialSyncOrHealing() {
  // From here on, the database is source of truth and the incoming delta was just a signal to start
  console.log(`Healing process (or initial sync) will start.`);
  console.log(
    `There were still ${producerQueue.queue.length} jobs in the queue`
  );
  console.log(
    `And the queue executing state is on ${producerQueue.executing}.`
  );
  producerQueue.queue = []; // Flush all remaining jobs, we don't want moving parts cf. next comment
  producerQueue.addJob(async () => {
    return await executeHealingTask();
  });
}

app.use(errorHandler);
