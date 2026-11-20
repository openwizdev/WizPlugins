import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { hostTokensV4 } from "./v4";

// ---- Theme check (contract section 9) ----------------------------------------
// WizBar takes every colour from the host's theme variables. A literal colour
// is allowed only as the contract's fallback for its own host variable.

const root = join(import.meta.dirname, "..", "..");
const colourFunction = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;
const hex = /(?<![\w&$])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const palette = /\b(?:text|bg|border(?:-[xytrblse])?|fill|stroke|ring(?:-offset)?|outline|decoration|from|via|to|shadow|accent|caret|divide(?:-[xy])?|placeholder)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white)\b/g;
const arbitrary = /\b[a-z-]+-\[(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|color:#)[^\]]*\]/g;
const arbitraryKeyword = /\b(?:text|bg|border(?:-[xytrblse])?|fill|stroke|ring(?:-offset)?|outline|decoration|from|via|to|shadow|accent|caret|divide(?:-[xy])?|placeholder)-\[([a-zA-Z]+)\]/g;
const keyword = /\b(?:color|background|fill|stroke|[a-zA-Z]+Color)\s*:\s*["']([a-zA-Z]+)["']/g;
const attribute = /\b(?:fill|stroke|color|stopColor|floodColor|lightingColor)=["']([a-zA-Z]+)["']/g;
const declaration = /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|fill|stroke)\s*:\s*([a-z]+)\s*[;}]/g;
const notColours = new Set(["transparent", "currentColor", "currentcolor", "inherit", "initial", "unset", "none"]);

/** Comments hold issue numbers like `#160`; they are not styles. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Every hard-coded colour in one source text, after removing the allowed fallbacks. */
export function hardCodedColours(source: string): string[] {
  let text = stripComments(source);
  for (const token of hostTokensV4) {
    if (token.fallback === null) continue;
    text = text.split(`var(${token.variable}, ${token.fallback})`).join(`var(${token.variable})`);
  }
  const found: string[] = [];
  // Each kind is blanked out once found, so `bg-[#161616]` counts once, not again as a hex.
  const named = [arbitraryKeyword, keyword, attribute, declaration];
  for (const pattern of [arbitrary, palette, ...named, colourFunction, hex]) {
    text = text.replace(pattern, (match: string, word?: unknown) => {
      if (named.includes(pattern) && notColours.has(String(word))) return match;
      found.push(match);
      return " ";
    });
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "fixtures" ? [] : sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("theme: host variables only (specs-section contract, section 9)", () => {
  it("finds each kind of hard-coded colour and passes host variables and their own fallbacks", () => {
    expect(hardCodedColours(`style={{ color: "#c6f432" }}`)).toEqual(["#c6f432"]);
    expect(hardCodedColours("background: `oklch(0.72 0.13 ${hue})`")).toEqual(["oklch("]);
    expect(hardCodedColours(`className="text-amber-500 bg-[#161616]"`)).toEqual(["bg-[#161616]", "text-amber-500"]);
    expect(hardCodedColours(`style={{ color: "red", fill: "currentColor" }}`)).toEqual([`color: "red"`]);
    expect(hardCodedColours(`<circle fill="red" stroke="currentColor" />`)).toEqual([`fill="red"`]);
    expect(hardCodedColours(`.dot { color: red; background: transparent; }`)).toEqual(["color: red;"]);
    expect(hardCodedColours(`style={{ background: "rgb(1 2 3)" }}`)).toEqual(["rgb("]);
    expect.soft(hardCodedColours(`className="text-[red] w-[auto] text-[inherit]"`)).toEqual(["text-[red]"]);
    expect.soft(hardCodedColours(`className="border-x-black divide-y-zinc-800 ring-offset-white"`)).toEqual(["border-x-black", "divide-y-zinc-800", "ring-offset-white"]);
    expect.soft(hardCodedColours(`style={{ borderTopColor: "red", stopColor: "inherit" }}`)).toEqual([`borderTopColor: "red"`]);
    expect(hardCodedColours(`color: "var(--muted, #3a3a3d)"`)).toEqual([]);
    // A fallback counts only for its own variable.
    expect(hardCodedColours(`color: "var(--primary, #c0ff04)"`)).toEqual([]);
    expect(hardCodedColours(`color: "var(--warning, #c0ff04)"`)).toEqual(["#c0ff04"]);
    expect(hardCodedColours(`color: "var(--foreground)", border: "1px solid var(--border)"`)).toEqual([]);
    expect(hardCodedColours(`// see #160 and #1434\nconst label = \`PR #\${n}\`;`)).toEqual([]);
  });

  it("finds no hard-coded colour anywhere in WizBar's source", () => {
    const found = sourceFiles(root).flatMap((path) => {
      const file = relative(root, path);
      return hardCodedColours(readFileSync(path, "utf8")).map((text) => ({ file, text }));
    });
    expect(found).toEqual([]);
  });
});
