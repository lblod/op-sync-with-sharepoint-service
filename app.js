import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import { getQueryParams } from './lib/delta-processing';

const CONFIG = require('/config/mappings.json')

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
  const deletesQueryParams = await getQueryParams(deletes);
  const insertsQueryParams = await getQueryParams(inserts);

  console.log('deletesQueryParams', deletesQueryParams);
  console.log('insertsQueryParams', insertsQueryParams);

  // To connect to Sharepoint, if we have this registration https://www.leonarmston.com/2022/01/pnp-powershell-csom-now-works-with-sharepoint-sites-selected-permission-using-azure-ad-app/,
  // we can try using https://pnp.github.io/pnpjs/authentication/server-nodejs/#call-sharepoint
  // Update : broken page, use https://web.archive.org/web/20210118233746/https://pnp.github.io/pnpjs/authentication/server-nodejs/

  // TODO - An insert can be entirely new data and not an update. See if has to be handled differently through the queries
}

// We were supposed to log in via Azure AD, but in the end not sure we'll do it like that.
// Here's some pieces of code that are logging via azure and using microsoft graph.
// TODO - Clean if unnecessary in the end.

/* 
      import fetch from './lib/fetch';
      import auth from './lib/auth';
      import "isomorphic-fetch";
      import { ClientSecretCredential } from "@azure/identity";
      import { Client } from "@microsoft/microsoft-graph-client"
      import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
      import {
        TENANT_ID,
        CLIENT_ID,
        CLIENT_SECRET
      } from './config'

      // USING MSAL NODE, WHICH IS A MORE COMPLETE VERSION OF AZURE IDENTITY
      // REMOVE IT IF AZURE IDENTITY WORKS

      // Here we get an access token. As it is valid 90 days, we don't request it only
      // once on service startup but for every request.
      const authResponse = await auth.getToken(auth.tokenRequest);

      // call the web API with the access token
      const result = await fetch.callApi(auth.apiConfig.uri, authResponse.accessToken);
      console.log('Result of the API call', result);

      // -----------------------------------------------------------------------------------
      // OR
      // -----------------------------------------------------------------------------------

      // USING AZURE IDENTITY

      // Create an instance of the TokenCredential class that is imported
      const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
      // OR
      //const credential = new ClientCertificateCredential(TENANT_ID, CLIENT_ID, CLIENT_CERTIFICATE_PATH);

      // Set your scopes and options for TokenCredential.getToken (Check the ` interface GetTokenOptions` in (TokenCredential Implementation)[https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/core/core-auth/src/tokenCredential.ts])
      // TODO Scope might be different, see with what Patrick did in Postman
      const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes: [".default"] });

      const client = Client.initWithMiddleware({
        debugLogging: true,
        authProvider,
      });

      await client.api('/sites/{site-id}/lists/{list-id}/items/{item-id}')
        .get();

      const fieldValueSet = {
        Color: 'Fuchsia',
        Quantity: 934
      };
      await client.api('/sites/{site-id}/lists/{list-id}/items/{item-id}/fields')
        .update(fieldValueSet); */

app.use(errorHandler);
