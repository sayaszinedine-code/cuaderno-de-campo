// Asistente de redacción: llama a Claude con la clave API que la docente guarda en su propio dispositivo.
// Se empaqueta con esbuild en www/vendor/ia.js y expone window.IA.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-opus-5-5";

function cliente(apiKey) {
  // La clave nunca sale del dispositivo salvo hacia la API de Anthropic.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

const blobABase64 = (blob) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

/**
 * Genera texto. opts: { onText(textoCompleto), images: Blob[], signal }
 * Devuelve el texto final o lanza un Error con .code (sin_clave | clave_invalida | limite | rechazo | red | otro).
 */
async function generar(apiKey, system, prompt, opts = {}) {
  if (!apiKey) throw Object.assign(new Error("Falta la clave API"), { code: "sin_clave" });
  const content = [];
  for (const img of opts.images || []) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.type || "image/jpeg", data: await blobABase64(img) },
    });
  }
  content.push({ type: "text", text: prompt });

  let texto = "";
  try {
    const stream = cliente(apiKey).beta.messages.stream(
      {
        model: MODELO,
        max_tokens: 8000,
        system,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content }],
      },
      { signal: opts.signal }
    );
    stream.on("text", (delta) => {
      texto += delta;
      opts.onText?.(texto);
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") {
      throw Object.assign(new Error("Solicitud rechazada"), { code: "rechazo" });
    }
    return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (e) {
    if (e.code) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      throw Object.assign(new Error("Clave inválida"), { code: "clave_invalida" });
    if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error("Límite"), { code: "limite" });
    if (e instanceof Anthropic.APIConnectionError) throw Object.assign(new Error("Sin conexión"), { code: "red" });
    if (e instanceof Anthropic.APIError) throw Object.assign(new Error(e.message), { code: "otro" });
    throw Object.assign(new Error(String(e?.message || e)), { code: "otro" });
  }
}

window.IA = { generar, modelo: MODELO };
