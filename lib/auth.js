// From https://docs.microsoft.com/en-us/azure/active-directory/develop/tutorial-v2-nodejs-console

import {
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  AAD_ENDPOINT,
  GRAPH_ENDPOINT
} from '../config'
const msal = require('@azure/msal-node');

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL Node configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/configuration.md
 */
const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: AAD_ENDPOINT + '/' + TENANT_ID,
    clientSecret: CLIENT_SECRET,
/*  Use that if certificate :
    clientCertificate: {
      thumbprint: "cert_thumbprint",
      privateKey: "cert_privateKey"
    } */
  }
};

/**
 * With client credentials flows permissions need to be granted in the portal by a tenant administrator.
 * The scope is always in the format '<resource>/.default'. For more, visit:
 * https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow
 */
const tokenRequest = {
  scopes: [GRAPH_ENDPOINT + '/.default'],
};

const apiConfig = {
  // TODO change this with what we're trying to query
  uri: GRAPH_ENDPOINT + '/v1.0/users',
};

/**
 * Initialize a confidential client application. For more info, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/initialize-confidential-client-application.md
 */
const cca = new msal.ConfidentialClientApplication(msalConfig);

/**
 * Acquires token with client credentials.
 * @param {object} tokenRequest
 */
async function getToken(tokenRequest) {
  return await cca.acquireTokenByClientCredential(tokenRequest);
}

module.exports = {
  apiConfig: apiConfig,
  tokenRequest: tokenRequest,
  getToken: getToken
};
