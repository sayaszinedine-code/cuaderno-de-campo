import { NetworkError } from "./session";

const NETWORK = "No hay conexión. Revisa tu internet e inténtalo de nuevo.";

/** Maps Supabase/auth errors to user-facing Spanish messages. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof NetworkError || error instanceof TypeError) return NETWORK;
  if (typeof error !== "object" || error === null) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  const { message = "", code = "", name = "" } = error as Record<string, unknown>;
  const text = `${String(code)} ${String(message)}`.toLowerCase();
  if (String(name) === "AuthRetryableFetchError" || text.includes("failed to fetch")) return NETWORK;
  if (text.includes("invalid_credentials") || text.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (text.includes("email_not_confirmed") || text.includes("email not confirmed")) {
    return "Aún no confirmaste tu correo. Revisa tu bandeja de entrada.";
  }
  if (text.includes("user_already_exists") || text.includes("already registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  if (text.includes("weak_password") || text.includes("password should be")) {
    return "La contraseña es muy débil. Usa al menos 8 caracteres.";
  }
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}
