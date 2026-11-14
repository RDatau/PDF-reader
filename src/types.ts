export type ReadingTheme = "light" | "night" | "sepia" | "midnight";

export type FontFamilyId = "sans" | "serif" | "literata" | "mono" | "dyslexic";
export type ReaderViewMode = "canvas" | "text";

export interface AppearanceSettings {
  mode: "dark" | "light";
  darkBgId: string;
  darkBgColor: string;
  lightBgId: string;
  lightBgColor: string;
  textTone: string;
  slideGesturesEnabled: boolean;
  mobileFitWidth: boolean;
  // Font & Typography settings
  fontSize: number; // in px, e.g. 18 (range 12 - 32)
  fontFamily: FontFamilyId;
  lineHeight: number; // e.g. 1.6 (range 1.3 - 2.2)
  viewMode: ReaderViewMode; // 'canvas' (Page view) or 'text' (Reflow typography reader view)
  invertPdfInDarkMode?: boolean; // Invert PDF canvas to dark in dark mode
}

export type TtsEngine = "gemini" | "webspeech";

export interface TtsFilterSettings {
  skipHeadersFooters: boolean;
  skipChapterHeadings: boolean;
  customIgnoredLines: string[];
}

export type GeminiTtsModelId =
  | "gemini-3.8-flash-lite-tts"
  | "gemini-3.8-flash-tts";

export interface GeminiTtsModelOption {
  id: GeminiTtsModelId;
  name: string;
  shortLabel: string;
  badge: string;
  badgeColor: string;
  description: string;
  latency: "low" | "ultra-low" | "standard";
  isLiveSupported?: boolean;
}

export interface StoredDocument {
  id: string;
  name: string;
  size: number;
  totalPages: number;
  lastPage: number;
  lastZoom: number;
  lastReadAt: number;
  data: ArrayBuffer;
  bookmarks: number[];
}

export interface StoredTtsAudio {
  id: string;
  title: string;
  docId: string;
  docTitle: string;
  pageNumber: number;
  partNumber: number;
  totalParts: number;
  textExcerpt: string;
  voice: string;
  model: string;
  durationSeconds: number;
  sizeBytes: number;
  mimeType: string;
  audioData: ArrayBuffer;
  createdAt: number;
  isMergedPage?: boolean;
  mergedBy?: "python" | "local";
}

export type StoredTtsAudioMeta = Omit<StoredTtsAudio, "audioData">;

export type ArticleBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "image"; src: string; alt?: string };

export interface StoredArticle {
  id: string;
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
  lastPage: number;
  bookmarks: number[];
  savedAt: number;
  lastReadAt: number;
}

export type StoredArticleMeta = Omit<StoredArticle, "blocks" | "plainText">;

export interface SearchMatch {
  pageNumber: number;
  matchIndex: number;
  text: string;
}

export interface OutlineItem {
  title: string;
  pageNumber?: number;
  dest?: any;
  items?: OutlineItem[];
}

export interface LiveVoiceMessage {
  sender: "user" | "gemini";
  text: string;
  timestamp: number;
}

export type AiModelId = "gemini-3.6-flash" | "gemini-3.1-flash" | "gemini-3.1-pro";

export interface ChatNode {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  model?: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  openPdfDialog: () => Promise<{ name: string; path: string; data: ArrayBuffer } | null>;
  savePdfDialog: (
    defaultName: string,
    arrayBuffer: ArrayBuffer
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onWindowStateChanged: (callback: (state: { isMaximized: boolean }) => void) => () => void;
  onOpenFile: (
    callback: (payload: { name: string; path?: string; data: ArrayBuffer }) => void
  ) => () => void;
  onMenuTrigger: (channel: string, callback: () => void) => () => void;
  fetchCleanArticle?: (
    url: string
  ) => Promise<{ ok: boolean; article?: any; error?: string; status?: number }>;
  openExternal: (url: string) => void;
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
