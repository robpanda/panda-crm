# Internal Comms Architecture

Last updated: 2026-03-04

## 1) UI Tab/Data Map

### Jobs (`frontend/src/pages/OpportunityDetail.jsx`)

Messages category sub-tabs:
- Conversations -> SMS/Email conversation timeline (`conversations`, `emails` queries)
- Inter Notes -> `InternalNotesTabs` (`opportunitiesApi.getNotes` / create/update/delete note)
- Internal Comments -> `InternalComments` (`opportunitiesApi.getInternalComments` / CRUD)
- Communications -> read-only imported AccuLynx activities (`sourceType === 'ACCULYNX_IMPORT`)
- Notifications -> `notificationsApi.getNotificationsByOpportunity`
- Activity -> non-archive activity timeline (`sourceType !== 'ACCULYNX_IMPORT`)

### Leads (`frontend/src/pages/LeadDetail.jsx`)

Tabs:
- Details
- Activity -> `CommunicationsTab` (customer-facing comms)
- Notes -> `InternalNotesTabs` (`leadsApi.getNotes` / CRUD)
- Internal Comments -> `InternalComments` (`leadsApi.getInternalComments` / CRUD)

### Shared Internal Thread UI

Both internal note and internal comment UIs now use:
- `frontend/src/components/ThreadMessageList.jsx`
- mention highlighting via shared `ThreadBody`

## 2) Backend Execution Map

### `addLeadNote` (Leads)
Route: `POST /api/leads/:id/notes`
Flow:
1. Create note in `note` table
2. Call `notifyLeadMentions(...)`
3. `notifyLeadMentions` posts to notifications service `POST /api/notifications/mentions/dispatch`
4. Return success even if mention delivery fails (best-effort)

### `createNoteReply` (Leads)
Route: `POST /api/leads/:id/notes/:noteId/replies`
Flow:
1. Create reply note (`title: REPLY|<noteId>`)
2. Call `notifyLeadMentions(...)`
3. Notifications service dispatch endpoint handles in-app/email/sms attempts

### `addOpportunityReply` (Jobs)
Route: `POST /api/opportunities/:id/replies`
Flow:
1. Create conversation reply note (`title: CONVERSATION_REPLY|<channel>`)
2. Call `notifyOpportunityMentions(...)`
3. `notifyOpportunityMentions` posts to notifications service mention dispatch endpoint

### `createInternalComment` (Jobs + Leads)
Routes:
- `POST /api/leads/:id/internal-comments`
- `POST /api/opportunities/:id/internal-comments`
Flow:
1. Create internal comment note (`title: INTERNAL_COMMENT|...`)
2. Call domain mention notifier (`notifyLeadMentions` / `notifyOpportunityMentions`)
3. Dispatch via notifications service endpoint

## 3) Notification Source-of-Truth

Canonical mention entrypoint:
- `POST /api/notifications/mentions/dispatch`
- Controller: `services/notifications/src/controllers/notificationController.js`
- Dispatcher: `services/notifications/src/services/mentionDispatcher.js`

Canonical payload:
- `actorId`
- `recipients[]`
- `entityType`, `entityId`
- `noteId` and/or `commentId`
- `snippet`/`bodyPreview`
- `actionPath`
- `correlationId`

Dispatch behavior:
- Dedupes recipients
- Skips actor self-notify
- Creates in-app notification record (`type=MENTION`, `readAt=null`) first
- Attempts email/SMS/push best-effort
- Never rolls back in-app notification on delivery failure

## 4) Inbox/Outbox

Schema:
- `notifications.actor_id` (nullable, indexed)

API:
- Inbox: `GET /api/notifications?userId=<me>`
- Outbox: `GET /api/notifications/outbox?actorId=<me>`

Frontend:
- New page: `/notifications` (`frontend/src/pages/Notifications.jsx`)
- Bell remains unread shortcut (Inbox unread)

## 5) Internal vs Customer-Facing Separation

Internal comms:
- Internal Notes + Internal Comments
- Mention dispatch only to system users (user IDs)

Customer comms:
- Conversations/Communications tabs (SMS/email logs/imported external activity)
- Archive (`ACCULYNX_IMPORT`) is visible read-only and not part of mention dispatch

## 6) Quick Verification (Staging/Prod)

1. Create Lead note with `@mention`.
2. Confirm note saves even if message providers are unavailable.
3. Confirm `notifications` row created (`type=MENTION`, `actor_id` set, `user_id` recipient).
4. Confirm recipient sees bell unread increment + Inbox entry.
5. Confirm sender sees Outbox entry.
6. If recipient has `smsEnabled=true` + `smsMentions=true` + `mobilePhone`, confirm SMS attempt (`smsSent` true on success).
7. If recipient has `smsMentions=false`, confirm in-app notification exists and SMS is not attempted.
8. In Job Communications Archive, confirm read-only rendering and no mention composer.
