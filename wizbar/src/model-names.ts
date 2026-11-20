// Red stub for #111: the shapes only, no friendly names yet.
import type { EffortV3 } from "./v3-types";
export function modelName(id: string | null): string | null { return id; }
export function effortName(effort: EffortV3 | null): string | null { return effort; }
export function harnessName(providerId: string): string { return providerId; }
export function modelEffortLabel(model: string | null, effort: EffortV3 | null): string | null { return model && `${model} · ${effort}`; }
