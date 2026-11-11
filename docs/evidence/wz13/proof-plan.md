# WZ13 / N5 proof plan

Baseline: main `8e878b346916311fec6d2ac11c5450b275d16410`, SDK 0.6.33.
Read the keeper's [private observation](https://github.com/jparker2006/ClosedWiz/pull/2375#issuecomment-6779925149), WZ10, settings seam and revision 9 before implementation. The [source ruling](https://github.com/openwizdev/wizplugins/issues/29#issuecomment-6787417378) supersedes the raw-target prerequisite for this consumer. This is a projection-based observed rule, not an SDK guarantee.

| Claim | Owning proof | Evidence class |
| --- | --- | --- |
| N5a Current projection identifies Cloud only with explicit null environment/host and a recognised non-starting runtime; environment objects identify Local | Existing registered-app row table, revised expected values from the source ruling | Synthetic rendered fixture |
| N5b Starting, missing and malformed machine inputs cannot invent Cloud; agent/name/branch heuristics are irrelevant | Same table, each shelf; same labels remain in both row forms | Synthetic rendered fixture |
| N5c Labels/icons, navigation, status, parking and search survive | Existing row regressions with corrected Cloud fixtures | Synthetic rendered fixture |
| N5d Off suppresses glyphs independently of source status; source loading/error suppresses stale icons; projected mapping is not claimed as verified live authority | MachineIcon rendered boundary with settings section and actual sidebar hook states | Synthetic rendered fixture |
| N5e Layout and existing 14px Cloud/Laptop glyphs stay intact | Generated target, then actual app-harness HTML at 390/1440 widths | Visual review of synthetic fixture |
| N5-live Known real rows, host icon parity and updates | Deferred to #9 | Unverified live behavior |

Plausible regression: the old provider-id inversion calls an environment object with null/empty provider Cloud, yet hides real projected Cloud rows. Existing tests encode that inversion and omit host/runtime/startup combinations. Revise their table before fixing code, run red, and commit the sanitised failure before implementation. Additional source-status test catches stale-ready or toggle-based claims missed by the old icon-only tests. No new RPC, raw field, dependency, SDK patch or host run is needed.

# UI brief and content packet

Small icon correction, no new screen or flow. Existing source/design pinned to the baseline above; no separate WizBar taste profile exists. Use the established system sans font, 14px title/12px metadata, #18191c ground, #f1f3f5 primary and #b9c0ca muted text; 2/4/6/8px spacing, 4/6px radii, 14px glyphs. Preserve status slot, shortcuts, controls, shelf hierarchy and both header chips. At 390px sidebar fills width; at 1440px it is 320px with a quiet main region. This remains the inherited UI, not an OpenWiz page redesign.

Synthetic packet: Review parser (Cloud), Write guide (Local), Starting workspace (unknown); Parser follow-up (Cloud) and Guide follow-up (Local) in expanded Snoozed and Settled. Long variant lengthens the parser title; empty has no rows; sparse has one row; missing has no environment; zero means no classified rows, not a machine total. No footer number or fabricated product statistic.

Target route: built-in OpenAI image generation, no API key. Prompt: two labelled phone/desktop panels of the above existing dark sidebar with small Cloud/Laptop glyphs, no marker on Starting workspace, expanded compact Snoozed/Settled shelves, existing status/times/restore controls. No redesign, illustration or real identifiers. Target is a concept, not a host screenshot. Critique: generated shelves are taller than the existing slim rows and include invented status captions/times; implementation must retain actual row geometry and real fixture values. Its Cloud/Local/unknown hierarchy and subdued glyphs are the intended comparison.
