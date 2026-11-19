import type { MatrixStateV4 } from "./fixtures/v4";

export function MatrixMark({ state }: { state: MatrixStateV4; className?: string }) {
  return <span role="img" data-matrix={state} />;
}
