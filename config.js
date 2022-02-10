// Credentials

if(!process.env.TENANT_ID)
  throw `Expected 'TENANT_ID' to be provided.`;
export const TENANT_ID = process.env.TENANT_ID;

if(!process.env.CLIENT_ID)
  throw `Expected 'CLIENT_ID' to be provided.`;
export const CLIENT_ID = process.env.CLIENT_ID;

if(!process.env.CLIENT_SECRET)
  throw `Expected 'CLIENT_SECRET' to be provided.`;
export const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Endpoints

if(!process.env.AAD_ENDPOINT)
  throw `Expected 'AAD_ENDPOINT' to be provided.`;
export const AAD_ENDPOINT = process.env.AAD_ENDPOINT;

if(!process.env.GRAPH_ENDPOINT)
  throw `Expected 'GRAPH_ENDPOINT' to be provided.`;
export const GRAPH_ENDPOINT = process.env.GRAPH_ENDPOINT;
