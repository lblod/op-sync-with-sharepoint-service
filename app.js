import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import { updateSharepointList } from './lib/sharepoint-helpers';

// TODO - Log an error + send an email each time a syncing fails
// See https://github.com/lblod/delta-consumer-file-sync-submissions/blob/master/lib/error.js

// TODO - Add a nighly cron job that heals the data in case something went wrong with the deltas
// It will get all the persons / organizations, flush their values in the list (only those that we'll replace)
// and push their current state from the publication graph

app.use(bodyParser.json({
  type: function (req) { return /^application\/json/.test(req.get('content-type')); },
  limit: '500mb'
}));

app.get('/', function (req, res) {
  res.send('Hello from sync-with-sharepoint ! :)');
});

app.post('/delta', async function (req, res) {
  try {
    const delta = req.body;

    const deletes = flatten(delta.map(changeSet => changeSet.deletes));
    const inserts = flatten(delta.map(changeSet => changeSet.inserts));

    if (deletes.length || inserts.length) {
      updateSharepointList(deletes, inserts);
    } else {
      console.log("No deletes or inserts in the deltas, skipping.");
    }
  }
  catch (e) {
    console.error(`General error processing delta notification ${e}`);
  }

  res.status(202).send();
});

app.use(errorHandler);
