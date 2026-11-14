import { ArticleBlock, StoredArticle, StoredArticleMeta, TtsFilterSettings } from "../types";
import { getApiBaseUrl } from "./apiConfig";

const DB_NAME = "voxreader_web_articles";
const DB_VERSION = 1;
const STORE_NAME = "articles";

function openArticleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("url", "url", { unique: false });
        store.createIndex("lastReadAt", "lastReadAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function buildArticleIdFromUrl(normalizedUrl: string): string {
  // Deterministic lightweight hash so saving the same article URL updates existing record cleanly
  let hash1 = 2166136261;
  let hash2 = 0;
  for (let i = 0; i < normalizedUrl.length; i++) {
    const c = normalizedUrl.charCodeAt(i);
    hash1 ^= c;
    hash1 = Math.imul(hash1, 16777619);
    hash2 = (hash2 * 31 + c) | 0;
  }
  return `art_${(hash1 >>> 0).toString(36)}_${(hash2 >>> 0).toString(36)}`;
}

export async function saveArticle(article: StoredArticle): Promise<void> {
  const db = await openArticleDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(article);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllArticles(): Promise<StoredArticleMeta[]> {
  const db = await openArticleDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = (request.result as StoredArticle[]) || [];
      const metas: StoredArticleMeta[] = records
        .map(({ blocks: _blocks, plainText: _plainText, ...meta }) => meta)
        .sort((a, b) => (b.lastReadAt || b.savedAt) - (a.lastReadAt || a.savedAt));
      resolve(metas);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getArticleById(id: string): Promise<StoredArticle | undefined> {
  const db = await openArticleDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as StoredArticle | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await openArticleDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateArticleProgress(
  id: string,
  lastPage: number,
  bookmarks: number[]
): Promise<void> {
  const existing = await getArticleById(id);
  if (!existing) return;
  await saveArticle({
    ...existing,
    lastPage,
    bookmarks,
    lastReadAt: Date.now(),
  });
}

export interface FetchedArticlePayload {
  url: string;
  domain: string;
  title: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  publishedTime?: string;
  wordCount: number;
  readingMinutes: number;
  blocks: ArticleBlock[];
  plainText: string;
}

export async function fetchCleanArticleFromUrl(rawUrl: string): Promise<StoredArticle> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Masukkan URL artikel terlebih dahulu.");
  }

  const normalizedInput = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/api/article/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: normalizedInput }),
  });

  const rawText = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  if (!res.ok || !data?.ok || !data?.article) {
    const textHint = !data?.error && rawText && !rawText.trim().startsWith("<")
      ? ` — ${rawText.trim().slice(0, 140)}`
      : "";
    throw new Error(
      data?.error ||
        `Gagal membuka artikel (${res.status})${textHint}. Pastikan URL dapat diakses publik.`
    );
  }

  const payload = data.article as FetchedArticlePayload;
  const id = buildArticleIdFromUrl(payload.url || normalizedInput);
  const existing = await getArticleById(id).catch(() => undefined);
  const now = Date.now();

  const stored: StoredArticle = {
    id,
    url: payload.url || normalizedInput,
    domain: payload.domain || new URL(normalizedInput).hostname,
    title: payload.title || "Artikel Tanpa Judul",
    byline: payload.byline,
    siteName: payload.siteName,
    excerpt: payload.excerpt,
    publishedTime: payload.publishedTime,
    wordCount: payload.wordCount || 0,
    readingMinutes: payload.readingMinutes || 1,
    blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
    plainText: payload.plainText || "",
    lastPage: 1,
    bookmarks: existing?.bookmarks || [],
    savedAt: existing?.savedAt || now,
    lastReadAt: now,
  };

  await saveArticle(stored);
  return stored;
}

export interface ArticlePageSlice {
  pageNumber: number;
  blocks: ArticleBlock[];
  plainText: string;
}

function blockToPlainText(block: ArticleBlock): string {
  switch (block.type) {
    case "heading":
      return block.text;
    case "paragraph":
      return block.text;
    case "blockquote":
      return block.text;
    case "list":
      return block.items.map((item, idx) => (block.ordered ? `${idx + 1}. ${item}` : `• ${item}`)).join("\n");
    case "image":
      return block.alt ? `[Gambar: ${block.alt}]` : "";
  }
}

function blockToTtsText(block: ArticleBlock): string {
  switch (block.type) {
    case "heading":
      return block.text;
    case "paragraph":
      return block.text;
    case "blockquote":
      return block.text;
    case "list":
      return block.items.join(". ");
    case "image":
      return "";
  }
}

export function paginateArticleBlocks(
  blocks: ArticleBlock[],
  maxCharsPerPage = 3200
): ArticlePageSlice[] {
  if (!blocks || blocks.length === 0) {
    return [{ pageNumber: 1, blocks: [], plainText: "" }];
  }

  const pages: ArticlePageSlice[] = [];
  let currentBlocks: ArticleBlock[] = [];
  let currentChars = 0;

  const flushPage = () => {
    if (currentBlocks.length === 0) return;
    const plainText = currentBlocks
      .map(blockToTtsText)
      .filter((t) => t.trim().length > 0)
      .join("\n\n");
    pages.push({
      pageNumber: pages.length + 1,
      blocks: currentBlocks,
      plainText,
    });
    currentBlocks = [];
    currentChars = 0;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockText = blockToPlainText(block);
    const len = blockText.length;

    // Avoid orphaned heading at the very bottom of a page
    const isNearPageEnd = currentBlocks.length > 0 && currentChars >= maxCharsPerPage * 0.78;
    if (block.type === "heading" && isNearPageEnd) {
      flushPage();
    } else if (currentBlocks.length > 0 && currentChars + len > maxCharsPerPage) {
      flushPage();
    }

    currentBlocks.push(block);
    currentChars += len + 2;
  }

  flushPage();

  if (pages.length === 0) {
    return [{ pageNumber: 1, blocks: [], plainText: "" }];
  }

  return pages;
}

export interface ArticleTtsFilterResult {
  plainText: string;
  ttsText: string;
  filteredHeaders: string[];
}

function normalizeArticleCompareText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D"']/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|•]+|[\s\-–—:|•.]+$/g, "")
    .trim();
}

function isLikelyArticleMetadataLine(
  text: string,
  article: StoredArticle
): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 140) return false;

  const norm = normalizeArticleCompareText(trimmed);
  if (!norm) return true;

  const titleNorm = normalizeArticleCompareText(article.title || "");
  const siteNorm = normalizeArticleCompareText(article.siteName || "");
  const domainNorm = normalizeArticleCompareText(article.domain || "");
  const bylineNorm = normalizeArticleCompareText(article.byline || "");

  if (
    titleNorm.length >= 4 &&
    (norm === titleNorm ||
      (norm.length <= titleNorm.length + 18 && titleNorm.includes(norm)) ||
      (norm.length >= titleNorm.length && norm.includes(titleNorm) && norm.length <= titleNorm.length + 30))
  ) {
    return true;
  }

  if ((siteNorm && norm === siteNorm) || (domainNorm && norm === domainNorm)) {
    return true;
  }

  if (
    bylineNorm &&
    (norm === bylineNorm ||
      norm === `oleh ${bylineNorm}` ||
      norm === `by ${bylineNorm}` ||
      norm === `penulis ${bylineNorm}`)
  ) {
    return true;
  }

  // Common editorial header/byline/reading-time/UI labels
  if (
    /^(oleh|penulis|author|editor|reporter|pewarta|kontributor|foto|ilustrasi|sumber|tag|topik)\s*:/i.test(trimmed) ||
    /^(oleh|by)\s+[a-zA-Z\u00C0-\u024F][\w\s.,'-]{1,50}$/i.test(trimmed) ||
    /^~?\d+\s*(menit|mnt|min|minutes?)\s*(baca|read|waktu baca)?$/i.test(trimmed) ||
    /^(buka situs asli|bagikan|share|iklan|advertisement|daftar isi)$/i.test(trimmed)
  ) {
    return true;
  }

  // Standalone publish date/time line (without full sentence punctuation)
  const endsWithSentencePunct = /[.?!…]["”’)]*\s*$/.test(trimmed);
  if (
    !endsWithSentencePunct &&
    trimmed.length <= 90 &&
    (/\b(wib|wita|wit|gmt|utc)\b/i.test(trimmed) ||
      (/\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|january|february|march|may|june|july|august|october|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
        trimmed
      ) &&
        /\d{1,4}/.test(trimmed)))
  ) {
    return true;
  }

  return false;
}

/**
 * Builds filtered TTS text for the current article page slice while keeping
 * full visual & AI Q&A text untouched.
 */
export function buildArticlePageTtsText(
  article: StoredArticle,
  slice: ArticlePageSlice | undefined,
  filterSettings?: TtsFilterSettings
): ArticleTtsFilterResult {
  const fullText = slice?.plainText || article.plainText || "";
  if (!slice || !slice.blocks || slice.blocks.length === 0) {
    return {
      plainText: fullText,
      ttsText: fullText,
      filteredHeaders: [],
    };
  }

  const skipHeadersFooters = filterSettings?.skipHeadersFooters ?? true;
  const skipChapterHeadings = filterSettings?.skipChapterHeadings ?? false;
  const customIgnored = (filterSettings?.customIgnoredLines || [])
    .map((s) => normalizeArticleCompareText(s))
    .filter((s) => s.length > 0);

  const isFirstPage = slice.pageNumber === 1;
  const titleNorm = normalizeArticleCompareText(article.title || "");
  const filteredHeaders: string[] = [];
  const pushFilteredHeader = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    if (!filteredHeaders.includes(clean)) {
      filteredHeaders.push(clean);
    }
  };

  // Page 1 header block (site name, reading time, article title, byline, date)
  if (isFirstPage && skipHeadersFooters && article.title) {
    pushFilteredHeader(article.title);
  }

  const keptParts: string[] = [];
  let seenBodyParagraph = false;

  for (const block of slice.blocks) {
    const ttsBlockText = blockToTtsText(block).trim();
    if (!ttsBlockText) continue;

    const normBlock = normalizeArticleCompareText(ttsBlockText);

    // 1. User-defined custom ignored phrases
    if (
      customIgnored.length > 0 &&
      customIgnored.some((ig) => normBlock === ig || normBlock.includes(ig))
    ) {
      pushFilteredHeader(ttsBlockText);
      continue;
    }

    // 2. Leading titles, subtitles, and metadata blocks at the top of Page 1
    if (isFirstPage && skipHeadersFooters && !seenBodyParagraph) {
      if (block.type === "heading") {
        pushFilteredHeader(block.text);
        continue;
      }

      if (
        (block.type === "paragraph" || block.type === "blockquote") &&
        isLikelyArticleMetadataLine(ttsBlockText, article)
      ) {
        pushFilteredHeader(ttsBlockText);
        continue;
      }

      // Short non-sentence kicker/category tag right above the first body paragraph
      if (
        block.type === "paragraph" &&
        ttsBlockText.length <= 65 &&
        !/[.?!…:]["”’)]*\s*$/.test(ttsBlockText) &&
        ttsBlockText.split(/\s+/).length <= 8 &&
        !/[-–—]\s*$/.test(ttsBlockText)
      ) {
        pushFilteredHeader(ttsBlockText);
        continue;
      }
    }

    // 3. Duplicate article title appearing anywhere as a heading/short line
    if (
      skipHeadersFooters &&
      titleNorm.length >= 4 &&
      normBlock === titleNorm &&
      (block.type === "heading" || ttsBlockText.length <= article.title.length + 20)
    ) {
      pushFilteredHeader(ttsBlockText);
      continue;
    }

    // 4. Mid-article headings / subheadings when skipChapterHeadings is enabled
    if (skipChapterHeadings && block.type === "heading") {
      pushFilteredHeader(block.text);
      continue;
    }

    seenBodyParagraph = true;
    keptParts.push(ttsBlockText);
  }

  let ttsText = keptParts.join("\n\n").trim();

  // Safety fallback if everything on a short page was filtered out
  if (!ttsText) {
    ttsText = fullText;
  } else if (isFirstPage && !skipHeadersFooters && article.title) {
    ttsText = `${article.title}.\n\n${ttsText}`;
  }

  return {
    plainText: fullText,
    ttsText,
    filteredHeaders,
  };
}

