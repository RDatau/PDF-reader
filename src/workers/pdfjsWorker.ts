import "../polyfills";
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs";

if (typeof globalThis !== "undefined" && !(globalThis as any).pdfjsWorker) {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}
