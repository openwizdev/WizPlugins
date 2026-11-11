// Synthetic browser fixture using the same SDK rendered-app boundary as tests.
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
const app = await loadPluginApp(() => import("../../../wizbar/app"));
let values = { footerCountEnabled: true, machineIconsEnabled: true };
renderSlot(app.settingsSections[0]!, {}, {
  pluginId: "synthetic-wizbar-settings",
  settings: values,
  sdk: { plugins: { updateSettings: async ({ values: patch }) => {
    values = { ...values, ...patch };
    return { ok: true, schema: {}, values };
  } } },
});
