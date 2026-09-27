# features

Domain logic, one folder per entity. No React, no DOM, no direct DB access from pages - pages import from here.
Each folder grows: `index.ts` (queries), `actions.ts` (mutations), `reducer.ts` where event-sourced, `schema.ts` (zod), tests in `tests/unit/`.
