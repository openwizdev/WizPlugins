# T3 push route for Needs you (FD4)

T3 Code v0.1.13 was read at commit
[`bc0f04da94f64b5e487c598761a43b4cf06b2ac9`](https://github.com/pingdotgg/t3code/tree/bc0f04da94f64b5e487c598761a43b4cf06b2ac9)
for [OpenWiz #3412](https://github.com/openwizdev/OpenWiz/issues/3412).
The evidence below is from source and public reports. Phone delivery is unverified.

## Publication scope

**Publish agent activity** is one switch for a T3 environment. The relay checks
it before looking up a thread, and its startup snapshot scans the environment's
projects and threads. The project lookup supplies context, including the
project title. A second project in the same environment shares the switch.
The relay event filter ignores pinning. There is no project or thread publishing selector in this path.
[Environment gate](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L503-L524)
· [Project lookup](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L593-L605)
· [Startup scan](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L866-L893)
· [Pin events](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L104-L125)

Listed, unarchived threads in an existing project can publish when they have a
projected activity state. Listed includes ordinary threads and forks. Side
chats, subagents and workflow steps do not get their own activity rows. A
qualifying wait in a subagent can make the listed parent publish a wait.
[Relay thread selection](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L585-L613)
· [Listed threads](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/contracts/src/orchestrationV2.ts#L189-L206)
· [Parent wait](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/shared/src/agentAwareness.ts#L154-L181)

## Push phases and muting

T3 documents alerts on `completed`, `failed`, `waiting_for_input` and
`waiting_for_approval`. The contract has device preferences for those four
phases. The v0.1.13 app registers all four as true whenever it registers, so
those fields do not offer an owner setting to select just input. `starting`,
`running` and `stale` are activity phases. Count ordinary phone notifications
separately from optional progress surfaces.
[Phone guide](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/docs/user/mobile-notifications.md#L1-L15)
· [Phases and preferences](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/contracts/src/relay.ts#L19-L40)
· [Device registration](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/mobile/src/features/agent-awareness/registrationPayload.ts#L49-L56)

There is no persistent per-thread alert mute in this path. Snooze can suppress a
completion that occurs during the snooze. The guide says ordinary alerts are
muted in the mobile foreground and that viewing on another device does not
silence the phone. The mobile handler is narrower. It suppresses presentation
when the alert targets the thread on screen. The Android native handler also
requires the app to be resumed and the target thread to match. Exact foreground
behavior of the shipped apps is unverified.
[Snoozed completions](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L366-L386)
· [Guide](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/docs/user/mobile-notifications.md#L17-L20)
· [Mobile handler](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/mobile/src/features/agent-awareness/foregroundNotificationBehavior.ts#L12-L28)
· [Android handler](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/mobile/modules/t3-agent-notifications/android/src/main/java/expo/modules/t3agentnotifications/AgentNotifications.kt#L150-L174)

## Questions and secret cards

A run that only ends with a question in its text follows its run status.
T3 projects `waiting_for_input` for an outstanding `user_input` request,
ahead of run status. A pending secret card in a live run can supply that
request. Once its run ends, the pending-secret lookup no longer sees it.
The relay test also verifies a child's waiting secret card publishes an input
wait on the parent. Actual delivery of a structured request or a secret card
to a phone is unverified. The public activity state carries phase, titles and
a deep link. It has no field for the question text, a card ID or a secret value.
The exact notification copy and whether it can identify the card are unverified.
[Phase projection](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/shared/src/agentAwareness.ts#L154-L189)
· [Secret projection](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/orchestration-v2/ProjectionStore.ts#L1843-L1854)
· [Live-run lookup](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/orchestration-v2/ProjectionStore.ts#L8593-L8606)
· [Relay test](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.test.ts#L410-L443)
· [Activity fields](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/contracts/src/relay.ts#L119-L130)

## Android and iOS

The guide requires T3 Connect sign-in on the host and phone and **Device
Notifications** on the phone. Android also needs Android 7.0+ and Google Play
services. A force-stopped Android app needs reopening. Optional iOS Live
Activities and Android ongoing activity are separate from ordinary alerts.
Open reports describe Android 2.2.0 missing pushes and alerts arriving after an
environment was disabled. On iOS, open reports describe a dismissed Live
Activity that did not resume and an approval alert that opened the app without
opening the target thread. A separate report describes repeated completion alerts.
These are reports to check against the installed versions, with reproduction on
the owner's devices unverified.
[Prerequisites and platform behavior](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/docs/user/mobile-notifications.md#L5-L20)
· [Android missing pushes](https://github.com/pingdotgg/t3code/issues/29597)
· [Android disabled environment](https://github.com/pingdotgg/t3code/issues/32453)
· [iOS Live Activity](https://github.com/pingdotgg/t3code/issues/39900)
· [iOS alert destination](https://github.com/pingdotgg/t3code/issues/26544)
· [Repeated completion alerts](https://github.com/pingdotgg/t3code/issues/42766)

## Chosen route and owner settings

Choose the **upstream alert filter proposal**. The proposed T3 setting permits
ordinary alerts from one designated **Needs you** thread, and only for
`waiting_for_input` tied to a new needs-owner card. The filter must drop all
other threads and phases before delivery, including completion or failure on
**Needs you** itself. A thread mute alone leaves those two phases audible on the
one allowed thread. The proposal also needs one alert identity per card and a
one-line public card label for the alert. The current relay accepts thread
activity and exposes four alert phases to the phone.
[Publish endpoint](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/contracts/src/relay.ts#L1243-L1255)
· [Current phone preferences](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/mobile/src/features/agent-awareness/registrationPayload.ts#L49-L56)

The unmodified pinned-thread route loses because separating projects leaves the
environment's relay switch shared. An ordinary empty run, failure or follow-up
can still alert in a publishing environment. Even an isolated publishing
environment would still need to suppress these terminal phases.
[Environment switch](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/server/src/relay/AgentAwarenessRelay.ts#L506-L524)
· [Terminal phases](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/shared/src/agentAwareness.ts#L170-L189)

1. **On v0.1.13.** Keep **Settings → Sharing & access → Publish agent activity**
   off on every environment running the factory. Keep the Needs you board
   available. Phone pings stay off while the upstream filter is unavailable.
2. **After the proposed feature ships.** Sign in to T3 Connect on host and phone.
   Pin a single **Needs you** thread in the home project. On its environment,
   set the proposed alert filter to that thread and **waiting for input only**
   before turning on **Publish agent activity**. Keep it off in other factory
   environments. On the phone, turn on **Settings → Notifications → Device
   Notifications** and allow **Agent alerts** on Android. Turn off optional live
   progress displays during the alert count.
3. For [FD7](https://github.com/openwizdev/OpenWiz/issues/3415), check the feed and
   save the card ID in the ledger before making the structured input request.
   Start no alerting turn on empty, resolved, scroll-only or already-seen input.
   Keep owner alerts off until the controlled phone check passes.
   This ticket records the proposal for a future upstream change.

[Host settings](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/web/src/components/settings/SavedEnvironmentRows.tsx#L788-L807)
· [Phone settings](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/docs/user/mobile-notifications.md#L5-L15)

## Phone check and stray-push count

For [FD11](https://github.com/openwizdev/OpenWiz/issues/3419), record the host
and app versions, OS, notification settings, card IDs and times. First keep the
phone app in the background. Generate three new needs-owner cards and expect
three ordinary alerts, one per card, each naming its public card label and
opening **Needs you**. Then replay the same cards, resolve one, add scroll-only
input and run a quiet scan. Complete, fail, request approval and request input
in another factory thread. Complete and fail a **Needs you** follow-up.
Expect zero alerts from all of those actions.

Run one plain-text question, one structured input request and one synthetic
secret card in a controlled test. Compare the projected phase, displayed text
and tap destination. Use a dummy value for the secret card and check that the
alert never shows it. Repeat on Android and iOS with the phone foreground on
the target thread, foreground on another thread and backgrounded. Include a
disabled-environment check on Android and verify ordinary alerts separately
from a dismissed Live Activity on iOS. Recheck the installed builds if results
differ from the source or the reports.
[Phase projection](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/packages/shared/src/agentAwareness.ts#L154-L189)
· [Foreground behavior](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/apps/mobile/src/features/agent-awareness/foregroundNotificationBehavior.ts#L19-L28)
· [Phone guide](https://github.com/pingdotgg/t3code/blob/bc0f04da94f64b5e487c598761a43b4cf06b2ac9/docs/user/mobile-notifications.md#L7-L20)

For a working day, count every factory alert against one new needs-owner card.
A stray push is a second alert for the same card, an alert with no matching new
card, a routine completion or failure, an approval prompt unrelated to a card,
or an alert from another thread. Record missing alerts separately. Success is
one ordinary alert per new card and zero stray pushes.
