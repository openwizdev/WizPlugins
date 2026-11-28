// The grill picker (CG7, OpenWiz #4048): WizBar shows grill questions one at a
// time, the recommended option first and marked, checkboxes when `multi`, a
// notes field, an "other" field, and Next. Cards and answers follow OpenWiz's
// contracts/grill-picker.v1.md. Each answer goes to the Wiz thread as one
// line, the compact answer object, inside decisions.v1's contextual answer
// framing; the grill's answer script records that line under its question.
//
// The view is plain HTML with no script: native radios and checkboxes in a
// fieldset make it keyboard-first, and the form's fields read back through
// `readChoice`, so the board (CG9, #4050) only wires the submit to the send.
import { esc, type View } from "../view.ts";

export const schema = "openwiz.grill-picker.v1";

/** decisions.v1's grill round answer locator, copied onto every card and answer. */
export interface GrillContext {
  readonly subject: { readonly repository: string; readonly kind: "issue" | "pull_request"; readonly number: number };
  readonly comment_id: number;
  readonly request_id: string;
  readonly request_kind: "grill_round";
  readonly fingerprint: string;
  readonly grill_file: string;
  readonly round: number;
  readonly question_id: string;
}

export interface GrillOption { readonly id: string; readonly text: string; readonly recommended: boolean }

/** One question card. The first option is the grill's recommendation. */
export interface GrillCard {
  readonly schema: typeof schema;
  readonly kind: "card";
  readonly context: GrillContext;
  readonly text: string;
  readonly options: readonly GrillOption[];
  readonly multi: boolean;
  readonly notes: boolean;
  readonly other: boolean;
}

/** One submitted answer. `notes` and `other` are present only when given. */
export interface GrillAnswer {
  readonly schema: typeof schema;
  readonly kind: "answer";
  readonly context: GrillContext;
  readonly chosen_option_ids: readonly string[];
  readonly notes?: string;
  readonly other?: string;
  readonly at: string;
}

/** What the owner picked, before it's checked against the card. */
export interface Choice { readonly chosen: readonly string[]; readonly notes?: string; readonly other?: string }

/** The view's data: the unanswered cards, in order. The picker shows the first. */
export interface GrillPicker { readonly cards: readonly GrillCard[] }

/** The card as given, or an error saying why it can't be shown. */
export function checkCard(card: GrillCard): GrillCard {
  if (card.text === "") throw new Error("the question has no text");
  if (card.options.length === 0) throw new Error("the question has no options");
  const seen = new Set<string>();
  card.options.forEach((option, at) => {
    if (option.id === "" || option.text === "") throw new Error(`option ${at + 1} needs an id and text`);
    if (seen.has(option.id)) throw new Error(`option id "${option.id}" is used twice`);
    seen.add(option.id);
    if (option.recommended !== (at === 0)) throw new Error("the recommendation must be the first option, and only the first");
  });
  return card;
}

/** Form field names. Option values carry an `id:` prefix so no option id can pass for Other. */
const optionField = "option";
const optionValue = (id: string) => `id:${id}`;
const otherValue = "other";

/**
 * The owner's choice from the submitted form fields (a FormData or
 * URLSearchParams works), values kept exactly. An empty Other is no choice;
 * in single-select, Other counts only when its radio is the one picked.
 */
export function readChoice(card: GrillCard, fields: Iterable<readonly [string, string]>): Choice {
  const picked: string[] = [];
  let notes: string | undefined;
  let other: string | undefined;
  for (const [name, value] of fields) {
    if (name === optionField) picked.push(value);
    else if (name === "notes" && card.notes) notes = value;
    else if (name === "other" && card.other) other = value;
  }
  const chosen = picked.filter((v) => v.startsWith("id:")).map((v) => v.slice(3));
  const otherPicked = card.multi ? other !== undefined && other !== "" : picked.includes(otherValue);
  return {
    chosen,
    ...(notes !== undefined ? { notes } : {}),
    ...(otherPicked ? { other: other ?? "" } : {}),
  };
}

const loneSurrogate = /[\uD800-\uDFFF]/u;
const utcTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d+)?Z$/;

/** The answer for this card, checked against it as the contract requires before anything is sent. */
export function answerFor(card: GrillCard, choice: Choice, at: Date | string): GrillAnswer {
  checkCard(card);
  const time = typeof at === "string" ? at : at.toISOString();
  if (!utcTime.test(time) || Number.isNaN(Date.parse(time))) throw new Error(`answer time "${time}" must be an RFC 3339 UTC time`);
  const ids = new Set(card.options.map((o) => o.id));
  for (const id of choice.chosen) if (!ids.has(id)) throw new Error(`"${id}" is not an option on this question`);
  if (new Set(choice.chosen).size !== choice.chosen.length) throw new Error("an option was chosen twice; choices must be distinct");
  if (choice.notes !== undefined && !card.notes) throw new Error("this question takes no notes");
  if (choice.other !== undefined && !card.other) throw new Error("this question takes no other answer");
  if (choice.other === "") throw new Error("an other answer needs its text");
  for (const text of [choice.notes, choice.other]) {
    if (text !== undefined && loneSurrogate.test(text)) throw new Error("the text can't be sent as UTF-8");
  }
  const count = choice.chosen.length + (choice.other !== undefined ? 1 : 0);
  if (count === 0) throw new Error("pick a choice before Next");
  if (!card.multi && count > 1) throw new Error("this question takes one choice");
  return {
    schema,
    kind: "answer",
    context: card.context,
    chosen_option_ids: [...choice.chosen],
    ...(choice.notes !== undefined ? { notes: choice.notes } : {}),
    ...(choice.other !== undefined ? { other: choice.other } : {}),
    at: time,
  };
}

/** The context with decisions.v1's fixed key order. */
const ordered = (c: GrillContext): GrillContext => ({
  subject: { repository: c.subject.repository, kind: c.subject.kind, number: c.subject.number },
  comment_id: c.comment_id,
  request_id: c.request_id,
  request_kind: c.request_kind,
  fingerprint: c.fingerprint,
  grill_file: c.grill_file,
  round: c.round,
  question_id: c.question_id,
});

/**
 * The answer as one physical line: the compact answer object with every
 * non-ASCII character as a JSON Unicode escape, so line separators can't split
 * it. This is the exact segment the grill records under its question.
 */
export function answerLine(answer: GrillAnswer): string {
  const compact = JSON.stringify({
    schema: answer.schema,
    kind: answer.kind,
    context: ordered(answer.context),
    chosen_option_ids: answer.chosen_option_ids,
    ...(answer.notes !== undefined ? { notes: answer.notes } : {}),
    ...(answer.other !== undefined ? { other: answer.other } : {}),
    at: answer.at,
  });
  return compact.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** The whole message for the Wiz thread: decisions.v1's framing, then the answer line, with no newline after it. */
export function answerMessage(answer: GrillAnswer): string {
  return `openwiz decision answer v1\n${JSON.stringify(ordered(answer.context))}\n\n${answerLine(answer)}`;
}

// Phone-first: one column, 44 px targets, 16 px text fields so a phone doesn't zoom,
// and long words wrap instead of pushing the page sideways.
const css = `
.grill{max-width:640px;min-width:0;overflow-wrap:anywhere}
.grill .meta{margin:0 0 6px;color:var(--muted,#9a9aa2);font-size:12px}
.grill fieldset{margin:0;padding:0;border:0;min-width:0}
.grill legend{padding:0;margin:0 0 10px;font-size:15px;font-weight:600;line-height:1.35}
.grill .choice{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 10px;margin:0 0 6px;border:1px solid var(--line,rgb(255 255 255/.08));border-radius:10px;cursor:pointer}
.grill .choice:has(input:checked){border-color:var(--fg,#ececee)}
.grill .choice input{flex:none;width:20px;height:20px;margin:0}
.grill .choice .text{flex:1;min-width:0}
.grill .recommended{flex:none;font-size:11px;font-weight:600;color:var(--warn,#e5a54b)}
.grill .field{display:block;margin:10px 0 0;min-height:44px}
.grill .field span{display:block;margin:0 0 4px;color:var(--muted,#9a9aa2);font-size:12px}
.grill textarea,.grill input[type=text]{display:block;width:100%;min-height:44px;padding:10px;font:16px/1.4 system-ui,sans-serif;color:inherit;background:transparent;border:1px solid var(--line,rgb(255 255 255/.08));border-radius:10px}
.grill textarea{min-height:72px;resize:vertical}
.grill .actions{display:flex;justify-content:flex-end;margin:12px 0 0}
.grill button{min-height:44px;min-width:96px;padding:0 18px;font:600 15px system-ui,sans-serif;color:var(--bg,#0f0f10);background:var(--fg,#ececee);border:0;border-radius:10px;cursor:pointer}
.grill :focus-visible{outline:2px solid var(--warn,#e5a54b);outline-offset:2px}`;

function renderCard(card: GrillCard, at: number, of: number): string {
  const type = card.multi ? "checkbox" : "radio";
  const q = esc(card.context.question_id);
  const options = card.options.map((option, i) => {
    const mark = option.recommended ? ` data-recommended` : "";
    const badge = option.recommended ? `<span class="recommended">Recommended</span>` : "";
    return `<label class="choice"><input type="${type}" name="${optionField}" value="${esc(optionValue(option.id))}"${mark}${i === 0 ? " autofocus" : ""}>`
      + `<span class="text">${esc(option.text)}</span>${badge}</label>`;
  }).join("");
  const otherRadio = card.other && !card.multi
    ? `<label class="choice"><input type="radio" name="${optionField}" value="${otherValue}"><span class="text">Other</span></label>`
    : "";
  const other = card.other
    ? `<label class="field"><span>${card.multi ? "Other" : "Other, in your words"}</span><input type="text" name="other" autocomplete="off"></label>`
    : "";
  const notes = card.notes
    ? `<label class="field"><span>Notes</span><textarea name="notes" rows="3"></textarea></label>`
    : "";
  return `<form class="grill" method="post" data-question="${q}" aria-label="Grill question ${q}">`
    + `<p class="meta">Question ${esc(at)} of ${esc(of)} · ${q}${card.multi ? " · pick any" : ""}</p>`
    + `<fieldset><legend>${esc(card.text)}</legend>${options}${otherRadio}</fieldset>${other}${notes}`
    + `<div class="actions"><button type="submit">Next</button></div></form>`;
}

/** The Grill view: the first unanswered question, alone. */
export const grillPickerView: View<GrillPicker> = {
  id: "grill",
  label: "Grill",
  count: (data) => data.cards.length,
  render(data) {
    const card = data.cards[0];
    if (!card) return `<p class="meta">No grill questions waiting.</p>`;
    try {
      checkCard(card);
    } catch (error) {
      return `<p class="unavailable">${esc(`This question can't be shown: ${(error as Error).message}`)}</p>`;
    }
    return `<style>${css}</style>${renderCard(card, 1, data.cards.length)}`;
  },
};
