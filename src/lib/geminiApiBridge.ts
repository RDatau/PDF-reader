/**
 * Universal Gemini API Bridge for VOXReader.
 * Seamlessly handles:
 * 1. Multi-key round-robin rotation & automatic failover across all user-configured keys
 *    (supporting both standard AIzaSy... keys and AQ.... Express keys).
 * 2. Web / PWA: sends the rotated key pool to Express /api/* backend so server-side rotation
 *    also runs in one request, AND automatically falls back to direct @google/genai SDK calls
 *    from the browser if /api/* returns 404 or is unreachable (e.g. static/PWA deployment).
 * 3. Windows Desktop Electron (.exe): runs direct @google/genai SDK requests standalone.
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { getApiBaseUrl, parseApiKeys, maskApiKey } from "./apiConfig";
import {
  loadGeminiSettings,
  getCustomApiKeys,
  getOrderedRotatedKeys,
  markApiKeyCooldown,
  clearApiKeyCooldowns,
  isAqExpressKey,
} from "./geminiSettings";

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.protocol === "file:" ||
    !window.location.host ||
    !!(window as any).electronAPI?.isElectron
  );
}

// Track if the local/origin Express /api/* backend returned 404 (e.g. static PWA host)
let webBackendUnavailable = false;

function createSdkClient(apiKey: string, useVertex = false): GoogleGenAI {
  if (useVertex) {
    return new GoogleGenAI({
      apiKey,
      vertexai: true,
    });
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "v1beta",
    },
  });
}

async function runSdkWithAqFallback<T>(
  apiKey: string,
  runner: (ai: GoogleGenAI) => Promise<T>
): Promise<T> {
  try {
    return await runner(createSdkClient(apiKey, false));
  } catch (err: any) {
    if (isAqExpressKey(apiKey) && isRotatableKeyError(err)) {
      return await runner(createSdkClient(apiKey, true));
    }
    throw err;
  }
}

function isRotatableKeyError(error: any): boolean {
  if (!error) return false;
  if (error?.name === "AbortError") return false;
  const msg = String(error?.message || error || "").toUpperCase();
  const status = error?.status || error?.code;
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("QUOTA") ||
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API KEY NOT VALID") ||
    msg.includes("INVALID_KEY") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("400") ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("404") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503")
  );
}

function isBackendUnavailableStatus(status?: number): boolean {
  return status === 404 || status === 502 || status === 503 || status === 504;
}

/**
 * Executes an operation with round-robin API key selection and automatic
 * failover across all configured keys when a key hits quota, auth, or endpoint errors.
 */
async function withApiKeyRotation<T>(
  operation: (
    apiKey: string,
    allOrderedKeys: string[],
    keyIndex: number,
    totalKeys: number
  ) => Promise<T>,
  shouldAbortFailover?: () => boolean
): Promise<T> {
  const { keys } = getOrderedRotatedKeys();
  if (keys.length === 0) {
    return await operation("", [], -1, 0);
  }

  let lastError: any;
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    try {
      return await operation(currentKey, keys, i, keys.length);
    } catch (error: any) {
      lastError = error;
      if (error?.name === "AbortError" || shouldAbortFailover?.()) {
        throw error;
      }
      if (isRotatableKeyError(error) && i < keys.length - 1) {
        const msg = String(error?.message || "").toUpperCase();
        const isQuota =
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("QUOTA");
        markApiKeyCooldown(currentKey, isQuota ? 60_000 : 120_000);
        console.warn(
          `[GeminiBridge] Key #${i + 1} (${maskApiKey(currentKey)}) gagal (${String(
            error?.message || error
          ).slice(0, 80)}). Merotasi ke Key #${i + 2}/${keys.length}...`
        );
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Retry helper with exponential backoff for single-key rate limit resilience.
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
      if (error?.name === "AbortError") throw error;
      const errorMsg = error?.message || String(error);
      const isQuotaError =
        errorMsg.includes("429") ||
        errorMsg.includes("RESOURCE_EXHAUSTED") ||
        error?.status === 429;

      if (isQuotaError && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt + 1) * 1000;
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

async function verifySingleKeyDirect(
  cleanKey: string,
  activeModel: string
): Promise<{ ok: boolean; message: string; reply?: string }> {
  const fallbackModel =
    activeModel === "gemini-3.8-flash" ? "gemini-3.6-flash" : "gemini-3.8-flash";
  const modelsToTry = [activeModel, fallbackModel];
  let lastErr: any;

  for (const useVertex of isAqExpressKey(cleanKey) ? [false, true] : [false]) {
    const ai = createSdkClient(cleanKey, useVertex);
    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: "Ping. Balas 'OK'.",
          config: { maxOutputTokens: 10 },
        });
        const reply = response.text?.trim();
        if (reply) {
          return {
            ok: true,
            message: useVertex ? `Valid (${model} Vertex)` : `Valid (${model})`,
            reply,
          };
        }
      } catch (err: any) {
        lastErr = err;
      }
    }
  }

  const errMsg = String(lastErr?.message || lastErr || "");
  if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
    return {
      ok: false,
      message: "API Key tidak valid. Pastikan kunci disalin lengkap.",
    };
  }
  if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429")) {
    return { ok: false, message: "Kuota/Rate Limit tercapai (429)." };
  }
  if (errMsg.includes("PERMISSION_DENIED") || errMsg.includes("403")) {
    return { ok: false, message: "Akses ditolak (403). Periksa izin API." };
  }
  return {
    ok: false,
    message: errMsg ? `Gagal (${errMsg.slice(0, 90)})` : "Gagal menghubungkan API Key.",
  };
}

/**
 * Verifies one or multiple newline-separated API Keys using @google/genai (and server fallback if available).
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

  if (keys.length === 0 && isDesktopApp()) {
    return {
      ok: false,
      message:
        "API Key belum diisi. Silakan tempel satu atau lebih API Key Anda dari Google AI Studio.",
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
    const singleRes = await verifySingleKeyDirect(keys[0], activeModel);
    return {
      ok: singleRes.ok,
      reply: singleRes.reply,
      message: singleRes.ok
        ? `API Key valid dan berhasil terhubung (${singleRes.message.replace(/^Valid \((.*)\)$/, "$1")})!`
        : singleRes.message,
      results: [
        {
          index: 0,
          maskedKey: maskApiKey(keys[0]),
          ok: singleRes.ok,
          message: singleRes.message,
        },
      ],
    };
  }

  const results: ApiKeyCheckItem[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const r = await verifySingleKeyDirect(k, activeModel);
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
 * Ask a question about the document with multi-key rotation and seamless browser/desktop SDK fallback.
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

  const askDirectSdk = async (apiKey: string) => {
    if (!apiKey) {
      throw new Error(
        "API Key belum diisi. Silakan buka Pengaturan Gemini AI dan masukkan API Key Anda."
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

    const response = await runSdkWithAqFallback(apiKey, (ai) =>
      ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      })
    );

    const answer = response.text?.trim();
    if (!answer) {
      throw new Error("Tidak ada jawaban yang dihasilkan oleh model AI.");
    }
    return { answer, model: selectedModel };
  };

  return await withApiKeyRotation(async (apiKey, allOrderedKeys) => {
    if (isDesktopApp() || (webBackendUnavailable && apiKey)) {
      return await askDirectSdk(apiKey);
    }

    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-gemini-api-key"] = apiKey;

    try {
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
          apiKeys: allOrderedKeys.length > 0 ? allOrderedKeys : undefined,
        }),
      });

      if (isBackendUnavailableStatus(res.status) && apiKey) {
        webBackendUnavailable = true;
        return await askDirectSdk(apiKey);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(data.error || `Gagal bertanya ke AI (${res.status}).`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err: any) {
      if (apiKey && (err?.name === "TypeError" || isBackendUnavailableStatus(err?.status))) {
        webBackendUnavailable = true;
        return await askDirectSdk(apiKey);
      }
      throw err;
    }
  });
}

/**
 * Summarize current page with multi-key rotation and seamless browser/desktop SDK fallback.
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

  const summarizeDirectSdk = async (apiKey: string) => {
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

    const response = await runSdkWithAqFallback(apiKey, (ai) =>
      ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      })
    );

    const summary = response.text?.trim();
    if (!summary) throw new Error("Gagal membuat rangkuman halaman.");
    return { summary, model: selectedModel };
  };

  return await withApiKeyRotation(async (apiKey, allOrderedKeys) => {
    if (isDesktopApp() || (webBackendUnavailable && apiKey)) {
      return await summarizeDirectSdk(apiKey);
    }

    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-gemini-api-key"] = apiKey;

    try {
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
          apiKeys: allOrderedKeys.length > 0 ? allOrderedKeys : undefined,
        }),
      });

      if (isBackendUnavailableStatus(res.status) && apiKey) {
        webBackendUnavailable = true;
        return await summarizeDirectSdk(apiKey);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(data.error || `Gagal membuat rangkuman (${res.status}).`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err: any) {
      if (apiKey && (err?.name === "TypeError" || isBackendUnavailableStatus(err?.status))) {
        webBackendUnavailable = true;
        return await summarizeDirectSdk(apiKey);
      }
      throw err;
    }
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
 * Automatically rotates across all configured API keys AND switches seamlessly to direct
 * @google/genai browser streaming if /api/tts/stream returns 404 or is unreachable.
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
  const rawStyle =
    params.styleInstruction !== undefined ? params.styleInstruction : settings.styleInstruction;
  const cleanStyle =
    typeof rawStyle === "string" && rawStyle.trim().length > 0 ? rawStyle.trim() : undefined;

  let emittedChunks = 0;

  const textPart: Record<string, any> = { text: params.text };
  if (cleanStyle) {
    textPart.speechMetadata = { style: cleanStyle };
  }

  const streamDirectSdk = async (apiKey: string) => {
    if (!apiKey) {
      throw new Error(
        "API Key diperlukan untuk Gemini 3.8 TTS. Silakan masukkan API Key di Pengaturan Gemini."
      );
    }

    const responseStream = await runSdkWithAqFallback(apiKey, (ai) =>
      ai.models.generateContentStream({
        model,
        contents: [{ role: "user", parts: [textPart] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
          abortSignal: params.signal,
        },
      })
    );

    for await (const chunk of responseStream) {
      if (params.signal?.aborted) break;
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        const data = (part as any)?.inlineData?.data;
        if (data) {
          emittedChunks++;
          params.onChunk(data, 24000);
        }
      }
    }
  };

  const streamWebBackend = async (apiKey: string, allOrderedKeys: string[]) => {
    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-gemini-api-key"] = apiKey;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/tts/stream`, {
        method: "POST",
        headers,
        signal: params.signal,
        body: JSON.stringify({
          text: params.text,
          voice,
          model,
          styleInstruction: cleanStyle,
          apiKey: apiKey || undefined,
          apiKeys: allOrderedKeys.length > 0 ? allOrderedKeys : undefined,
        }),
      });
    } catch (fetchErr: any) {
      if (fetchErr?.name === "AbortError") throw fetchErr;
      if (apiKey) {
        webBackendUnavailable = true;
        console.warn("[GeminiBridge] /api/tts/stream unreachable, switching to direct @google/genai...");
        await streamDirectSdk(apiKey);
        return;
      }
      throw fetchErr;
    }

    if (isBackendUnavailableStatus(res.status) && apiKey) {
      webBackendUnavailable = true;
      console.warn(
        `[GeminiBridge] /api/tts/stream returned ${res.status}, switching to direct @google/genai...`
      );
      await streamDirectSdk(apiKey);
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err: any = new Error(
        errData.error || `Gagal memulai stream Gemini TTS (${res.status})`
      );
      err.status = res.status;
      throw err;
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
          const err: any = new Error(`${prefix}${evt.error || "Stream TTS gagal."}`);
          if (evt.quotaExceeded) err.status = 429;
          throw err;
        }
      }
    }
  };

  await withApiKeyRotation(
    async (apiKey, allOrderedKeys) => {
      if (emittedChunks > 0 || params.signal?.aborted) return;
      if (isDesktopApp() || (webBackendUnavailable && apiKey)) {
        await streamDirectSdk(apiKey);
      } else {
        await streamWebBackend(apiKey, allOrderedKeys);
      }
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
 * Fetch Gemini Flash TTS Audio (Unary compatibility)
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
  const rawStyle =
    params.styleInstruction !== undefined ? params.styleInstruction : settings.styleInstruction;
  const cleanStyle =
    typeof rawStyle === "string" && rawStyle.trim().length > 0 ? rawStyle.trim() : undefined;

  const textPart: Record<string, any> = { text: params.text };
  if (cleanStyle) {
    textPart.speechMetadata = { style: cleanStyle };
  }

  const fetchDirectSdk = async (apiKey: string) => {
    if (!apiKey) {
      throw new Error("API Key diperlukan untuk Gemini 3.8 TTS.");
    }

    const response = await runSdkWithAqFallback(apiKey, (ai) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [textPart] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      })
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
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
  };

  return await withApiKeyRotation(async (apiKey, allOrderedKeys) => {
    if (isDesktopApp() || (webBackendUnavailable && apiKey)) {
      return await fetchDirectSdk(apiKey);
    }

    const baseUrl = getApiBaseUrl();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-gemini-api-key"] = apiKey;

    try {
      const res = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: params.text,
          voice,
          model,
          styleInstruction: cleanStyle,
          apiKey: apiKey || undefined,
          apiKeys: allOrderedKeys.length > 0 ? allOrderedKeys : undefined,
        }),
      });

      if (isBackendUnavailableStatus(res.status) && apiKey) {
        webBackendUnavailable = true;
        return await fetchDirectSdk(apiKey);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(errData.error || `Gagal menghasilkan suara Gemini TTS (${res.status})`);
        err.status = res.status;
        throw err;
      }

      return await res.json();
    } catch (err: any) {
      if (apiKey && (err?.name === "TypeError" || isBackendUnavailableStatus(err?.status))) {
        webBackendUnavailable = true;
        return await fetchDirectSdk(apiKey);
      }
      throw err;
    }
  });
}

// Re-export count helper if needed by UI
export function getConfiguredApiKeyCount(): number {
  return getCustomApiKeys().length;
}
