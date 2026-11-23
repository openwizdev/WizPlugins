import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
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
// Values that hold several words: a named colour can hide among them (`1px solid red`, `linear-gradient(red, blue)`).
const gradient = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g;
const compoundProperty = String.raw`\b(?:background(?:-?[iI]mage)?|border(?:-?(?:[tT]op|[rR]ight|[bB]ottom|[lL]eft|[bB]lock|[iI]nline)(?:-?(?:[sS]tart|[eE]nd))?)?|outline|box-?[sS]hadow|text-?[sS]hadow|text-?[dD]ecoration|column-?[rR]ule)`;
const compoundString = new RegExp(String.raw`${compoundProperty}\s*:\s*(["'\`])((?:(?!\1).)*)\1`, "g");
const compoundDeclaration = new RegExp(String.raw`${compoundProperty}\s*:\s*([^;{}"'\`]*)[;}]`, "g");
// CSS Color 4 named colours, lower-cased (transparent and currentcolor are allowed above).
const namedColours = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue " +
    "chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
    "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray " +
    "darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen " +
    "fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen " +
    "lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
    "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver " +
    "skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
    "whitesmoke yellow yellowgreen").split(" "),
);

/** Whether a multi-word value names a colour; a variable's name is not a colour, its leftover fallback is. */
function namesColour(value: string): boolean {
  const words = value.replace(/var\(\s*--[\w-]+/g, "var(").match(/(?<![\w-])[a-zA-Z]+(?![\w-])/g) ?? [];
  return words.some((word) => namedColours.has(word.toLowerCase()));
}

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
  const compound = [gradient, compoundString, compoundDeclaration];
  for (const pattern of [arbitrary, palette, ...named, ...compound, colourFunction, hex]) {
    text = text.replace(pattern, (match: string, word?: unknown) => {
      if (named.includes(pattern) && notColours.has(String(word))) return match;
      if (compound.includes(pattern)) {
        const value = pattern === gradient ? match : match.slice(match.indexOf(":") + 1);
        // A bare capitalised word (`background: LIME`) is a script constant, not CSS; lower case counts, as in `declaration`.
        if (pattern === compoundDeclaration && /^\s*[a-zA-Z]*[A-Z][a-zA-Z]*\s*[;}]$/.test(value)) return match;
        if (!namesColour(value)) return match;
      }
      found.push(match);
      return " ";
    });
  }
  return found;
}

// Build output (dist/) and the SDK declarations a plugin build refreshes (types/) are not WizBar's source.
const notSource = new Set(["node_modules", "fixtures"]);
const buildOutput = new Set(["dist", "types"]);
function sourceFiles(dir: string, top = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (notSource.has(entry.name) || (dir === top && buildOutput.has(entry.name))) return [];
      return sourceFiles(path, top);
    }
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
    // Named colours inside shorthand values and gradient stops (WizPlugins#141).
    expect.soft(hardCodedColours(`style={{ border: "1px solid red" }}`)).toEqual([`border: "1px solid red"`]);
    expect.soft(hardCodedColours(`style={{ background: "linear-gradient(red, blue)" }}`)).toEqual(["linear-gradient(red, blue)"]);
    expect.soft(hardCodedColours(`className="bg-[radial-gradient(white,var(--card))]"`)).toEqual(["radial-gradient(white,var(--card))"]);
    expect.soft(hardCodedColours(`.card { box-shadow: 0 1px 2px black; outline: 2px dashed Gold }`)).toEqual(["box-shadow: 0 1px 2px black;", "outline: 2px dashed Gold }"]);
    expect.soft(hardCodedColours(`style={{ borderTop: "1px solid var(--red, red)" }}`)).toEqual([`borderTop: "1px solid var(--red, red)"`]);
    expect(hardCodedColours(`style={{ border: "1px solid var(--border, #292929)", background: "linear-gradient(var(--card), transparent)" }}`)).toEqual([]);
    expect(hardCodedColours(`<div style={{ background: LIME }} />`)).toEqual([]);
    expect.soft(hardCodedColours(`.bar { background: lime; }`)).toEqual(["background: lime;"]);
    expect(hardCodedColours(`.row { border-bottom: 1px solid currentColor; text-decoration: underline dotted; }`)).toEqual([]);
    expect(hardCodedColours(`// see #160 and #1434\nconst label = \`PR #\${n}\`;`)).toEqual([]);
  });

  it("skips only the top-level dist/ and types/, never a nested source folder of the same name", () => {
    const tree = mkdtempSync(join(tmpdir(), "wizbar-theme-"));
    try {
      for (const file of ["dist/server.ts", "types/sdk.d.ts", "src/dist/panel.tsx", "src/types/card.ts", "src/view.css"]) {
        mkdirSync(join(tree, dirname(file)), { recursive: true });
        writeFileSync(join(tree, file), `style={{ color: "#c6f432" }}`);
      }
      const found = sourceFiles(tree, tree).map((path) => relative(tree, path).split("\\").join("/")).sort();
      expect(found).toEqual(["src/dist/panel.tsx", "src/types/card.ts", "src/view.css"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it("finds no hard-coded colour anywhere in WizBar's source", () => {
    const found = sourceFiles(root).flatMap((path) => {
      const file = relative(root, path);
      return hardCodedColours(readFileSync(path, "utf8")).map((text) => ({ file, text }));
    });
    expect(found).toEqual([]);
  });
});
