// The shared selection between WizBar and WizDeck (D1, #73;
// factory-view.v1.md section 6). Both surfaces run in this one plugin app,
// so one module-level store serves them. A selection is a highlight only: an
// update never navigates or scrolls. Only `openWizDeck` with an explicit
// Needs-you focus opens the deck at an item.
import { useSyncExternalStore } from "react";
import type { BbNavigate, JsonValue } from "@get-bb/plugin-sdk";
import type { FocusRequestV1, SelectionV1 } from "../../factory-contract";

/** The `threadPanelAction` id WizDeck registers. `openThreadPanel` targets only this plugin's own actions. */
export const WIZDECK_ACTION_ID = "wizdeck";

const none: SelectionV1 = { kind: "none" };
let current: SelectionV1 = none;
const listeners = new Set<() => void>();

const same = (a: SelectionV1, b: SelectionV1) => JSON.stringify(a) === JSON.stringify(b);

export function getSelection(): SelectionV1 {
  return current;
}

/** Highlight a spec or thread on both surfaces. Never navigates. */
export function setSelection(next: SelectionV1): void {
  if (same(current, next)) return;
  current = next.kind === "none" ? none : { ...next };
  for (const listener of [...listeners]) listener();
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSelection(): SelectionV1 {
  return useSyncExternalStore(subscribeSelection, getSelection, getSelection);
}

/** The panel tab's params: an optional explicit Needs-you focus. */
export interface WizDeckParamsV1 {
  focus: FocusRequestV1 | null;
}

/**
 * Open WizDeck in the current thread's side panel through the host's
 * same-plugin opener. Pass a focus only for an explicit Needs-you click.
 * Returns the host's answer: false where there is no side panel.
 */
export function openWizDeck(navigate: Pick<BbNavigate, "openThreadPanel">, focus: FocusRequestV1 | null = null): boolean {
  const params: WizDeckParamsV1 = { focus: focus ? { kind: "needs-you", projectKey: focus.projectKey, itemId: focus.itemId } : null };
  return navigate.openThreadPanel({ actionId: WIZDECK_ACTION_ID, params: params as unknown as JsonValue });
}

/** Read a tab's persisted params; anything unexpected is no focus. */
export function readWizDeckParams(params: unknown): WizDeckParamsV1 {
  const focus = (params as { focus?: Partial<FocusRequestV1> } | null)?.focus;
  if (focus && focus.kind === "needs-you" && typeof focus.projectKey === "string" && typeof focus.itemId === "string") {
    return { focus: { kind: "needs-you", projectKey: focus.projectKey, itemId: focus.itemId } };
  }
  return { focus: null };
}
