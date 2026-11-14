import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import dns from "dns";
import net from "net";
import { spawn } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import {
  GoogleGenAI,
  Modality,
  LiveServerMessage,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "60mb" }));

// Global safety settings: BLOCK_NONE across all harm categories
const SAFETY_SETTINGS_BLOCK_NONE = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

// --- Multi-Key Parsing, Cooldown & Round-Robin Rotation ---
let serverRotationCursor = 0;
const serverKeyCooldowns = new Map<string, number>();

function cleanKeyToken(token: string): string {
  return token
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^GEMINI_API_KEY\s*=\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function parseServerApiKeys(raw?: unknown): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  const pushRawString = (str: string) => {
    for (const part of str.split(/[\r\n,;]+/)) {
      const cleaned = cleanKeyToken(part);
      if (cleaned && !cleaned.startsWith("#") && !seen.has(cleaned)) {
        seen.add(cleaned);
        keys.push(cleaned);
      }
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") pushRawString(item);
    }
  } else if (typeof raw === "string") {
    pushRawString(raw);
  }

  return keys;
}

function extractRequestApiKeys(req: express.Request): {
  keys: string[];
  isCustom: boolean;
} {
  const combined = parseServerApiKeys([
    ...(Array.isArray(req.body?.apiKeys) ? req.body.apiKeys : []),
    typeof req.body?.apiKey === "string" ? req.body.apiKey : "",
    typeof req.headers["x-gemini-api-keys"] === "string"
      ? req.headers["x-gemini-api-keys"]
      : "",
    typeof req.headers["x-gemini-api-key"] === "string"
      ? req.headers["x-gemini-api-key"]
      : "",
  ]);

  if (combined.length > 0) {
    return { keys: combined, isCustom: true };
  }

  const envKeys = parseServerApiKeys(process.env.GEMINI_API_KEY);
  return { keys: envKeys, isCustom: false };
}

function isKeyCoolingDown(key: string): boolean {
  const until = serverKeyCooldowns.get(key);
  if (!until) return false;
  if (Date.now() >= until) {
    serverKeyCooldowns.delete(key);
    return false;
  }
  return true;
}

function markServerKeyCooldown(key: string, durationMs = 60_000): void {
  if (!key) return;
  serverKeyCooldowns.set(key, Date.now() + durationMs);
}

function getOrderedServerKeys(keys: string[]): string[] {
  if (keys.length <= 1) return keys;
  const start = serverRotationCursor % keys.length;
  serverRotationCursor = (start + 1) % keys.length;

  const healthy: string[] = [];
  const cooling: string[] = [];
  for (let offset = 0; offset < keys.length; offset++) {
    const candidate = keys[(start + offset) % keys.length];
    if (isKeyCoolingDown(candidate)) {
      cooling.push(candidate);
    } else {
      healthy.push(candidate);
    }
  }
  return [...healthy, ...cooling];
}

function createGeminiClient(apiKey: string, useVertex = false): GoogleGenAI {
  if (useVertex) {
    return new GoogleGenAI({
      apiKey,
      vertexai: true,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "v1beta",
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isRotatableServerError(error: any): boolean {
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
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("400") ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("404")
  );
}

function maskKeyForLog(key: string): string {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

async function runWithServerGeminiRotation<T>(
  rawKeys: string[],
  executor: (ai: GoogleGenAI, apiKey: string, attemptIndex: number) => Promise<T>
): Promise<{ result: T; keyUsed: string }> {
  if (rawKeys.length === 0) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const orderedKeys = getOrderedServerKeys(rawKeys);
  let lastError: any;

  for (let i = 0; i < orderedKeys.length; i++) {
    const key = orderedKeys[i];
    try {
      const result = await executor(createGeminiClient(key, false), key, i);
      return { result, keyUsed: key };
    } catch (err: any) {
      lastError = err;

      // For AQ.* keys, automatically test Vertex Express Mode if standard Gemini endpoint rejected the key
      if (key.startsWith("AQ.") && isRotatableServerError(err)) {
        try {
          const vertexResult = await executor(createGeminiClient(key, true), key, i);
          return { result: vertexResult, keyUsed: key };
        } catch (vertexErr: any) {
          lastError = vertexErr;
        }
      }

      if (isRotatableServerError(lastError) && i < orderedKeys.length - 1) {
        const msg = String(lastError?.message || "").toUpperCase();
        const isQuota =
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("QUOTA");
        markServerKeyCooldown(key, isQuota ? 60_000 : 120_000);
        console.warn(
          `[ServerRotation] Key ${maskKeyForLog(key)} failed (${String(
            lastError?.message || lastError
          ).slice(0, 90)}). Rotating to key ${i + 2}/${orderedKeys.length}...`
        );
        continue;
      }

      throw lastError;
    }
  }

  throw lastError;
}

// Helper: Convert 16-bit 24kHz mono PCM to WAV format
function pcmToWav(
  pcmData: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  const envKeys = parseServerApiKeys(process.env.GEMINI_API_KEY);
  res.json({
    status: "ok",
    hasApiKey: envKeys.length > 0,
    envKeyCount: envKeys.length,
    timestamp: new Date().toISOString(),
  });
});

// Gemini API Key Verification Endpoint (supports single or multi-key batch checks + AQ.* Vertex fallback)
app.post("/api/gemini/check", async (req, res) => {
  try {
    const { keys, isCustom } = extractRequestApiKeys(req);

    if (keys.length === 0) {
      res.status(400).json({
        ok: false,
        error: "API Key belum diisi. Tempel API Key Anda dari Google AI Studio.",
      });
      return;
    }

    const checkSingleServerKey = async (apiKey: string) => {
      const modelsToTry = ["gemini-3.8-flash", "gemini-3.6-flash"];
      let lastErr: any;

      for (const useVertex of apiKey.startsWith("AQ.") ? [false, true] : [false]) {
        const ai = createGeminiClient(apiKey, useVertex);
        for (const model of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: "Ping. Return 'OK'.",
              config: {
                maxOutputTokens: 10,
                safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
              },
            });
            return {
              ok: true,
              model: useVertex ? `${model} (Vertex)` : model,
              reply: response.text?.trim() || "OK",
            };
          } catch (err: any) {
            lastErr = err;
          }
        }
      }

      const errorMsg = String(lastErr?.message || lastErr || "");
      let friendly = `Gagal terhubung (${errorMsg.slice(0, 100)})`;
      if (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("API key not valid")) {
        friendly = "API Key tidak valid.";
      } else if (errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("403")) {
        friendly = "Akses ditolak (403).";
      } else if (
        errorMsg.includes("RESOURCE_EXHAUSTED") ||
        errorMsg.includes("429") ||
        errorMsg.toLowerCase().includes("quota")
      ) {
        friendly = "Kuota/Rate Limit tercapai (429).";
      }
      return { ok: false, message: friendly };
    };

    if (keys.length === 1) {
      const single = await checkSingleServerKey(keys[0]);
      if (single.ok) {
        res.json({
          ok: true,
          message: `API Key valid dan berhasil terhubung (${single.model})!`,
          reply: single.reply,
          isCustom,
        });
      } else {
        res.status(400).json({
          ok: false,
          error: single.message,
          message: single.message,
        });
      }
      return;
    }

    // Batch verify multiple keys
    const results: Array<{
      index: number;
      maskedKey: string;
      ok: boolean;
      message: string;
    }> = [];

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const r = await checkSingleServerKey(k);
      if (!r.ok) {
        markServerKeyCooldown(k, 60_000);
      } else {
        serverKeyCooldowns.delete(k);
      }
      results.push({
        index: i,
        maskedKey: maskKeyForLog(k),
        ok: r.ok,
        message: r.ok ? `Valid (${r.model})` : r.message || "Gagal",
      });
    }

    const validCount = results.filter((r) => r.ok).length;
    res.status(validCount > 0 ? 200 : 400).json({
      ok: validCount > 0,
      message:
        validCount === keys.length
          ? `${validCount}/${keys.length} API Key valid dan siap dirotasi otomatis!`
          : validCount > 0
          ? `${validCount}/${keys.length} API Key valid & aktif untuk rotasi. Sebagian key lain limit/tidak valid.`
          : `0/${keys.length} API Key berhasil terhubung. Periksa kembali key Anda.`,
      results,
      isCustom,
    });
  } catch (error: any) {
    res.status(400).json({
      ok: false,
      error: error?.message || "Gagal memverifikasi API Key.",
    });
  }
});

// In-memory TTS audio cache to conserve quota
const ttsAudioCache = new Map<
  string,
  { audio: string; mimeType: string; voice: string; model: string; rawPcmSampleRate: number }
>();

// Helper to normalize TTS model IDs strictly to Gemini 3.8 TTS models
function resolveTtsModel(
  requestedModel?: string
): "gemini-3.8-flash-lite-tts" | "gemini-3.8-flash-tts" {
  if (requestedModel === "gemini-3.8-flash-tts" || requestedModel === "gemini-3.8-flash") {
    return "gemini-3.8-flash-tts";
  }
  return "gemini-3.8-flash-lite-tts";
}

// Gemini Streaming TTS Endpoint (SSE raw PCM chunks, 24kHz mono 16-bit LE)
// Opens stream inside multi-key rotation BEFORE flushing SSE headers so key failover works transparently.
app.post("/api/tts/stream", async (req, res) => {
  let clientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  try {
    const {
      text,
      voice = "Fola",
      model = "gemini-3.8-flash-lite-tts",
      styleInstruction,
    } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "Text is required for streaming TTS" });
      return;
    }

    const cleanText = text.trim();
    const selectedVoice =
      typeof voice === "string" && voice.trim().length > 0 ? voice.trim() : "Fola";
    const selectedModel = resolveTtsModel(typeof model === "string" ? model.trim() : undefined);
    const cleanStyle =
      typeof styleInstruction === "string" && styleInstruction.trim().length > 0
        ? styleInstruction.trim()
        : undefined;

    const { keys } = extractRequestApiKeys(req);
    if (keys.length === 0) {
      res.status(400).json({
        error: "API Key belum diisi. Silakan masukkan API Key di Pengaturan Gemini.",
      });
      return;
    }

    const textPart: any = { text: cleanText };
    if (cleanStyle) {
      textPart.speechMetadata = { style: cleanStyle };
    }

    const openStreamForModel = async (modelToUse: string) => {
      return await runWithServerGeminiRotation(keys, async (ai) => {
        return await ai.models.generateContentStream({
          model: modelToUse,
          contents: [
            {
              role: "user",
              parts: [textPart],
            },
          ],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
          },
        });
      });
    };

    let actualModelUsed = selectedModel;
    let streamHandle: { result: AsyncGenerator<any>; keyUsed: string };

    try {
      streamHandle = await openStreamForModel(actualModelUsed);
    } catch (streamOpenErr: any) {
      if (actualModelUsed !== "gemini-3.8-flash-lite-tts" && !clientClosed) {
        console.warn(
          `Stream TTS model ${actualModelUsed} failed across keys (${streamOpenErr?.message}). Falling back to gemini-3.8-flash-lite-tts.`
        );
        actualModelUsed = "gemini-3.8-flash-lite-tts";
        streamHandle = await openStreamForModel(actualModelUsed);
      } else {
        throw streamOpenErr;
      }
    }

    if (clientClosed) return;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let emittedChunks = 0;
    for await (const chunk of streamHandle.result) {
      if (clientClosed || res.writableEnded) break;
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        const data = (part as any)?.inlineData?.data;
        if (data) {
          emittedChunks++;
          res.write(
            `data: ${JSON.stringify({
              type: "audio",
              data,
              sampleRate: 24000,
              model: actualModelUsed,
            })}\n\n`
          );
        }
      }
    }

    if (!clientClosed && !res.writableEnded) {
      if (emittedChunks === 0) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error: "Tidak ada chunk audio yang diterima dari model TTS.",
          })}\n\n`
        );
      } else {
        res.write(`data: ${JSON.stringify({ type: "done", model: actualModelUsed })}\n\n`);
      }
      res.end();
    }
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    const isQuotaExceeded =
      error?.status === "RESOURCE_EXHAUSTED" ||
      error?.code === 429 ||
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED") ||
      errorMsg.includes("exceeded your current quota");

    if (!res.headersSent) {
      res.status(isQuotaExceeded ? 429 : 500).json({
        error: isQuotaExceeded
          ? "Kuota Gemini TTS tercapai (429) pada seluruh API Key yang aktif. Silakan tambah/rotasi key lain di Pengaturan Gemini."
          : error?.message || "Failed to stream Gemini TTS",
        quotaExceeded: isQuotaExceeded,
      });
    } else if (!clientClosed && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: isQuotaExceeded
            ? "Kuota Gemini TTS tercapai (429) pada seluruh API Key yang aktif."
            : error?.message || "Failed to stream Gemini TTS",
          quotaExceeded: isQuotaExceeded,
        })}\n\n`
      );
      res.end();
    }
  }
});

// Unary Gemini TTS Endpoint (compatibility)
app.post("/api/tts", async (req, res) => {
  try {
    const {
      text,
      voice = "Fola",
      model = "gemini-3.8-flash-lite-tts",
      styleInstruction,
    } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text is required for TTS" });
      return;
    }

    const cleanText = text.trim();
    if (cleanText.length === 0) {
      res.status(400).json({ error: "Text cannot be empty" });
      return;
    }

    const selectedVoice =
      typeof voice === "string" && voice.trim().length > 0 ? voice.trim() : "Fola";
    const selectedModel = resolveTtsModel(typeof model === "string" ? model.trim() : undefined);
    const cleanStyle =
      typeof styleInstruction === "string" && styleInstruction.trim().length > 0
        ? styleInstruction.trim()
        : undefined;

    const { keys, isCustom } = extractRequestApiKeys(req);
    if (keys.length === 0) {
      res.status(400).json({ error: "API Key belum diisi." });
      return;
    }

    const cacheKey = `${isCustom ? "custom:" : ""}${selectedModel}:${selectedVoice}:${cleanStyle || ""}:${cleanText}`;
    if (ttsAudioCache.has(cacheKey)) {
      res.json(ttsAudioCache.get(cacheKey));
      return;
    }

    const textPart: any = { text: cleanText };
    if (cleanStyle) {
      textPart.speechMetadata = { style: cleanStyle };
    }

    let actualModelUsed = selectedModel;
    const callUnary = async (modelToUse: string) => {
      return await runWithServerGeminiRotation(keys, async (ai) => {
        return await ai.models.generateContent({
          model: modelToUse,
          contents: [{ role: "user", parts: [textPart] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
          },
        });
      });
    };

    let responseWrapper: { result: any; keyUsed: string };
    try {
      responseWrapper = await callUnary(actualModelUsed);
    } catch (modelErr: any) {
      if (actualModelUsed !== "gemini-3.8-flash-lite-tts") {
        actualModelUsed = "gemini-3.8-flash-lite-tts";
        responseWrapper = await callUnary(actualModelUsed);
      } else {
        throw modelErr;
      }
    }

    const base64Audio =
      responseWrapper.result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: "No audio data received from Gemini TTS" });
      return;
    }

    const rawBytes = Buffer.from(base64Audio, "base64");
    const isAlreadyWav =
      rawBytes.length > 44 && rawBytes.subarray(0, 4).toString("ascii") === "RIFF";
    const wavBuffer = isAlreadyWav ? rawBytes : pcmToWav(rawBytes, 24000, 1, 16);
    const wavBase64 = wavBuffer.toString("base64");

    const payload = {
      audio: wavBase64,
      mimeType: "audio/wav",
      voice: selectedVoice,
      model: actualModelUsed,
      rawPcmSampleRate: 24000,
    };

    if (ttsAudioCache.size > 100) {
      const oldestKey = ttsAudioCache.keys().next().value;
      if (oldestKey) ttsAudioCache.delete(oldestKey);
    }
    ttsAudioCache.set(cacheKey, payload);

    res.json(payload);
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    const isQuotaExceeded =
      error?.status === "RESOURCE_EXHAUSTED" ||
      error?.code === 429 ||
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED");

    if (isQuotaExceeded) {
      res.status(429).json({
        error:
          "Kuota Gemini TTS tercapai (429). Silakan rotasi API Key lain di Pengaturan Gemini atau tunggu beberapa saat.",
        quotaExceeded: true,
      });
      return;
    }

    res.status(500).json({
      error: error?.message || "Failed to generate speech with Gemini TTS",
    });
  }
});

function runPythonMergeScript(
  scriptPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const trySpawn = (cmd: string) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(cmd, [scriptPath, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err: NodeJS.ErrnoException) => reject(err));
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr.trim() || `Python exited with code ${code}`));
        }
      });
    });

  return trySpawn("python3").catch((err: any) => {
    if (err?.code === "ENOENT") {
      return trySpawn("python");
    }
    throw err;
  });
}

// Merge multiple generated WAV TTS clips for a page using the Python script
app.post("/api/tts/merge", async (req, res) => {
  let tempDir: string | null = null;
  try {
    const rawParts = Array.isArray(req.body?.parts) ? req.body.parts : [];
    const silenceMs = Math.max(0, Math.min(2000, Number(req.body?.silenceMs ?? 180) || 0));

    if (rawParts.length === 0) {
      res.status(400).json({ error: "Daftar bagian audio WAV tidak boleh kosong." });
      return;
    }

    const candidateScripts = [
      path.join(process.cwd(), "scripts", "merge_tts.py"),
      path.resolve(process.cwd(), "..", "scripts", "merge_tts.py"),
    ];
    const scriptPath = candidateScripts.find((p) => fs.existsSync(p));
    if (!scriptPath) {
      res.status(500).json({ error: "Skrip Python scripts/merge_tts.py tidak ditemukan." });
      return;
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voxreader-tts-merge-"));
    const inputPaths: string[] = [];

    for (let i = 0; i < rawParts.length; i++) {
      const b64 = typeof rawParts[i] === "string" ? rawParts[i].trim() : "";
      if (!b64) continue;
      const buf = Buffer.from(b64, "base64");
      if (buf.length <= 44) continue;
      const partPath = path.join(tempDir, `part_${String(i).padStart(3, "0")}.wav`);
      fs.writeFileSync(partPath, buf);
      inputPaths.push(partPath);
    }

    if (inputPaths.length === 0) {
      res.status(400).json({ error: "Tidak ada data WAV valid yang dapat digabungkan." });
      return;
    }

    const outputPath = path.join(tempDir, "merged_page.wav");
    const { stdout } = await runPythonMergeScript(scriptPath, [
      "--output",
      outputPath,
      "--silence-ms",
      String(silenceMs),
      ...inputPaths,
    ]);

    if (!fs.existsSync(outputPath)) {
      res.status(500).json({ error: "File hasil gabungan Python tidak ditemukan." });
      return;
    }

    const mergedBuf = fs.readFileSync(outputPath);
    let meta: any = {};
    try {
      meta = JSON.parse(stdout.trim() || "{}");
    } catch {
      meta = {};
    }

    res.json({
      ok: true,
      audio: mergedBuf.toString("base64"),
      mimeType: "audio/wav",
      durationSeconds: Number(meta.durationSeconds || 0),
      sizeBytes: mergedBuf.length,
      partsMerged: Number(meta.partsMerged || inputPaths.length),
      mergedBy: "python",
    });
  } catch (error: any) {
    console.error("Error merging TTS audio with Python:", error);
    res.status(500).json({
      error: error?.message || "Gagal menggabungkan audio TTS dengan skrip Python.",
    });
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
});

// --- Web Reader Mode: SSRF-Safe Article Fetcher & Ad-Free Extractor ---
const ARTICLE_FETCH_TIMEOUT_MS = 15_000;
const ARTICLE_MAX_BYTES = 8 * 1024 * 1024;
const ARTICLE_MAX_REDIRECTS = 5;

function isPrivateOrReservedIp(rawIp: string): boolean {
  let ip = rawIp.trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (version === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 unique local
    if (
      ip.startsWith("fe8") ||
      ip.startsWith("fe9") ||
      ip.startsWith("fea") ||
      ip.startsWith("feb")
    ) {
      return true; // fe80::/10 link-local
    }
    if (ip.startsWith("ff")) return true; // ff00::/8 multicast
    return false;
  }

  return true;
}

async function validateExternalHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Format URL tidak valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Hanya URL http:// atau https:// yang didukung.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL tidak boleh mengandung kredensial.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Akses ke alamat lokal atau jaringan internal tidak diizinkan.");
  }

  const strippedHost = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(strippedHost)) {
    if (isPrivateOrReservedIp(strippedHost)) {
      throw new Error("Akses ke alamat IP privat atau lokal tidak diizinkan.");
    }
    return parsed;
  }

  const resolved = await dns.promises.lookup(strippedHost, { all: true });
  if (!resolved || resolved.length === 0) {
    throw new Error(`Domain "${hostname}" tidak ditemukan.`);
  }
  for (const record of resolved) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error("Domain mengarah ke alamat IP internal yang diblokir.");
    }
  }

  return parsed;
}

async function fetchHtmlWithSafeRedirects(initialUrl: string): Promise<{
  html: string;
  finalUrl: string;
}> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= ARTICLE_MAX_REDIRECTS; hop++) {
    const validatedUrl = await validateExternalHttpUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(validatedUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect (${response.status}) tanpa tujuan.`);
        }
        currentUrl = new URL(location, validatedUrl).toString();
        continue;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw new Error(
            `Situs memblokir akses otomatis (HTTP ${response.status}). Beberapa situs berita dengan proteksi bot/paywall tidak mengizinkan pembacaan eksternal.`
          );
        }
        throw new Error(`Gagal memuat halaman situs (HTTP ${response.status}).`);
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/plain")
      ) {
        throw new Error(
          `URL bukan halaman artikel HTML (Content-Type: ${contentType.split(";")[0]}).`
        );
      }

      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > ARTICLE_MAX_BYTES) {
        throw new Error("Ukuran halaman web terlalu besar (maksimal 8 MB).");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const fallbackText = await response.text();
        return { html: fallbackText, finalUrl: validatedUrl.toString() };
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > ARTICLE_MAX_BYTES) {
            reader.cancel().catch(() => {});
            throw new Error("Ukuran halaman web melebihi batas 8 MB.");
          }
          chunks.push(value);
        }
      }

      const combined = Buffer.concat(chunks);
      const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
      let decoded = "";
      try {
        decoded = new TextDecoder(charsetMatch?.[1] || "utf-8", { fatal: false }).decode(combined);
      } catch {
        decoded = combined.toString("utf-8");
      }

      return { html: decoded, finalUrl: validatedUrl.toString() };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("Waktu permintaan habis (timeout 15 detik) saat menghubungi situs.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Terlalu banyak pengalihan URL (redirect).");
}

type CleanArticleBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "image"; src: string; alt?: string };

const AD_AND_CLUTTER_TOKEN_RE =
  /\b(ads?|advert|advertisement|ad-slot|ad-container|ad-wrapper|ad-banner|adsbygoogle|sponsored|promo-box|newsletter|subscribe|cookie-banner|cookie-consent|consent-banner|gdpr|paywall|popup|modal-backdrop|share-buttons|social-share|related-articles|related-posts|taboola|outbrain|mgid|teads|disqus|comment-section)\b/i;

const BOILERPLATE_TEXT_RE =
  /^(advertisement|iklan|sponsored content|konten bersponsor|baca juga\s*:?\s*$|lihat juga\s*:?\s*$|scroll untuk melanjutkan|continue reading|loading\.{0,3})$/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripAdsAndTrackersFromDom(doc: Document, baseUrl: string): void {
  const hardRemoveSelectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "object",
    "embed",
    "ins.adsbygoogle",
    "[aria-label*='advertisement' i]",
    "[aria-label*='sponsored' i]",
    "[data-ad]",
    "[data-ad-slot]",
    "[data-ad-client]",
    "[id*='google_ads']",
    "[id*='taboola']",
    "[id*='outbrain']",
    "[class*='adsbygoogle']",
    "[class*='taboola']",
    "[class*='outbrain']",
  ];

  for (const selector of hardRemoveSelectors) {
    try {
      doc.querySelectorAll(selector).forEach((el) => el.remove());
    } catch {
      // ignore invalid selector edge cases
    }
  }

  const protectedTags = new Set(["HTML", "BODY", "MAIN", "ARTICLE"]);
  const allElements = Array.from(doc.querySelectorAll("*"));
  for (const el of allElements) {
    if (protectedTags.has(el.tagName)) continue;
    if (!el.parentNode) continue;

    const className = typeof el.className === "string" ? el.className : "";
    const idAttr = el.id || "";
    const roleAttr = el.getAttribute("role") || "";
    const combined = `${className} ${idAttr} ${roleAttr}`;

    if (AD_AND_CLUTTER_TOKEN_RE.test(combined)) {
      // Guard: skip if this container actually wraps the whole <article>
      if (el.querySelector("article")) continue;
      el.remove();
      continue;
    }

    const styleAttr = (el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
    if (styleAttr.includes("display:none") || styleAttr.includes("visibility:hidden")) {
      el.remove();
    }
  }

  // Resolve lazy-loaded images & strip 1x1 tracking pixels
  doc.querySelectorAll("img").forEach((img) => {
    const candidateSrc =
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("src") ||
      "";
    const widthAttr = parseInt(img.getAttribute("width") || "0", 10);
    const heightAttr = parseInt(img.getAttribute("height") || "0", 10);

    if ((widthAttr > 0 && widthAttr <= 3) || (heightAttr > 0 && heightAttr <= 3)) {
      img.remove();
      return;
    }

    if (!candidateSrc || candidateSrc.startsWith("data:")) {
      if (!candidateSrc) img.remove();
      return;
    }

    try {
      const resolved = new URL(candidateSrc, baseUrl).toString();
      if (/^https?:\/\//i.test(resolved)) {
        img.setAttribute("src", resolved);
      } else {
        img.remove();
      }
    } catch {
      img.remove();
    }
  });
}

function extractBlocksFromArticleHtml(
  htmlContent: string,
  baseUrl: string
): CleanArticleBlock[] {
  const fragmentDom = new JSDOM(`<body>${htmlContent}</body>`, { url: baseUrl });
  const body = fragmentDom.window.document.body;
  const blocks: CleanArticleBlock[] = [];

  const pushTextBlock = (
    type: "paragraph" | "blockquote" | "heading",
    rawText: string,
    level: 1 | 2 | 3 | 4 = 2
  ) => {
    const clean = normalizeWhitespace(rawText);
    if (!clean || clean.length < 2) return;
    if (BOILERPLATE_TEXT_RE.test(clean)) return;

    const prev = blocks[blocks.length - 1];
    if (prev && "text" in prev && prev.text === clean) return;

    if (type === "heading") {
      blocks.push({ type: "heading", level, text: clean });
    } else {
      blocks.push({ type, text: clean });
    }
  };

  const visitNode = (node: Node) => {
    if (node.nodeType === 3) {
      const txt = normalizeWhitespace(node.textContent || "");
      if (txt.length >= 25) {
        pushTextBlock("paragraph", txt);
      }
      return;
    }

    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME") {
      return;
    }

    if (tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4") {
      const lvl = parseInt(tag.slice(1), 10) as 1 | 2 | 3 | 4;
      pushTextBlock("heading", el.textContent || "", lvl);
      return;
    }

    if (tag === "P") {
      const imgs = el.querySelectorAll("img");
      imgs.forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (/^https?:\/\//i.test(src)) {
          blocks.push({
            type: "image",
            src,
            alt: normalizeWhitespace(img.getAttribute("alt") || "") || undefined,
          });
        }
      });
      pushTextBlock("paragraph", el.textContent || "");
      return;
    }

    if (tag === "BLOCKQUOTE") {
      pushTextBlock("blockquote", el.textContent || "");
      return;
    }

    if (tag === "UL" || tag === "OL") {
      const items = Array.from(el.querySelectorAll(":scope > li"))
        .map((li) => normalizeWhitespace(li.textContent || ""))
        .filter((t) => t.length > 0 && !BOILERPLATE_TEXT_RE.test(t));
      if (items.length > 0) {
        blocks.push({ type: "list", ordered: tag === "OL", items });
      }
      return;
    }

    if (tag === "IMG") {
      const src = el.getAttribute("src") || "";
      if (/^https?:\/\//i.test(src)) {
        blocks.push({
          type: "image",
          src,
          alt: normalizeWhitespace(el.getAttribute("alt") || "") || undefined,
        });
      }
      return;
    }

    if (tag === "PRE") {
      const txt = normalizeWhitespace(el.textContent || "");
      if (txt) pushTextBlock("paragraph", txt);
      return;
    }

    // Container tags (div, section, figure, article, main, etc.)
    const hasBlockChildren = Array.from(el.children).some((child) =>
      /^(P|H[1-6]|DIV|SECTION|ARTICLE|BLOCKQUOTE|UL|OL|FIGURE|PRE|IMG)$/i.test(child.tagName)
    );
    if (!hasBlockChildren) {
      const txt = normalizeWhitespace(el.textContent || "");
      if (txt.length >= 12) {
        pushTextBlock("paragraph", txt);
      }
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      visitNode(child);
    }
  };

  for (const child of Array.from(body.childNodes)) {
    visitNode(child);
  }

  return blocks;
}

app.post("/api/article/fetch", async (req, res) => {
  try {
    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: "URL artikel wajib diisi." });
      return;
    }

    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const { html, finalUrl } = await fetchHtmlWithSafeRedirects(normalizedUrl);

    const dom = new JSDOM(html, { url: finalUrl });
    const doc = dom.window.document;

    // Extract meta fallbacks before mutating DOM
    const ogSiteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() || "";
    const metaTitle =
      doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
      doc.title?.trim() ||
      "";
    const metaPublished =
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content")?.trim() ||
      doc.querySelector("time[datetime]")?.getAttribute("datetime")?.trim() ||
      "";

    stripAdsAndTrackersFromDom(doc, finalUrl);

    const reader = new Readability(doc, {
      charThreshold: 120,
      keepClasses: false,
    });
    const parsed = reader.parse();

    let blocks: CleanArticleBlock[] = [];
    if (parsed?.content) {
      blocks = extractBlocksFromArticleHtml(parsed.content, finalUrl);
    }

    // Fallback to <article> or <main> paragraphs if Readability missed short/structured posts
    if (blocks.length === 0) {
      const fallbackRoot = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      if (fallbackRoot) {
        blocks = extractBlocksFromArticleHtml(fallbackRoot.innerHTML, finalUrl);
      }
    }

    const plainText = blocks
      .map((b) => {
        if (b.type === "list") return b.items.join("\n");
        if ("text" in b) return b.text;
        return "";
      })
      .filter((t) => t.trim().length > 0)
      .join("\n\n");

    if (!plainText || plainText.length < 80) {
      res.status(422).json({
        ok: false,
        error:
          "Tidak ditemukan konten artikel yang memadai pada halaman ini, atau situs memerlukan JavaScript/login untuk menampilkan artikel.",
      });
      return;
    }

    const words = plainText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));
    const finalParsedUrl = new URL(finalUrl);

    res.json({
      ok: true,
      article: {
        url: finalUrl,
        domain: finalParsedUrl.hostname.replace(/^www\./i, ""),
        title: normalizeWhitespace(parsed?.title || metaTitle || finalParsedUrl.hostname),
        byline: parsed?.byline ? normalizeWhitespace(parsed.byline) : undefined,
        siteName: normalizeWhitespace(parsed?.siteName || ogSiteName || finalParsedUrl.hostname),
        excerpt: parsed?.excerpt ? normalizeWhitespace(parsed.excerpt) : undefined,
        publishedTime: metaPublished || parsed?.publishedTime || undefined,
        wordCount,
        readingMinutes,
        blocks,
        plainText,
      },
    });
  } catch (error: any) {
    const msg = error?.message || "Gagal mengambil dan membersihkan artikel situs.";
    const isClientInputErr =
      msg.includes("URL") ||
      msg.includes("lokal") ||
      msg.includes("privat") ||
      msg.includes("internal") ||
      msg.includes("Content-Type");
    res.status(isClientInputErr ? 400 : 502).json({
      ok: false,
      error: msg,
    });
  }
});

// Document Q&A / Explanation with configurable Gemini model, personality & key rotation
app.post("/api/ai/ask", async (req, res) => {
  try {
    const {
      question,
      pageText,
      docTitle,
      pageNumber,
      history,
      model: requestedModel,
      personality,
    } = req.body;
    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    const { keys } = extractRequestApiKeys(req);
    if (keys.length === 0) {
      res.status(400).json({ error: "API Key belum diisi." });
      return;
    }

    let targetModel = "gemini-3.6-flash";
    if (requestedModel === "gemini-3.1-pro" || requestedModel === "gemini-3.1-pro-preview") {
      targetModel = "gemini-3.1-pro-preview";
    } else if (requestedModel === "gemini-3.1-flash" || requestedModel === "gemini-3.1-flash-lite") {
      targetModel = "gemini-3.1-flash-lite";
    } else if (requestedModel === "gemini-3.6-flash") {
      targetModel = "gemini-3.6-flash";
    } else if (requestedModel) {
      targetModel = requestedModel;
    }

    let historyContext = "";
    if (Array.isArray(history) && history.length > 0) {
      const historyTurns = history
        .slice(-6)
        .map((h: any) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
        .join("\n\n");
      historyContext = `\n\nRecent Conversation History:\n${historyTurns}\n`;
    }

    const personalityDirective =
      personality && typeof personality === "string" && personality.trim().length > 0
        ? `\nAI PERSONALITY & CUSTOM DIRECTIVES (YOU MUST STRICTLY FOLLOW THIS PERSONA):\n${personality.trim()}\n`
        : ``;

    const prompt = `You are a perceptive reading assistant for the PDF document "${docTitle || "Document"}".
Page Number: ${pageNumber || "Unknown"}
${personalityDirective}
Page Content Excerpt:
"""
${pageText ? pageText.slice(0, 8000) : "No text available for this page."}
"""${historyContext}

User Question:
${question}

Instructions:
- Provide an accurate, clear, and engaging answer grounded directly in the text excerpt whenever possible.
- Adhere faithfully to the AI PERSONALITY & CUSTOM DIRECTIVES above regarding tone, depth, style, and attitude.
- If the question asks for definitions, explain clearly with context.
- Keep responses well structured and easy to read.`;

    const { result } = await runWithServerGeminiRotation(keys, async (ai) => {
      return await ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        },
      });
    });

    res.json({
      answer: result.text || "No response generated.",
      model: targetModel,
    });
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    const isQuota =
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED");
    res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? "Batas kuota seluruh API Key Gemini tercapai (429). Coba tambahkan key lain atau tunggu beberapa saat."
        : error?.message || "Failed to analyze document question",
    });
  }
});

// Summary Endpoint with configurable Gemini model, personality & key rotation
app.post("/api/ai/summary", async (req, res) => {
  try {
    const {
      pageText,
      pageNumber,
      docTitle,
      model: requestedModel,
      personality,
    } = req.body;
    if (!pageText || pageText.trim().length === 0) {
      res.status(400).json({ error: "Page text is required for summary" });
      return;
    }

    const { keys } = extractRequestApiKeys(req);
    if (keys.length === 0) {
      res.status(400).json({ error: "API Key belum diisi." });
      return;
    }

    let targetModel = "gemini-3.6-flash";
    if (requestedModel === "gemini-3.1-pro" || requestedModel === "gemini-3.1-pro-preview") {
      targetModel = "gemini-3.1-pro-preview";
    } else if (requestedModel === "gemini-3.1-flash" || requestedModel === "gemini-3.1-flash-lite") {
      targetModel = "gemini-3.1-flash-lite";
    } else if (requestedModel === "gemini-3.6-flash") {
      targetModel = "gemini-3.6-flash";
    } else if (requestedModel) {
      targetModel = requestedModel;
    }

    const personalityDirective =
      personality && typeof personality === "string" && personality.trim().length > 0
        ? `\nPersonality & Tone:\n${personality.trim()}\n`
        : "";

    const prompt = `You are analyzing Page ${pageNumber || 1} of "${docTitle || "Document"}".
${personalityDirective}
Page Text:
"""
${pageText.slice(0, 8000)}
"""

Please provide:
1. A concise 2-sentence executive summary.
2. 3-4 key bullet points or takeaways.
3. 2 interesting questions or concepts raised on this page.`;

    const { result } = await runWithServerGeminiRotation(keys, async (ai) => {
      return await ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        },
      });
    });

    res.json({
      summary: result.text || "No summary could be generated.",
      model: targetModel,
    });
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    const isQuota =
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED");
    res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? "Batas kuota seluruh API Key Gemini tercapai (429). Coba tambahkan key lain atau tunggu beberapa saat."
        : error?.message || "Failed to generate summary",
    });
  }
});

async function startServer() {
  const server = http.createServer(app);

  // WebSocket Server for Live Voice Conversation
  const wss = new WebSocketServer({ server, path: "/api/live" });

  function buildLiveSystemInstruction(
    docTitle?: string,
    pageNumber?: number,
    context?: string,
    personality?: string
  ) {
    const cleanContext = (context || "").trim();
    const personalityDirective =
      personality && typeof personality === "string" && personality.trim().length > 0
        ? `\nKARAKTER / PERSONALITY & GAYA BICARA KHUSUS:\n${personality.trim()}\n(Terapkan gaya bicara, nada, dan persona ini secara konsisten dalam seluruh ucapan Anda)\n`
        : "";

    return `Anda adalah asisten suara AI pembaca dokumen PDF untuk aplikasi pembaca dokumen VOXReader.
${personalityDirective}
INFORMASI DOKUMEN YANG SEDANG DIBUKA OLEH PENGGUNA:
- Judul Dokumen: "${docTitle || "Dokumen PDF"}"
- Halaman yang Sedang Tampil: Halaman ${pageNumber || 1}

ISI TEKS LENGKAP PADA HALAMAN INI:
"""
${cleanContext ? cleanContext.slice(0, 8000) : "[Tidak ada teks terdeteksi pada halaman ini / halaman berupa scan gambar murni tanpa OCR]"}
"""

PANDUAN & ATURAN MUTLAK MEMBACA (CRITICAL GROUNDING DIRECTIVES):
1. ATURAN MEMBACA TEKS:
   - Jika pengguna meminta Anda untuk membaca (misalnya berkata: "bacakan", "baca", "bacakan teksnya", "tolong bacakan halaman ini", "baca halaman ini", "bacakan isi dokumen", "read this page", atau tombol 'Bacakan Teks' ditekan):
   - Anda HARUS membacakan ISI TEKS LENGKAP PADA HALAMAN INI di atas secara persis kata demi kata (verbatim).
   - DILARANG KERAS mengarang cerita fiktif, membaca teks acak/dongeng yang tidak ada hubungannya, atau berhalusinasi.
   - Jika halaman ini kosong atau tidak memiliki teks, sampaikan dengan ramah: "Maaf, halaman ini tidak memiliki teks yang terdeteksi untuk dibacakan."
   - Bacakan dengan artikulasi yang jernih, intonasi yang hidup, ekspresif, dan tempo yang nyaman didengarkan.

2. ATURAN DISKUSI & TANYA JAWAB:
   - Jika pengguna bertanya tentang isi halaman ("jelaskan", "apa intinya", "rangkumkan", "buat kuis"), jawablah secara ringkas dan lugas HANYA berdasarkan isi teks halaman di atas.

3. Gunakan Bahasa Indonesia yang ramah, sopan, dan jelas (atau bahasa asli dokumen jika dokumen berbahasa Inggris).`;
  }

  wss.on("connection", async (clientWs: WebSocket, req: any) => {
    let session: any = null;
    let isConnecting = false;

    const parsedUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    let requestedModel = parsedUrl.searchParams.get("model") || "gemini-3.1-flash-live-preview";
    let requestedVoice = parsedUrl.searchParams.get("voice") || "Aoede";
    const initialUrlKey = parsedUrl.searchParams.get("apiKey") || "";

    let liveVoice =
      typeof requestedVoice === "string" && requestedVoice.trim().length > 0
        ? requestedVoice.trim()
        : "Aoede";

    const initLiveSession = async (initPayload?: {
      docTitle?: string;
      pageNumber?: number;
      context?: string;
      model?: string;
      voice?: string;
      personality?: string;
      apiKey?: string;
      apiKeys?: string[];
    }) => {
      if (session || isConnecting) return;
      isConnecting = true;

      try {
        if (initPayload?.model) requestedModel = initPayload.model;
        if (initPayload?.voice && initPayload.voice.trim().length > 0) {
          liveVoice = initPayload.voice.trim();
        }

        const customKeys = parseServerApiKeys([
          ...(Array.isArray(initPayload?.apiKeys) ? initPayload.apiKeys : []),
          initPayload?.apiKey || "",
          initialUrlKey,
        ]);
        const keys =
          customKeys.length > 0
            ? customKeys
            : parseServerApiKeys(process.env.GEMINI_API_KEY);

        let liveModelToUse = requestedModel;
        const systemInstruction = buildLiveSystemInstruction(
          initPayload?.docTitle,
          initPayload?.pageNumber,
          initPayload?.context,
          initPayload?.personality
        );

        const createSessionWithClient = async (ai: GoogleGenAI, modelName: string) => {
          return await ai.live.connect({
            model: modelName,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: liveVoice } },
              },
              systemInstruction,
              safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
            },
            callbacks: {
              onmessage: (message: LiveServerMessage) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (audio) {
                    clientWs.send(JSON.stringify({ type: "audio", audio }));
                  }
                  if (message.serverContent?.interrupted) {
                    clientWs.send(JSON.stringify({ type: "interrupted" }));
                  }
                  const textPart = message.serverContent?.modelTurn?.parts?.find(
                    (p: any) => p.text
                  );
                  if (textPart?.text) {
                    clientWs.send(JSON.stringify({ type: "text", text: textPart.text }));
                  }
                }
              },
              onclose: () => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: "closed" }));
                  clientWs.close();
                }
              },
              onerror: (err: any) => {
                console.error("Live session error:", err);
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(
                    JSON.stringify({
                      type: "error",
                      error: err?.message || "Live API error occurred",
                    })
                  );
                }
              },
            },
          });
        };

        try {
          const { result } = await runWithServerGeminiRotation(keys, async (ai) => {
            return await createSessionWithClient(ai, liveModelToUse);
          });
          session = result;
        } catch (connErr: any) {
          if (liveModelToUse !== "gemini-3.1-flash-live-preview") {
            console.warn(
              `Live model ${liveModelToUse} failed (${connErr?.message}). Falling back to gemini-3.1-flash-live-preview.`
            );
            liveModelToUse = "gemini-3.1-flash-live-preview";
            const { result } = await runWithServerGeminiRotation(keys, async (ai) => {
              return await createSessionWithClient(ai, liveModelToUse);
            });
            session = result;
          } else {
            throw connErr;
          }
        }

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "ready",
              message: `Live voice session connected with model: ${liveModelToUse}`,
              model: liveModelToUse,
              hasContext: Boolean(initPayload?.context && initPayload.context.trim().length > 0),
              pageNumber: initPayload?.pageNumber || 1,
            })
          );
        }
      } catch (err: any) {
        console.error("Failed to connect Gemini Live session:", err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "error",
              error: err?.message || "Failed to initialize Gemini Live session",
            })
          );
          clientWs.close();
        }
      } finally {
        isConnecting = false;
      }
    };

    const fallbackInitTimer = setTimeout(() => {
      if (!session && !isConnecting) {
        initLiveSession();
      }
    }, 500);

    clientWs.on("message", async (data: any) => {
      try {
        const payload = JSON.parse(data.toString());

        if (payload.type === "init") {
          clearTimeout(fallbackInitTimer);
          await initLiveSession(payload);
          return;
        }

        if (!session) {
          clearTimeout(fallbackInitTimer);
          await initLiveSession(payload);
          if (!session) return;
        }

        if (payload.type === "audio" && payload.audio) {
          session.sendRealtimeInput({
            audio: {
              data: payload.audio,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } else if (payload.type === "text" && payload.text) {
          session.sendRealtimeInput({
            text: payload.text,
          });
        } else if (payload.type === "context" || payload.type === "update_page") {
          session.sendRealtimeInput({
            text: `[INFORMASI KONTEKS DOKUMEN DIPERBARUI]:
Pengguna saat ini sedang membuka Halaman ${payload.pageNumber || 1} dari dokumen "${payload.docTitle || "Dokumen"}".
ISI TEKS HALAMAN BARU:
"""
${(payload.context || "").trim().slice(0, 8000)}
"""
PANDUAN: Jika pengguna meminta Anda membacakan teks ("bacakan", "baca", "bacakan halaman ini"), bacakan teks halaman ${payload.pageNumber || 1} di atas persis apa adanya kata demi kata.]`,
          });
        }
      } catch (e) {
        console.error("Error processing client WS message:", e);
      }
    });

    clientWs.on("close", () => {
      clearTimeout(fallbackInitTimer);
      if (session && typeof session.close === "function") {
        try {
          session.close();
        } catch {
          // ignore cleanup errors
        }
      }
    });
  });

  // Return JSON 404 for unknown /api/* routes instead of falling through to SPA HTML
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  // Serve PDF.js CMaps, standard fonts, and WASM decoders directly (never fall through to SPA HTML on 404)
  const mountPdfAssetDir = (route: string, publicSubdir: string, nodeSubdir: string) => {
    const pubDir = path.join(process.cwd(), "public", publicSubdir);
    const modDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", nodeSubdir);
    if (fs.existsSync(pubDir)) {
      app.use(route, express.static(pubDir, { fallthrough: true }));
    }
    if (fs.existsSync(modDir)) {
      app.use(route, express.static(modDir, { fallthrough: true }));
    }
    app.use(route, (_req, res) => {
      res.status(404).end();
    });
  };

  mountPdfAssetDir("/cmaps", "cmaps", "cmaps");
  mountPdfAssetDir("/standard_fonts", "standard_fonts", "standard_fonts");
  mountPdfAssetDir("/wasm", "wasm", "wasm");

  // Vite middleware in dev or static serving in production
  let viteServer: any = null;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server },
      },
      appType: "spa",
    });
    app.use(viteServer.middlewares);
  } else {
    const possibleDistPaths = [
      path.join(process.cwd(), "dist"),
      __dirname,
      path.join(__dirname, "dist"),
      path.join(__dirname, "../dist"),
    ];
    const distPath =
      possibleDistPaths.find((p) => fs.existsSync(path.join(p, "index.html"))) ||
      path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (/\.(mjs|js|css|wasm|bcmap|json|png|jpg|svg|ico|woff2?)$/i.test(req.path)) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`Port ${PORT} sudah digunakan. Tutup proses server lain pada port ${PORT} atau ubah PORT.`);
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });

  const gracefulShutdown = async () => {
    try {
      if (viteServer && typeof viteServer.close === "function") {
        await viteServer.close();
      }
    } catch {
      // ignore
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
