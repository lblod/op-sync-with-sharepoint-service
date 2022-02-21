# op-sync-with-sharepoint-service

Service to sync data from OP to some Sharepoint lists.

## How to

Add the following to your stack:

```
  sync-with-sharepoint:
    image: lblod/op-sync-with-sharepoint-service  
    links:
      - db:database
```