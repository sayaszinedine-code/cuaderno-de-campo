export type AiProviderId = "deepseek" | "claude";

export interface AiRequest {
  system: string;
  prompt: string;
  images?: Blob[];
  onText?(full: string): void;
  signal?: AbortSignal;
}

export type AiErrorCode =
  | "no-key"
  | "invalid-key"
  | "rate-limit"
  | "network"
  | "refused"
  | "no-images"
  | "disabled"
  | "other";

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode) {
    super(code);
    this.name = "AiError";
    this.code = code;
  }
}

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  "no-key": "Agrega tu clave de IA en Perfil.",
  "invalid-key": "La clave de IA no es válida.",
  "rate-limit": "Se alcanzó el límite de uso o no hay saldo. Intenta más tarde.",
  network: "Sin conexión a internet. La IA necesita internet; lo demás funciona sin conexión.",
  refused: "La IA no pudo responder a esta solicitud.",
  "no-images": "Describir fotos solo está disponible con Claude.",
  disabled: "Activa el asistente de IA en Perfil.",
  other: "No se pudo generar el texto. Intenta de nuevo.",
};

export const AI_PROVIDERS: Record<AiProviderId, { label: string; country: string }> = {
  deepseek: { label: "DeepSeek", country: "China" },
  claude: { label: "Claude (Anthropic)", country: "Estados Unidos" },
};
