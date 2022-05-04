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
