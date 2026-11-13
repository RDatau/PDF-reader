import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
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
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

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

// Parse one or multiple newline/comma-separated API keys defensively
let serverRotationCursor = 0;
function parseServerApiKeys(raw?: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of raw.split(/[\r\n,;]+/)) {
    const cleaned = part
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^GEMINI_API_KEY\s*=\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    if (cleaned && !cleaned.startsWith("#") && !seen.has(cleaned)) {
      seen.add(cleaned);
      keys.push(cleaned);
    }
  }
  return keys;
}

// Lazy Gemini client helper supporting optional user-supplied single or multi-line custom API keys
let defaultGeminiClient: GoogleGenAI | null = null;
function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const customKeys = parseServerApiKeys(customApiKey);
  if (customKeys.length > 0) {
    const pickedKey = customKeys[serverRotationCursor % customKeys.length];
    serverRotationCursor = (serverRotationCursor + 1) % customKeys.length;
    return new GoogleGenAI({
      apiKey: pickedKey,
      httpOptions: {
        apiVersion: "v1beta",
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  const envKeys = parseServerApiKeys(process.env.GEMINI_API_KEY);
  if (envKeys.length > 1) {
    const pickedKey = envKeys[serverRotationCursor % envKeys.length];
    serverRotationCursor = (serverRotationCursor + 1) % envKeys.length;
    return new GoogleGenAI({
      apiKey: pickedKey,
      httpOptions: {
        apiVersion: "v1beta",
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  if (!defaultGeminiClient) {
    const apiKey = envKeys[0] || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    defaultGeminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "v1beta",
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return defaultGeminiClient;
}

// Helper: Convert 16-bit 24kHz mono PCM to WAV format
function pcmToWav(pcmData: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  // RIFF identifier
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Gemini API Key Verification Endpoint
app.post("/api/gemini/check", async (req, res) => {
  try {
    let customApiKey =
      (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;
    if (typeof customApiKey === "string") {
      customApiKey = customApiKey.trim().replace(/^["'`]|["'`]$/g, "").trim();
    }

    if (!customApiKey && !process.env.GEMINI_API_KEY) {
      res.status(400).json({
        ok: false,
        error: "API Key belum diisi. Tempel API Key Anda dari Google AI Studio.",
      });
      return;
    }

    const ai = getGeminiClient(customApiKey);

    // Call modern lightweight model to verify credentials and connectivity
    let response: any;
    let verifiedModel = "gemini-3.8-flash";
    try {
      response = await ai.models.generateContent({
        model: verifiedModel,
        contents: "Ping. Return 'OK'.",
        config: {
          maxOutputTokens: 10,
          safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        },
      });
    } catch (e1: any) {
      console.warn(`Check with ${verifiedModel} failed (${e1?.message}), trying gemini-3.6-flash...`);
      verifiedModel = "gemini-3.6-flash";
      response = await ai.models.generateContent({
        model: verifiedModel,
        contents: "Ping. Return 'OK'.",
        config: {
          maxOutputTokens: 10,
          safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
        },
      });
    }

    res.json({
      ok: true,
      message: `API Key valid dan berhasil terhubung (${verifiedModel})!`,
      reply: response.text?.trim() || "OK",
      isCustom: !!(customApiKey && customApiKey.trim().length > 0),
    });
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    let friendlyMessage = "Gagal memverifikasi API Key.";

    if (
      errorMsg.includes("API_KEY_INVALID") ||
      errorMsg.includes("API key not valid") ||
      errorMsg.includes("400") ||
      error?.status === 400
    ) {
      friendlyMessage =
        "API Key tidak valid atau salah ketik. Pastikan key disalin lengkap (dimulai dengan AIzaSy...) dari Google AI Studio.";
    } else if (
      errorMsg.includes("PERMISSION_DENIED") ||
      errorMsg.includes("403")
    ) {
      friendlyMessage =
        "Akses ditolak (Permission Denied). Periksa izin API Key Anda di Google AI Studio.";
    } else if (
      errorMsg.includes("RESOURCE_EXHAUSTED") ||
      errorMsg.includes("429") ||
      errorMsg.includes("quota")
    ) {
      friendlyMessage =
        "Batas kuota API tercapai (Rate limit / Quota exceeded). Coba gunakan key lain atau tunggu beberapa saat.";
    } else if (
      errorMsg.includes("GEMINI_API_KEY environment variable is required")
    ) {
      friendlyMessage =
        "API Key belum diisi dan tidak ada kunci sistem yang terkonfigurasi.";
    } else {
      friendlyMessage = `Gagal terhubung: ${errorMsg.slice(0, 150)}`;
    }

    res.status(400).json({
      ok: false,
      error: friendlyMessage,
      details: errorMsg,
    });
  }
});

// In-memory TTS audio cache to conserve quota
const ttsAudioCache = new Map<string, { audio: string; mimeType: string; voice: string; model: string; rawPcmSampleRate: number }>();

// Helper to normalize TTS model IDs strictly to Gemini 3.8 TTS models
function resolveTtsModel(requestedModel?: string): "gemini-3.8-flash-lite-tts" | "gemini-3.8-flash-tts" {
  if (requestedModel === "gemini-3.8-flash-tts" || requestedModel === "gemini-3.8-flash") {
    return "gemini-3.8-flash-tts";
  }
  return "gemini-3.8-flash-lite-tts";
}

// Gemini Streaming TTS Endpoint (SSE raw PCM chunks, 24kHz mono 16-bit LE)
// Uses gemini-3.8-flash-lite-tts or gemini-3.8-flash-tts with generateContentStream
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
      voice = "Aoede",
      model = "gemini-3.8-flash-lite-tts",
      styleInstruction,
    } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "Text is required for streaming TTS" });
      return;
    }

    const cleanText = text.trim();
    const selectedVoice =
      typeof voice === "string" && voice.trim().length > 0 ? voice.trim() : "Aoede";
    const selectedModel = resolveTtsModel(typeof model === "string" ? model.trim() : undefined);
    const cleanStyle =
      typeof styleInstruction === "string" && styleInstruction.trim().length > 0
        ? styleInstruction.trim()
        : undefined;

    const customApiKey = (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;
    const ai = getGeminiClient(customApiKey);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let actualModelUsed = selectedModel;
    let emittedChunks = 0;

    const textPart: any = { text: cleanText };
    if (cleanStyle) {
      textPart.speechMetadata = { style: cleanStyle };
    }

    const runStream = async (modelToUse: string) => {
      const responseStream = await ai.models.generateContentStream({
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

      for await (const chunk of responseStream) {
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
                model: modelToUse,
              })}\n\n`
            );
          }
        }
      }
    };

    try {
      await runStream(actualModelUsed);
    } catch (streamErr: any) {
      // Only fallback if no audio has been streamed yet and requested model wasn't already lite
      if (emittedChunks === 0 && actualModelUsed !== "gemini-3.8-flash-lite-tts" && !clientClosed) {
        console.warn(
          `Stream TTS model ${actualModelUsed} failed (${streamErr?.message}). Falling back to gemini-3.8-flash-lite-tts.`
        );
        actualModelUsed = "gemini-3.8-flash-lite-tts";
        await runStream(actualModelUsed);
      } else {
        throw streamErr;
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
      errorMsg.includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED") ||
      errorMsg.includes("exceeded your current quota");

    if (!res.headersSent) {
      res.status(isQuotaExceeded ? 429 : 500).json({
        error: isQuotaExceeded
          ? "Gemini TTS quota reached. Switched to offline device voice."
          : error?.message || "Failed to stream Gemini TTS",
        quotaExceeded: isQuotaExceeded,
      });
    } else if (!clientClosed && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: isQuotaExceeded
            ? "Gemini TTS quota reached. Switched to offline device voice."
            : error?.message || "Failed to stream Gemini TTS",
          quotaExceeded: isQuotaExceeded,
        })}\n\n`
      );
      res.end();
    }
  }
});

// Unary Gemini TTS Endpoint (fallback / compatibility)
app.post("/api/tts", async (req, res) => {
  try {
    const {
      text,
      voice = "Aoede",
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
      typeof voice === "string" && voice.trim().length > 0 ? voice.trim() : "Aoede";
    const selectedModel = resolveTtsModel(typeof model === "string" ? model.trim() : undefined);
    const cleanStyle =
      typeof styleInstruction === "string" && styleInstruction.trim().length > 0
        ? styleInstruction.trim()
        : undefined;

    const customApiKey = (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;

    const cacheKey = `${customApiKey ? "custom:" : ""}${selectedModel}:${selectedVoice}:${cleanStyle || ""}:${cleanText}`;
    if (ttsAudioCache.has(cacheKey)) {
      res.json(ttsAudioCache.get(cacheKey));
      return;
    }

    const ai = getGeminiClient(customApiKey);
    let response: any = null;
    let actualModelUsed = selectedModel;

    const textPart: any = { text: cleanText };
    if (cleanStyle) {
      textPart.speechMetadata = { style: cleanStyle };
    }

    try {
      response = await ai.models.generateContent({
        model: actualModelUsed,
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
    } catch (modelErr: any) {
      if (actualModelUsed !== "gemini-3.8-flash-lite-tts") {
        console.warn(
          `Model ${actualModelUsed} failed for TTS (${modelErr?.message}). Falling back to gemini-3.8-flash-lite-tts.`
        );
        actualModelUsed = "gemini-3.8-flash-lite-tts";
        response = await ai.models.generateContent({
          model: actualModelUsed,
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
      } else {
        throw modelErr;
      }
    }

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: "No audio data received from Gemini TTS" });
      return;
    }

    const rawBytes = Buffer.from(base64Audio, "base64");
    const isAlreadyWav = rawBytes.length > 44 && rawBytes.subarray(0, 4).toString("ascii") === "RIFF";
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
      errorMsg.includes("quota") ||
      errorMsg.includes("RESOURCE_EXHAUSTED") ||
      errorMsg.includes("exceeded your current quota");

    if (isQuotaExceeded) {
      console.warn("Gemini TTS quota exceeded. Client will use offline device speech synthesis.");
      res.status(429).json({
        error: "Gemini TTS quota reached. Switched to offline device voice.",
        quotaExceeded: true,
      });
      return;
    }

    console.warn("Gemini TTS request warning:", errorMsg);
    res.status(500).json({
      error: error?.message || "Failed to generate speech with Gemini TTS",
    });
  }
});

// Document Q&A / Explanation with configurable Gemini model & personality
app.post("/api/ai/ask", async (req, res) => {
  try {
    const { question, pageText, docTitle, pageNumber, history, model: requestedModel, personality } = req.body;
    if (!question) {
      res.status(400).json({ error: "Question is required" });
      return;
    }

    const customApiKey = (req.headers["x-gemini-api-key"] as string) || req.body.apiKey;
    const ai = getGeminiClient(customApiKey);

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

    const personalityDirective = personality && typeof personality === "string" && personality.trim().length > 0
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

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
      },
    });

    res.json({
      answer: response.text || "No response generated.",
      model: targetModel,
    });
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    const isQuota = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED");
    console.warn("AI Ask:", isQuota ? "Rate/quota limited" : errorMsg);
    res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? "Batas kuota model Gemini tercapai (rate limit). Coba beralih ke model Gemini 3.6 Flash atau tunggu beberapa saat."
        : error?.message || "Failed to analyze document question",
    });
  }
});

// Summary Endpoint with configurable Gemini model & personality
app.post("/api/ai/summary", async (req, res) => {
  try {
    const { pageText, pageNumber, docTitle, model: requestedModel, personality } = req.body;
    if (!pageText || pageText.trim().length === 0) {
      res.status(400).json({ error: "Page text is required for summary" });
      return;
    }

    const customApiKey = (req.headers["x-gemini-api-key"] as string) || req.body.apiKey;
    const ai = getGeminiClient(customApiKey);

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

    const personalityDirective = personality && typeof personality === "string" && personality.trim().length > 0
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

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
      },
    });

    res.json({
      summary: response.text || "No summary could be generated.",
      model: targetModel,
    });
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    const isQuota = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED");
    console.warn("AI Summary:", isQuota ? "Rate/quota limited" : errorMsg);
    res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? "Batas kuota model Gemini tercapai (rate limit). Coba beralih ke model Gemini 3.6 Flash atau tunggu beberapa saat."
        : error?.message || "Failed to generate summary",
    });
  }
});

async function startServer() {
  const server = http.createServer(app);

  // WebSocket Server for Live Voice Conversation (Supports gemini-3.1-flash-live-preview and gemini-2.5-flash-native-audio-preview-12-2025)
  const wss = new WebSocketServer({ server, path: "/api/live" });

  function buildLiveSystemInstruction(docTitle?: string, pageNumber?: number, context?: string, personality?: string) {
    const cleanContext = (context || "").trim();
    const personalityDirective = personality && typeof personality === "string" && personality.trim().length > 0
      ? `\nKARAKTER / PERSONALITY & GAYA BICARA KHUSUS:\n${personality.trim()}\n(Terapkan gaya bicara, nada, dan persona ini secara konsisten dalam seluruh ucapan Anda)\n`
      : "";

    return `Anda adalah asisten suara AI pembaca dokumen PDF untuk aplikasi pembaca dokumen Lumina Reader.
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
    let requestedApiKey = parsedUrl.searchParams.get("apiKey") || undefined;

    const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr", "Aoede"];
    let liveVoice = validVoices.includes(requestedVoice) ? requestedVoice : "Aoede";

    const initLiveSession = async (initPayload?: {
      docTitle?: string;
      pageNumber?: number;
      context?: string;
      model?: string;
      voice?: string;
      personality?: string;
      apiKey?: string;
    }) => {
      if (session || isConnecting) return;
      isConnecting = true;

      try {
        if (initPayload?.apiKey) requestedApiKey = initPayload.apiKey;
        if (initPayload?.model) requestedModel = initPayload.model;
        if (initPayload?.voice && validVoices.includes(initPayload.voice)) {
          liveVoice = initPayload.voice;
        }

        const ai = getGeminiClient(requestedApiKey);
        let liveModelToUse = requestedModel;
        const systemInstruction = buildLiveSystemInstruction(
          initPayload?.docTitle,
          initPayload?.pageNumber,
          initPayload?.context,
          initPayload?.personality
        );

        const createSession = async (modelName: string) => {
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
                  const textPart = message.serverContent?.modelTurn?.parts?.find((p: any) => p.text);
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
          session = await createSession(liveModelToUse);
        } catch (connErr: any) {
          if (liveModelToUse !== "gemini-3.1-flash-live-preview") {
            console.warn(
              `Live model ${liveModelToUse} failed (${connErr?.message}). Falling back to gemini-3.1-flash-live-preview.`
            );
            liveModelToUse = "gemini-3.1-flash-live-preview";
            session = await createSession(liveModelToUse);
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

    // Give the client 500ms to send the 'init' packet with document context
    // If no init packet is received, initialize with default parameters
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
          // If message arrived before session was ready, initialize now with this context
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
          // Update the context in the active conversation
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
        } catch (e) {
          // ignore cleanup errors
        }
      }
    });
  });

  // Vite middleware in dev or static serving in production
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
