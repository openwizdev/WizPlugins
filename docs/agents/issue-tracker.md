# Issue tracker: GitHub

WizBar's tickets live in this GitHub repository, `openwizdev/wizplugins`. Use the `gh` CLI (2.94 or later, for sub-issues and "blocked by" links) for everything.

**This is a standalone repository with a fresh history.** Its first commit copies only the T3 Sidebar plugin folder from `SawyerHood/sawyer-plugins` at commit `d3424f24e2cebe91da4e72cb38feb023da808922` into `wizbar/`, retains the upstream MIT notices, and credits the source. Upstream history is not imported or merged. Pull requests are only ever opened against `openwizdev/wizplugins`. WizBar is the first plugin, in `wizbar/`; WZ2 performs identity, SDK and contract preparation within that folder. Pass `--repo openwizdev/wizplugins` (or `-R openwizdev/wizplugins`) on every `gh issue` and `gh pr` command, and check the target with `gh repo view openwizdev/wizplugins --json nameWithOwner` before the first write of a session. Never open an issue or pull request on the upstream repository.

## Where things live

| Thing | On GitHub |
| --- | --- |
| Spec | An issue in the private records repository (below); its body is the spec. WizBar's spec is not public |
| Plan | The local parent issue holds the public-form graph and approval revision; the full spec remains private |
| Ticket | A sub-issue of the local plan, in the public form, with "blocked by" links to the tickets it waits for. Its `## Parent` section names its private spec |
| A ticket's work | Its pull request here, against `main` |
| The user's approval of a spec or a plan graph | A public-form comment on the local plan issue for graph approval, or on the private spec for spec confirmation: the decision, date and private-comment pointer, naming the revision approved |

A ticket is ready when it has the `ready-for-agent` label and every ticket blocking it has a verified merge: a closed blocker alone is not enough. A ticket closes only on a verified merge, and a spec only when all its tickets are closed.

## Repositories

- **Development tracker:** `openwizdev/wizplugins` (final name; private until the orchestrator verifies the migration and makes it public).
- **Private records:** `jparker2006/ClosedWiz` (private): the spec, grills, exact replies and orchestration state.

## Private records and approval forms

Nothing private goes in this repository: no thread ids, no exact words of a decision, no personal details, no machine details or private paths. Examples and test data use made-up ids. Save and read back an exact confirmation or approval in a private comment in the private records repository first; a public record carries only the decision in plain words, its date, and `Private record: <pointer>` on the very next line, where the pointer is the full `https://github.com/jparker2006/ClosedWiz/issues/<N>#issuecomment-<C>` URL.

## Commands

- **Create an issue:** `gh issue create -R openwizdev/wizplugins --title "..." --body-file body.md`.
- **Blocking:** GitHub's own "blocked by" links: `gh issue create -R openwizdev/wizplugins --blocked-by <n>,<n> ...`, or afterwards `gh issue edit <ticket> -R openwizdev/wizplugins --add-blocked-by <blocker>`.
- **List a ticket's blockers:** `gh issue view <n> -R openwizdev/wizplugins --json blockedBy --jq '.blockedBy.nodes[] | {number, state}'`. A closed blocker still needs its verified merge.
- **Read an issue:** `gh issue view <n> -R openwizdev/wizplugins --json number,title,body,labels,comments,blockedBy`.
- **Comment:** `gh issue comment <n> -R openwizdev/wizplugins --body-file comment.md`.
- **Labels:** `gh issue edit <n> -R openwizdev/wizplugins --add-label "..."` and `--remove-label "..."`.
- **Close:** post the reason with `gh issue comment`, then `gh issue close <n> -R openwizdev/wizplugins`.

## Pull requests as triage input

**Outside pull requests count as requests: no.**

## When a skill says

- **"Publish to the issue tracker":** create a GitHub issue here.
- **"Fetch the ticket":** read it as in **Read an issue** above.
