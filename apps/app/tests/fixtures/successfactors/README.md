# SuccessFactors fixtures

Everything here is hand-written in SAP's documented OData v2 shape (`{ "d": { "results": [ ... ], "__next": "..." } }`,
`/Date(<ms>)/` dates). The company 'Musterwerk' and every person in it are made up; nothing was recorded from a real
system.

`pages/` holds the scenarios of plan SFX-M1:

| File | Scenario |
|---|---|
| `full-user-1/2`, `full-job-1/2` | a full read with a `__next` link (two pages) |
| `full-employment` | a leaver by end date (u4), an open-ended employment (9999-12-31), a row without `personIdExternal` |
| `full-job-*` | a manager `NO_MANAGER` (u2) |
| `full-department` | a department with status `I` (D300) |
| `jobs-future-move` | a move dated 2026-11-10 next to the current job (before and after it becomes effective) |
| `delta-*` | a delta run: a mover (u3 changes department and manager); `delta-manager-employment` is the unchanged manager |

`keys.ts` makes the RSA key and certificate at test time; no key is committed.
