# PR #35 findings: red proof

Baseline: `e70dc1cb5f0166f7a157ed06fa2921da3fd75016`.
Production files unchanged. Registered-app fixtures reproduce R1 (Muted Cloud
marker missing) and all four R2 loading/error × visibility cases (unverified
instead of unavailable). Navigation, Unmute, Local, unknown and visibility-off
controls pass. Synthetic evidence only; live acceptance remains for #9.

```text

> bb-plugin-wizbar@0.1.0 test
> vitest run --config vitest.config.ts --maxWorkers=2 src/ThreadCard.test.tsx src/MachineIcon.test.tsx


 RUN  v4.1.10 wizbar

 ❯ |bb-plugin-wizbar| src/MachineIcon.test.tsx (6 tests | 4 failed) 556ms
     × R2 loading and recovery with icons enabled true 120ms
     × R2 error and recovery with icons enabled true 57ms
     × R2 loading and recovery with icons enabled false 49ms
     × R2 error and recovery with icons enabled false 49ms
 ❯ |bb-plugin-wizbar| src/ThreadCard.test.tsx (96 tests | 1 failed) 4877ms
     × R1 'Cloud' with icons enabled true 73ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |bb-plugin-wizbar| src/MachineIcon.test.tsx > N5 source availability and visibility at the rendered boundary > R2 loading and recovery with icons enabled true
 FAIL  |bb-plugin-wizbar| src/MachineIcon.test.tsx > N5 source availability and visibility at the rendered boundary > R2 error and recovery with icons enabled true
 FAIL  |bb-plugin-wizbar| src/MachineIcon.test.tsx > N5 source availability and visibility at the rendered boundary > R2 loading and recovery with icons enabled false
 FAIL  |bb-plugin-wizbar| src/MachineIcon.test.tsx > N5 source availability and visibility at the rendered boundary > R2 error and recovery with icons enabled false
AssertionError: expected 'unverified' to be 'unavailable' // Object.is equality

Expected: "unavailable"
Received: "unverified"

 ❯ src/MachineIcon.test.tsx:74:49
     72|       expect(screen.queryByRole("link", { name: "Sample work" })).toBe…
     73|       if (status === "error") expect(screen.getByText("Could not load …
     74|       expect(getSourceStatuses(pluginId).icons).toBe("unavailable");
       |                                                 ^
     75|       expect(screen.getByText("The Cloud/Local source is not connected…
     76|       expect(screen.getByText(`Icons: ${enabled ? "Enabled" : "Disable…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |bb-plugin-wizbar| src/ThreadCard.test.tsx > Muted machine markers at the registered app boundary > R1 'Cloud' with icons enabled true
AssertionError: expected [] to deeply equal [ 'Cloud' ]

- Expected
+ Received

- [
-   "Cloud",
- ]
+ []

 ❯ src/ThreadCard.test.tsx:248:58
    246|       await waitFor(() => expect(unmute).toHaveBeenCalledWith({ thread…
    247|       expect(within(shelf).queryAllByRole("img", { name: /^(Cloud|Loca…
    248|         .map((icon) => icon.getAttribute("aria-label"))).toEqual(enabl…
       |                                                          ^
    249|     });
    250|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯


 Test Files  2 failed (2)
      Tests  5 failed | 97 passed (102)
   Start at  07:13:32
   Duration  6.60s (transform 481ms, setup 0ms, import 1.49s, tests 5.43s, environment 1.56s)

```
