import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => vi.fn());
vi.mock("@/ai", () => ({ generateWithSettings: gen }));

import { AiSettings } from "./AiSettings";
import { currentApiKey, loadAiSettings, saveAiSettings, type AiSettings as Settings } from "@/ai/settings";
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
    expect(loadAiSettings("u1").apiKeys).toEqual({ deepseek: "sk-secret-1234" });
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
    saveAiSettings("u1", { enabled: true, provider: "claude", apiKeys: { claude: "sk-abcd" }, consentAt: "2026-01-01T00:00:00Z" });
    render(<AiSettings userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar clave" }));
    const s = loadAiSettings("u1");
    expect(currentApiKey(s)).toBe("");
    expect(s.enabled).toBe(false);
  });
  it("Probar shows the result or the Spanish error", async () => {
    saveAiSettings("u1", { enabled: true, provider: "deepseek", apiKeys: { deepseek: "k" }, consentAt: "2026-01-01T00:00:00Z" });
    gen.mockResolvedValueOnce("Listo, el asistente funciona.");
    render(<AiSettings userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(await screen.findByText("Listo, el asistente funciona.")).toBeInTheDocument();
    gen.mockRejectedValueOnce(new AiError("no-key"));
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    await waitFor(() => expect(screen.getByText("Agrega tu clave de IA en Perfil.")).toBeInTheDocument());
  });
  it("switching provider never sends the previous provider's key and asks for consent again", async () => {
    saveAiSettings("u1", { enabled: true, provider: "deepseek", apiKeys: { deepseek: "sk-deep-1111" }, consentAt: "2026-01-01T00:00:00Z" });
    gen.mockResolvedValue("ok");
    render(<AiSettings userId="u1" />);
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "claude" } });
    expect(screen.getByText("Cambiaste de proveedor: vuelve a aceptar el consentimiento.")).toBeInTheDocument();
    expect(loadAiSettings("u1")).toMatchObject({ enabled: false, provider: "claude" });
    expect(loadAiSettings("u1").consentAt).toBeUndefined();
    expect(screen.queryByText(/Clave guardada/)).toBeNull();
    expect(screen.getByRole("button", { name: "Probar" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Usar asistente de IA"));
    fireEvent.click(screen.getByRole("button", { name: "Acepto" }));
    expect(screen.queryByText("Cambiaste de proveedor: vuelve a aceptar el consentimiento.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    await waitFor(() => expect(gen).toHaveBeenCalled());
    const sent = gen.mock.calls[0][0] as Settings;
    expect(sent.provider).toBe("claude");
    expect(currentApiKey(sent)).not.toBe("sk-deep-1111");
    expect(currentApiKey(sent)).toBe("");
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "deepseek" } });
    expect(screen.getByText("Clave guardada: …1111")).toBeInTheDocument();
  });
  it("trims the key and rejects invisible or non-ASCII characters", () => {
    render(<AiSettings userId="u1" />);
    const input = screen.getByLabelText("Clave de IA");
    fireEvent.change(input, { target: { value: "sk-a\u200bb" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));
    expect(screen.getByText("La clave tiene caracteres no válidos. Cópiala de nuevo.")).toBeInTheDocument();
    expect(loadAiSettings("u1").apiKeys).toEqual({});
    fireEvent.change(input, { target: { value: "sk-ñandú" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));
    expect(loadAiSettings("u1").apiKeys).toEqual({});
    fireEvent.change(input, { target: { value: "  sk-good-9999\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));
    expect(loadAiSettings("u1").apiKeys).toEqual({ deepseek: "sk-good-9999" });
    expect(screen.queryByText("La clave tiene caracteres no válidos. Cópiala de nuevo.")).toBeNull();
  });
});
