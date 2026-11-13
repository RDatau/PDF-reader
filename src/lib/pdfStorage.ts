import { StoredDocument } from "../types";

const DB_NAME = "pdf_reader_offline_store";
const DB_VERSION = 1;
const STORE_NAME = "documents";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("lastReadAt", "lastReadAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      // If doc.data is a valid non-detached ArrayBuffer, clone it so storage has an independent copy
      const safeData = doc.data && doc.data.byteLength > 0 ? doc.data.slice(0) : doc.data;
      const safeDoc = { ...doc, data: safeData };
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(safeDoc);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAllDocuments(): Promise<Omit<StoredDocument, "data">[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const docs: StoredDocument[] = req.result || [];
      // Return metadata without loading full array buffers for snappy UI
      const list = docs.map((d) => ({
        id: d.id,
        name: d.name,
        size: d.size,
        totalPages: d.totalPages,
        lastPage: d.lastPage,
        lastZoom: d.lastZoom,
        lastReadAt: d.lastReadAt,
        bookmarks: d.bookmarks || [],
      }));
      list.sort((a, b) => b.lastReadAt - a.lastReadAt);
      resolve(list as any);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function getDocumentById(id: string): Promise<StoredDocument | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const doc = req.result;
      if (doc && doc.data) {
        // If data buffer is detached or 0-byte, treat as invalid
        if (doc.data.byteLength === 0) {
          resolve(null);
          return;
        }
      }
      resolve(doc || null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateProgress(id: string, lastPage: number, lastZoom: number, bookmarks?: number[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing) {
        existing.lastPage = lastPage;
        existing.lastZoom = lastZoom;
        existing.lastReadAt = Date.now();
        if (bookmarks !== undefined) {
          existing.bookmarks = bookmarks;
        }
        if (existing.data && existing.data.byteLength === 0) {
          // Do not attempt to clone detached buffer
          delete existing.data;
        }
        try {
          store.put(existing);
        } catch (e) {
          console.warn("Could not persist updated progress:", e);
        }
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
