import type { ComposerFooterMode } from "./settings";

export const COMPOSER_FOOTER_ATTR = "data-wizbar-hide-composer-footer";
export const COMPOSER_FOOTER_STYLE_ATTR = "data-wizbar-composer-footer-style";
export const COMPOSER_FOOTER_CSS =
  "html[data-wizbar-hide-composer-footer] [data-follow-up-composer-footer] { display: none }";

export function shouldHideComposerFooter(
  mode: ComposerFooterMode,
  activeThread: { isPinned: boolean } | null | undefined,
): boolean {
  if (mode === "all") return true;
  if (mode === "pinned") return Boolean(activeThread?.isPinned);
  return false;
}

export function syncComposerFooterAttribute(
  hide: boolean,
  root: Element | null = typeof document !== "undefined" ? document.documentElement : null,
): void {
  if (!root) return;
  if (hide) root.setAttribute(COMPOSER_FOOTER_ATTR, "");
  else root.removeAttribute(COMPOSER_FOOTER_ATTR);
}

export function mountComposerFooterStylesheet(
  doc: Document | null = typeof document !== "undefined" ? document : null,
): () => void {
  if (!doc) return () => {};
  const parent = doc.head ?? doc.documentElement;
  if (!parent) return () => {};
  let style = parent.querySelector<HTMLStyleElement>(`style[${COMPOSER_FOOTER_STYLE_ATTR}]`);
  if (!style) {
    style = doc.createElement("style");
    style.setAttribute(COMPOSER_FOOTER_STYLE_ATTR, "");
    style.textContent = COMPOSER_FOOTER_CSS;
    parent.appendChild(style);
  }
  const owned = style;
  return () => {
    owned.remove();
  };
}
