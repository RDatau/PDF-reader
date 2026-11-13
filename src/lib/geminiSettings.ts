import { GEMINI_VOICE_OPTIONS } from "./geminiModels";
import { parseApiKeys } from "./apiConfig";

export interface GeminiSettings {
  apiKey: string; // custom API key if provided by user; empty string means default server key
  textModel: string;
  ttsModel: string;
  liveModel: string;
  voice: string;
  styleInstruction: string;
}

export const DEFAULT_GEMINI_SETTINGS: GeminiSettings = {
  apiKey: "",
  textModel: "gemini-3.6-flash",
  ttsModel: "gemini-3.8-flash-lite-tts",
  liveModel: "gemini-3.1-flash-live-preview",
  voice: "Fola",
  styleInstruction: "",
};

export interface ModelDropdownOption {
  id: string;
  name: string;
  badge?: string;
  badgeColor?: string;
  description: string;
}

export const TEXT_MODEL_OPTIONS: ModelDropdownOption[] = [
  {
    id: "gemini-3.6-flash",
    name: "gemini-3.6-flash (Rekomendasi)",
    badge: "Terbaru & Cepat",
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    description: "Model multimodal generasi terbaru berkecepatan tinggi dan penalaran mutakhir untuk tanya jawab dokumen.",
  },
  {
    id: "gemini-3.8-flash",
    name: "gemini-3.8-flash",
    badge: "⚡ Super Cepat",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    description: "Model Gemini 3.8 Flash generasi terbaru untuk pemindaian teks instan dan analisis dokumen responsif.",
  },
  {
    id: "gemini-3.1-pro",
    name: "gemini-3.1-pro",
    badge: "🧠 Penalaran Flagship",
    badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    description: "Model reasoning generasi 3.1 untuk tugas-tugas analisis tingkat tinggi dan dokumen teknis kompleks.",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "gemini-3.1-flash-lite",
    badge: "Ringan & Efisien",
    badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    description: "Model sangat ringan dan hemat kuota untuk interaksi tanya jawab cepat.",
  },
];

export const TTS_MODEL_OPTIONS: ModelDropdownOption[] = [
  {
    id: "gemini-3.8-flash-lite-tts",
    name: "gemini-3.8-flash-lite-tts (Default)",
    badge: "⚡ Stream Cepat",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    description: "Model TTS 3.8 Flash Lite berlatensi rendah dengan metode audio streaming langsung untuk membaca dokumen tanpa jeda tunggu.",
  },
  {
    id: "gemini-3.8-flash-tts",
    name: "gemini-3.8-flash-tts",
    badge: "🎙️ Studio Stream",
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    description: "Model TTS flagship Gemini 3.8 Flash untuk kualitas suara studio, artikulasi paling ekspresif, dan streaming progresif.",
  },
];

export const LIVE_MODEL_OPTIONS: ModelDropdownOption[] = [
  {
    id: "gemini-3.1-flash-live-preview",
    name: "gemini-3.1-flash-live-preview (Default)",
    badge: "Live Real-Time",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    description: "Model resmi audio dua arah streaming real-time untuk percakapan interaktif dan interupsi suara.",
  },
  {
    id: "gemini-3.8-flash",
    name: "gemini-3.8-flash",
    badge: "⚡ Low Latency",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    description: "Model respon cepat untuk percakapan audio dua arah generasi terbaru.",
  },
];

export interface VoiceDropdownOption {
  id: string;
  name: string;
  tone: string;
  gender: "female" | "male";
  description: string;
  isNew38?: boolean;
}

export const GLOBAL_VOICE_OPTIONS: VoiceDropdownOption[] = GEMINI_VOICE_OPTIONS.map((v) => ({
  id: v.id,
  name: `${v.name} (${v.tone})`,
  tone: v.tone,
  gender: v.gender,
  description: v.description,
  isNew38: v.isNew38,
}));

const SETTINGS_STORAGE_KEY = "lumina_gemini_settings";

export function loadGeminiSettings(): GeminiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawTtsModel = parsed.ttsModel;
      const normalizedTtsModel =
        rawTtsModel === "gemini-3.8-flash-tts" || rawTtsModel === "gemini-3.8-flash"
          ? "gemini-3.8-flash-tts"
          : "gemini-3.8-flash-lite-tts";
      return {
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        textModel: parsed.textModel || DEFAULT_GEMINI_SETTINGS.textModel,
        ttsModel: normalizedTtsModel,
        liveModel: parsed.liveModel || DEFAULT_GEMINI_SETTINGS.liveModel,
        voice: parsed.voice || DEFAULT_GEMINI_SETTINGS.voice,
        styleInstruction: typeof parsed.styleInstruction === "string" ? parsed.styleInstruction : "",
      };
    }
  } catch (e) {
    console.warn("Could not load gemini settings:", e);
  }
  return { ...DEFAULT_GEMINI_SETTINGS };
}

export function saveGeminiSettings(settings: GeminiSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    // Also dispatch custom event for instant cross-component updates
    window.dispatchEvent(
      new CustomEvent("gemini-settings-updated", { detail: settings })
    );
  } catch (e) {
    console.warn("Could not save gemini settings:", e);
  }
}

const KEY_ROTATION_INDEX_STORAGE = "lumina_gemini_key_rotation_index";
const apiKeyCooldowns = new Map<string, number>();

export function getCustomApiKeys(rawOverride?: string): string[] {
  if (typeof rawOverride === "string") {
    return parseApiKeys(rawOverride);
  }
  const s = loadGeminiSettings();
  return parseApiKeys(s.apiKey);
}

export function getRotationIndex(total = 1): number {
  if (total <= 0) return 0;
  try {
    const raw = localStorage.getItem(KEY_ROTATION_INDEX_STORAGE);
    const parsed = raw ? parseInt(raw, 10) : 0;
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed % total;
    }
  } catch {
    // ignore storage errors
  }
  return 0;
}

export function setRotationIndex(nextIndex: number): void {
  try {
    localStorage.setItem(KEY_ROTATION_INDEX_STORAGE, String(Math.max(0, nextIndex)));
  } catch {
    // ignore storage errors
  }
}

export function markApiKeyCooldown(key: string, durationMs = 60_000): void {
  if (!key) return;
  apiKeyCooldowns.set(key, Date.now() + durationMs);
}

export function clearApiKeyCooldowns(): void {
  apiKeyCooldowns.clear();
}

export function isApiKeyInCooldown(key: string): boolean {
  const until = apiKeyCooldowns.get(key);
  if (!until) return false;
  if (Date.now() >= until) {
    apiKeyCooldowns.delete(key);
    return false;
  }
  return true;
}

export function isAqExpressKey(key: string): boolean {
  return typeof key === "string" && key.trim().startsWith("AQ.");
}

/**
 * Returns all custom keys ordered starting from the round-robin cursor,
 * placing healthy (non-cooled-down) keys first and cooled-down keys last,
 * and advances the round-robin pointer for the next request.
 */
export function getOrderedRotatedKeys(rawOverride?: string): {
  keys: string[];
  startIndex: number;
  total: number;
} {
  const allKeys = getCustomApiKeys(rawOverride);
  if (allKeys.length === 0) {
    return { keys: [], startIndex: -1, total: 0 };
  }

  const startIdx = getRotationIndex(allKeys.length);
  const healthy: string[] = [];
  const cooling: string[] = [];

  for (let offset = 0; offset < allKeys.length; offset++) {
    const idx = (startIdx + offset) % allKeys.length;
    const candidate = allKeys[idx];
    if (isApiKeyInCooldown(candidate)) {
      cooling.push(candidate);
    } else {
      healthy.push(candidate);
    }
  }

  const ordered = [...healthy, ...cooling];
  const firstActualIdx = allKeys.indexOf(ordered[0]);
  const chosenIdx = firstActualIdx >= 0 ? firstActualIdx : startIdx;
  setRotationIndex((chosenIdx + 1) % allKeys.length);

  return {
    keys: ordered,
    startIndex: chosenIdx,
    total: allKeys.length,
  };
}

/**
 * Returns the next available API key in round-robin rotation order,
 * skipping keys currently in cooldown when healthy keys exist, and advances the pointer.
 */
export function getNextRotatedApiKey(rawOverride?: string): {
  key: string;
  index: number;
  total: number;
} {
  const { keys, startIndex, total } = getOrderedRotatedKeys(rawOverride);
  if (keys.length === 0) {
    return { key: "", index: -1, total: 0 };
  }
  return {
    key: keys[0],
    index: startIndex,
    total,
  };
}

export function getCustomApiKey(): string {
  return getNextRotatedApiKey().key;
}

export function getGeminiHeaders(
  baseHeaders: Record<string, string> = {}
): Record<string, string> {
  const key = getCustomApiKey();
  if (key) {
    return {
      ...baseHeaders,
      "x-gemini-api-key": key,
    };
  }
  return baseHeaders;
}
