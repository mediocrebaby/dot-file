# Local Markdown Wayfinder Tracker

This repository has no configured remote issue tracker, so Wayfinder uses this local Markdown fallback.

## Issue representation

- Each map or ticket is one Markdown file.
- Frontmatter `id` plus the file path is its identity.
- `parent` declares the map-child relationship.
- `labels` carries `wayfinder:map` or one `wayfinder:<type>` label.
- `status` is `open` or `closed`.
- `assignee` is the claim; an empty assignee is unclaimed.
- `blocked_by` is the fallback dependency relation because Markdown has no native blocking feature.

## Wayfinding operations

- Load a map: read its `map.md` only.
- Find children: inspect the sibling `tickets/` directory and select files whose `parent` points to the map.
- Find the frontier: select open, unassigned tickets for which every `blocked_by` ticket is closed.
- Claim a ticket: set `assignee` before doing any work.
- Resolve a ticket: append the answer under `## Resolution comments`, set `status: closed`, clear `assignee`, and add a one-line linked gist to the map's **Decisions so far**.
- Add work: create ticket files first, then add `blocked_by` relationships in a second pass.

Refer to maps and tickets by their linked titles, not by bare IDs.
