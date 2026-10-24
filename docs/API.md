# API Reference

Base URL for local development: `http://localhost:3000`. JSON request and response bodies are used. Authentication is a browser cookie named `collab_session`; it is `httpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Do not send a session token in JSON or logs.

The currently implemented endpoints are listed below. Version history is not exposed as an API route. Delete operations are limited to a user's own comment, except owner-authorized workspace membership removal.

## Authentication

### `POST /api/auth/register`

Body: `{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "at least 10 characters" }`

Success: `201` with a public user object and session cookie. Creates a personal workspace, owner membership, and starter document atomically. Email is normalized to lowercase. Passwords are bcrypt-hashed; passwords longer than 72 UTF-8 bytes are rejected.

Errors: `400` invalid input, `409` email already registered, `500` generic account/database failure.

### `POST /api/auth/login`

Body: `{ "email": "ada@example.com", "password": "..." }`

Success: `200` with a public user object and session cookie. Invalid credentials return the same `401` response.

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

Currently returns `503`: the fail-closed operational gate keeps collaboration disabled in every environment. If re-enabled after the persistence lifecycle and migration prerequisites are resolved, ticket issuance requires exact `NODE_ENV=development`, explicit opt-in, a valid session, and owner/editor membership. Tickets are random, single-use, document-scoped, session-bound, and expire after one minute; only their hashes are stored. Database durability is not implied by provider sync.

## Proposed Document Version History Contract (Not Implemented)

The current editor stores TipTap JSON in `Document.content`, but `DocumentVersion` currently requires a binary `yState` and has no JSON snapshot field. The document editor's History panel therefore reports that history is unavailable; no version endpoints, snapshots, previews, or restores are implemented. Do not place JSON in `DocumentVersion.yState`.

The smallest schema prerequisite for legacy-editor history is a nullable `DocumentVersion.content Json?` field and making `DocumentVersion.yState` nullable. Existing binary Yjs snapshots must remain unchanged. A migration should preserve all existing rows and keep JSON and binary snapshots distinct (preferably with a constraint requiring exactly one snapshot representation).

After that migration is reviewed and applied, the proposed API is:

### `GET /api/documents/{documentId}/versions`

Requires a valid session and workspace membership; nonmembers receive `404`. Returns metadata only, newest first:

```json
{
  "versions": [
    {
      "id": "version-id",
      "label": "Before major edits",
      "createdAt": "2026-10-24T10:00:00.000Z",
      "author": { "id": "user-id", "name": "Ada Lovelace" }
    }
  ]
}
```

### `GET /api/documents/{documentId}/versions/{versionId}`

Requires workspace membership and verifies that the version belongs to the URL document. Returns the JSON snapshot for a read-only preview; never returns Yjs binary state through this legacy JSON contract.

### `POST /api/documents/{documentId}/versions/{versionId}/restore`

Requires OWNER or EDITOR membership. Body: `{ "expectedRevision": 12 }`. In a single database transaction, compare-and-set the document's current `contentRevision`, preserve the pre-restore current JSON as a version when it differs from the selected snapshot, apply the selected JSON, and increment the revision. A stale revision returns `409` with the current revision; it must not overwrite content. VIEWER and COMMENTER roles receive `403`.

Snapshots should be created server-side only after a successful content write, at meaningful save boundaries rather than for each debounced keystroke. The snapshot operation and revision update must be atomic so an unsuccessful or stale write cannot create a misleading history entry. A retention policy should be selected before enabling automatic snapshots.

## Error Shape

Validation and authorization errors use `{ "error": "..." }` with a 4xx status. Unexpected failures handled by the shared wrapper use a generic `500` response. Registration has its own generic failure handler. Automated database integration tests are not included; authenticated live smoke tests have verified document content reads and saves.