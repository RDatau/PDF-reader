import { StoredTtsAudio, StoredTtsAudioMeta } from "../types";
import { getApiBaseUrl } from "./apiConfig";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  mergeWavArrayBuffersLocal,
} from "./audioUtils";

const DB_NAME = "voxreader_tts_audio_store";
const DB_VERSION = 1;
const STORE_NAME = "tts_clips";

function openTtsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("docId", "docId", { unique: false });
        store.createIndex("pageNumber", "pageNumber", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function cleanPdfDisplayTitle(docName: string): string {
  const cleaned = (docName || "Dokumen").replace(/\.pdf$/i, "").trim();
  return cleaned || "Dokumen";
}

export function formatTtsClipTitle(
  docName: string,
  pageNumber: number,
  partNumber: number,
  isSelection = false
): string {
  const baseTitle = cleanPdfDisplayTitle(docName);
  const partStr = String(partNumber).padStart(2, "0");
  if (isSelection) {
    return `${baseTitle} - Hal ${pageNumber} - Pilihan ${partStr}`;
  }
  return `${baseTitle} - Hal ${pageNumber} - ${partStr}`;
}

export function formatMergedPageTtsTitle(docName: string, pageNumber: number): string {
  const baseTitle = cleanPdfDisplayTitle(docName);
  return `${baseTitle} - Hal ${pageNumber}`;
}

export function buildTtsDownloadFilename(title: string, extension = "wav"): string {
  const sanitized = (title || "VOXReader_TTS")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const safeBase = sanitized || "VOXReader_TTS";
  return `${safeBase}.${extension}`;
}

export async function mergePageWavClips(
  wavBuffers: ArrayBuffer[],
  silenceMs = 180
): Promise<{
  wavBuffer: ArrayBuffer;
  durationSeconds: number;
  mergedBy: "python" | "local";
}> {
  const validBuffers = wavBuffers.filter((b) => b && b.byteLength > 44);
  if (validBuffers.length === 0) {
    throw new Error("Tidak ada audio WAV yang dapat digabungkan.");
  }

  try {
    const apiBase = getApiBaseUrl();
    const parts = validBuffers.map((buf) => arrayBufferToBase64(buf));
    const res = await fetch(`${apiBase}/api/tts/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts, silenceMs }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.ok && typeof data?.audio === "string" && data.audio.length > 0) {
        const wavBuffer = base64ToArrayBuffer(data.audio);
        return {
          wavBuffer,
          durationSeconds: Number(data.durationSeconds || 0),
          mergedBy: "python",
        };
      }
    }
  } catch (err) {
    console.warn("Python /api/tts/merge tidak tersedia, memakai penggabung WAV lokal:", err);
  }

  const localMerged = mergeWavArrayBuffersLocal(validBuffers, silenceMs);
  return {
    wavBuffer: localMerged.wavBuffer,
    durationSeconds: localMerged.durationSeconds,
    mergedBy: "local",
  };
}

export async function saveTtsClip(clip: StoredTtsAudio): Promise<void> {
  const db = await openTtsDatabase();
  return new Promise((resolve, reject) => {
    try {
      const safeBuffer =
        clip.audioData && clip.audioData.byteLength > 0
          ? clip.audioData.slice(0)
          : clip.audioData;
      const safeClip: StoredTtsAudio = { ...clip, audioData: safeBuffer };
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(safeClip);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function cleanupStalePageParts(
  docId: string,
  pageNumber: number,
  maxPartNumber: number
): Promise<void> {
  const db = await openTtsDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("docId");
    const req = index.getAll(docId);

    req.onsuccess = () => {
      const items: StoredTtsAudio[] = req.result || [];
      for (const item of items) {
        if (
          item.pageNumber === pageNumber &&
          !item.id.includes("::sel_") &&
          !item.isMergedPage &&
          !item.id.endsWith("::full") &&
          item.partNumber > maxPartNumber
        ) {
          store.delete(item.id);
        }
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTtsClipsMeta(): Promise<StoredTtsAudioMeta[]> {
  const db = await openTtsDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const raw: StoredTtsAudio[] = req.result || [];
      const meta: StoredTtsAudioMeta[] = raw.map((c) => ({
        id: c.id,
        title: c.title,
        docId: c.docId,
        docTitle: c.docTitle,
        pageNumber: c.pageNumber,
        partNumber: c.partNumber,
        totalParts: c.totalParts,
        textExcerpt: c.textExcerpt,
        voice: c.voice,
        model: c.model,
        durationSeconds: c.durationSeconds,
        sizeBytes: c.sizeBytes,
        mimeType: c.mimeType,
        createdAt: c.createdAt,
        isMergedPage: c.isMergedPage,
        mergedBy: c.mergedBy,
      }));
      // Sort by newest batch / page / merged-first then part order
      meta.sort((a, b) => {
        if (a.docId === b.docId && a.pageNumber === b.pageNumber) {
          if (Boolean(a.isMergedPage) !== Boolean(b.isMergedPage)) {
            return a.isMergedPage ? -1 : 1;
          }
          return a.partNumber - b.partNumber;
        }
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        return a.partNumber - b.partNumber;
      });
      resolve(meta);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function getTtsClipById(id: string): Promise<StoredTtsAudio | null> {
  const db = await openTtsDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const clip: StoredTtsAudio | undefined = req.result;
      if (!clip || !clip.audioData || clip.audioData.byteLength === 0) {
        resolve(null);
        return;
      }
      resolve(clip);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTtsClip(id: string): Promise<void> {
  const db = await openTtsDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllTtsClips(): Promise<void> {
  const db = await openTtsDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
