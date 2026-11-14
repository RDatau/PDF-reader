import dns from "dns";
import net from "net";
import type { IncomingMessage, ServerResponse } from "http";
import * as readabilityMod from "@mozilla/readability";
import { parseHTML } from "linkedom";

const ReadabilityCtor =
  (readabilityMod as any).Readability ?? (readabilityMod as any).default?.Readability;

interface VercelApiRequest extends IncomingMessage {
  body?: any;
}

interface VercelApiResponse extends ServerResponse {
  status: (code: number) => VercelApiResponse;
  json: (data: any) => void;
}

const ARTICLE_FETCH_TIMEOUT_MS = 9_500;
const ARTICLE_MAX_BYTES = 8 * 1024 * 1024;
const ARTICLE_MAX_REDIRECTS = 5;

type CleanArticleBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "image"; src: string; alt?: string };

class ArticleFetchError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "ArticleFetchError";
    this.statusCode = statusCode;
  }
}

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
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  if (version === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (
      ip.startsWith("fe8") ||
      ip.startsWith("fe9") ||
      ip.startsWith("fea") ||
      ip.startsWith("feb")
    ) {
      return true;
    }
    if (ip.startsWith("ff")) return true;
    return false;
  }

  return true;
}

async function validateExternalHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ArticleFetchError("Format URL tidak valid.", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ArticleFetchError("Hanya URL http:// atau https:// yang didukung.", 400);
  }

  if (parsed.username || parsed.password) {
    throw new ArticleFetchError("URL tidak boleh mengandung kredensial.", 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new ArticleFetchError(
      "Akses ke alamat lokal atau jaringan internal tidak diizinkan.",
      400
    );
  }

  const strippedHost = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(strippedHost)) {
    if (isPrivateOrReservedIp(strippedHost)) {
      throw new ArticleFetchError(
        "Akses ke alamat IP privat atau lokal tidak diizinkan.",
        400
      );
    }
    return parsed;
  }

  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(strippedHost, { all: true });
  } catch {
    throw new ArticleFetchError(
      `Domain "${hostname}" tidak ditemukan atau gagal di-resolve.`,
      502
    );
  }

  if (!resolved || resolved.length === 0) {
    throw new ArticleFetchError(`Domain "${hostname}" tidak ditemukan.`, 502);
  }
  for (const record of resolved) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new ArticleFetchError(
        "Domain mengarah ke alamat IP internal yang diblokir.",
        400
      );
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
          throw new ArticleFetchError(`Redirect (${response.status}) tanpa tujuan.`, 502);
        }
        currentUrl = new URL(location, validatedUrl).toString();
        continue;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw new ArticleFetchError(
            `Situs memblokir akses otomatis (HTTP ${response.status}). Beberapa situs berita dengan proteksi bot/paywall tidak mengizinkan pembacaan eksternal.`,
            502
          );
        }
        throw new ArticleFetchError(`Gagal memuat halaman situs (HTTP ${response.status}).`, 502);
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/plain")
      ) {
        throw new ArticleFetchError(
          `URL bukan halaman artikel HTML (Content-Type: ${contentType.split(";")[0]}).`,
          400
        );
      }

      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > ARTICLE_MAX_BYTES) {
        throw new ArticleFetchError("Ukuran halaman web terlalu besar (maksimal 8 MB).", 400);
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
            throw new ArticleFetchError("Ukuran halaman web melebihi batas 8 MB.", 400);
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
      if (err instanceof ArticleFetchError) throw err;
      if (err?.name === "AbortError") {
        throw new ArticleFetchError(
          "Waktu permintaan habis (timeout) saat menghubungi situs.",
          504
        );
      }
      throw new ArticleFetchError(err?.message || "Gagal mengambil halaman situs.", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ArticleFetchError("Terlalu banyak pengalihan URL (redirect).", 502);
}

const AD_AND_CLUTTER_TOKEN_RE =
  /\b(ads?|advert|advertisement|ad-slot|ad-container|ad-wrapper|ad-banner|adsbygoogle|sponsored|promo-box|newsletter|subscribe|cookie-banner|cookie-consent|consent-banner|gdpr|paywall|popup|modal-backdrop|share-buttons|social-share|related-articles|related-posts|taboola|outbrain|mgid|teads|disqus|comment-section|google_ads)\b/i;

const BOILERPLATE_TEXT_RE =
  /^(advertisement|iklan|sponsored content|konten bersponsor|baca juga\s*:?\s*$|lihat juga\s*:?\s*$|scroll untuk melanjutkan|continue reading|loading\.{0,3})$/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripAdsAndTrackersFromDom(doc: any, baseUrl: string): void {
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
  ];

  for (const selector of hardRemoveSelectors) {
    try {
      const matches = Array.from(doc.querySelectorAll(selector)) as any[];
      for (const el of matches) {
        el.remove?.();
      }
    } catch {
      // ignore selector edge cases
    }
  }

  const protectedTags = new Set(["HTML", "BODY", "MAIN", "ARTICLE"]);
  const allElements = Array.from(doc.querySelectorAll("*")) as any[];
  for (const el of allElements) {
    const tag = String(el.tagName || "").toUpperCase();
    if (protectedTags.has(tag)) continue;
    if (!el.parentNode) continue;

    const className = typeof el.className === "string" ? el.className : el.getAttribute?.("class") || "";
    const idAttr = el.id || el.getAttribute?.("id") || "";
    const roleAttr = el.getAttribute?.("role") || "";
    const ariaLabel = el.getAttribute?.("aria-label") || "";
    const hasAdAttr =
      el.hasAttribute?.("data-ad") ||
      el.hasAttribute?.("data-ad-slot") ||
      el.hasAttribute?.("data-ad-client");
    const combined = `${className} ${idAttr} ${roleAttr} ${ariaLabel}`;

    if (hasAdAttr || AD_AND_CLUTTER_TOKEN_RE.test(combined)) {
      if (el.querySelector?.("article")) continue;
      el.remove?.();
      continue;
    }

    const styleAttr = (el.getAttribute?.("style") || "").replace(/\s+/g, "").toLowerCase();
    if (styleAttr.includes("display:none") || styleAttr.includes("visibility:hidden")) {
      el.remove?.();
    }
  }

  const images = Array.from(doc.querySelectorAll("img")) as any[];
  for (const img of images) {
    const candidateSrc =
      img.getAttribute?.("data-src") ||
      img.getAttribute?.("data-lazy-src") ||
      img.getAttribute?.("data-original") ||
      img.getAttribute?.("src") ||
      "";
    const widthAttr = parseInt(img.getAttribute?.("width") || "0", 10);
    const heightAttr = parseInt(img.getAttribute?.("height") || "0", 10);

    if ((widthAttr > 0 && widthAttr <= 3) || (heightAttr > 0 && heightAttr <= 3)) {
      img.remove?.();
      continue;
    }

    if (!candidateSrc || candidateSrc.startsWith("data:")) {
      if (!candidateSrc) img.remove?.();
      continue;
    }

    try {
      const resolved = new URL(candidateSrc, baseUrl).toString();
      if (/^https?:\/\//i.test(resolved)) {
        img.setAttribute?.("src", resolved);
      } else {
        img.remove?.();
      }
    } catch {
      img.remove?.();
    }
  }
}

function extractBlocksFromArticleHtml(
  htmlContent: string,
  baseUrl: string
): CleanArticleBlock[] {
  const { document: fragDoc } = parseHTML(`<!DOCTYPE html><html><body>${htmlContent}</body></html>`);
  const body = fragDoc.body;
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

  const resolveImageSrc = (rawSrc: string): string | null => {
    if (!rawSrc || rawSrc.startsWith("data:")) return null;
    try {
      const resolved = new URL(rawSrc, baseUrl).toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch {
      return null;
    }
  };

  const visitNode = (node: any) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const txt = normalizeWhitespace(node.textContent || "");
      if (txt.length >= 25) {
        pushTextBlock("paragraph", txt);
      }
      return;
    }

    if (node.nodeType !== 1) return;
    const tag = String(node.tagName || "").toUpperCase();

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME") {
      return;
    }

    if (tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4") {
      const lvl = parseInt(tag.slice(1), 10) as 1 | 2 | 3 | 4;
      pushTextBlock("heading", node.textContent || "", lvl);
      return;
    }

    if (tag === "P") {
      const imgs = Array.from(node.querySelectorAll?.("img") || []) as any[];
      for (const img of imgs) {
        const src = resolveImageSrc(img.getAttribute?.("src") || "");
        if (src) {
          blocks.push({
            type: "image",
            src,
            alt: normalizeWhitespace(img.getAttribute?.("alt") || "") || undefined,
          });
        }
      }
      pushTextBlock("paragraph", node.textContent || "");
      return;
    }

    if (tag === "BLOCKQUOTE") {
      pushTextBlock("blockquote", node.textContent || "");
      return;
    }

    if (tag === "UL" || tag === "OL") {
      const childLis = Array.from(node.children || []).filter(
        (child: any) => String(child.tagName || "").toUpperCase() === "LI"
      );
      const items = childLis
        .map((li: any) => normalizeWhitespace(li.textContent || ""))
        .filter((t: string) => t.length > 0 && !BOILERPLATE_TEXT_RE.test(t));
      if (items.length > 0) {
        blocks.push({ type: "list", ordered: tag === "OL", items });
      }
      return;
    }

    if (tag === "IMG") {
      const src = resolveImageSrc(node.getAttribute?.("src") || "");
      if (src) {
        blocks.push({
          type: "image",
          src,
          alt: normalizeWhitespace(node.getAttribute?.("alt") || "") || undefined,
        });
      }
      return;
    }

    if (tag === "PRE") {
      const txt = normalizeWhitespace(node.textContent || "");
      if (txt) pushTextBlock("paragraph", txt);
      return;
    }

    const children = Array.from(node.children || []) as any[];
    const hasBlockChildren = children.some((child) =>
      /^(P|H[1-6]|DIV|SECTION|ARTICLE|BLOCKQUOTE|UL|OL|FIGURE|PRE|IMG)$/i.test(
        String(child.tagName || "")
      )
    );
    if (!hasBlockChildren) {
      const txt = normalizeWhitespace(node.textContent || "");
      if (txt.length >= 12) {
        pushTextBlock("paragraph", txt);
      }
      return;
    }

    for (const child of Array.from(node.childNodes || [])) {
      visitNode(child);
    }
  };

  for (const child of Array.from(body?.childNodes || [])) {
    visitNode(child);
  }

  return blocks;
}

async function extractCleanArticleSelfContained(rawUrl: string) {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    throw new ArticleFetchError("URL artikel wajib diisi.", 400);
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const { html, finalUrl } = await fetchHtmlWithSafeRedirects(normalizedUrl);

  const { document: doc } = parseHTML(html);
  try {
    Object.defineProperty(doc, "baseURI", { value: finalUrl, configurable: true });
  } catch {
    // ignore if readonly
  }

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

  if (typeof ReadabilityCtor !== "function") {
    throw new ArticleFetchError("Parser artikel gagal dimuat di server.", 500);
  }

  const reader = new ReadabilityCtor(doc as unknown as Document, {
    charThreshold: 120,
    keepClasses: false,
  });
  const parsed = reader.parse();

  let blocks: CleanArticleBlock[] = [];
  if (parsed?.content) {
    blocks = extractBlocksFromArticleHtml(parsed.content, finalUrl);
  }

  if (blocks.length === 0) {
    const fallbackRoot = doc.querySelector("article") || doc.querySelector("main") || doc.body;
    if (fallbackRoot) {
      blocks = extractBlocksFromArticleHtml(fallbackRoot.innerHTML || "", finalUrl);
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
    throw new ArticleFetchError(
      "Tidak ditemukan konten artikel yang memadai pada halaman ini, atau situs memerlukan JavaScript/login untuk menampilkan artikel.",
      422
    );
  }

  const words = plainText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));
  const finalParsedUrl = new URL(finalUrl);

  return {
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
  };
}

async function readJsonBody(req: VercelApiRequest): Promise<any> {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res: VercelApiResponse, statusCode: number, payload: unknown): void {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed. Gunakan POST." });
    return;
  }

  try {
    const body = await readJsonBody(req).catch(() => ({}));
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

    const article = await extractCleanArticleSelfContained(rawUrl);
    sendJson(res, 200, { ok: true, article });
  } catch (error: any) {
    const statusCode = error instanceof ArticleFetchError ? error.statusCode : 502;
    sendJson(res, statusCode, {
      ok: false,
      error: error?.message || "Gagal mengambil dan membersihkan artikel situs.",
    });
  }
}
