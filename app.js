import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import { getQueryParams } from './lib/delta-processing';
import {
  USERNAME,
  PASSWORD,
  SITE,
  LIST
} from './config';

const $SP = require("sharepointplus/dist");

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

/**
 * Update the sharepoint list linked to some deltas.
 * The order is important : we should first process the deletes and only once it's done the inserts.
 *
 * @param {Array} deltas The deltas from which to deduce the query params
 */
async function updateSharepointList(deletes, inserts) {
  try {
    const deletesQueryParams = await getQueryParams(deletes);
    const insertsQueryParams = await getQueryParams(inserts);

    console.log('deletesQueryParams', deletesQueryParams);
    console.log('insertsQueryParams', insertsQueryParams);

    const credentialOptions = {
      username: USERNAME,
      password: PASSWORD
    };

    const sp = $SP().auth(credentialOptions);

    // Example of GET
    const res = await sp.list(LIST, SITE).get({
      fields: "Title,KBOnr"
    });
      
    res.map(data => {
      console.log(data.getAttribute('Title'), ' and ', data.getAttribute('KBOnr'));
    });

    // Example of UPDATE
    sp.list(LIST, SITE).update(
      { KBOnr: "TEST" }, // 0751541350
      { where: "Title = 'Digipolis_Antwerpen'" }
    );
  } catch (e) {
    console.log('Error: ', e);
  }
}

app.use(errorHandler);
