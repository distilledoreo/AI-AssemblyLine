# Authentication and Access Control

AI AssemblyLine supports both single-user creators and team production. This document defines the authentication provider, session model, role-based access, and permission enforcement.

## Authentication provider

The MVP should use **NextAuth.js** (Auth.js v5) with the following providers:

- **Credentials provider:** email and password for self-hosted or local development.
- **OAuth providers:** Google and GitHub for convenience.

NextAuth handles session tokens, CSRF protection, and callback URLs. Sessions should use **database-backed sessions** (not JWTs) so that sessions can be revoked server-side when roles change or users are removed.

Google and GitHub sign-in buttons are shown on `/signin` only when the matching provider credentials are configured. The app accepts Auth.js-style names and common provider aliases:

| Provider | Client ID variables | Client secret variables |
|----------|---------------------|-------------------------|
| Google | `AUTH_GOOGLE_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_ID` | `AUTH_GOOGLE_SECRET`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SECRET` |
| GitHub | `AUTH_GITHUB_ID`, `GITHUB_CLIENT_ID`, `GITHUB_ID` | `AUTH_GITHUB_SECRET`, `GITHUB_CLIENT_SECRET`, `GITHUB_SECRET` |

This OAuth sign-in is for authenticating users into AI AssemblyLine. It is separate from provider API credentials used for model calls.

Application authorization accepts both the local credentials session cookie and the database-backed Auth.js session. OAuth sessions add the Auth.js user ID to the session payload and the app reloads that user from the repository before authorizing workspace, project, and API access.

## Session model

- Sessions are stored in Postgres via the Prisma adapter for NextAuth.
- Session tokens are httpOnly, secure, sameSite cookies.
- Sessions expire after 30 days of inactivity. Active use extends the session.
- A user can have multiple active sessions.
- Workspace owners can revoke all sessions for a member.

Local credentials sign-in persists the user upsert and new database session as one Prisma nested write. If the session cannot be created, the sign-in must fail instead of leaving a credential user update without an active session.

## Role hierarchy

Access control operates at two levels: **workspace** and **project**.

### Workspace roles

| Role | Purpose |
|------|---------|
| `owner` | Full workspace control: billing, settings, member management, provider keys, project creation, deletion |
| `admin` | Member management, provider keys, project creation. Cannot delete workspace or transfer ownership |
| `member` | Can access projects they are assigned to. Cannot manage workspace settings or keys |

### Project roles

| Role | Purpose |
|------|---------|
| `owner` | Full project control: settings, deletion, export, member assignment, all production actions |
| `producer` | Workflow management: approvals, assignments, generation settings, export. Cannot delete project |
| `artist` | Upload references, edit assets, create/edit storyboards, markup. Cannot approve or manage settings |
| `reviewer` | Comment on and approve assigned work. Cannot edit assets or storyboards directly |
| `viewer` | Read-only access to all project content |

## Permission matrix

| Action | owner | producer | artist | reviewer | viewer |
|--------|:-----:|:--------:|:------:|:--------:|:------:|
| View project dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit project settings | ✓ | — | — | — | — |
| Delete project | ✓ | — | — | — | — |
| Manage project members | ✓ | ✓ | — | — | — |
| Upload script | ✓ | ✓ | — | — | — |
| Run script analysis | ✓ | ✓ | — | — | — |
| Edit scene/shot metadata | ✓ | ✓ | ✓ | — | — |
| Edit asset requirements | ✓ | ✓ | ✓ | — | — |
| Upload asset references | ✓ | ✓ | ✓ | — | — |
| Request asset generation | ✓ | ✓ | ✓ | — | — |
| Approve/reject assets | ✓ | ✓ | — | ✓ | — |
| Lock/unlock assets | ✓ | ✓ | — | — | — |
| Generate storyboard frames | ✓ | ✓ | ✓ | — | — |
| Edit storyboard frames | ✓ | ✓ | ✓ | — | — |
| Use drawing/markup tools | ✓ | ✓ | ✓ | ✓ | — |
| Approve/reject frames | ✓ | ✓ | — | ✓ | — |
| Generate video clips | ✓ | ✓ | ✓ | — | — |
| Approve/reject clips | ✓ | ✓ | — | ✓ | — |
| Add review comments | ✓ | ✓ | ✓ | ✓ | — |
| Export project | ✓ | ✓ | — | — | — |
| Cancel generation jobs | ✓ | ✓ | ✓* | — | — |
| Select provider/model | ✓ | ✓ | ✓ | — | — |

*Artists can only cancel their own jobs.

## Enforcement model

Permissions are enforced at the **API route layer** using middleware, not only in the UI.

1. Every mutating API route checks the session, loads the user's project role, and validates the action against the permission matrix.
2. Middleware pattern: `requireAuth()` → `requireWorkspaceRole(workspaceId, minRole)` → `requireProjectRole(projectId, allowedRoles[])`.
3. Row-level checks (e.g. "artists can only cancel their own jobs") are handled in the service layer after the role check.
4. Provider API keys are decrypted server-side only, never sent to the client.

Asset Bible mutations enforce permissions per action: reference uploads use `upload_asset_references`, provider generation uses `request_asset_generation`, approval/rejection uses `approve_reject_assets`, locking uses `lock_unlock_assets`, style updates use `edit_project_settings`, and detail/split/merge corrections use `edit_asset_requirements`.

Storyboard mutations enforce permissions per action: provider generation uses `generate_storyboard_frames`, sketch/markup uploads use `use_drawing_markup_tools`, approval/rejection uses `approve_reject_frames`, comments use `add_review_comments`, and other frame metadata edits use `edit_storyboard_frames`.

Mutation handlers must also verify object ownership after the role check. For example, a user with review rights on one project cannot update a frame or clip version from another project by guessing its ID.

## Invitations

- Workspace owners and admins can invite users by email.
- Invitations create a pending member record with a signed token, expiring after 7 days.
- Accepting an invitation creates the User account (if new) or links the existing account.

## Single-user mode

For single creators, the workspace and project are auto-created on first login. The user is `owner` at both levels. Team UI is hidden but the data model remains the same so team mode can be enabled later without migration.

## ChatGPT and Google AI OAuth boundaries

OpenAI [GPT Actions authentication](https://platform.openai.com/docs/actions/authentication) supports OAuth when ChatGPT users need to authenticate to **this app's API** from a custom GPT action. That is not a general mechanism for AI AssemblyLine to spend a user's ChatGPT subscription quota for OpenAI API calls. OpenAI generation inside this app still uses server-side provider credentials, either the encrypted workspace OpenAI key or `OPENAI_API_KEY`.

For Google model calls, production [Vertex AI authentication](https://cloud.google.com/vertex-ai/docs/authentication) uses Google Cloud authentication such as Application Default Credentials or service-account credentials. Google AI Studio/Gemini API keys and Google account sign-in are separate from a user's Google AI Pro subscription; the app should not imply that signing in with Google grants model API quota.
