import type { Student } from "@/domain/schema";

type NamePart = Pick<Student, "firstNames" | "lastNames">;

/** Apostrophe look-alikes (right/left quote, modifier letter, grave, acute) separate name parts. */
const APOSTROPHES = "'\u2019\u2018\u02BC`\u00B4";
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const NAME_SPLIT = new RegExp(`[\\s\\-${APOSTROPHES}]+`, "u");
const SEPARATOR = new RegExp(`^[\\s\\-${APOSTROPHES}]+$`, "u");
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * Canonical form for matching: the acute accent and the modifier-letter apostrophe become ’ (NFKC
 * would turn the acute into a space plus a combining mark, and ʼ counts as a letter), NFKC folds compatibility forms (fullwidth letters), and invisible format
 * characters (zero-width, soft hyphen) are dropped so they cannot split a name.
 */
const prepare = (s: string) => s.replace(/[\u00B4\u02BC]/g, "\u2019").normalize("NFKC").replace(/\p{Cf}/gu, "");

const split = (s: string) => s.split(NAME_SPLIT).filter(Boolean);
const words = (s: string) => split(s).map(fold);

interface Word {
  start: number;
  end: number;
  folded: string;
  raw: string;
}

function studentInitials(students: NamePart[]): string[] {
  // Names arrive already prepared.
  const base = students.map((s) =>
    [...split(s.firstNames), ...split(s.lastNames)].map((t) => `${t[0].toUpperCase()}.`).join(" "),
  );
  const seen = new Map<string, number>();
  return base.map((b) => {
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return n === 1 ? b : `${b} (${n})`;
  });
}

/**
 * Replaces children's names with initials. Whole-word, accent/case-insensitive,
 * compound names (hyphen, apostrophes) are split. A name part shared by several
 * children is replaced by its own initial, never by one child's initials.
 * The legend maps each label that belongs to exactly one child to that child's full name (labels for
 * shared tokens are left out); it stays on this device and must never be sent.
 */
export function anonymize(text: string, rawStudents: NamePart[]): { text: string; legend: Record<string, string> } {
  const input = prepare(text);
  const students = rawStudents.map((s) => ({ firstNames: prepare(s.firstNames), lastNames: prepare(s.lastNames) }));
  const initials = studentInitials(students);

  // phrase (folded words joined by space) -> student indexes
  const phrases = new Map<string, Set<number>>();
  const add = (ws: string[], idx: number) => {
    if (ws.length === 0) return;
    if (ws.length === 1 && ws[0].length < 3) return;
    const key = ws.join(" ");
    (phrases.get(key) ?? phrases.set(key, new Set()).get(key)!).add(idx);
  };
  students.forEach((s, idx) => {
    const first = words(s.firstNames);
    const last = words(s.lastNames);
    add([...first, ...last], idx);
    add(first, idx);
    add(last, idx);
    for (const w of [...first, ...last]) if (w.length >= 3) add([w], idx);
  });
  const maxLen = Math.max(0, ...[...phrases.keys()].map((k) => k.split(" ").length));

  const found: Word[] = [];
  for (const m of input.matchAll(WORD)) {
    found.push({ start: m.index, end: m.index + m[0].length, folded: fold(m[0]), raw: m[0] });
  }

  /** label -> owner index, or null when the label is ambiguous (shared token or several owners). */
  const owners = new Map<string, number | null>();
  const own = (label: string, idx: number | null) => {
    const prev = owners.get(label);
    owners.set(label, prev === undefined ? idx : prev === idx ? prev : null);
  };
  let out = "";
  let pos = 0;
  let i = 0;
  while (i < found.length) {
    let replaced = false;
    for (let n = Math.min(maxLen, found.length - i); n >= 1 && !replaced; n--) {
      let contiguous = true;
      for (let k = 0; k < n - 1; k++) {
        if (!SEPARATOR.test(input.slice(found[i + k].end, found[i + k + 1].start))) contiguous = false;
      }
      if (!contiguous) continue;
      const key = found.slice(i, i + n).map((w) => w.folded).join(" ");
      const matched = phrases.get(key);
      if (!matched) continue;
      let label: string;
      if (matched.size === 1) {
        const [idx] = matched;
        label = initials[idx];
        own(label, idx);
      } else {
        label = found.slice(i, i + n).map((w) => `${w.raw[0].toUpperCase()}.`).join(" ");
        own(label, null);
      }
      out += input.slice(pos, found[i].start) + label;
      pos = found[i + n - 1].end;
      i += n;
      replaced = true;
    }
    if (!replaced) i++;
  }
  const legend: Record<string, string> = {};
  for (const [label, idx] of owners) {
    if (idx !== null) legend[label] = `${rawStudents[idx].firstNames} ${rawStudents[idx].lastNames}`.trim();
  }
  return { text: out + input.slice(pos), legend };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Puts the children's names back into text produced from anonymized input, on this device only.
 * Whole-token matches, longest label first; a label never matches the start of a suffixed one
 * («A. P.» inside «A. P. (2)»). Labels missing from the legend (ambiguous) stay as they are.
 * A label's final dot doubles as a full stop at the end of a sentence: it is kept there.
 */
export function deanonymize(text: string, legend: Record<string, string>): string {
  const labels = Object.keys(legend).sort((a, b) => b.length - a.length);
  if (labels.length === 0) return text;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${labels.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])(?! \\(\\d+\\))`,
    "gu",
  );
  return text.replace(re, (label: string, offset: number) => {
    const name = legend[label] ?? label;
    const rest = text.slice(offset + label.length);
    const endsSentence = label.endsWith(".") && /^(?:$|\s*\n|\s+\p{Lu})/u.test(rest);
    return endsSentence ? `${name}.` : name;
  });
}
