# Device synchronization

`workdesk_user_state` stores per-workspace, per-authenticated-user receipts,
conversation drafts and theme/scenery preferences. RLS requires both the user
identity and the existing workspace access check. Anonymous access is denied.

- `read:<freshKey>`: insert-only receipt, merged with legacy browser receipts.
- `draft:<task/event/general target>`: body and idempotent message UUID. Empty
  body is a tombstone after sending; saving a draft does not submit a message.
- `pref:theme`, `pref:scenery`: appearance choices, separate keys.

Writes use `save_workdesk_user_state` with the last read revision. Concurrent
draft edits preserve the pending local text and show the other device's text,
requiring a choice. Preference conflicts accept the committed server value.
Pending changes are cached under a user/workspace-specific browser key and
retried on refresh/reconnect. A server response is required to display a draft
as synchronized. New typing during an in-flight write is retained.

Realtime, the existing 30-second refresh, focus and visibility refresh fetch
these records. Both devices must run version 2.15.0 or newer. Legacy receipts
are merged when each device opens the updated application. No task/source state
is changed by receipt migration. Existing sent messages, tasks, link pinning,
calendar overrides and hidden-item preferences keep their existing contracts.

Navigation, search, scroll positions and responsive layout remain local so one
device does not unexpectedly move the other device's viewport. Unsaved edits
in task-edit forms still require the existing Save action; conversation drafts
are autosaved. Offline changes cannot reach another device until reconnected.

Validation: two-client unit tests cover receipts, draft continuation/clearing,
simultaneous editing, pending-write races, offline recovery and account cache
isolation. Database validation uses a rolled-back transaction to verify the
RPC revision check and RLS isolation, without leaving test rows behind.
