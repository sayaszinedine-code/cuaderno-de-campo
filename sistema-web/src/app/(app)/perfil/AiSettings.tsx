"use client";

import { useState } from "react";
import { generateWithSettings } from "@/ai";
import { loadAiSettings, saveAiSettings, type AiSettings as Settings } from "@/ai/settings";
import { prompts, SYSTEM_PROMPT } from "@/ai/prompts";
import { AI_ERROR_MESSAGES, AI_PROVIDERS, AiError, type AiProviderId } from "@/ai/types";

export function AiSettings({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<Settings>(() => loadAiSettings(userId));
  const [keyInput, setKeyInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const provider = AI_PROVIDERS[settings.provider];

  function persist(next: Settings) {
    try {
      saveAiSettings(userId, next);
      setSettings(next);
      setMessage(null);
    } catch {
      setMessage("No se pudo guardar la configuración en este navegador.");
    }
  }

  function onToggle(checked: boolean) {
    if (!checked) {
      setAsking(false);
      persist({ ...settings, enabled: false });
    } else if (settings.consentAt) {
      persist({ ...settings, enabled: true });
    } else {
      setAsking(true);
    }
  }

  function accept() {
    setAsking(false);
    persist({ ...settings, enabled: true, consentAt: new Date().toISOString() });
  }

  function onProvider(id: AiProviderId) {
    // A different provider is a new recipient: ask for consent again.
    persist({ enabled: false, provider: id, apiKey: settings.apiKey });
    setAsking(false);
    setTestResult(null);
  }

  function saveKey() {
    const apiKey = keyInput.trim();
    if (!apiKey) return;
    persist({ ...settings, apiKey });
    setKeyInput("");
  }

  function clearKey() {
    persist({ ...settings, enabled: false, apiKey: "" });
    setTestResult(null);
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const text = await generateWithSettings(settings, {
        system: SYSTEM_PROMPT,
        prompt: prompts.test,
      });
      setTestResult({ ok: true, text });
    } catch (e) {
      setTestResult({ ok: false, text: AI_ERROR_MESSAGES[e instanceof AiError ? e.code : "other"] });
    }
    setTesting(false);
  }

  const consentProvider = provider.label.startsWith("Claude") ? "Claude (Anthropic)" : provider.label;

  return (
    <section className="card max-w-2xl space-y-4 p-6" aria-labelledby="ai-title">
      <h2 id="ai-title" className="text-xl font-semibold">Asistente de IA</h2>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={settings.enabled || asking}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>Usar asistente de IA</span>
      </label>
      {asking && (
        <div role="alertdialog" aria-label="Consentimiento" className="space-y-3 rounded-xl bg-accent-soft p-4">
          <p>
            Al usar el asistente, el texto que elijas (y la foto, si lo pides) se envía a {consentProvider} para
            generar la redacción. {consentProvider} procesa los datos en {provider.country}. Los nombres de los niños
            se reemplazan por iniciales antes de enviarse. Tu clave se guarda solo en este navegador.
          </p>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" onClick={accept}>Acepto</button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>Cancelar</button>
          </div>
        </div>
      )}
      <label className="block space-y-1">
        <span>Proveedor</span>
        <select
          className="field"
          value={settings.provider}
          onChange={(e) => onProvider(e.target.value as AiProviderId)}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="claude">Claude</option>
        </select>
      </label>
      <div className="space-y-1">
        <label className="block space-y-1">
          <span>Clave de IA</span>
          <input
            className="field"
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={settings.apiKey ? `Guardada: …${settings.apiKey.slice(-4)}` : "Pega tu clave"}
          />
        </label>
        <button type="button" className="btn" onClick={saveKey} disabled={!keyInput.trim()}>
          Guardar clave
        </button>
        {settings.apiKey && (
          <>
            <p className="text-sm">Clave guardada: …{settings.apiKey.slice(-4)}</p>
            <button type="button" className="btn" onClick={clearKey}>Borrar clave</button>
          </>
        )}
      </div>
      <button type="button" className="btn" onClick={test}
        disabled={testing || !settings.enabled || !settings.consentAt}
      >
        {testing ? "Probando…" : "Probar"}
      </button>
      {testResult && (
        <p role={testResult.ok ? "status" : "alert"} className="rounded-xl bg-accent-soft p-3">
          {testResult.text}
        </p>
      )}
      {message && <p role="alert" className="rounded-xl bg-accent-soft p-3">{message}</p>}
    </section>
  );
}
