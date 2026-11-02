# Collabry API Reference

Base URL for local development: `http://localhost:3000`. JSON request and response bodies are used. Authentication is a browser cookie named `collab_session`; it is `httpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Do not send a session token in JSON or logs.

The currently implemented endpoints are listed below. Delete operations are limited to a user's own comment, except owner-authorized workspace membership removal.

## Authentication

### `POST /api/auth/register`

Body: `{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "at least 10 characters, at most 72 UTF-8 bytes" }`

Success: `201` with a public user object and session cookie. Creates a personal workspace, owner membership, and starter document atomically. Email is normalized to lowercase. Passwords are bcrypt-hashed; passwords longer than 72 UTF-8 bytes are rejected.

Errors: `400` invalid input or password exceeding 72 UTF-8 bytes, `409` email already registered, `500` generic account/database failure.

### `POST /api/auth/login`

Body: `{ "email": "ada@example.com", "password": "..." }`

Success: `200` with a public user object and session cookie. Invalid credentials return the same `401` response. Password values over 72 UTF-8 bytes are rejected with `400` before bcrypt comparison.

### `POST /api/auth/logout`

Revokes the current session and deletes the cookie. Success: `200 { "ok": true }`.

## Workspaces

All workspace endpoints require a valid session.

### `GET /api/workspaces`

Returns only workspaces where the caller is a member, with their role and document summaries.

### `GET /api/workspaces/{workspaceId}/members`

Returns member names, email identifiers, roles, and join timestamps. Any workspace member may view the list; nonmembers receive `404`.

### `PATCH /api/workspaces/{workspaceId}/members/{userId}`

Owner-only role update. Body: `{ "role": "EDITOR" }`, with assignable roles limited to `EDITOR`, `COMMENTER`, or `VIEWER`; granting `OWNER` is not supported. A request to demote the last owner receives `409`.

### `DELETE /api/workspaces/{workspaceId}/members/{userId}`

Owner-only member removal. Removing the last owner receives `409`. Owner role changes and removals are checked in serializable transactions to preserve the last-owner invariant. Invites are not supported because the current schema has no invitation model.

### `POST /api/workspaces`

Body: `{ "name": "Product" }`. Creates the workspace, caller's `OWNER` membership, and an `Untitled` document in a transaction. Success: `201`.

## Documents

### `GET /api/workspaces/{workspaceId}/documents`

Returns document summaries and the caller's role. Nonmembers receive `404`.

### `POST /api/workspaces/{workspaceId}/documents`

Body: `{ "title": "Project brief" }` (title is optional; defaults to `Untitled`). Owner/editor only. Success: `201`; nonmembers get `404`, other members without edit access get `403`.

### `GET /api/documents/{documentId}`

Returns document metadata, validated TipTap JSON content (or `null` for documents not yet edited), the content revision, workspace id/name, member ids/names, and caller role. Raw Yjs state is not returned. Nonmembers receive `404`.

### `PATCH /api/documents/{documentId}`

Body: `{ "title": "Updated brief" }`. Owner/editor only. Success: `200` with the updated document summary.

### `PUT /api/documents/{documentId}/content`

Body: `{ "content": <TipTap JSONContent>, "expectedRevision": 0 }`. Content is restricted to the editor's supported paragraph, heading, list, bold, italic, and hard-break schema. Requests are size- and depth-bounded. Owner/editor only; nonmembers receive `404`, and other members receive `403`.

Success: `200 { "contentRevision": 1 }`. Saves use compare-and-swap revisions; stale writes receive `409` with the current revision and must reload before editing again.

### `GET /api/documents/{documentId}/comments`

Returns up to the 200 most recent comments in chronological order, including author name, timestamp, resolved status, and whether the comment belongs to the caller. Any workspace member may read comments; nonmembers receive `404`.

### `POST /api/documents/{documentId}/comments`

Body: `{ "text": "Please review this section." }`. Owner, editor, and commenter roles may create comments. Text is trimmed and must contain 1 to 2000 characters. Success: `201 { "comment": ... }`; viewers receive `403`.

### `PATCH /api/documents/{documentId}/comments/{commentId}`

Body: `{ "resolved": true }` or `{ "resolved": false }`. Owner, editor, and commenter roles may resolve or reopen a comment. Success: `200 { "comment": ... }`.

### `DELETE /api/documents/{documentId}/comments/{commentId}`

Deletes the caller's own comment only. All comment endpoints require an authenticated workspace member. Errors use the shared sanitized `{ "error": "..." }` response shape.

### `POST /api/documents/{documentId}/collaboration-ticket`

The endpoint returns `503` while `NEXT_PUBLIC_COLLABORATION_ENABLED` is not explicitly `true` for development or production. When enabled, ticket issuance requires a valid session and owner/editor membership. Tickets are random, single-use, document-scoped, session-bound, and expire after one minute; only their hashes are stored. Database durability is not implied by provider sync. Keep the production flag off until a separately deployed WebSocket service and persistence have been verified.

For deployments that run multiple Hocuspocus instances, configure the official `@hocuspocus/extension-redis` 3.4.4 with the same private `COLLABORATION_REDIS_URL` on each instance and set `COLLABORATION_REDIS_REQUIRED=true`. Redis carries Hocuspocus document-update and awareness messages; it does not persist documents. PostgreSQL Yjs state remains authoritative for persistence. Redis channels use the `collabry` prefix and the globally unique document ID; every connection is still authenticated and checked against current session, document, workspace membership, and editor role. On Redis disconnection, active sockets are closed and incoming messages fail closed; after reconnection, clients reconnect and request fresh single-use tickets. Local same-server presence tests and the real two-instance integration against dedicated loopback Memurai have passed; that Redis run used in-memory document persistence. PostgreSQL persistence and a deployed WebSocket service remain unverified.

## Document Version History

JSON snapshots use a separate nullable `DocumentVersion.content` column. Existing binary Yjs snapshots remain in `yState`; the additive migration makes that legacy column nullable without rewriting existing rows. Apply the migration before using these endpoints. Snapshots are explicit restore points, not created on every autosave.

### `GET /api/documents/{documentId}/versions`

Requires a valid session and workspace membership; nonmembers receive `404`. Returns JSON snapshot metadata newest first (maximum 100):

```json
{
  "versions": [
    {
      "id": "version-id",
      "label": "Before major edits",
      "createdAt": "2026-10-24T10:00:00.000Z",
      "user": { "name": "Ada Lovelace" }
    }
  ]
}
```

### `POST /api/documents/{documentId}/versions`

Body: `{ "label": "Before major edits" }`. Owner/editor only. Saves current valid TipTap JSON as a labeled snapshot and returns `201`; when persisted Yjs state exists, it is the snapshot source rather than the legacy JSON column. Empty or malformed content receives `409`. Snapshot creation returns `409` while live collaborative editing is configured because an in-flight document state cannot yet be snapshotted consistently.

### `POST /api/documents/{documentId}/versions/{versionId}/restore`

Requires OWNER or EDITOR membership. Verifies the version belongs to the URL document, preserves current valid JSON as a `Before restore` version in the same transaction, restores the selected snapshot, and increments `contentRevision` with compare-and-set protection against both JSON revision and persisted Yjs state. A concurrent edit returns `409`; VIEWER and COMMENTER roles receive `403`. Restore returns `409` while live collaborative editing is configured, because active Hocuspocus documents cannot yet be replaced safely. The UI reloads after a successful legacy-mode restore.

## PostgreSQL-backed version-history test

The PostgreSQL integration tests accept only the dedicated Neon project `collabry-production`, branch `collabry-test` (`br-steep-leaf-b4p3hqt3`), database `collabry_test`, using direct hostname `ep-muddy-thunder-b4hdbzfm.c-6.us-east-2.aws.neon.tech` and exactly `sslmode=require`, `sslaccept=strict`, and `channel_binding=require`. The shared guard rejects production and unknown hosts, localhost, pooled endpoints, and every database name except `collabry_test`; it never includes the supplied URL or credentials in validation errors. Set `COLLABORATION_TEST_DATABASE_URL` only for the test process, then run `npm run test:database:versions`. It creates uniquely identified fixture rows and removes only its own workspace and user fixtures; it does not migrate or reset the database. The dedicated branch/database identity and empty public schema were verified read-only; its migrations remain unapplied. If the test schema is not provisioned, run checked-in migrations against this dedicated test database only after a separate review and explicit approval. Never point migration commands at `neondb` or the production branch. The regular `npm test` suite runs only the offline URL-validator unit tests, not this integration test.

## Error Shape

Validation and authorization errors use `{ "error": "..." }` with a 4xx status. Unexpected failures handled by the shared wrapper use a generic `500` response. Registration has its own generic failure handler. An opt-in PostgreSQL version-history integration test is available but has not been run. The default unit suite uses in-memory repositories and does not verify live PostgreSQL behavior.
