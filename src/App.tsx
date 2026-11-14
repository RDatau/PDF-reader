import React, { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { PdfViewer } from "./components/PdfViewer";
import { ThumbnailsSidebar } from "./components/ThumbnailsSidebar";
import { OutlineSidebar } from "./components/OutlineSidebar";
import { SearchPanel } from "./components/SearchPanel";
import { LiveVoiceModal } from "./components/LiveVoiceModal";
import { AiAssistantPanel } from "./components/AiAssistantPanel";
import { DocumentLibraryModal } from "./components/DocumentLibraryModal";
import { AppearanceModal } from "./components/AppearanceModal";
import { TtsSettingsModal } from "./components/TtsSettingsModal";
import { TtsLibraryModal } from "./components/TtsLibraryModal";
import { GeminiSettingsModal } from "./components/GeminiSettingsModal";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { WebArticleModal } from "./components/WebArticleModal";
import { ArticleReaderView } from "./components/ArticleReaderView";
import {
  ReadingTheme,
  StoredDocument,
  TtsEngine,
  AppearanceSettings,
  GeminiTtsModelId,
  TtsFilterSettings,
  StoredTtsAudioMeta,
  StoredArticle,
  StoredArticleMeta,
} from "./types";
import {
  saveDocument,
  getAllDocuments,
  getDocumentById,
  deleteDocument,
  updateProgress,
} from "./lib/pdfStorage";
import {
  cleanPdfDisplayTitle,
  cleanupStalePageParts,
  formatMergedPageTtsTitle,
  formatTtsClipTitle,
  getAllTtsClipsMeta,
  mergePageWavClips,
  saveTtsClip,
} from "./lib/ttsAudioStorage";
import {
  deleteArticle,
  getAllArticles,
  paginateArticleBlocks,
  updateArticleProgress,
} from "./lib/articleStorage";
import { generateSamplePdfArrayBuffer } from "./lib/samplePdf";
import {
  OfflineSpeechPlayer,
  StreamingTtsPlayer,
  decodeBase64PcmChunk,
  pcmChunksToWavBuffer,
} from "./lib/audioUtils";
import { WindowsTitlebar } from "./components/WindowsTitlebar";
import { loadGeminiSettings, saveGeminiSettings } from "./lib/geminiSettings";
import { normalizeGeminiTtsModel } from "./lib/geminiModels";
import { streamGeminiTtsAudio } from "./lib/geminiApiBridge";
import { configurePdfJsWorker, openPdfDocument } from "./lib/pdfjsConfig";
import { X } from "lucide-react";

configurePdfJsWorker();

function toCleanArrayBuffer(rawData: unknown): ArrayBuffer | null {
  if (!rawData) return null;
  try {
    if (rawData instanceof ArrayBuffer) {
      return rawData.byteLength > 0 ? rawData.slice(0) : null;
    }
    if (typeof SharedArrayBuffer !== "undefined" && rawData instanceof SharedArrayBuffer) {
      return rawData.byteLength > 0 ? new Uint8Array(rawData).slice().buffer : null;
    }
    if (ArrayBuffer.isView(rawData)) {
      if (rawData.byteLength === 0) return null;
      return new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength).slice().buffer;
    }
    const obj = rawData as any;
    if (obj?.type === "Buffer" && Array.isArray(obj.data)) {
      return obj.data.length > 0 ? new Uint8Array(obj.data).buffer : null;
    }
    if (typeof obj?.byteLength === "number" && obj.byteLength > 0) {
      return new Uint8Array(obj).slice().buffer;
    }
  } catch (err) {
    console.warn("Failed to normalize PDF buffer:", err);
  }
  return null;
}

export default function App() {
  const [isGeminiSettingsOpen, setIsGeminiSettingsOpen] = useState<boolean>(false);
  // Theme & Comfort settings (Default to night mode for comfortable reading)
  const [theme, setTheme] = useState<ReadingTheme>(() => {
    return (localStorage.getItem("lumina_theme") as ReadingTheme) || "night";
  });
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    const defaultSettings: AppearanceSettings = {
      mode: "dark",
      darkBgId: "charcoal",
      darkBgColor: "#18181b",
      lightBgId: "cream",
      lightBgColor: "#fcfaf4",
      textTone: "default",
      slideGesturesEnabled: true,
      mobileFitWidth: true,
      fontSize: 18,
      fontFamily: "sans",
      lineHeight: 1.6,
      viewMode: "canvas",
      invertPdfInDarkMode: true,
    };
    try {
      const saved = localStorage.getItem("vox_appearance");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed };
      }
    } catch (e) {}
    return defaultSettings;
  });
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [dimmerLevel, setDimmerLevel] = useState<number>(() => {
    const saved = localStorage.getItem("lumina_dimmer");
    return saved ? parseFloat(saved) : 0;
  });

  // Document & Web Article state
  const [readerSource, setReaderSource] = useState<"pdf" | "article">("pdf");
  const [activeArticle, setActiveArticle] = useState<StoredArticle | null>(null);
  const [savedArticlesList, setSavedArticlesList] = useState<StoredArticleMeta[]>([]);
  const [isWebArticleModalOpen, setIsWebArticleModalOpen] = useState<boolean>(false);
  const activePdfMetaRef = useRef<{
    id: string;
    name: string;
    lastPage: number;
    totalPages: number;
    bookmarks: number[];
  }>({
    id: "sample-doc-1",
    name: "The Art of Deep Reading.pdf",
    lastPage: 1,
    totalPages: 4,
    bookmarks: [],
  });

  const [currentDocId, setCurrentDocId] = useState<string>("sample-doc-1");
  const [currentDocName, setCurrentDocName] = useState<string>("The Art of Deep Reading.pdf");
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isDocLoading, setIsDocLoading] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(4);
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [pageText, setPageText] = useState<string>("");
  const [ttsPageText, setTtsPageText] = useState<string>("");
  const [filteredTtsHeaders, setFilteredTtsHeaders] = useState<string[]>([]);

  // Library state
  const [documentsList, setDocumentsList] = useState<Omit<StoredDocument, "data">[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Panels & Modals
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);

  // Read Aloud / TTS state
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>(() => {
    return (localStorage.getItem("lumina_tts_engine") as TtsEngine) || "gemini";
  });
  const [geminiTtsModel, setGeminiTtsModel] = useState<GeminiTtsModelId>(() => {
    const stored = localStorage.getItem("lumina_gemini_tts_model") || loadGeminiSettings().ttsModel;
    return normalizeGeminiTtsModel(stored);
  });
  const [isTtsSettingsOpen, setIsTtsSettingsOpen] = useState<boolean>(false);
  const [isTtsLibraryOpen, setIsTtsLibraryOpen] = useState<boolean>(false);
  const [ttsClipsList, setTtsClipsList] = useState<StoredTtsAudioMeta[]>([]);
  const [geminiQuotaReached, setGeminiQuotaReached] = useState<boolean>(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [geminiVoice, setGeminiVoice] = useState<string>(() => loadGeminiSettings().voice || "Fola");
  const [styleInstruction, setStyleInstruction] = useState<string>(
    () => loadGeminiSettings().styleInstruction || ""
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [ttsFilterSettings, setTtsFilterSettings] = useState<TtsFilterSettings>(() => {
    const defaults: TtsFilterSettings = {
      skipHeadersFooters: true,
      skipChapterHeadings: false,
      customIgnoredLines: [],
    };
    try {
      const saved = localStorage.getItem("vox_tts_filter_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          skipHeadersFooters:
            typeof parsed.skipHeadersFooters === "boolean" ? parsed.skipHeadersFooters : true,
          skipChapterHeadings:
            typeof parsed.skipChapterHeadings === "boolean" ? parsed.skipChapterHeadings : false,
          customIgnoredLines: Array.isArray(parsed.customIgnoredLines)
            ? parsed.customIgnoredLines.filter((s: unknown) => typeof s === "string")
            : [],
        };
      }
    } catch {}
    return defaults;
  });
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [activeReadingSentence, setActiveReadingSentence] = useState<string | undefined>(undefined);
  const [selectedSnippet, setSelectedSnippet] = useState<string>("");

  const handleTtsFilterSettingsChange = (next: TtsFilterSettings) => {
    setTtsFilterSettings(next);
    try {
      localStorage.setItem("vox_tts_filter_settings", JSON.stringify(next));
    } catch {}
  };

  const handleGeminiModelChange = (model: GeminiTtsModelId) => {
    const normalized = normalizeGeminiTtsModel(model);
    setGeminiTtsModel(normalized);
    localStorage.setItem("lumina_gemini_tts_model", normalized);
    const current = loadGeminiSettings();
    if (current.ttsModel !== normalized) {
      saveGeminiSettings({ ...current, ttsModel: normalized });
    }
  };

  const handleGeminiVoiceChange = (voice: string) => {
    setGeminiVoice(voice);
    const current = loadGeminiSettings();
    if (current.voice !== voice) {
      saveGeminiSettings({ ...current, voice });
    }
  };

  const handleStyleInstructionChange = (style: string) => {
    setStyleInstruction(style);
    const current = loadGeminiSettings();
    if (current.styleInstruction !== style) {
      saveGeminiSettings({ ...current, styleInstruction: style });
    }
  };

  // Sync TTS model, voice & styleInstruction when updated via GeminiSettingsModal
  useEffect(() => {
    const onSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.ttsModel) {
        const normalized = normalizeGeminiTtsModel(detail.ttsModel);
        setGeminiTtsModel(normalized);
        localStorage.setItem("lumina_gemini_tts_model", normalized);
      }
      if (detail?.voice) {
        setGeminiVoice(detail.voice);
      }
      if (typeof detail?.styleInstruction === "string") {
        setStyleInstruction(detail.styleInstruction);
      }
      setGeminiQuotaReached(false);
      setTtsError(null);
    };
    window.addEventListener("gemini-settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("gemini-settings-updated", onSettingsUpdated);
  }, []);

  // Audio References
  const offlinePlayerRef = useRef<OfflineSpeechPlayer>(new OfflineSpeechPlayer());
  const streamingPlayerRef = useRef<StreamingTtsPlayer>(new StreamingTtsPlayer(24000));
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const karaokeTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save theme, appearance & dimmer to localStorage
  const handleAppearanceChange = (newSettings: AppearanceSettings) => {
    setAppearance(newSettings);
    localStorage.setItem("vox_appearance", JSON.stringify(newSettings));
    setTheme(newSettings.mode === "dark" ? "night" : "light");
  };

  const handleThemeChange = (newTheme: ReadingTheme) => {
    setTheme(newTheme);
    localStorage.setItem("lumina_theme", newTheme);
    const newMode = newTheme === "night" || newTheme === "midnight" ? "dark" : "light";
    setAppearance((prev) => {
      const updated: AppearanceSettings = { ...prev, mode: newMode };
      localStorage.setItem("vox_appearance", JSON.stringify(updated));
      return updated;
    });
  };

  const handleDimmerChange = (level: number) => {
    setDimmerLevel(level);
    localStorage.setItem("lumina_dimmer", level.toString());
  };

  const refreshTtsClipsList = async () => {
    try {
      const clips = await getAllTtsClipsMeta();
      setTtsClipsList(clips);
    } catch (err) {
      console.warn("Failed to load TTS clips:", err);
    }
  };

  const refreshArticlesList = async () => {
    try {
      const articles = await getAllArticles();
      setSavedArticlesList(articles);
    } catch (err) {
      console.warn("Failed to load saved web articles:", err);
    }
  };

  // Load Library & Initial Document on Mount
  useEffect(() => {
    let isCancelled = false;
    async function init() {
      try {
        getAllTtsClipsMeta()
          .then((clips) => {
            if (!isCancelled) setTtsClipsList(clips);
          })
          .catch(() => {});

        getAllArticles()
          .then((articles) => {
            if (!isCancelled) setSavedArticlesList(articles);
          })
          .catch(() => {});

        const list = await getAllDocuments();
        if (isCancelled) return;
        setDocumentsList(list);

        if (list.length > 0) {
          // Load most recent document
          const mostRecent = list[0];
          const fullDoc = await getDocumentById(mostRecent.id);
          if (isCancelled) return;
          if (fullDoc && fullDoc.data) {
            const normalizedBuffer = toCleanArrayBuffer(fullDoc.data);
            if (normalizedBuffer && normalizedBuffer.byteLength > 0) {
              activePdfMetaRef.current = {
                id: fullDoc.id,
                name: fullDoc.name,
                lastPage: fullDoc.lastPage || 1,
                totalPages: fullDoc.totalPages || 1,
                bookmarks: fullDoc.bookmarks || [],
              };
              setReaderSource("pdf");
              setCurrentDocId(fullDoc.id);
              setCurrentDocName(fullDoc.name);
              setPdfData(normalizedBuffer);
              setCurrentPage(fullDoc.lastPage || 1);
              setZoom(fullDoc.lastZoom || 1.0);
              setBookmarks(fullDoc.bookmarks || []);
              return;
            }
          }
        }

        // Otherwise initialize with clean sample PDF
        if (!isCancelled) {
          loadSampleDocument();
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Failed to load initial documents:", err);
          loadSampleDocument();
        }
      }
    }
    init();
    return () => {
      isCancelled = true;
    };
  }, []);

  const loadSampleDocument = async () => {
    const sampleBuffer = generateSamplePdfArrayBuffer();
    const sampleDoc: StoredDocument = {
      id: "sample-doc-1",
      name: "The Art of Deep Reading & Night Study.pdf",
      size: sampleBuffer.byteLength,
      totalPages: 4,
      lastPage: 1,
      lastZoom: 1.0,
      lastReadAt: Date.now(),
      data: sampleBuffer.slice(0),
      bookmarks: [1],
    };

    try {
      await saveDocument(sampleDoc);
      const list = await getAllDocuments();
      setDocumentsList(list);
    } catch (e) {
      console.warn("Could not save sample doc into IndexedDB:", e);
    }

    activePdfMetaRef.current = {
      id: sampleDoc.id,
      name: sampleDoc.name,
      lastPage: 1,
      totalPages: 4,
      bookmarks: [1],
    };
    setReaderSource("pdf");
    setCurrentDocId(sampleDoc.id);
    setCurrentDocName(sampleDoc.name);
    setPdfData(sampleBuffer.slice(0));
    setCurrentPage(1);
    setZoom(1.0);
    setBookmarks([1]);
  };

  // Safe Central PDF.js Document Loader
  // Slices the buffer to guarantee worker transfer cannot detach the original state ArrayBuffer
  useEffect(() => {
    if (!pdfData) {
      setPdfDoc(null);
      setIsDocLoading(false);
      setDocError(null);
      return;
    }

    if (pdfData.byteLength === 0) {
      console.warn("Skipping load of 0-byte or detached ArrayBuffer");
      return;
    }

    let isCancelled = false;
    setIsDocLoading(true);
    setDocError(null);

    const loadHandle = openPdfDocument(pdfData);

    loadHandle.promise
      .then((doc) => {
        if (isCancelled) {
          (doc as any).destroy?.().catch(() => {});
          return;
        }
        setPdfDoc(doc);
        activePdfMetaRef.current.totalPages = doc.numPages;
        setTotalPages((prev) => (readerSource === "pdf" ? doc.numPages : prev));
        setIsDocLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("PDF loading error:", err);
        const detail = err?.message ? ` (${err.message})` : "";
        setDocError(
          `Gagal membuka dokumen PDF. File mungkin rusak atau terproteksi kata sandi.${detail}`
        );
        setIsDocLoading(false);
      });

    return () => {
      isCancelled = true;
      loadHandle.cancel();
    };
  }, [pdfData]);

  // Persist reading progress (PDF vs Web Article separately)
  useEffect(() => {
    if (readerSource === "article") {
      if (activeArticle) {
        updateArticleProgress(activeArticle.id, currentPage, bookmarks)
          .then(() => {
            void refreshArticlesList();
          })
          .catch(() => {});
      }
      return;
    }

    if (currentDocId && pdfData && pdfData.byteLength > 0) {
      activePdfMetaRef.current = {
        ...activePdfMetaRef.current,
        id: currentDocId,
        name: currentDocName,
        lastPage: currentPage,
        bookmarks,
      };
      updateProgress(currentDocId, currentPage, zoom, bookmarks).catch(() => {});
    }
  }, [readerSource, activeArticle, currentDocId, currentDocName, currentPage, zoom, bookmarks, pdfData]);

  // Central PDF buffer loader
  const loadPdfBuffer = async (name: string, rawBuffer: ArrayBuffer | Uint8Array | unknown) => {
    const cleanBuffer = toCleanArrayBuffer(rawBuffer);
    if (!cleanBuffer || cleanBuffer.byteLength === 0) {
      setDocError("File PDF kosong atau gagal dibaca dari perangkat.");
      return;
    }

    const newId = "doc_" + Date.now();
    const newDoc: StoredDocument = {
      id: newId,
      name: name || "Document.pdf",
      size: cleanBuffer.byteLength,
      totalPages: 1,
      lastPage: 1,
      lastZoom: 1.0,
      lastReadAt: Date.now(),
      data: cleanBuffer.slice(0),
      bookmarks: [],
    };

    try {
      await saveDocument(newDoc);
      const list = await getAllDocuments();
      setDocumentsList(list);
    } catch (err) {
      console.warn("Error caching document offline:", err);
    }

    // Stop any current reading
    handleStopSpeaking();

    activePdfMetaRef.current = {
      id: newDoc.id,
      name: newDoc.name,
      lastPage: 1,
      totalPages: 1,
      bookmarks: [],
    };
    setReaderSource("pdf");
    setCurrentDocId(newDoc.id);
    setCurrentDocName(newDoc.name);
    setPdfData(cleanBuffer.slice(0));
    setCurrentPage(1);
    setZoom(1.0);
    setBookmarks([]);
  };

  // Open PDF handler: uses native Windows file picker if in Electron, or file input in browser
  const handleOpenPdf = async () => {
    if (typeof window !== "undefined" && window.electronAPI?.openPdfDialog) {
      try {
        const result = await window.electronAPI.openPdfDialog();
        if (result && result.data) {
          await loadPdfBuffer(result.name, result.data);
          return;
        }
      } catch (err) {
        console.warn("Native file open error:", err);
      }
    }
    fileInputRef.current?.click();
  };

  // Handle local PDF upload from file input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer || buffer.byteLength === 0) return;
      await loadPdfBuffer(file.name, buffer);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Electron IPC Listeners & Windows Menu triggers
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      // When double clicking a PDF in Windows explorer
      const unsubOpenFile = window.electronAPI.onOpenFile((payload) => {
        if (payload && payload.data) {
          loadPdfBuffer(payload.name, payload.data);
        }
      });

      const unsubSave = window.electronAPI.onMenuTrigger("menu:trigger-save", async () => {
        if (pdfData && window.electronAPI?.savePdfDialog) {
          await window.electronAPI.savePdfDialog(currentDocName, pdfData);
        }
      });

      const unsubZoomIn = window.electronAPI.onMenuTrigger("menu:zoom-in", () => {
        setZoom((prev) => Math.min(prev + 0.2, 3.0));
      });

      const unsubZoomOut = window.electronAPI.onMenuTrigger("menu:zoom-out", () => {
        setZoom((prev) => Math.max(prev - 0.2, 0.5));
      });

      const unsubZoomReset = window.electronAPI.onMenuTrigger("menu:zoom-reset", () => {
        setZoom(1.0);
      });

      const unsubNextPage = window.electronAPI.onMenuTrigger("menu:next-page", () => {
        setCurrentPage((prev) => Math.min(prev + 1, totalPages));
      });

      const unsubPrevPage = window.electronAPI.onMenuTrigger("menu:prev-page", () => {
        setCurrentPage((prev) => Math.max(prev - 1, 1));
      });

      const unsubFirstPage = window.electronAPI.onMenuTrigger("menu:first-page", () => {
        setCurrentPage(1);
      });

      const unsubLastPage = window.electronAPI.onMenuTrigger("menu:last-page", () => {
        setCurrentPage(totalPages);
      });

      const unsubLiveVoice = window.electronAPI.onMenuTrigger("menu:open-live-voice", () => {
        setIsLiveVoiceOpen(true);
      });

      const unsubAiChat = window.electronAPI.onMenuTrigger("menu:open-ai-chat", () => {
        setIsAiChatOpen(true);
      });

      const unsubGeminiSettings = window.electronAPI.onMenuTrigger("menu:open-gemini-settings", () => {
        setIsGeminiSettingsOpen(true);
      });

      return () => {
        unsubOpenFile();
        unsubSave();
        unsubZoomIn();
        unsubZoomOut();
        unsubZoomReset();
        unsubNextPage();
        unsubPrevPage();
        unsubFirstPage();
        unsubLastPage();
        unsubLiveVoice();
        unsubAiChat();
        unsubGeminiSettings();
      };
    }
  }, [pdfData, currentDocName, totalPages]);

  // Windows Desktop Keyboard Shortcuts (Ctrl+O, Ctrl+S, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+O: Open PDF
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenPdf();
      }
      // Ctrl+S: Save PDF copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (pdfData) {
          if (window.electronAPI?.savePdfDialog) {
            window.electronAPI.savePdfDialog(currentDocName, pdfData);
          } else {
            const blob = new Blob([pdfData], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = currentDocName || "VOXReader_Document.pdf";
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pdfData, currentDocName]);

  const handleSelectDocumentFromLibrary = async (id: string) => {
    handleStopSpeaking();
    const doc = await getDocumentById(id);
    if (doc && doc.data && doc.data.byteLength > 0) {
      activePdfMetaRef.current = {
        id: doc.id,
        name: doc.name,
        lastPage: doc.lastPage || 1,
        totalPages: doc.totalPages || 1,
        bookmarks: doc.bookmarks || [],
      };
      setReaderSource("pdf");
      setCurrentDocId(doc.id);
      setCurrentDocName(doc.name);
      setPdfData(doc.data.slice(0));
      setCurrentPage(doc.lastPage || 1);
      setZoom(doc.lastZoom || 1.0);
      setBookmarks(doc.bookmarks || []);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    await deleteDocument(id);
    const list = await getAllDocuments();
    setDocumentsList(list);
    if (activePdfMetaRef.current.id === id || currentDocId === id) {
      if (list.length > 0) {
        handleSelectDocumentFromLibrary(list[0].id);
      } else {
        loadSampleDocument();
      }
    }
  };

  const handleOpenArticle = (article: StoredArticle) => {
    handleStopSpeaking();
    setShowThumbnails(false);
    setShowOutline(false);
    setShowSearch(false);
    setSelectedSnippet("");

    const articlePages = paginateArticleBlocks(article.blocks);
    const safePage = Math.max(1, Math.min(articlePages.length, article.lastPage || 1));

    setActiveArticle(article);
    setReaderSource("article");
    setCurrentDocId(article.id);
    setCurrentDocName(article.title);
    setTotalPages(articlePages.length);
    setCurrentPage(safePage);
    setBookmarks(article.bookmarks || []);
    void refreshArticlesList();
  };

  const handleSwitchBackToPdf = () => {
    handleStopSpeaking();
    setSelectedSnippet("");
    setReaderSource("pdf");

    const meta = activePdfMetaRef.current;
    const restoredTotal = pdfDoc?.numPages || meta.totalPages || 1;
    setCurrentDocId(meta.id);
    setCurrentDocName(meta.name);
    setTotalPages(restoredTotal);
    setCurrentPage(Math.max(1, Math.min(restoredTotal, meta.lastPage || 1)));
    setBookmarks(meta.bookmarks || []);
  };

  const handleDeleteArticle = async (id: string) => {
    await deleteArticle(id);
    await refreshArticlesList();
    if (readerSource === "article" && activeArticle?.id === id) {
      setActiveArticle(null);
      handleSwitchBackToPdf();
    }
  };

  // Bookmark toggle
  const handleToggleBookmark = () => {
    setBookmarks((prev) => {
      if (prev.includes(currentPage)) {
        return prev.filter((p) => p !== currentPage);
      } else {
        return [...prev, currentPage].sort((a, b) => a - b);
      }
    });
  };

  // Zoom handlers
  const handleFitWidth = () => {
    const container = document.getElementById("pdf-viewport-container");
    if (container) {
      const containerWidth = container.clientWidth - 48;
      // standard PDF page width is ~595pt
      const calculatedZoom = Math.min(2.5, Math.max(0.6, containerWidth / 620));
      setZoom(parseFloat(calculatedZoom.toFixed(2)));
    }
  };

  const handleFitPage = () => {
    const container = document.getElementById("pdf-viewport-container");
    if (container) {
      const containerHeight = container.clientHeight - 64;
      const calculatedZoom = Math.min(2.0, Math.max(0.5, containerHeight / 860));
      setZoom(parseFloat(calculatedZoom.toFixed(2)));
    }
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Text-To-Speech / Real-Time Stream Read Aloud Logic
  const handleStopSpeaking = () => {
    if (karaokeTimerRef.current !== null) {
      window.clearInterval(karaokeTimerRef.current);
      karaokeTimerRef.current = null;
    }
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    streamingPlayerRef.current.stop();
    offlinePlayerRef.current.stop();
    isPausedRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    setActiveReadingSentence(undefined);
  };

  const handlePauseSpeaking = () => {
    isPausedRef.current = true;
    setIsPaused(true);
    if (ttsAbortControllerRef.current || streamingPlayerRef.current.hasActiveAudio()) {
      void streamingPlayerRef.current.pause();
    } else {
      offlinePlayerRef.current.pause();
    }
  };

  const handleResumeSpeaking = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    if (ttsAbortControllerRef.current || streamingPlayerRef.current.hasActiveAudio()) {
      void streamingPlayerRef.current.resume();
    } else {
      offlinePlayerRef.current.resume();
    }
  };

  // Keep streaming player speed synced if changed mid-playback
  useEffect(() => {
    streamingPlayerRef.current.setPlaybackRate(playbackSpeed);
  }, [playbackSpeed]);

  // Split text into sentences / streamable blocks (~650 chars max per stream request)
  const splitIntoStreamBlocks = (text: string): { block: string; highlight: string }[] => {
    const sentences = text
      .replace(/\r\n|\r|\n/g, " ")
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);

    if (sentences.length === 0) return [];

    const blocks: { block: string; highlight: string }[] = [];
    let currentBlock = "";
    let firstSentence = "";

    for (const s of sentences) {
      if (!currentBlock) {
        currentBlock = s;
        firstSentence = s;
      } else if ((currentBlock + " " + s).length <= 650) {
        currentBlock += " " + s;
      } else {
        blocks.push({ block: currentBlock, highlight: firstSentence });
        currentBlock = s;
        firstSentence = s;
      }
    }
    if (currentBlock) {
      blocks.push({ block: currentBlock, highlight: firstSentence });
    }
    return blocks;
  };

  const playTextAloud = async (
    textToRead: string,
    playOptions?: { isSelection?: boolean }
  ) => {
    handleStopSpeaking();
    if (!textToRead.trim()) return;

    const blocks = splitIntoStreamBlocks(textToRead);
    if (blocks.length === 0) return;

    const isSelection = Boolean(playOptions?.isSelection);
    const snapshotDocId = currentDocId;
    const snapshotDocName = currentDocName;
    const snapshotPage = currentPage;
    const selectionBatchTag = Date.now();

    setIsSpeaking(true);
    setIsPaused(false);
    setTtsError(null);
    isPausedRef.current = false;

    // Only use device Web Speech when user explicitly selects the "webspeech" engine
    if (ttsEngine === "webspeech") {
      setActiveReadingSentence(blocks[0].highlight);
      offlinePlayerRef.current.speak(textToRead, {
        rate: playbackSpeed,
        onSentenceChange: (_charIdx, currentSentence) => {
          setActiveReadingSentence(currentSentence);
        },
        onEnd: () => {
          setIsSpeaking(false);
          setActiveReadingSentence(undefined);
          if (autoAdvance && currentPage < totalPages) {
            setCurrentPage((p) => p + 1);
          }
        },
        onError: () => {
          setIsSpeaking(false);
          setActiveReadingSentence(undefined);
        },
      });
      return;
    }

    // Gemini 3.8 Flash / Flash Lite True Streaming TTS Mode (no offline fallback)
    // Audio plays IMMEDIATELY as first PCM chunk arrives — never waits for full generation
    setGeminiQuotaReached(false);
    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;
    const player = streamingPlayerRef.current;
    player.start(playbackSpeed);

    const markers: { startTime: number; highlight: string }[] = [];
    setActiveReadingSentence(blocks[0].highlight);

    karaokeTimerRef.current = window.setInterval(() => {
      if (controller.signal.aborted) return;
      const now = player.getCurrentTime();
      let activeHighlight = markers[0]?.highlight;
      for (const m of markers) {
        if (now >= m.startTime) {
          activeHighlight = m.highlight;
        }
      }
      if (activeHighlight) {
        setActiveReadingSentence(activeHighlight);
      }
    }, 180);

    const pagePartWavBuffers: ArrayBuffer[] = [];
    const pagePartExcerpts: string[] = [];

    try {
      for (let i = 0; i < blocks.length; i++) {
        if (controller.signal.aborted) return;

        // If there is still plenty of audio buffered (> 1.4s), wait cleanly before fetching next block
        while (!controller.signal.aborted && (isPausedRef.current || player.getRemainingSeconds() > 1.4)) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (controller.signal.aborted) return;

        player.beginNewUtterance();
        let recordedMarker = false;
        const pcmChunks: Uint8Array[] = [];
        let isFirstChunkOfBlock = true;

        await streamGeminiTtsAudio({
          text: blocks[i].block,
          voice: geminiVoice,
          model: geminiTtsModel,
          styleInstruction,
          signal: controller.signal,
          onChunk: (pcmBase64) => {
            if (controller.signal.aborted) return;
            try {
              const decoded = decodeBase64PcmChunk(pcmBase64, isFirstChunkOfBlock);
              isFirstChunkOfBlock = false;
              if (decoded.byteLength > 0) {
                pcmChunks.push(decoded);
              }
            } catch {
              isFirstChunkOfBlock = false;
            }
            const scheduled = player.enqueuePcmBase64(pcmBase64);
            if (scheduled && !recordedMarker) {
              recordedMarker = true;
              markers.push({
                startTime: scheduled.startTime,
                highlight: blocks[i].highlight,
              });
            }
          },
        });

        // Persist completed TTS block as WAV in local IndexedDB database
        if (!controller.signal.aborted && pcmChunks.length > 0) {
          try {
            const { wavBuffer, durationSeconds } = pcmChunksToWavBuffer(pcmChunks, 24000, 1, 16);
            if (!isSelection) {
              pagePartWavBuffers.push(wavBuffer.slice(0));
              pagePartExcerpts.push(blocks[i].block.slice(0, 90));
            }
            const partNumber = i + 1;
            const partStr = String(partNumber).padStart(2, "0");
            const clipTitle = formatTtsClipTitle(
              snapshotDocName,
              snapshotPage,
              partNumber,
              isSelection
            );
            const clipId = isSelection
              ? `${snapshotDocId}::p${snapshotPage}::sel_${selectionBatchTag}_${partStr}`
              : `${snapshotDocId}::p${snapshotPage}::${partStr}`;

            await saveTtsClip({
              id: clipId,
              title: clipTitle,
              docId: snapshotDocId,
              docTitle: cleanPdfDisplayTitle(snapshotDocName),
              pageNumber: snapshotPage,
              partNumber,
              totalParts: blocks.length,
              textExcerpt: blocks[i].block.slice(0, 180),
              voice: geminiVoice,
              model: geminiTtsModel,
              durationSeconds,
              sizeBytes: wavBuffer.byteLength,
              mimeType: "audio/wav",
              audioData: wavBuffer,
              createdAt: Date.now(),
            });

            if (!isSelection && i === blocks.length - 1) {
              await cleanupStalePageParts(snapshotDocId, snapshotPage, blocks.length);
            }
            void refreshTtsClipsList();
          } catch (saveErr) {
            console.warn("Failed to save generated TTS clip to IndexedDB:", saveErr);
          }
        }
      }

      // After all TTS parts on the same page succeed, merge them into one page WAV via Python
      const mergeAndSaveFullPage = async () => {
        if (controller.signal.aborted || isSelection || pagePartWavBuffers.length === 0) {
          return;
        }
        try {
          const { wavBuffer, durationSeconds, mergedBy } = await mergePageWavClips(
            pagePartWavBuffers,
            180
          );
          const mergedTitle = formatMergedPageTtsTitle(snapshotDocName, snapshotPage);
          const mergedClipId = `${snapshotDocId}::p${snapshotPage}::full`;

          await saveTtsClip({
            id: mergedClipId,
            title: mergedTitle,
            docId: snapshotDocId,
            docTitle: cleanPdfDisplayTitle(snapshotDocName),
            pageNumber: snapshotPage,
            partNumber: 0,
            totalParts: pagePartWavBuffers.length,
            textExcerpt:
              pagePartExcerpts[0] ||
              `Gabungan lengkap ${pagePartWavBuffers.length} bagian audio halaman ${snapshotPage}`,
            voice: geminiVoice,
            model: geminiTtsModel,
            durationSeconds,
            sizeBytes: wavBuffer.byteLength,
            mimeType: "audio/wav",
            audioData: wavBuffer,
            createdAt: Date.now(),
            isMergedPage: true,
            mergedBy,
          });
          void refreshTtsClipsList();
        } catch (mergeErr) {
          console.warn("Gagal menggabungkan audio TTS halaman:", mergeErr);
        }
      };

      if (!controller.signal.aborted) {
        await Promise.all([player.waitUntilDrain(), mergeAndSaveFullPage()]);
      }

      if (!controller.signal.aborted) {
        if (karaokeTimerRef.current !== null) {
          window.clearInterval(karaokeTimerRef.current);
          karaokeTimerRef.current = null;
        }
        ttsAbortControllerRef.current = null;
        setIsSpeaking(false);
        setIsPaused(false);
        setActiveReadingSentence(undefined);
        if (autoAdvance && currentPage < totalPages) {
          setCurrentPage((p) => p + 1);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return;
      }

      console.warn("Gemini Stream TTS playback stopped:", err);
      const errMsg = String(err?.message || "");
      const isQuota =
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.toLowerCase().includes("quota");
      if (isQuota) {
        setGeminiQuotaReached(true);
      }

      if (karaokeTimerRef.current !== null) {
        window.clearInterval(karaokeTimerRef.current);
        karaokeTimerRef.current = null;
      }
      ttsAbortControllerRef.current = null;
      player.stop();
      setIsSpeaking(false);
      setIsPaused(false);
      setActiveReadingSentence(undefined);
      setTtsError(
        isQuota
          ? "Kuota / batas permintaan Gemini TTS tercapai (429). Tambahkan atau rotasi API Key lain di Pengaturan Gemini."
          : errMsg || "Gagal memutar Gemini Stream TTS."
      );
    }
  };

  const handlePlayPage = () => {
    const textForSpeech = ttsPageText.trim() || pageText;
    if (textForSpeech) {
      playTextAloud(textForSpeech, { isSelection: false });
    }
  };

  const handleReadSelectedText = (snippet?: string) => {
    const text = snippet || selectedSnippet;
    if (text) {
      playTextAloud(text, { isSelection: true });
    }
  };

  const handleAskAiAboutText = (text: string) => {
    setSelectedSnippet(text);
    setIsAiChatOpen(true);
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
      } else if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      } else if (e.key === " ") {
        e.preventDefault();
        if (isSpeaking) {
          if (isPaused) handleResumeSpeaking();
          else handlePauseSpeaking();
        } else {
          handlePlayPage();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalPages, isSpeaking, isPaused, pageText, ttsPageText]);

  // Drag and drop PDF upload
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer || buffer.byteLength === 0) return;

        const newDoc: StoredDocument = {
          id: "doc_" + Date.now(),
          name: file.name,
          size: file.size,
          totalPages: 1,
          lastPage: 1,
          lastZoom: 1.0,
          lastReadAt: Date.now(),
          data: buffer.slice(0),
          bookmarks: [],
        };
        await saveDocument(newDoc);
        const list = await getAllDocuments();
        setDocumentsList(list);

        handleStopSpeaking();
        activePdfMetaRef.current = {
          id: newDoc.id,
          name: newDoc.name,
          lastPage: 1,
          totalPages: 1,
          bookmarks: [],
        };
        setReaderSource("pdf");
        setCurrentDocId(newDoc.id);
        setCurrentDocName(newDoc.name);
        setPdfData(buffer.slice(0));
        setCurrentPage(1);
        setZoom(1.0);
        setBookmarks([]);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div
      id="pdf-reader-app-root"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`h-screen flex flex-col font-sans transition-colors duration-200 overflow-hidden ${
        theme === "night"
          ? "dark bg-[#0F1115] text-[#E5E7EB]"
          : theme === "sepia"
          ? "bg-[#fbf4e4] text-[#423325]"
          : theme === "midnight"
          ? "dark bg-[#080d1a] text-slate-100"
          : "bg-neutral-50 text-neutral-900"
      }`}
    >
      {/* Hidden File Input for PDF Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="application/pdf"
        className="hidden"
      />

      {/* Windows 11 Native Frameless Titlebar */}
      <WindowsTitlebar
        currentDocName={currentDocName}
        isDark={appearance.mode === "dark"}
      />

      {/* Header */}
      <Header
        currentDocName={currentDocName}
        theme={theme}
        appearance={appearance}
        onThemeChange={handleThemeChange}
        onOpenAppearanceModal={() => setIsAppearanceOpen(true)}
        onOpenGeminiSettings={() => setIsGeminiSettingsOpen(true)}
        dimmerLevel={dimmerLevel}
        onDimmerChange={handleDimmerChange}
        onUploadClick={handleOpenPdf}
        onLoadSampleClick={loadSampleDocument}
        onOpenLibraryClick={() => setIsLibraryOpen(true)}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        onOpenAiChat={() => setIsAiChatOpen(true)}
        libraryCount={documentsList.length}
        readerSource={readerSource}
        onOpenWebArticleClick={() => setIsWebArticleModalOpen(true)}
        articleCount={savedArticlesList.length}
      />

      {/* Toolbar */}
      <Toolbar
        theme={theme}
        appearance={appearance}
        onAppearanceChange={handleAppearanceChange}
        onOpenAppearanceModal={() => setIsAppearanceOpen(true)}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => {
          handleStopSpeaking();
          setCurrentPage(page);
        }}
        zoom={zoom}
        onZoomChange={setZoom}
        onFitWidth={handleFitWidth}
        onFitPage={handleFitPage}
        onRotate={handleRotate}
        isBookmarked={bookmarks.includes(currentPage)}
        onToggleBookmark={handleToggleBookmark}
        showThumbnails={showThumbnails}
        onToggleThumbnails={() => {
          setShowThumbnails((p) => !p);
          if (!showThumbnails) setShowOutline(false);
        }}
        showOutline={showOutline}
        onToggleOutline={() => {
          setShowOutline((p) => !p);
          if (!showOutline) setShowThumbnails(false);
        }}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch((p) => !p)}
        onToggleAiChat={() => setIsAiChatOpen(true)}
        ttsEngine={ttsEngine}
        onTtsEngineChange={(engine) => {
          setTtsEngine(engine);
          localStorage.setItem("lumina_tts_engine", engine);
        }}
        geminiModel={geminiTtsModel}
        onGeminiModelChange={handleGeminiModelChange}
        onOpenTtsSettings={() => setIsTtsSettingsOpen(true)}
        onOpenTtsLibrary={() => {
          void refreshTtsClipsList();
          setIsTtsLibraryOpen(true);
        }}
        ttsClipsCount={ttsClipsList.length}
        geminiVoice={geminiVoice}
        onGeminiVoiceChange={handleGeminiVoiceChange}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        isSpeaking={isSpeaking}
        isPaused={isPaused}
        onPlayPage={handlePlayPage}
        onPauseSpeaking={handlePauseSpeaking}
        onResumeSpeaking={handleResumeSpeaking}
        onStopSpeaking={handleStopSpeaking}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={() => setAutoAdvance((p) => !p)}
        hasSelectedText={!!selectedSnippet}
        onReadSelectedText={() => handleReadSelectedText(selectedSnippet)}
        geminiQuotaReached={geminiQuotaReached}
        hasStyleInstruction={Boolean(styleInstruction.trim())}
        readerSource={readerSource}
        onOpenWebArticleClick={() => setIsWebArticleModalOpen(true)}
        onSwitchBackToPdf={handleSwitchBackToPdf}
        hasLoadedPdf={Boolean(pdfData)}
      />

      {/* TTS Error / Quota notification banner (no offline fallback) */}
      {(ttsError || geminiQuotaReached) && (
        <div
          id="gemini-quota-banner"
          className="bg-amber-950/60 border-b border-amber-800/60 px-4 py-2 text-xs text-amber-200 flex items-center justify-between shrink-0 gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="truncate sm:whitespace-normal">
              {ttsError ||
                "Kuota Gemini AI TTS tercapai (429). Tambahkan atau rotasi API Key cadangan di Pengaturan Gemini untuk melanjutkan."}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsGeminiSettingsOpen(true)}
              className="text-amber-100 hover:text-white text-xs px-2.5 py-0.5 rounded bg-amber-700/60 hover:bg-amber-700 transition-colors cursor-pointer font-medium"
            >
              Atur API Key
            </button>
            <button
              onClick={() => {
                setGeminiQuotaReached(false);
                setTtsError(null);
              }}
              className="text-amber-400 hover:text-amber-100 text-xs px-2 py-0.5 rounded bg-amber-900/40 hover:bg-amber-900/70 transition-colors cursor-pointer font-medium flex items-center gap-1"
              title="Tutup pemberitahuan"
            >
              <X className="w-3.5 h-3.5" />
              <span>Tutup</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace: Sidebars + PDF Canvas Stage + AI Assistant (with pb-14 for mobile bottom bar) */}
      <div className="flex-1 flex overflow-hidden relative pb-13 sm:pb-0">
        {/* Mobile Backdrop for Sidebars */}
        {readerSource === "pdf" && (showThumbnails || showOutline || showSearch) && (
          <div
            className="sm:hidden fixed inset-0 z-35 bg-black/60 backdrop-blur-xs"
            onClick={() => {
              setShowThumbnails(false);
              setShowOutline(false);
              setShowSearch(false);
            }}
          />
        )}

        {/* Thumbnails Sidebar */}
        {readerSource === "pdf" && showThumbnails && (
          <ThumbnailsSidebar
            pdfDoc={pdfDoc}
            totalPages={totalPages}
            currentPage={currentPage}
            onPageSelect={(page) => {
              handleStopSpeaking();
              setCurrentPage(page);
              setShowThumbnails(false);
            }}
            onClose={() => setShowThumbnails(false)}
            theme={theme}
          />
        )}

        {/* Outline / Bookmarks Sidebar */}
        {readerSource === "pdf" && showOutline && (
          <OutlineSidebar
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            bookmarks={bookmarks}
            onPageSelect={(page) => {
              handleStopSpeaking();
              setCurrentPage(page);
              setShowOutline(false);
            }}
            onRemoveBookmark={(page) => {
              setBookmarks((prev) => prev.filter((p) => p !== page));
            }}
            onClose={() => setShowOutline(false)}
            theme={theme}
          />
        )}

        {/* Central Reader Stage: Web Article Clean Reader Mode vs PDF Viewer */}
        {readerSource === "article" && activeArticle ? (
          <ArticleReaderView
            article={activeArticle}
            currentPage={currentPage}
            onPageChange={(page) => {
              handleStopSpeaking();
              setCurrentPage(page);
            }}
            appearance={appearance}
            onAppearanceChange={handleAppearanceChange}
            onOpenAppearanceModal={() => setIsAppearanceOpen(true)}
            dimmerLevel={dimmerLevel}
            onPageTextExtracted={setPageText}
            onPageTtsTextExtracted={(filteredText, filteredHeaders) => {
              setTtsPageText(filteredText);
              setFilteredTtsHeaders(filteredHeaders);
            }}
            ttsFilterSettings={ttsFilterSettings}
            activeReadingSentence={activeReadingSentence}
            onReadSelectedText={(snippet) => {
              setSelectedSnippet(snippet);
              handleReadSelectedText(snippet);
            }}
            onAskAiAboutText={handleAskAiAboutText}
            onStopSpeaking={handleStopSpeaking}
            onOpenWebArticleModal={() => setIsWebArticleModalOpen(true)}
            onSwitchBackToPdf={handleSwitchBackToPdf}
            hasLoadedPdf={Boolean(pdfData)}
          />
        ) : (
          <PdfViewer
            pdfDoc={pdfDoc}
            docTitle={currentDocName}
            isLoading={isDocLoading}
            error={docError}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => {
              handleStopSpeaking();
              setCurrentPage(page);
            }}
            zoom={zoom}
            rotation={rotation}
            theme={theme}
            appearance={appearance}
            onAppearanceChange={handleAppearanceChange}
            onOpenAppearanceModal={() => setIsAppearanceOpen(true)}
            dimmerLevel={dimmerLevel}
            onPageTextExtracted={setPageText}
            onPageTtsTextExtracted={(filteredText, filteredHeaders) => {
              setTtsPageText(filteredText);
              setFilteredTtsHeaders(filteredHeaders);
            }}
            ttsFilterSettings={ttsFilterSettings}
            activeReadingSentence={activeReadingSentence}
            onReadSelectedText={(snippet) => {
              setSelectedSnippet(snippet);
              handleReadSelectedText(snippet);
            }}
            onAskAiAboutText={handleAskAiAboutText}
            onStopSpeaking={handleStopSpeaking}
            onOpenOtherPdf={handleOpenPdf}
            onLoadSamplePdf={loadSampleDocument}
          />
        )}

        {/* In-Document Search Panel */}
        {readerSource === "pdf" && showSearch && (
          <SearchPanel
            pdfDoc={pdfDoc}
            totalPages={totalPages}
            onJumpToPage={(p) => {
              handleStopSpeaking();
              setCurrentPage(p);
              setShowSearch(false);
            }}
            onClose={() => setShowSearch(false)}
            theme={theme}
          />
        )}

        {/* Gemini 3.8 AI Assistant Panel */}
        <AiAssistantPanel
          isOpen={isAiChatOpen}
          onClose={() => setIsAiChatOpen(false)}
          docTitle={currentDocName}
          currentPage={currentPage}
          currentPageText={pageText}
          theme={theme}
          initialQuery={selectedSnippet ? `Jelaskan kutipan ini: "${selectedSnippet}"` : undefined}
          onClearInitialQuery={() => setSelectedSnippet("")}
        />
      </div>

      {/* Appearance & Dark Mode Customizer Modal */}
      <AppearanceModal
        isOpen={isAppearanceOpen}
        onClose={() => setIsAppearanceOpen(false)}
        appearance={appearance}
        onChange={handleAppearanceChange}
      />

      {/* Live Voice Conversation Modal */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        docTitle={currentDocName}
        currentPage={currentPage}
        currentPageText={pageText}
        initialModel={loadGeminiSettings().liveModel || "gemini-3.1-flash-live-preview"}
        initialVoice={geminiVoice}
      />

      {/* Gemini TTS Model & Voice Customizer Modal */}
      <TtsSettingsModal
        isOpen={isTtsSettingsOpen}
        onClose={() => setIsTtsSettingsOpen(false)}
        ttsEngine={ttsEngine}
        onTtsEngineChange={(engine) => {
          setTtsEngine(engine);
          localStorage.setItem("lumina_tts_engine", engine);
        }}
        geminiModel={geminiTtsModel}
        onGeminiModelChange={handleGeminiModelChange}
        geminiVoice={geminiVoice}
        onGeminiVoiceChange={handleGeminiVoiceChange}
        styleInstruction={styleInstruction}
        onStyleInstructionChange={handleStyleInstructionChange}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        autoAdvance={autoAdvance}
        onAutoAdvanceChange={setAutoAdvance}
        ttsFilterSettings={ttsFilterSettings}
        onTtsFilterSettingsChange={handleTtsFilterSettingsChange}
        filteredHeadersOnCurrentPage={filteredTtsHeaders}
        onOpenTtsLibrary={() => {
          void refreshTtsClipsList();
          setIsTtsLibraryOpen(true);
        }}
        ttsClipsCount={ttsClipsList.length}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        geminiQuotaReached={geminiQuotaReached}
      />

      {/* Saved Generated TTS Audio Library Modal */}
      <TtsLibraryModal
        isOpen={isTtsLibraryOpen}
        onClose={() => setIsTtsLibraryOpen(false)}
        clips={ttsClipsList}
        currentDocId={currentDocId}
        currentDocName={currentDocName}
        onRefreshClips={refreshTtsClipsList}
      />

      {/* Offline Stored Documents Library Modal */}
      <DocumentLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        documents={documentsList}
        currentDocId={currentDocId}
        onSelectDoc={handleSelectDocumentFromLibrary}
        onDeleteDoc={handleDeleteDocument}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      {/* Web Article Reader Mode Modal */}
      <WebArticleModal
        isOpen={isWebArticleModalOpen}
        onClose={() => setIsWebArticleModalOpen(false)}
        savedArticles={savedArticlesList}
        activeArticleId={activeArticle?.id || null}
        readerSource={readerSource}
        hasLoadedPdf={Boolean(pdfData)}
        onOpenArticle={handleOpenArticle}
        onDeleteArticle={handleDeleteArticle}
        onRefreshArticles={refreshArticlesList}
        onSwitchBackToPdf={handleSwitchBackToPdf}
      />

      {/* Gemini Settings Modal */}
      <GeminiSettingsModal
        isOpen={isGeminiSettingsOpen}
        onClose={() => setIsGeminiSettingsOpen(false)}
      />

      {/* PWA Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
}
