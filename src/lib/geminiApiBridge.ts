/**
 * Universal Gemini API Bridge for VOXReader.
 * Seamlessly handles:
 * 1. Web Preview / Production Web: proxies calls or connects to Gemini API with robust fallbacks.
 * 2. Windows Desktop Electron (.exe): makes direct REST requests to Google's official Gemini API
 *    using the user's configured API key, ensuring the desktop app works 100% standalone
 *    without needing an external local server process.
 * 3. Exponential backoff retry for rate limits / 429 errors (inspired by Lumina AI architecture).
 * 4. Preserves all currently configured Gemini models (gemini-3.6-flash, gemini-3.8-flash, gemini-3.1-flash-tts-preview, etc.).
 */

import { sanitizeApiKey, getApiBaseUrl, parseApiKeys, maskApiKey } from "./apiConfig";
import {
  loadGeminiSettings,
  getCustomApiKeys,
  getNextRotatedApiKey,
  markApiKeyCooldown,
  clearApiKeyCooldowns,
} from "./geminiSettings";

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.protocol === "file:" ||
    !window.location.host ||
    !!(window as any).electronAPI?.isElectron
  );
}

function isRotatableKeyError(error: any): boolean {
  const msg = String(error?.message || error || "").toUpperCase();
  const status = error?.status || error?.code;
  return (
    status === 429 ||
    status === 401 ||
    status === 403 ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("QUOTA") ||
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API KEY NOT VALID") ||
    msg.includes("INVALID_KEY") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("403")
  );
}

/**
 * Executes an operation with round-robin API key selection and automatic
 * failover across all configured keys when a key hits 429/quota or auth errors.
 */
async function withApiKeyRotation<T>(
  operation: (apiKey: string, keyIndex: number, totalKeys: number) => Promise<T>,
  shouldAbortFailover?: () => boolean
): Promise<T> {
  const keys = getCustomApiKeys();
  if (keys.length === 0) {
    return await operation("", -1, 0);
  }

  const first = getNextRotatedApiKey();
  const orderedIndices: number[] = [];
  for (let offset = 0; offset < keys.length; offset++) {
    orderedIndices.push((first.index + offset) % keys.length);
  }

  let lastError: any;
  for (let attempt = 0; attempt < orderedIndices.length; attempt++) {
    const idx = orderedIndices[attempt];
    const currentKey = keys[idx];
    try {
      return await operation(currentKey, idx, keys.length);
    } catch (error: any) {
      lastError = error;
      if (shouldAbortFailover?.()) {
        throw error;
      }
      if (isRotatableKeyError(error) && attempt < orderedIndices.length - 1) {
        const msg = String(error?.message || "").toUpperCase();
        const isQuota = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("QUOTA");
        markApiKeyCooldown(currentKey, isQuota ? 60_000 : 120_000);
        console.warn(
          `[GeminiBridge] Key #${idx + 1} (${maskApiKey(currentKey)}) bermasalah/limit. Merotasi ke Key berikutnya...`
        );
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Retry helper with exponential backoff for handling intermittent rate limits (429) and network glitches.
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || String(error);
      const isQuotaError =
        errorMsg.includes("429") ||
        errorMsg.includes("RESOURCE_EXHAUSTED") ||
        error?.status === 429;

      if (isQuotaError && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
        console.warn(`[GeminiBridge] Kuota/RPM tersenggol (429). Mencoba lagi dalam ${delayMs / 1000}s... (Percobaan ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export interface ApiKeyCheckItem {
  index: number;
  maskedKey: string;
  ok: boolean;
  message: string;
}

async function verifySingleKey(
  cleanKey: string,
  activeModel: string
): Promise<{ ok: boolean; message: string; reply?: string }> {
  const fallbackModel = activeModel === "gemini-3.8-flash" ? "gemini-3.6-flash" : "gemini-3.8-flash";
  const modelsToTry = [activeModel, fallbackModel];

  for (const model of modelsToTry) {
    try {
      const result = await retryOperation(async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          cleanKey
        )}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Ping. Balas 'OK'." }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        });

        const data = await res.json();
        if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return {
            ok: true,
            message: `Valid (${model})`,
            reply: data.candidates[0].content.parts[0].text.trim(),
          };
        }

        if (data.error) {
          const errMsg = data.error.message || "";
          if (errMsg.includes("API_KEY_INVALID") || res.status === 400) {
            throw new Error("INVALID_KEY");
          }
          if (errMsg.includes("RESOURCE_EXHAUSTED") || res.status === 429) {
            throw new Error("QUOTA_EXHAUSTED");
          }
          if (errMsg.includes("PERMISSION_DENIED") || res.status === 403) {
            throw new Error("PERMISSION_DENIED");
          }
          throw new Error(errMsg);
        }

        throw new Error("NO_RESPONSE");
      }, 0);

      if (result.ok) return result;
    } catch (err: any) {
      if (err.message === "INVALID_KEY") {
        return {
          ok: false,
          message: "API Key tidak valid. Pastikan kunci disalin lengkap (dimulai dengan AIzaSy...).",
        };
      }
      if (err.message === "QUOTA_EXHAUSTED") {
        return {
          ok: false,
          message: "Kuota/Rate Limit tercapai (429).",
        };
      }
      if (err.message === "PERMISSION_DENIED") {
        return {
          ok: false,
          message: "Akses ditolak (403). Periksa izin Generative Language API.",
        };
      }
      console.warn(`[verifyApiKey] Model ${model} check error:`, err);
    }
  }

  // Fallback to backend server check on web preview
  if (!isDesktopApp()) {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/gemini/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": cleanKey,
        },
        body: JSON.stringify({ apiKey: cleanKey }),
      });
      return await res.json();
    } catch {
      // ignore
    }
  }

  return {
    ok: false,
    message: "Gagal menghubungkan API Key ke Google AI Studio.",
  };
}

/**
 * Verifies one or multiple newline-separated API Keys using the current text model.
 */
export async function verifyApiKey(
  key?: string
): Promise<{
  ok: boolean;
  message: string;
  reply?: string;
  results?: ApiKeyCheckItem[];
}> {
  const settings = loadGeminiSettings();
  const rawKey = key ?? settings.apiKey;
  const keys = parseApiKeys(rawKey);
  const cleanKey = sanitizeApiKey(rawKey);

  if (keys.length === 0 && isDesktopApp()) {
    return {
      ok: false,
      message: "API Key belum diisi. Silakan tempel satu atau lebih API Key Anda dari Google AI Studio.",
    };
  }

  // Web environment with no custom key: check default server key
  if (!isDesktopApp() && keys.length === 0) {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/gemini/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return await res.json();
    } catch {
      return { ok: false, message: "Gagal menghubungi server verifikasi web." };
    }
  }

  const activeModel = settings.textModel || "gemini-3.6-flash";
  clearApiKeyCooldowns();

  if (keys.length === 1) {
    const singleRes = await verifySingleKey(cleanKey, activeModel);
    return {
      ok: singleRes.ok,
      reply: singleRes.reply,
      message: singleRes.ok
        ? `API Key valid dan berhasil terhubung (${singleRes.message.replace(/^Valid \((.*)\)$/, "$1")})!`
        : singleRes.message,
      results: [
        {
          index: 0,
          maskedKey: maskApiKey(cleanKey),
          ok: singleRes.ok,
          message: singleRes.message,
        },
      ],
    };
  }

  // Multi-key batch verification
  const results: ApiKeyCheckItem[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const r = await verifySingleKey(k, activeModel);
    if (!r.ok) {
      markApiKeyCooldown(k, 60_000);
    }
    results.push({
      index: i,
      maskedKey: maskApiKey(k),
      ok: r.ok,
      message: r.message,
    });
  }

  const validCount = results.filter((r) => r.ok).length;
  if (validCount === keys.length) {
    return {
      ok: true,
      message: `${validCount}/${keys.length} API Key valid dan siap dirotasi otomatis!`,
      results,
    };
  }
  if (validCount > 0) {
    return {
      ok: true,
      message: `${validCount}/${keys.length} API Key valid & aktif untuk rotasi. Sebagian key lain limit/tidak valid (lihat detail).`,
      results,
    };
  }
  return {
    ok: false,
    message: `0/${keys.length} API Key berhasil terhubung. Periksa kembali key Anda.`,
    results,
  };
}

/**
 * Ask a question about the document with auto-retry and desktop direct API support
 */
export async function askGeminiDocument(params: {
  question: string;
  history: Array<{ role: string; content: string }>;
  pageText: string;
  docTitle?: string;
  pageNumber?: number;
  model?: string;
  personality?: string;
}): Promise<{ answer: string; model?: string }> {
  const settings = loadGeminiSettings();
  const selectedModel = params.model || settings.textModel || "gemini-3.6-flash";

  return await withApiKeyRotation(async (apiKey) => {
    return await retryOperation(async () => {
      if (isDesktopApp()) {
        if (!apiKey) {
          throw new Error(
            "API Key belum diisi. Silakan buka Pengaturan Gemini AI (ikon gerigi) dan masukkan API Key Anda untuk menggunakan asisten AI."
          );
        }

        const systemPrompt =
          params.personality ||
          `Anda adalah VOXReader AI Assistant, asisten pembaca dokumen PDF yang cerdas, ramah, dan solutif.
Jawab pertanyaan pengguna secara akurat, terstruktur, dan berbasis pada konteks dokumen yang disediakan.
Dokumen: "${params.docTitle || "Dokumen"}" (Halaman ${params.pageNumber || 1}).
Gunakan format Markdown jika memudahkan pembacaan.`;

        const contextPrefix = params.pageText
          ? `[KONTEKS HALAMAN ${params.pageNumber || 1}]:\n"""${params.pageText.slice(0, 10000)}"""\n\n`
          : "";

        const fullUserPrompt = `${contextPrefix}Pertanyaan Pengguna: ${params.question}`;

        const contents = [
          ...params.history.map((h) => ({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.content }],
          })),
          {
            role: "user",
            parts: [{ text: fullUserPrompt }],
          },
        ];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 2048,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          const msg = data.error?.message || "Gagal mendapatkan respon dari Gemini AI";
          if (res.status === 429) {
            throw new Error("429 RESOURCE_EXHAUSTED: Kuota permintaan Gemini AI tercapai.");
          }
          throw new Error(msg);
        }

        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!answer) {
          throw new Error("Tidak ada jawaban yang dihasilkan oleh model AI.");
        }

        return { answer: answer.trim(), model: selectedModel };
      }

      // Web environment: call server with rotated key
      const baseUrl = getApiBaseUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-gemini-api-key"] = apiKey;

      const res = await fetch(`${baseUrl}/api/ai/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: params.question,
          history: params.history,
          pageText: params.pageText,
          docTitle: params.docTitle,
          pageNumber: params.pageNumber,
          model: selectedModel,
          personality: params.personality,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("429: Kuota tercapai.");
        }
        throw new Error(data.error || "Gagal bertanya ke AI.");
      }
      return data;
    }, getCustomApiKeys().length > 1 ? 0 : 2);
  });
}

/**
 * Summarize current page with auto-retry and desktop direct API support
 */
export async function summarizeDocumentPage(params: {
  pageText: string;
  pageNumber?: number;
  docTitle?: string;
  model?: string;
  personality?: string;
}): Promise<{ summary: string; model?: string }> {
  const settings = loadGeminiSettings();
  const selectedModel = params.model || settings.textModel || "gemini-3.6-flash";

  return await withApiKeyRotation(async (apiKey) => {
    return await retryOperation(async () => {
      if (isDesktopApp()) {
        if (!apiKey) {
          throw new Error(
            "API Key belum diisi. Silakan masukkan API Key di Pengaturan Gemini AI untuk merangkum halaman."
          );
        }

        const prompt = `Anda adalah asisten dokumen PDF. Buatlah rangkuman ringkas, terstruktur, dan mudah dipahami dari isi halaman ${
          params.pageNumber || 1
        } dokumen "${params.docTitle || "Dokumen"}".
Sertakan poin-poin penting dan kesimpulan utama.

Teks Halaman:
"""
${params.pageText.slice(0, 10000)}
"""`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          if (res.status === 429) {
            throw new Error("429: Kuota ringkasan tercapai.");
          }
          throw new Error(data.error?.message || "Gagal membuat rangkuman");
        }

        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!summary) throw new Error("Gagal membuat rangkuman halaman.");

        return { summary: summary.trim(), model: selectedModel };
      }

      // Web environment: call server with rotated key
      const baseUrl = getApiBaseUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-gemini-api-key"] = apiKey;

      const res = await fetch(`${baseUrl}/api/ai/summary`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          pageText: params.pageText,
          pageNumber: params.pageNumber,
          docTitle: params.docTitle,
          model: selectedModel,
          personality: params.personality,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("429: Kuota ringkasan tercapai.");
        }
        throw new Error(data.error || "Gagal membuat rangkuman.");
      }
      return data;
    }, getCustomApiKeys().length > 1 ? 0 : 2);
  });
}

/**
 * Convert PCM Audio Buffer to standard WAV
 */
function pcmToWav(
  pcmData: Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): ArrayBuffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const uint8 = new Uint8Array(buffer);
  uint8.set(pcmData, 44);

  return buffer;
}

function normalizeTtsModelId(model?: string): "gemini-3.8-flash-lite-tts" | "gemini-3.8-flash-tts" {
  if (model === "gemini-3.8-flash-tts" || model === "gemini-3.8-flash") {
    return "gemini-3.8-flash-tts";
  }
  return "gemini-3.8-flash-lite-tts";
}

/**
 * Stream Gemini 3.8 TTS Audio incrementally (raw PCM chunks, 24kHz mono 16-bit LE).
 * Plays audio immediately as chunks arrive — does NOT wait for full generation.
 */
export async function streamGeminiTtsAudio(params: {
  text: string;
  voice?: string;
  model?: string;
  styleInstruction?: string;
  signal?: AbortSignal;
  onChunk: (base64Pcm: string, sampleRate: number) => void;
  onComplete?: () => void;
}): Promise<{ voice: string; model: string }> {
  const settings = loadGeminiSettings();
  const voice = params.voice || settings.voice || "Fola";
  const model = normalizeTtsModelId(params.model || settings.ttsModel);
  const rawStyle = params.styleInstruction !== undefined ? params.styleInstruction : settings.styleInstruction;
  const cleanStyle = typeof rawStyle === "string" && rawStyle.trim().length > 0 ? rawStyle.trim() : undefined;

  let emittedChunks = 0;

  const textPart: Record<string, any> = { text: params.text };
  if (cleanStyle) {
    textPart.speechMetadata = { style: cleanStyle };
  }

  const streamDesktopDirect = async (apiKey: string) => {
    if (!apiKey) {
      throw new Error("API Key diperlukan untuk Gemini 3.8 TTS pada aplikasi desktop.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: params.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [textPart] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error("429 RESOURCE_EXHAUSTED: Kuota Gemini TTS tercapai.");
      }
      throw new Error(errJson?.error?.message || `Permintaan Gemini Stream TTS gagal (${res.status}).`);
    }

    if (!res.body) {
      throw new Error("Stream body tidak tersedia dari Google AI API.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let parsed: any;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (parsed.error) {
          throw new Error(parsed.error.message || "Error pada stream Gemini TTS");
        }

        const parts = parsed.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          const data = part?.inlineData?.data;
          if (data) {
            emittedChunks++;
            params.onChunk(data, 24000);
          }
        }
      }
    }
  };

  const streamWebBackend = async (apiKey: string) => {
    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-gemini-api-key"] = apiKey;

    const res = await fetch(`${baseUrl}/api/tts/stream`, {
      method: "POST",
      headers,
      signal: params.signal,
      body: JSON.stringify({
        text: params.text,
        voice,
        model,
        styleInstruction: cleanStyle,
        apiKey: apiKey || undefined,
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("429 RESOURCE_EXHAUSTED: Kuota Gemini TTS tercapai.");
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Gagal memulai stream Gemini TTS (${res.status})`);
    }

    if (!res.body) {
      throw new Error("Stream body tidak tersedia dari server.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;

        let evt: any;
        try {
          evt = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (evt.type === "audio" && evt.data) {
          emittedChunks++;
          params.onChunk(evt.data, evt.sampleRate || 24000);
        } else if (evt.type === "error") {
          const prefix = evt.quotaExceeded ? "429 RESOURCE_EXHAUSTED: " : "";
          throw new Error(`${prefix}${evt.error || "Stream TTS gagal."}`);
        }
      }
    }
  };

  // Rotate API keys automatically if a key fails BEFORE any chunk has been emitted
  await withApiKeyRotation(
    async (apiKey) => {
      await retryOperation(async () => {
        if (emittedChunks > 0) return;
        if (isDesktopApp()) {
          await streamDesktopDirect(apiKey);
        } else {
          await streamWebBackend(apiKey);
        }
      }, getCustomApiKeys().length > 1 ? 0 : 1);
    },
    () => emittedChunks > 0 || !!params.signal?.aborted
  );

  if (emittedChunks === 0 && !params.signal?.aborted) {
    throw new Error("Tidak ada data audio yang diterima dari stream TTS.");
  }

  params.onComplete?.();
  return { voice, model };
}

/**
 * Fetch Gemini Flash TTS Audio (Unary fallback)
 */
export async function fetchGeminiTtsAudio(params: {
  text: string;
  voice?: string;
  model?: string;
  styleInstruction?: string;
}): Promise<{ audio: string; mimeType: string; voice: string; model: string }> {
  const settings = loadGeminiSettings();
  const voice = params.voice || settings.voice || "Fola";
  const model = normalizeTtsModelId(params.model || settings.ttsModel);
  const rawStyle = params.styleInstruction !== undefined ? params.styleInstruction : settings.styleInstruction;
  const cleanStyle = typeof rawStyle === "string" && rawStyle.trim().length > 0 ? rawStyle.trim() : undefined;

  const textPart: Record<string, any> = { text: params.text };
  if (cleanStyle) {
    textPart.speechMetadata = { style: cleanStyle };
  }

  return await withApiKeyRotation(async (apiKey) => {
    return await retryOperation(async () => {
      if (isDesktopApp()) {
        if (!apiKey) {
          throw new Error("API Key diperlukan untuk Gemini 3.8 TTS pada aplikasi desktop.");
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [textPart] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          if (res.status === 429) {
            throw new Error("429: Kuota TTS tercapai.");
          }
          throw new Error(data.error?.message || "Permintaan Gemini TTS gagal.");
        }

        const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error("Tidak ada audio yang dikembalikan dari model Gemini TTS.");
        }

        const binaryString = atob(base64Audio);
        const rawBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          rawBytes[i] = binaryString.charCodeAt(i);
        }

        const isAlreadyWav =
          rawBytes.length > 44 &&
          rawBytes[0] === 0x52 &&
          rawBytes[1] === 0x49 &&
          rawBytes[2] === 0x46 &&
          rawBytes[3] === 0x46;

        let wavBase64 = base64Audio;
        if (!isAlreadyWav) {
          const wavBuffer = pcmToWav(rawBytes, 24000, 1, 16);
          const wavBytes = new Uint8Array(wavBuffer);
          let binaryWav = "";
          for (let i = 0; i < wavBytes.byteLength; i++) {
            binaryWav += String.fromCharCode(wavBytes[i]);
          }
          wavBase64 = btoa(binaryWav);
        }

        return {
          audio: wavBase64,
          mimeType: "audio/wav",
          voice,
          model,
        };
      }

      // Web environment: call server with rotated key
      const baseUrl = getApiBaseUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-gemini-api-key"] = apiKey;

      const res = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: params.text,
          voice,
          model,
          styleInstruction: cleanStyle,
          apiKey: apiKey || undefined,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("429: Kuota Gemini TTS tercapai.");
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal menghasilkan suara Gemini TTS");
      }

      return await res.json();
    }, getCustomApiKeys().length > 1 ? 0 : 2);
  });
}
