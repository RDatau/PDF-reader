import * as pdfjsLib from "pdfjs-dist";
import pwaWorkerUrl from "../workers/pdfjsWorker.ts?worker&url";

/**
 * Detect whether the app is running inside Electron Desktop (dev or packaged .exe)
 * vs a standard WebApp / PWA browser environment.
 */
export function isElectronEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Boolean((window as any).electronAPI?.isElectron) ||
    window.location.protocol === "file:" ||
    /\bElectron\b/i.test(navigator.userAgent || "")
  );
}

/**
 * Resolve public asset URL for Electron (supports both http://localhost dev and file:// packaged builds).
 */
export function resolvePublicAssetUrl(subpath: string): string {
  try {
    const isHttpOrigin =
      typeof window !== "undefined" &&
      (window.location.protocol === "http:" || window.location.protocol === "https:");
    return isHttpOrigin
      ? new URL(subpath, `${window.location.origin}/`).href
      : new URL(subpath, window.location.href).href;
  } catch {
    return `./${subpath}`;
  }
}

let isWorkerConfigured = false;

/**
 * Configure PDF.js worker:
 * - Electron: keeps the verified local public/pdf.worker.min.mjs configuration untouched.
 * - WebApp / PWA: uses the default Vite-bundled Web Worker (with polyfills inside worker scope).
 */
export function configurePdfJsWorker(): void {
  if (isWorkerConfigured) return;
  isWorkerConfigured = true;

  if (isElectronEnvironment()) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = resolvePublicAssetUrl("pdf.worker.min.mjs");
  } else {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pwaWorkerUrl;
  }
}

export interface PdfLoadHandle {
  promise: Promise<any>;
  cancel: () => void;
}

/**
 * Open a PDF document buffer with environment-appropriate strategy:
 * - Electron: preserves the exact Electron PDF.js configuration untouched.
 * - WebApp / PWA: uses default WebApp PDF.js Web Worker loading, with automatic timeout/main-thread
 *   worker fallback so WebApp PWA never hangs indefinitely on "Memuat Halaman 1...".
 */
export function openPdfDocument(pdfData: ArrayBuffer): PdfLoadHandle {
  configurePdfJsWorker();

  let cancelled = false;
  let activeTask: any = null;
  let timeoutId: number | null = null;

  const cancel = () => {
    cancelled = true;
    if (timeoutId !== null && typeof window !== "undefined") {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (activeTask && typeof activeTask.destroy === "function") {
      activeTask.destroy().catch(() => {});
    }
  };

  if (isElectronEnvironment()) {
    // Preserve verified Electron PDF loading flow verbatim
    const cMapUrl = resolvePublicAssetUrl("cmaps/");
    const standardFontDataUrl = resolvePublicAssetUrl("standard_fonts/");
    const wasmUrl = resolvePublicAssetUrl("wasm/");

    const bufferCopy = pdfData.slice(0);
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(bufferCopy),
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
      wasmUrl,
      disableWorker: true,
    } as any);
    activeTask = task;

    return {
      promise: task.promise,
      cancel,
    };
  }

  // WebApp / PWA default PDF loading path (standard Web Worker via Vite bundled worker URL)
  const runWebAppPwaLoad = async () => {
    const baseUri =
      typeof document !== "undefined" && document.baseURI
        ? document.baseURI
        : `${window.location.origin}/`;

    const cMapUrl = new URL("cmaps/", baseUri).href;
    const standardFontDataUrl = new URL("standard_fonts/", baseUri).href;
    const wasmUrl = new URL("wasm/", baseUri).href;

    const primaryTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData.slice(0)),
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
      wasmUrl,
    });
    activeTask = primaryTask;

    const WORKER_LOAD_TIMEOUT_MS = 10000;

    try {
      const doc = await Promise.race([
        primaryTask.promise,
        new Promise<never>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error("PWA_WORKER_TIMEOUT"));
          }, WORKER_LOAD_TIMEOUT_MS);
        }),
      ]);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      return doc;
    } catch (primaryErr: any) {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (cancelled) {
        throw primaryErr;
      }

      // If default Web Worker stalled or failed (e.g. restricted PWA WebView / CSP / SW cache),
      // fall back cleanly to in-thread WorkerMessageHandler with polyfills already active.
      const isWorkerFailure =
        primaryErr?.message === "PWA_WORKER_TIMEOUT" ||
        /worker|fetch|import|script|network/i.test(String(primaryErr?.message || ""));

      if (!isWorkerFailure) {
        throw primaryErr;
      }

      console.warn(
        "WebApp PWA primary PDF worker stalled/failed, switching to fallback:",
        primaryErr?.message
      );

      if (activeTask && typeof activeTask.destroy === "function") {
        await activeTask.destroy().catch(() => {});
      }
      if (cancelled) {
        throw primaryErr;
      }

      if (!(globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
        const workerMod = await import("pdfjs-dist/build/pdf.worker.min.mjs");
        (globalThis as any).pdfjsWorker = workerMod;
      }

      const fallbackTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfData.slice(0)),
        cMapUrl,
        cMapPacked: true,
        standardFontDataUrl,
        wasmUrl,
      });
      activeTask = fallbackTask;
      return await fallbackTask.promise;
    }
  };

  return {
    promise: runWebAppPwaLoad(),
    cancel,
  };
}
