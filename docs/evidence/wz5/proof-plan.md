# WZ5 proof plan

Scope: #6 and the additional evidence/changelog paths granted on the ticket.
Evidence is synthetic fixture behavior and presentation only. Live host completeness,
footer placement and numerical agreement remain unverified until #9.

| Claim | Owning proof | Plausible missed bug |
| --- | --- | --- |
| W2: one count across projects, parents, children and in-thread agents | `running-count.test.ts` table | Counting only visible rows, counting an activity signal twice, conflating child threads with in-thread agents |
| W2: unchanged upstream working definition | Count table, one case per working signal | Omitting goals, workflows, commands, plan mode or either working indicator |
| W2: filters and parking cannot narrow inputs | SDK rendered footer alongside filtered inbox | Using the inbox's scoped/hidden rows instead of the host thread feed |
| W2: reactive updates and unavailable states | SDK rendered footer rerenders | Retaining an old number during loading/error, showing an invented zero |
| W3: number, dim zero, conditional spinner, hover split, inert clicks | SDK rendered footer and synthetic browser captures | Static icon only, animated zero, missing split or unwanted navigation |
| Footer location/fallback | SDK contribution harness and declaration inspection | Registering a card instead of inline content, using an unsupported registration |

Existing tests cover inbox and row/header behavior but no footer contribution or
counting function. Each new contract starts with a failing proof before its fix;
retain sanitized output here. All expected totals are literal worked examples.
