// Credentials

if(!process.env.USERNAME)
  throw `Expected 'USERNAME' to be provided.`;
export const USERNAME = process.env.USERNAME;

if(!process.env.PASSWORD)
  throw `Expected 'PASSWORD' to be provided.`;
export const PASSWORD = process.env.PASSWORD;

// Sharepoint list info

if(!process.env.LIST)
  throw `Expected 'LIST' to be provided.`;
export const LIST = process.env.LIST;

if(!process.env.SITE)
  throw `Expected 'SITE' to be provided.`;
export const SITE = process.env.SITE;

if(!process.env.SHAREPOINT_UUID_FIELD_NAME)
  throw `Expected 'SITE' to be provided.`;
export const SHAREPOINT_UUID_FIELD_NAME = process.env.SHAREPOINT_UUID_FIELD_NAME;

// Retry mechanism
export const RETRY =  process.env.RETRY == "false" ? false : true;
export const RETRY_MAX_ATTEMPTS = parseInt(process.env.RETRY_MAX_ATTEMPTS || 3);
export const RETRY_TIMEOUT_INCREMENT_FACTOR = parseFloat(process.env.RETRY_TIMEOUT_INCREMENT_FACTOR || 0.3);
