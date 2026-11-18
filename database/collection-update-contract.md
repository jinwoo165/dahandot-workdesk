# Workdesk collection policy (2026-11-19)

This policy supersedes the earlier small-link-selection and restricted OneDrive discovery rules. It changes collection selection, not schedules, account permissions, user task state, or source documents.

## Business links

- Read business email bodies and the current favorite chat rooms within the existing collection windows.
- Ingest all verified business-related HTTP(S) links; exclude electronic-approval notifications, advertising email links, unsubscribe/tracking links, and credentials.
- Preserve removed links and user pin choices. Deduplicate by URL and source resource. Split ingestion into batches of at most 30 links when needed.
- The UI places up to seven user-pinned links first, then new links by creation time. Updating metadata must not make an existing link appear newly created.

## OneDrive recent documents

- Discover newly created and modified business files within the authorized personal company drive using both source creation and modification timestamps. Use a seven-day overlap from the last successful collection and record actual query boundaries and result caps.
- Supplement indexed search with direct folder/item metadata. Search support is limited to text-friendly formats; do not claim complete account coverage or absence of files based on unsupported formats.
- Exclude personal files, credentials, dependency libraries, automation feed files, and previously removed coursework artifacts. Do not restore the retired personal-workdesk directory.
- Read and summarize new files and changed working drafts, including newly added PDFs. Preserve source version timestamps; do not infer authorship from modification time.
- Store metadata through `ingest_workdesk_files`, verify it, then store version-matched summaries through `ingest_workdesk_file_summaries` and verify again.
- Summaries describe what was actually read. Distinguish draft/proposal/plan from approval or completion. Empty text extraction is not an empty document; record the limitation instead of inventing a summary.
- Display the newest version of each drive/item, ordered by source creation/modification time, with at most 30 files. No rolling seven-day display expiry. Older records remain in the database.
- NEW follows the UI's per-user read state and real file version. Collection must not alter timestamps just to trigger NEW.

## Completion and safety

Metadata collection and content-summary results are separate. Record actual counts, partial reading and failures. Preserve prior failures, user states and verified source links. Never include source bodies, credentials, private business rows or real file inventories in this repository.

Existing regular execution times and holiday checks remain unchanged. This contract does not introduce polling or claim real-time source ingestion.
