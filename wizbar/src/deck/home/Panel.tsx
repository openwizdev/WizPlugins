// WizDeck's right-panel tabs (D1, #73). A thread panel shows Home; the New
// thread screen has no thread, so it asks the person to open one.
import type { PluginNewThreadPanelProps, PluginThreadPanelProps } from "@get-bb/plugin-sdk";
import { readWizDeckParams } from "../selection/selection";
import { Home } from "./Home";

export function WizDeckPanel({ params }: PluginThreadPanelProps) {
  // The thread this panel sits beside is ignored on purpose: it never chooses the factory.
  return <Home focus={readWizDeckParams(params).focus} />;
}

export function WizDeckNewThreadPanel(_: PluginNewThreadPanelProps) {
  return (
    <div style={{ padding: 16, color: "var(--foreground)" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>WizDeck</h2>
      <p style={{ margin: 0, color: "var(--muted-foreground)" }}>Open a thread to use WizDeck. It lives in a thread's right panel.</p>
    </div>
  );
}
