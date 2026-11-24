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
import { SettingsPage } from "./src/SettingsPage";
import { WizDeckNewThreadPanel, WizDeckPanel } from "./src/deck/home/Panel";
import { WIZDECK_ACTION_ID } from "./src/deck/selection/selection";
import { mountComposerFooterStylesheet } from "./src/composer-footer";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "composer-footer",
    mount: () => mountComposerFooterStylesheet(),
  });
  app.slots.settingsSection({ id: "wizbar-settings", component: SettingsPage });
  // WB4-3 (#1437): no footer item, so no bolt. "N running" at the list's
  // bottom carries the stats as its hover card.

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

  // WizDeck 0.1 (#73): the factory home in the right panel, from this same
  // runtime, so WizBar can open it with the same-plugin opener.
  app.slots.threadPanelAction({ id: WIZDECK_ACTION_ID, title: "WizDeck", icon: "Layers", component: WizDeckPanel });
  app.slots.experimental_newThreadPanelAction({ id: WIZDECK_ACTION_ID, title: "WizDeck", icon: "Layers", component: WizDeckNewThreadPanel });
});
