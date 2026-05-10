# Authentication and Access Control

AI AssemblyLine supports both single-user creators and team production. This document defines the authentication provider, session model, role-based access, and permission enforcement.

## Authentication provider

The MVP should use **NextAuth.js** (Auth.js v5) with the following providers:

- **Credentials provider:** email and password for self-hosted or local development.
- **OAuth providers:** Google and GitHub for convenience.

NextAuth handles session tokens, CSRF protection, and callback URLs. Sessions should use **database-backed sessions** (not JWTs) so that sessions can be revoked server-side when roles change or users are removed.

## Session model

- Sessions are stored in Postgres via the Prisma adapter for NextAuth.
- Session tokens are httpOnly, secure, sameSite cookies.
- Sessions expire after 30 days of inactivity. Active use extends the session.
- A user can have multiple active sessions.
- Workspace owners can revoke all sessions for a member.

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

## Invitations

- Workspace owners and admins can invite users by email.
- Invitations create a pending member record with a signed token, expiring after 7 days.
- Accepting an invitation creates the User account (if new) or links the existing account.

## Single-user mode

For single creators, the workspace and project are auto-created on first login. The user is `owner` at both levels. Team UI is hidden but the data model remains the same so team mode can be enabled later without migration.
