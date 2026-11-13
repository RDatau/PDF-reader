/**
 * API configuration and utility helpers for VOXReader.
 * Handles desktop Electron environment (file:// protocol) as well as web environment.
 */

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // When running inside Electron with file:// or without host, route to local Express server
    if (window.location.protocol === "file:" || !window.location.host) {
      return "http://localhost:3000";
    }
  }
  return "";
}

export function getWsBaseUrl(): string {
  if (typeof window !== "undefined") {
    if (window.location.protocol === "file:" || !window.location.host) {
      return "ws://localhost:3000";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }
  return "ws://localhost:3000";
}

/**
 * Cleans a single API key token by removing quotes, accidental whitespace, and separators.
 */
export function cleanSingleApiKeyToken(key: string | undefined | null): string {
  if (!key || typeof key !== "string") return "";
  return key
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^GEMINI_API_KEY\s*=\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

/**
 * Parses one or multiple API keys separated by newlines (or commas/semicolons),
 * deduplicating while preserving order.
 */
export function parseApiKeys(rawKeys: string | undefined | null): string[] {
  if (!rawKeys || typeof rawKeys !== "string") return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawLine of rawKeys.split(/[\r\n,;]+/)) {
    const cleaned = cleanSingleApiKeyToken(rawLine);
    if (!cleaned || cleaned.startsWith("#")) continue;
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * Normalizes multi-line API key text so every valid key is cleanly placed on its own line.
 */
export function normalizeApiKeysText(rawKeys: string | undefined | null): string {
  return parseApiKeys(rawKeys).join("\n");
}

/**
 * Masks an API key for safe visual preview (e.g. "AIzaSy••••9xK2").
 */
export function maskApiKey(key: string): string {
  const clean = cleanSingleApiKeyToken(key);
  if (clean.length <= 10) return "••••••";
  return `${clean.slice(0, 6)}••••${clean.slice(-4)}`;
}

/**
 * Strips quotes, accidental copy-paste symbols, and trims whitespace from a single API key.
 * If multiple newline-separated keys are passed, returns the first valid key.
 */
export function sanitizeApiKey(key: string | undefined | null): string {
  const parsed = parseApiKeys(key);
  return parsed[0] || "";
}
