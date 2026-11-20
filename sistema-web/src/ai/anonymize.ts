import type { Student } from "@/domain/schema";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function initialsOf(s: Pick<Student, "firstNames" | "lastNames">): string {
  return [...s.firstNames.split(/\s+/), ...s.lastNames.split(/\s+/)]
    .filter(Boolean)
    .map((t) => `${t[0].toUpperCase()}.`)
    .join(" ");
}

const tokens = (s: string) => s.split(/\s+/).filter((t) => t.length >= 3);

/**
 * Replaces children's names with initials. Matching is whole-word, accent and
 * case-insensitive. Longer phrases are matched first. The legend is for display only.
 */
export function anonymize(
  text: string,
  students: Pick<Student, "firstNames" | "lastNames">[],
): { text: string; legend: Record<string, string> } {
  // Candidate phrases (folded) -> student
  const entries: { phrase: string; initials: string; full: string }[] = [];
  for (const s of students) {
    const initials = initialsOf(s);
    const full = `${s.firstNames} ${s.lastNames}`.trim();
    const first = tokens(s.firstNames);
    const last = tokens(s.lastNames);
    const phrases = new Set<string>([fold(full), fold(s.firstNames), fold(s.lastNames), ...first, ...last].map(fold));
    for (const p of phrases) if (p.length >= 3) entries.push({ phrase: p, initials, full });
  }
  entries.sort((a, b) => b.phrase.length - a.phrase.length);

  // Fold char-by-char keeping 1:1 index mapping with the original.
  const foldedChars = [...text].map((ch) => {
    const f = fold(ch);
    return f.length === 1 ? f : ch.toLowerCase();
  });
  const chars = [...text];
  const isLetter = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

  const legend: Record<string, string> = {};
  let out = "";
  let i = 0;
  while (i < chars.length) {
    let matched = false;
    if (!isLetter(chars[i - 1]) && isLetter(chars[i])) {
      for (const e of entries) {
        const phraseChars = [...e.phrase];
        const end = i + phraseChars.length;
        if (foldedChars.slice(i, end).join("") === e.phrase && !isLetter(chars[end])) {
          out += e.initials;
          legend[e.initials] ??= e.full;
          i = end;
          matched = true;
          break;
        }
      }
    }
    if (!matched) out += chars[i++];
  }
  return { text: out, legend };
}
