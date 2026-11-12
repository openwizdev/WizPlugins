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
import { StatsPanel } from "./src/StatsPanel";
import { SettingsPage } from "./src/SettingsPage";

export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "wizbar-settings", component: SettingsPage });
  // WZ20 (#41): one disclosure on the host's own bolt icon, with a fixed
  // label. The live number stays in the list-bottom "N running" line.
  app.experimental_sidebarFooter.register({
    id: "stats",
    kind: "disclosure",
    label: "WizBar stats",
    icon: "Zap",
    component: StatsPanel,
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
