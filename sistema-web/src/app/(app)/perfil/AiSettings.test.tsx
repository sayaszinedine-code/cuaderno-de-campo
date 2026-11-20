import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => vi.fn());
vi.mock("@/ai", () => ({ generateWithSettings: gen }));

import { AiSettings } from "./AiSettings";
import { loadAiSettings, saveAiSettings } from "@/ai/settings";
import { AiError } from "@/ai/types";

beforeEach(() => {
  localStorage.clear();
  gen.mockReset();
});

describe("AiSettings", () => {
  it("asks for consent with provider and country before enabling", () => {
    render(<AiSettings userId="u1" />);
    fireEvent.click(screen.getByLabelText("Usar asistente de IA"));
    expect(screen.getByText(/procesa los datos en China/)).toBeInTheDocument();
    expect(loadAiSettings("u1").enabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Acepto" }));
    const s = loadAiSettings("u1");
    expect(s.enabled).toBe(true);
    expect(s.consentAt).toBeTruthy();
  });
  it("cancel leaves it disabled; Claude shows Estados Unidos", () => {
    render(<AiSettings userId="u1" />);
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "claude" } });
    fireEvent.click(screen.getByLabelText("Usar asistente de IA"));
    expect(screen.getByText(/procesa los datos en Estados Unidos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(loadAiSettings("u1").enabled).toBe(false);
  });
  it("stores the key, shows only the last 4 chars, input is a password field", () => {
    render(<AiSettings userId="u1" />);
    const input = screen.getByLabelText("Clave de IA");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "sk-secret-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));
    expect(loadAiSettings("u1").apiKey).toBe("sk-secret-1234");
    expect(screen.getByText("Clave guardada: …1234")).toBeInTheDocument();
    expect(screen.queryByText(/sk-secret/)).toBeNull();
    expect((input as HTMLInputElement).value).toBe("");
  });
  it("disables Probar until enabled with consent", () => {
    render(<AiSettings userId="u1" />);
    expect(screen.getByRole("button", { name: "Probar" })).toBeDisabled();
    expect(gen).not.toHaveBeenCalled();
  });
  it("Borrar clave removes the key and disables the assistant", () => {
    saveAiSettings("u1", { enabled: true, provider: "claude", apiKey: "sk-abcd", consentAt: "2026-01-01T00:00:00Z" });
    render(<AiSettings userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar clave" }));
    const s = loadAiSettings("u1");
    expect(s.apiKey).toBe("");
    expect(s.enabled).toBe(false);
  });
  it("Probar shows the result or the Spanish error", async () => {
    saveAiSettings("u1", { enabled: true, provider: "deepseek", apiKey: "k", consentAt: "2026-01-01T00:00:00Z" });
    gen.mockResolvedValueOnce("Listo, el asistente funciona.");
    render(<AiSettings userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(await screen.findByText("Listo, el asistente funciona.")).toBeInTheDocument();
    gen.mockRejectedValueOnce(new AiError("no-key"));
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    await waitFor(() => expect(screen.getByText("Agrega tu clave de IA en Perfil.")).toBeInTheDocument());
  });
});
