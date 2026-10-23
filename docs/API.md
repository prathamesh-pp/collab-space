# API Reference

Base URL for local development: `http://localhost:3000`. JSON request and response bodies are used. Authentication is a browser cookie named `collab_session`; it is `httpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Do not send a session token in JSON or logs.

The currently implemented endpoints are listed below. Comments, version history, member management, invitations, realtime collaboration, and delete operations are not exposed as API routes.

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

## Error Shape

Validation and authorization errors use `{ "error": "..." }` with a 4xx status. Unexpected failures handled by the shared wrapper use a generic `500` response. Registration has its own generic failure handler. Automated database integration tests are not included; authenticated live smoke tests have verified document content reads and saves.