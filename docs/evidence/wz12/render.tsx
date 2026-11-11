// Synthetic SDK harness only; never connects to a host or reads live work.
import { act } from "react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { FooterCounter } from "../../../wizbar/src/FooterCounter";
import { positiveThreads } from "../wz5/fixtures";
const app = await loadPluginApp(() => import("../../../wizbar/app"));
const mode = new URLSearchParams(location.search).get("state") ?? "positive";
const status = mode === "unavailable" ? "error" : "ready";
const threads = mode === "zero" ? [] : [...positiveThreads, positiveThreads[0]!];
const rendered = renderSlot({ component: FooterCounter }, {}, {
  pluginId: "synthetic-wz12-browser", settings: { footerCountEnabled: mode !== "disabled" },
  sidebarThreads: { status, threads },
});
document.querySelector("#footer")!.append(rendered.container);
document.querySelector("#context")!.textContent = `${mode}: ${mode === "zero" ? "empty observable input" : "2 unique working threads; two projects, a child and a duplicate"}`;
if (mode === "hover") {
  const counter = rendered.container.querySelector<HTMLElement>('[role="status"]')!;
  await act(async () => {
    counter.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}
const expected = ["disabled", "unavailable"].includes(mode) ? null : mode === "zero" ? "0" : "2";
const counter = rendered.container.querySelector<HTMLElement>('[role="status"]');
if ((counter?.textContent?.slice(0, 1) ?? null) !== expected) throw new Error("Unexpected synthetic fixture count");
if (mode === "hover" && !rendered.container.querySelector('[role="tooltip"]')) throw new Error("Hover fixture not settled");
document.querySelector(".fixture")!.setAttribute("data-ready", "true");
// App collection validates registration; this shell intentionally does not fake
// a host footer button or assert its geometry.
void app;
