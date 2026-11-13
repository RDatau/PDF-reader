import { StoredTtsAudio, StoredTtsAudioMeta } from "../types";

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

export function buildTtsDownloadFilename(title: string, extension = "wav"): string {
  const sanitized = (title || "VOXReader_TTS")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const safeBase = sanitized || "VOXReader_TTS";
  return `${safeBase}.${extension}`;
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
      }));
      // Sort by newest batch / page / part order
      meta.sort((a, b) => {
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
