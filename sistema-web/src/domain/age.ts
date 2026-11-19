import type { AgeBand, Cycle } from "@/curriculum/types";

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(date: string | undefined): Ymd | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function monthsBetween(from: Ymd, to: Ymd): number | null {
  const months = (to.y - from.y) * 12 + (to.m - from.m) - (to.d < from.d ? 1 : 0);
  return months < 0 ? null : months;
}

/** Completed months between birthDate and `at` (YYYY-MM-DD); null if missing/invalid/future. */
export function ageInMonths(birthDate: string, at: string): number | null {
  const from = parse(birthDate);
  const to = parse(at);
  if (!from || !to) return null;
  return monthsBetween(from, to);
}

/** Completed years on March 31 of `schoolYear`; null if missing/invalid/future. */
export function ageAtMarch31(birthDate: string, schoolYear: number): number | null {
  const months = ageInMonths(birthDate, `${schoolYear}-03-31`);
  return months === null ? null : Math.floor(months / 12);
}

export function bandFor(params: {
  cycle: Cycle;
  birthDate?: string;
  at: string;
  schoolYear: number;
  classroomBands: AgeBand[];
}): AgeBand {
  const { cycle, birthDate, at, schoolYear, classroomBands } = params;
  const fallback = classroomBands[0];

  if (cycle === "I") {
    const months = birthDate ? ageInMonths(birthDate, at) : null;
    if (months === null) return fallback;
    if (months <= 9) return "9m";
    if (months <= 18) return "18m";
    if (months <= 24) return "24m";
    return "36m";
  }

  if (classroomBands.length === 1) return fallback;
  const years = birthDate ? ageAtMarch31(birthDate, schoolYear) : null;
  if (years === null) return fallback;
  const clamped = Math.min(5, Math.max(3, years));
  return `${clamped}y` as AgeBand;
}

export function formatAge(birthDate: string, at: string): string {
  const months = ageInMonths(birthDate, at);
  if (months === null) return "";
  if (months < 36) return `${months} meses`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsText = `${years} ${years === 1 ? "año" : "años"}`;
  if (rest === 0) return yearsText;
  return `${yearsText} ${rest} ${rest === 1 ? "mes" : "meses"}`;
}
