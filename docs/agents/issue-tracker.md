# Issue tracker: Linear

Issues and specs for this repo live in Linear. Hierarchy is **team → project → issue**. Create and update issues with the Linear MCP (`save_issue`, `get_issue`, `list_issues`, `save_comment`, `save_issue_label`, …), not the GitHub `gh` CLI.

Do not put new work in Linear Inbox. Always set `project` so the issue lands on the project board.

Status and workflow labels are not established beyond the triage vocabulary in `docs/agents/triage-labels.md`. Apply those five labels; do not invent extra status conventions until the team records them here.

## Conventions

- **Create an issue**: `save_issue` with `team`, `project`, `title`, and `description` (Markdown). Add triage labels via `labels` / `addLabels`.
- **Read an issue**: `get_issue` with the identifier (e.g. `ENG-123`) or UUID.
- **List issues**: `list_issues` scoped with `team`, `project`, `state`, and/or `label`.
- **Comment**: `save_comment` on the issue.
- **Apply / remove labels**: `save_issue` with `addLabels` / `removeLabels` (or `labels` to replace).
- **Close / change state**: `save_issue` with `state` (name, type, or ID from `list_issue_statuses`).

Resolve the team and project from Linear (`list_teams`, `list_projects`) when they are not already in context. Prefer names the workspace already uses; do not guess a GitHub repo as the destination.

## Pull requests as a triage surface

**PRs as a request surface: no.** GitHub PRs are not triaged as Linear issues.

## When a skill says "publish to the issue tracker"

Create a Linear issue on the relevant **project** (not Inbox) with `save_issue`.

## When a skill says "fetch the relevant ticket"

`get_issue` for that identifier.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Linear issue with **child** issues as tickets.

- **Map**: one issue titled as the wayfinder map, labelled `wayfinder:map`, holding Notes / Decisions-so-far / Fog in the description.
- **Child ticket**: `save_issue` with `parentId` set to the map, plus a `wayfinder:<type>` label (`research` / `prototype` / `grilling` / `task`). Once claimed, assign the driving dev (`assignee`).
- **Blocking**: `blockedBy` / `blocks` on `save_issue`. A ticket is unblocked when every blocker is done.
- **Frontier query**: list the map's open children, drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"`, the session's first write.
- **Resolve**: `save_comment` with the answer, set `state` to Done/completed, then append a context pointer to the map's Decisions-so-far.
