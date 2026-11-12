// bb-plugin-wizbar — an inbox-style replacement for bb's sidebar thread
// list, and the reference example for `app.slots.experimental_threadList`.
//
// The idea it is built around: the list NEVER re-orders itself. Threads sort
// by creation time, newest first, and hold that place. Status is carried by
// each card, not by position, so the sidebar only moves when you act.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadInbox } from "./src/ThreadInbox";
import { ParentChip } from "./src/ParentChip";
import { SubagentsChip } from "./src/SubagentsChip";
import { FooterCounter } from "./src/FooterCounter";
import { SettingsPage } from "./src/SettingsPage";

export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "wizbar-settings", component: SettingsPage });
  // WZ12-F1/F2: the host owns sizing and its static label; the artwork owns
  // the observable count and dynamic hover. Host presentation remains for #9.
  app.experimental_icons.register({
    name: "wizbar-running-count",
    component: FooterCounter,
  });
  app.experimental_sidebarFooter.register({
    id: "running-count",
    kind: "action",
    label: "Running count: see the line at the bottom of the list",
    icon: "wizbar-running-count",
    onActivate() {},
  });

  app.slots.experimental_threadList({
    id: "inbox",
    title: "WizBar",
    description: "One flat list of cards, newest first, that never re-orders.",
    component: ThreadInbox,
  });

  // Registered first, so it renders on the left of the children chip: the
  // header then reads up (parent) then down (children).
  //
  // The hidden child is otherwise a dead end — it is not in the list, so this
  // chip is its only route back to the parent.
  app.slots.experimental_threadHeaderAction({
    id: "parent",
    title: "Parent thread",
    component: ParentChip,
  });

  // A flat inbox has nowhere to nest child threads, so the list hides them
  // and this chip gives them a home on their parent's header.
  app.slots.experimental_threadHeaderAction({
    id: "children",
    title: "Child threads",
    component: SubagentsChip,
  });
});
