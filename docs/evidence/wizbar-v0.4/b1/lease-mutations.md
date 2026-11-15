# Sidebar lease: planted breaks (post-implementation guards)

`wizbar/src/sidebar-v4/lease.test.tsx` passes against B1's existing code: it guards behaviour already built, so each case was checked against a planted break in a throwaway copy of the branch at `d8a378c` (not committed). Command: `npx vitest run src/sidebar-v4/lease.test.tsx`.

| Plant | Result |
| --- | --- |
| M1: the sidebar calls `deckRefresh` instead of `deckWatch` | "with the panel open too, makes one GitHub board read per 60-second interval" fails |
| M2: no `deckRelease` on unmount, and renewals continue while the page is hidden | "stops reading once the sidebar unmounts, and lets its lease lapse while the page is hidden" fails |
| M3: the backend copies a transport error's text (echoing the token) into the read failure | "never shows or receives the GitHub token when a read fails" fails |
| M4: the sidebar also calls `deckRefresh` on every heartbeat | the one-read-per-interval and unmount cases fail; the rate-limit case still passes, because D1's shared cache refuses refreshes until the reset |

The rate-limit case therefore guards the shared back-off with only the sidebar holding the lease; no sidebar-side plant can break it while D1's cache holds the schedule.
