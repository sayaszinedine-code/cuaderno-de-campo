export interface BuiltPrompt {
  system: string;
  prompt: string;
}

export const SYSTEM_PROMPT = [
  "Eres un asistente de redacción para una docente de educación inicial en Perú.",
  "Trabajas con el Currículo Nacional de la Educación Básica (CNEB) y la evaluación formativa.",
  "Responde siempre en español peruano, claro y sencillo.",
  "No inventes datos: usa solo la información que se te da.",
  "Los nombres de los niños aparecen como iniciales; no intentes adivinarlos.",
].join(" ");

const build = (instructions: string, content: string): BuiltPrompt => ({
  system: SYSTEM_PROMPT,
  prompt: `${instructions}\n\n${content}`,
});

export const prompts = {
  test: "Responde solo: Listo, el asistente funciona.",
};

export function objectiveEvidence(rawNote: string): BuiltPrompt {
  return build(
    "Redacta la evidencia objetiva de esta observación: solo hechos observables, en tercera persona, sin juicios de valor. Conserva las citas textuales entre comillas. Máximo 6 oraciones. Responde en español y no inventes datos.",
    `Observación:\n${rawNote}`,
  );
}

export function suggestCompetency(
  note: string,
  competencies: { id: string; name: string }[],
  /** Desempeños of every competency, numbered globally. */
  performances: { index: number; competency: string; text: string }[],
): BuiltPrompt {
  const comps = competencies.map((c, i) => `${i + 1}. [${c.id}] ${c.name}`).join("\n");
  const perfs = performances.map((p) => `[${p.index}] ${p.competency} — ${p.text}`).join("\n");
  return build(
    'Elige la competencia y los desempeños que mejor corresponden a la observación, SOLO de las listas dadas. Los desempeños elegidos deben ser de la competencia elegida. Responde únicamente con JSON, sin texto adicional, con la forma {"competencyId": string, "performanceIndexes": number[], "reason": string}. "competencyId" es el código entre corchetes de la competencia; "performanceIndexes" son los números entre corchetes de los desempeños. "reason" va en español, breve. No inventes datos.',
    `Observación:\n${note}\n\nCompetencias:\n${comps}\n\nDesempeños (usa los números):\n${perfs}`,
  );
}

export function interpretation(evidence: string, competency: string, performances: string[]): BuiltPrompt {
  return build(
    "Redacta la interpretación pedagógica de la evidencia en 2 o 3 oraciones, relacionándola con los desempeños. No califiques ni pongas nivel de logro. Responde en español y no inventes datos.",
    `Competencia: ${competency}\nDesempeños:\n${performances.map((p) => `- ${p}`).join("\n")}\n\nEvidencia:\n${evidence}`,
  );
}

export function describePhoto(context?: string): BuiltPrompt {
  return build(
    "Describe la foto en 3 o 4 oraciones objetivas: qué se ve y qué hace cada niño, sin juicios de valor. Responde en español y no inventes datos.",
    context ? `Contexto:\n${context}` : "",
  );
}

export interface Suggestion {
  competencyId: string;
  performanceIndexes: number[];
  reason: string;
}

/** Tolerant to text around the JSON object. Returns null when it cannot be parsed. */
export function parseSuggestion(text: string): Suggestion | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof j.competencyId !== "string" || !j.competencyId) return null;
    const idx = Array.isArray(j.performanceIndexes)
      ? j.performanceIndexes.filter((n): n is number => typeof n === "number" && Number.isInteger(n))
      : [];
    return {
      competencyId: j.competencyId,
      performanceIndexes: idx,
      reason: typeof j.reason === "string" ? j.reason : "",
    };
  } catch {
    return null;
  }
}
