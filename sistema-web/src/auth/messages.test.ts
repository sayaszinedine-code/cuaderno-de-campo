import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./messages";
import { NetworkError } from "./session";

describe("authErrorMessage", () => {
  it("maps invalid credentials", () => {
    expect(authErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials" })).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(authErrorMessage(new Error("Invalid login credentials"))).toBe("Correo o contraseña incorrectos.");
  });
  it("maps unconfirmed email", () => {
    expect(authErrorMessage({ message: "Email not confirmed", code: "email_not_confirmed" })).toBe(
      "Aún no confirmaste tu correo. Revisa tu bandeja de entrada.",
    );
  });
  it("maps already registered", () => {
    expect(authErrorMessage({ message: "User already registered", code: "user_already_exists" })).toBe(
      "Ya existe una cuenta con ese correo.",
    );
  });
  it("maps weak password", () => {
    expect(authErrorMessage({ message: "Password should be at least 6 characters", code: "weak_password" })).toBe(
      "La contraseña es muy débil. Usa al menos 8 caracteres.",
    );
  });
  it("maps network failures", () => {
    expect(authErrorMessage(new NetworkError())).toBe("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "No hay conexión. Revisa tu internet e inténtalo de nuevo.",
    );
    expect(authErrorMessage({ message: "x", name: "AuthRetryableFetchError" })).toBe(
      "No hay conexión. Revisa tu internet e inténtalo de nuevo.",
    );
  });
  it("falls back to a generic message", () => {
    expect(authErrorMessage(new Error("boom"))).toBe("Ocurrió un error inesperado. Inténtalo de nuevo.");
    expect(authErrorMessage("x")).toBe("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });
});
