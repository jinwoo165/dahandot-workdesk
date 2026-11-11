# Collection completion evidence

`collection-results.sql` adds an owner-readable latest-result table and an operator-only, security-invoker RPC. It does not modify task states or create source content. Never put real work data, reports, or the private automation prompt in this repository.

After ingesting a feed and reading the stored result back, the operator calls `record_workdesk_collection(workspace_uuid, report_json)`. Use the actual source observation time from the matching feed, not the time the browser refreshed.

| Field | Contract |
| --- | --- |
| `schema_version`, `source_id`, `run_id` | Version 1, a source below, and a unique run identifier |
| `checked_at` | Actual observation timestamp, including timezone |
| `status` | `ok`, `partial`, or `failed` |
| `scope` | `description`, timezone-aware `from` and exclusive `to`, and `limitations` array |
| `checks` | Required keys below, each with numeric `expected`, `checked`, boolean `complete`, and optional `reason` |
| `missing` | Array of `{target, reason}`; empty only when no required work remains |
| `detail` | Brief factual outcome, up to 6,000 characters |
| `feed_batch_id` / `file_batch_id` | The matching stored feed ID, or null on a failed attempt without a saved feed |
| `next_expected_at` / `schedule_verified_at` | Next weekday 13:00 Asia/Seoul verified against the Korean holiday calendar, and the actual calendar-check time; both null if unknown |

| Source | Required check keys |
| --- | --- |
| `dooray-mail` | `listing`, `content`, `attachments` |
| `dooray-favorites` | `favorites`, `history`, `attachments` |
| `dooray-calendar` | `listing`, `details` |
| `google-primary`, `google-secondary` | `listing` |
| `onedrive-files` | `modified_search`, `created_search`, `folder_listing`, `metadata` |

Counts must use the same unit per check, explained in the scope/detail. An unknown total is not zero: omit the unknown check, describe the missing range and reason, and record an incomplete or failed result. A verified empty range can be complete at 0/0. Content and attachment checks concern the items needed to assess the authorized work scope.

Completion requires every required check complete with matching counts, no missing targets, and a persisted feed with the same workspace, source, and observation time. The operator still must read back the ingested tasks/events/files: the RPC verifies linkage and structure, not the truth of a narrative or whether a human read a document.

For OneDrive, a raw file feed can remain `partial` because of permanent search-format limitations while a completion report is `ok` for the explicitly declared supported-format search plus designated folder. Unread pages, saturated searches, missed folders, or failed metadata reads prevent completion. File content summaries and feed backup are separate results.

The RPC preserves the last success when a newer attempt fails; it ignores older observations and rejects same-time conflicting evidence. The UI keeps each source independently, prioritizes newer actual failures, and distinguishes UI read errors from collector failures. Historical partial records are not retroactively promoted. A verified scheduled check overdue by 30 minutes displays a delay; there is no blanket 36-hour expiry across holidays or weekends.

After calling the RPC, read `source_collection_results` back and verify `run_id`, `status`, `verified_at`, `checks`, and `missing`. No browser role can write results or call the RPC. The migration grants owner-scoped SELECT only and adds Realtime notifications.
