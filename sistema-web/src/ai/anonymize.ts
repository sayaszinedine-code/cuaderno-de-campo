import type { Student } from "@/domain/schema";

type NamePart = Pick<Student, "firstNames" | "lastNames">;

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/’/g, "'");
const NAME_SPLIT = /[\s\-'’]+/;
const SEPARATOR = /^[\s\-'’]+$/;
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

const split = (s: string) => s.split(NAME_SPLIT).filter(Boolean);
const words = (s: string) => split(s).map(fold);

interface Word {
  start: number;
  end: number;
  folded: string;
  raw: string;
}

function studentInitials(students: NamePart[]): string[] {
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
 * The legend is for display only and must never be sent.
 */
export function anonymize(text: string, students: NamePart[]): { text: string; legend: Record<string, string> } {
  const input = text.normalize("NFC");
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

  const legend: Record<string, string> = {};
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
      const owners = phrases.get(key);
      if (!owners) continue;
      let label: string;
      if (owners.size === 1) {
        const [idx] = owners;
        label = initials[idx];
        legend[label] ??= `${students[idx].firstNames} ${students[idx].lastNames}`.trim();
      } else {
        label = found.slice(i, i + n).map((w) => `${w.raw[0].toUpperCase()}.`).join(" ");
        legend[label] ??= [...owners].map((o) => `${students[o].firstNames} ${students[o].lastNames}`.trim()).join(" / ");
      }
      out += input.slice(pos, found[i].start) + label;
      pos = found[i + n - 1].end;
      i += n;
      replaced = true;
    }
    if (!replaced) i++;
  }
  return { text: out + input.slice(pos), legend };
}
