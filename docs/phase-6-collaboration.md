# Phase 6 Collaboration

Phase 6 adds team production controls around the existing project workflow.

## Implemented user flow

1. Invite a collaborator to a project with a signed token.
2. Accept the invitation and add the user as a project member.
3. Assign a scene, shot, or asset to a project member.
4. Review project activity feed entries for invitations, membership changes, and assignments.
5. Enforce role permissions for collaboration and generation actions.
6. Surface locked-asset edit warnings by blocking continuity-detail edits until the asset is unlocked.

## Runtime endpoint

- `GET /api/projects/{projectId}/collaboration` returns invitations, assignments, and activity events as part of the project graph.
- `POST /api/projects/{projectId}/collaboration` accepts:
  - `invite` to create a pending project invitation and return a local token for verification.
  - `accept` to accept an invitation token.
  - `member` to add/update a project member role.
  - `assign` to assign scenes, shots, or assets.
- Assignment actions require the assignee to already be a member of the route project, must include exactly one target ID that matches `targetType`, and reject scene/shot/asset IDs from other projects with `not_found`.

## Role behavior

The existing Phase 1 permission matrix gates collaboration endpoints. Owners and producers can manage project members and assignments. Artists can work on generation/editing tasks, reviewers can approve/comment, and viewers remain read-only.

## Local verification

Use:

```bash
npm test
npm run lint
npm run build
npm run dev
```

Then invite the sample artist from the project dashboard, assign scene 1, and confirm both actions appear in the collaboration activity feed.
