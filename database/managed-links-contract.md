# Managed workspace links

The board reads owner-scoped `workspace_links`. Its delete action hides a bookmark
through `set_workdesk_link_removed(p_link, p_removed)`. It never deletes the linked
document. The deleted-items view can restore it. The RPC checks workspace access
before locking or modifying the row; anonymous execution is denied.

During an authorized workdesk refresh, the operator first reads all existing links,
including `removed_at`. Add only a few useful, verified references for ongoing work.
Compare both the URL and the underlying resource to avoid duplicates or returning a
deleted bookmark under an alternate URL. Do not copy every source or recent file.

Use `ingest_workdesk_links(workspace_uuid, feed_json)` from the approved operator:

```json
{
  "schema_version": 1,
  "type": "dahandot.links",
  "checked_at": "2026-01-01T13:00:00+09:00",
  "links": [{"label": "Reference title", "url": "https://example.com/reference", "description": "Purpose of this reference"}]
}
```

Use the actual verification timestamp and HTTP(S) URLs confirmed by source tools.
Never use credentials or guessed URLs. Escape SQL string literals safely. The RPC
preserves IDs/order, suppresses removed URLs, and ignores stale/replayed timestamps.
It is not callable by clients. Read back counts and saved rows after ingestion.
Real labels, URLs and descriptions belong only in the private database, never this
repository. Existing task states, source content and sharing settings are unchanged.
