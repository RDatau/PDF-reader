import "../polyfills";
import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { AppearanceSettings, TtsFilterSettings } from "../types";
import { DARK_PRESETS, LIGHT_PRESETS, TEXT_TONES, FONT_OPTIONS } from "../lib/themePresets";
import { extractPageEdgeLines, extractStructuredTextFromPdfPage } from "../lib/pdfTextExtractor";
import { configurePdfJsWorker } from "../lib/pdfjsConfig";
import {
  Sparkles,
  Volume2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  FileText,
  Type,
  Minus,
  Plus,
  Moon,
  Sun,
  AlignLeft,
  AlignJustify,
  X,
  Square,
} from "lucide-react";

configurePdfJsWorker();

interface PdfViewerProps {
  pdfDoc: any | null;
  docTitle?: string;
  isLoading?: boolean;
  error?: string | null;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  zoom: number;
  rotation: number;
  theme?: string;
  appearance: AppearanceSettings;
  onAppearanceChange?: (settings: AppearanceSettings) => void;
  onOpenAppearanceModal?: () => void;
  dimmerLevel: number;
  onPageTextExtracted: (text: string) => void;
  onPageTtsTextExtracted?: (ttsText: string, filteredHeaders: string[]) => void;
  ttsFilterSettings?: TtsFilterSettings;
  activeReadingSentence?: string;
  onReadSelectedText: (text: string) => void;
  onAskAiAboutText: (text: string) => void;
  searchQuery?: string;
  onStopSpeaking?: () => void;
  onOpenOtherPdf?: () => void;
  onLoadSamplePdf?: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfDoc,
  docTitle,
  isLoading = false,
  error = null,
  currentPage,
  totalPages,
  onPageChange,
  zoom,
  rotation,
  appearance,
  onAppearanceChange,
  onOpenAppearanceModal,
  dimmerLevel,
  onPageTextExtracted,
  onPageTtsTextExtracted,
  ttsFilterSettings,
  activeReadingSentence,
  onReadSelectedText,
  onAskAiAboutText,
  onStopSpeaking,
  onOpenOtherPdf,
  onLoadSamplePdf,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRenderTaskRef = useRef<any>(null);
  const lastRawPageTextRef = useRef<{
    textContent: any;
    pageView?: number[];
    neighborTopTexts: string[];
    neighborBottomTexts: string[];
  } | null>(null);
  const edgeCacheRef = useRef<Map<number, { topLines: string[]; bottomLines: string[] }>>(new Map());
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 800
  );

  // Extracted page text and structured paragraphs for Text / Reflow Reader Mode
  const [pageTextContent, setPageTextContent] = useState<string>("");
  const [pageParagraphs, setPageParagraphs] = useState<string[]>([]);
  const [paragraphIndent, setParagraphIndent] = useState<boolean>(false);
  const [textAlign, setTextAlign] = useState<"justify" | "left">("left");

  // Selection floating tooltip state
  const [selectedText, setSelectedText] = useState("");
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Read Aloud top banner dismissal state
  const [isReadingBannerDismissed, setIsReadingBannerDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Reset banner dismissal whenever speaking stops or a new sentence begins
    if (!activeReadingSentence) {
      setIsReadingBannerDismissed(false);
    }
  }, [activeReadingSentence]);

  // Clear edge cache when document changes
  useEffect(() => {
    edgeCacheRef.current.clear();
    lastRawPageTextRef.current = null;
  }, [pdfDoc]);

  // Re-run TTS text filtering immediately whenever TTS filter settings or docTitle change
  useEffect(() => {
    const raw = lastRawPageTextRef.current;
    if (!raw) return;
    const extraction = extractStructuredTextFromPdfPage(raw.textContent, {
      pageView: raw.pageView,
      docTitle,
      neighborTopTexts: raw.neighborTopTexts,
      neighborBottomTexts: raw.neighborBottomTexts,
      skipHeadersFooters: ttsFilterSettings?.skipHeadersFooters ?? true,
      skipChapterHeadings: ttsFilterSettings?.skipChapterHeadings ?? false,
      customIgnoredLines: ttsFilterSettings?.customIgnoredLines ?? [],
    });
    onPageTtsTextExtracted?.(extraction.ttsText, extraction.filteredHeaders);
  }, [
    docTitle,
    ttsFilterSettings?.skipHeadersFooters,
    ttsFilterSettings?.skipChapterHeadings,
    ttsFilterSettings?.customIgnoredLines,
  ]);

  // Slide / Swipe to flip page gesture state
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev" | null>(null);

  // ResizeObserver for Container Width (Responsive mobile vertical viewport with debouncing)
  useEffect(() => {
    if (!containerRef.current) return;
    let resizeTimer: any = null;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          const newWidth = Math.round(entry.contentRect.width);
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            setContainerWidth((prev) => (Math.abs(prev - newWidth) > 2 ? newWidth : prev));
          }, 80);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  // Render Current Page with auto-fit scale calculation
  useEffect(() => {
    if (!pdfDoc || currentPage < 1 || currentPage > pdfDoc.numPages) {
      return;
    }

    // If pdfDoc was destroyed or transport was closed, do not attempt to render
    if (pdfDoc.destroyed || (pdfDoc._transport && pdfDoc._transport.destroyed)) {
      return;
    }

    let isCancelled = false;

    const getNeighborEdges = async (pageNum: number) => {
      if (pageNum < 1 || pageNum > pdfDoc.numPages) {
        return { topLines: [], bottomLines: [] };
      }
      const cached = edgeCacheRef.current.get(pageNum);
      if (cached) return cached;
      try {
        const neighborPage = await pdfDoc.getPage(pageNum);
        const neighborText = await neighborPage.getTextContent();
        const edges = extractPageEdgeLines(neighborText);
        edgeCacheRef.current.set(pageNum, edges);
        return edges;
      } catch {
        return { topLines: [], bottomLines: [] };
      }
    };

    const renderPage = async () => {
      let renderTask: any = null;
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        // Extract structured text and paragraphs for TTS, AI, and Reflow Reader
        try {
          const textContent = await page.getTextContent();
          if (isCancelled) return;

          const neighborTopTexts: string[] = [];
          const neighborBottomTexts: string[] = [];
          const adjacentPageNums = [currentPage - 1, currentPage + 1].filter(
            (n) => n >= 1 && n <= pdfDoc.numPages
          );
          if (adjacentPageNums.length > 0) {
            const neighborResults = await Promise.all(adjacentPageNums.map(getNeighborEdges));
            if (isCancelled) return;
            for (const nr of neighborResults) {
              neighborTopTexts.push(...nr.topLines);
              neighborBottomTexts.push(...nr.bottomLines);
            }
          }

          const extraction = extractStructuredTextFromPdfPage(textContent, {
            pageView: page.view,
            docTitle,
            neighborTopTexts,
            neighborBottomTexts,
            skipHeadersFooters: ttsFilterSettings?.skipHeadersFooters ?? true,
            skipChapterHeadings: ttsFilterSettings?.skipChapterHeadings ?? false,
            customIgnoredLines: ttsFilterSettings?.customIgnoredLines ?? [],
          });

          edgeCacheRef.current.set(currentPage, {
            topLines: extraction.topLines,
            bottomLines: extraction.bottomLines,
          });
          lastRawPageTextRef.current = {
            textContent,
            pageView: page.view,
            neighborTopTexts,
            neighborBottomTexts,
          };

          setPageTextContent(extraction.fullText);
          setPageParagraphs(extraction.paragraphs);
          onPageTextExtracted(extraction.fullText);
          onPageTtsTextExtracted?.(extraction.ttsText, extraction.filteredHeaders);
        } catch (e: any) {
          if (
            isCancelled ||
            e?.message?.includes("Transport destroyed") ||
            e?.message?.includes("Worker was destroyed") ||
            e?.name === "RenderingCancelledException"
          ) {
            return;
          }
          console.warn("Could not extract text content:", e);
        }

        // Cancel and wait for any existing render task on this canvas before starting a new one
        if (activeRenderTaskRef.current) {
          try {
            activeRenderTaskRef.current.cancel();
            await activeRenderTaskRef.current.promise;
          } catch (e) {
            // Expected cancellation rejection, safely ignore
          }
          activeRenderTaskRef.current = null;
        }

        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        // Unscaled viewport to determine base dimensions
        const baseViewport = page.getViewport({ scale: 1.0, rotation: rotation });

        // Mobile vertical optimization: calculate scale to fit mobile screen width
        const isMobileScreen = containerWidth < 640;
        let computedScale = zoom;

        if (appearance.mobileFitWidth) {
          const horizontalPadding = isMobileScreen ? 16 : 36;
          const availableWidth = Math.max(280, containerWidth - horizontalPadding);
          const fitWidthRatio = availableWidth / baseViewport.width;

          // If on mobile screen, base scale is fitWidthRatio modulated by user's zoom factor
          if (isMobileScreen) {
            computedScale = fitWidthRatio * zoom;
          } else if (zoom === 1.0) {
            // On desktop if zoom is 1.0, use comfortable scale capped at available width
            computedScale = Math.min(1.4, fitWidthRatio);
          }
        }

        const viewport = page.getViewport({ scale: computedScale, rotation: rotation });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        // Pre-fill canvas with white background so inverted dark mode produces clean dark tones
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderContext = {
          canvasContext: ctx,
          canvas: canvas,
          transform: transform,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        activeRenderTaskRef.current = renderTask;

        await renderTask.promise;
      } catch (err: any) {
        if (
          isCancelled ||
          err?.name === "RenderingCancelledException" ||
          err?.name === "AbortException" ||
          err?.message?.includes("cancelled") ||
          err?.message?.includes("Rendering cancelled") ||
          err?.message?.includes("Transport destroyed") ||
          err?.message?.includes("Worker was destroyed")
        ) {
          return;
        }
        console.error("Page render error:", err);
      } finally {
        if (activeRenderTaskRef.current === renderTask) {
          activeRenderTaskRef.current = null;
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, currentPage, zoom, rotation, containerWidth, appearance.mobileFitWidth]);

  // Touch Swipe to Flip Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!appearance.slideGesturesEnabled) return;
    if (e.touches.length !== 1) return;
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setIsSwiping(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || touchStartX === null || touchStartY === null || !appearance.slideGesturesEnabled) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    // Check if horizontal movement is dominant
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
      // Apply rubber-band damping
      setDragOffset(diffX * 0.7);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping || !appearance.slideGesturesEnabled) {
      setIsSwiping(false);
      setDragOffset(0);
      return;
    }

    const SWIPE_THRESHOLD = 45; // pixels to trigger page flip

    if (dragOffset < -SWIPE_THRESHOLD && currentPage < totalPages) {
      // Swiped Left -> Next page
      setFlipDirection("next");
      onPageChange(currentPage + 1);
    } else if (dragOffset > SWIPE_THRESHOLD && currentPage > 1) {
      // Swiped Right -> Previous page
      setFlipDirection("prev");
      onPageChange(currentPage - 1);
    }

    setIsSwiping(false);
    setDragOffset(0);
    setTouchStartX(null);
    setTouchStartY(null);

    setTimeout(() => {
      setFlipDirection(null);
    }, 280);
  };

  // Text selection handler
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectedText("");
      setSelectionBox(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionBox({
        x: rect.left + rect.width / 2,
        y: Math.max(60, rect.top - 10),
      });
    } else {
      setSelectedText("");
      setSelectionBox(null);
    }
  };

  const handleCopySelection = () => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Determine Appearance Theme & Styling
  const isDarkMode = appearance.mode === "dark";

  const activeDarkPreset = DARK_PRESETS.find((p) => p.id === appearance.darkBgId) || {
    id: "custom",
    name: "Kustom",
    color: appearance.darkBgColor,
    viewportColor: appearance.darkBgColor,
    desc: "",
  };

  const activeLightPreset = LIGHT_PRESETS.find((p) => p.id === appearance.lightBgId) || {
    id: "custom",
    name: "Kustom",
    color: appearance.lightBgColor,
    viewportColor: appearance.lightBgColor,
    desc: "",
  };

  const activeTone = TEXT_TONES.find((t) => t.id === appearance.textTone) || TEXT_TONES[0];
  const activeFont = FONT_OPTIONS.find((f) => f.id === appearance.fontFamily) || FONT_OPTIONS[0];

  // Paper and Viewport Colors
  const paperBgColor = isDarkMode ? appearance.darkBgColor : appearance.lightBgColor;
  const viewportBgColor = isDarkMode
    ? activeDarkPreset.viewportColor || appearance.darkBgColor
    : activeLightPreset.viewportColor || appearance.lightBgColor;

  // DIRECT, RELIABLE CSS FILTER FOR DARK MODE & LIGHT TONES
  // Avoids unstable mixBlendMode which bleeds white background from parent containers or iframes
  const getCanvasFilter = () => {
    const toneFilterStr = activeTone.filterTone !== "none" ? activeTone.filterTone : "";

    if (!isDarkMode) {
      if (activeTone.filterTone !== "none") return activeTone.filterTone;
      if (appearance.lightBgId === "cream") return "sepia(0.22) contrast(1.02)";
      if (appearance.lightBgId === "sepia") return "sepia(0.45) contrast(1.05)";
      if (appearance.lightBgId === "mint") return "hue-rotate(60deg) sepia(0.18)";
      return "none";
    }

    // If invertPdfInDarkMode is explicitly set to false, do not invert canvas (keep original paper)
    if (appearance.invertPdfInDarkMode === false) {
      return "none";
    }

    const toneSuffix = toneFilterStr ? ` ${toneFilterStr}` : "";

    switch (appearance.darkBgId) {
      case "oled":
        // 100% Pitch Black #000000 with crisp white text
        return `invert(1) hue-rotate(180deg) contrast(1.15) brightness(0.92)${toneSuffix}`;
      case "charcoal":
        // Modern #18181b soft dark
        return `invert(0.90) hue-rotate(180deg) contrast(1.08) brightness(0.96)${toneSuffix}`;
      case "midnight":
        // Deep Navy Slate #0b1329
        return `invert(0.92) hue-rotate(205deg) saturate(1.4) contrast(1.12) brightness(0.90)${toneSuffix}`;
      case "espresso":
        // Warm brown espresso #1c1917
        return `invert(0.90) hue-rotate(155deg) sepia(0.28) contrast(1.08) brightness(0.95)${toneSuffix}`;
      case "slate":
        // Slate gray #1e293b
        return `invert(0.88) hue-rotate(180deg) contrast(1.06) brightness(0.95)${toneSuffix}`;
      case "emerald":
        // Deep forest emerald #061a14
        return `invert(0.90) hue-rotate(250deg) saturate(1.5) contrast(1.1) brightness(0.92)${toneSuffix}`;
      default:
        return `invert(0.90) hue-rotate(180deg) contrast(1.08) brightness(0.96)${toneSuffix}`;
    }
  };

  const canvasFilter = getCanvasFilter();

  const handleFontSizeDelta = (delta: number) => {
    if (!onAppearanceChange) return;
    const currentSize = appearance.fontSize || 18;
    const newSize = Math.max(12, Math.min(32, currentSize + delta));
    // If user is adjusting font in Canvas mode, automatically switch to text mode so they see the result
    if (appearance.viewMode !== "text") {
      onAppearanceChange({ ...appearance, fontSize: newSize, viewMode: "text" });
    } else {
      onAppearanceChange({ ...appearance, fontSize: newSize });
    }
  };

  const handleFontFamilySelect = (fontId: any) => {
    if (!onAppearanceChange) return;
    if (appearance.viewMode !== "text") {
      onAppearanceChange({ ...appearance, fontFamily: fontId, viewMode: "text" });
    } else {
      onAppearanceChange({ ...appearance, fontFamily: fontId });
    }
  };

  const handleToggleInvertPaper = () => {
    if (!onAppearanceChange) return;
    const nextInvert = appearance.invertPdfInDarkMode === false ? true : false;
    onAppearanceChange({ ...appearance, invertPdfInDarkMode: nextInvert });
  };

  const handleToggleViewMode = () => {
    if (!onAppearanceChange) return;
    const nextMode = appearance.viewMode === "text" ? "canvas" : "text";
    onAppearanceChange({ ...appearance, viewMode: nextMode });
  };

  return (
    <div
      id="pdf-viewport-container"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseUp={handleMouseUp}
      className="relative flex-1 overflow-auto flex flex-col items-center justify-start p-2 sm:p-6 transition-colors duration-200 select-text touch-pan-y"
      style={{
        backgroundColor: viewportBgColor,
        minHeight: 0,
      }}
    >
      {/* Night Dimmer overlay for zero eye-strain reading */}
      {dimmerLevel > 0 && (
        <div
          id="screen-dimmer-overlay"
          className="fixed inset-0 pointer-events-none z-40 transition-opacity duration-200"
          style={{ backgroundColor: `rgba(0, 0, 0, ${dimmerLevel})` }}
        />
      )}

      {/* Floating Slide Gesture Feedback Indicator */}
      {appearance.slideGesturesEnabled && Math.abs(dragOffset) > 20 && (
        <div
          id="slide-flip-gesture-pill"
          className="fixed bottom-16 sm:bottom-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-2xl text-xs font-bold flex items-center gap-2 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 bg-blue-600 text-white border border-blue-400/40"
        >
          {dragOffset < 0 ? (
            <>
              <span>Halaman Berikutnya ({Math.min(totalPages, currentPage + 1)})</span>
              <ChevronRight className="w-4 h-4 animate-pulse" />
            </>
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 animate-pulse" />
              <span>Halaman Sebelumnya ({Math.max(1, currentPage - 1)})</span>
            </>
          )}
        </div>
      )}

      {/* Floating Selection Action Tooltip */}
      {selectionBox && selectedText && (
        <div
          id="selection-action-tooltip"
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 bg-[#14171D] text-gray-200 rounded-md shadow-2xl border border-[#2D333B] px-2 py-1.5 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ left: selectionBox.x, top: selectionBox.y }}
        >
          <button
            onClick={() => {
              onReadSelectedText(selectedText);
              setSelectedText("");
              setSelectionBox(null);
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors cursor-pointer"
            title="Read this highlighted text aloud"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Baca</span>
          </button>

          <button
            onClick={() => {
              onAskAiAboutText(selectedText);
              setSelectedText("");
              setSelectionBox(null);
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer"
            title="Explain or summarize this selection with Gemini"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Jelaskan</span>
          </button>

          <button
            onClick={handleCopySelection}
            className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Copy text to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Quick Reflow / Typography Bar on Top of Document */}
      <div className="w-full max-w-3xl flex items-center justify-between px-2 py-1.5 mb-2 rounded-lg bg-[#14171D]/90 border border-[#2D333B] text-xs text-gray-300 backdrop-blur-xs shadow-md select-none">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleViewMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              appearance.viewMode === "text"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-[#1F242F] text-gray-300 hover:bg-[#2A313F]"
            }`}
            title={
              appearance.viewMode === "text"
                ? "Beralih ke Tampilan Halaman PDF Asli"
                : "Beralih ke Mode Teks Tipografi (E-Reader / Reflow)"
            }
          >
            {appearance.viewMode === "text" ? (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span>Mode Teks (Aktif)</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                <span>Mode Teks Reflow</span>
              </>
            )}
          </button>

          <span className="text-[11px] text-gray-400 hidden sm:inline">
            Halaman {currentPage} / {totalPages || 1}
          </span>
        </div>

        {/* Font Size, Font Family & Dark Paper Controls */}
        <div className="flex items-center gap-1.5">
          {/* Font Family Selector */}
          <select
            id="quick-font-family-select"
            value={appearance.fontFamily || "sans"}
            onChange={(e) => handleFontFamilySelect(e.target.value)}
            className="hidden sm:block text-[11px] py-0.5 px-1.5 rounded bg-[#1F242F] border border-[#2D333B] text-gray-200 font-medium focus:outline-hidden focus:border-blue-500 cursor-pointer"
            title="Ganti Jenis Huruf (Font Family)"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* Font Size Stepper */}
          <div className="flex items-center gap-1 bg-[#1F242F] px-1.5 py-0.5 rounded border border-[#2D333B]">
            <button
              onClick={() => handleFontSizeDelta(-2)}
              disabled={(appearance.fontSize || 18) <= 12}
              className="w-5 h-5 rounded hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center font-bold text-[11px] text-gray-300 cursor-pointer"
              title="Perkecil Ukuran Font (A-)"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono text-[11px] font-bold px-1 text-blue-400 min-w-[28px] text-center">
              {appearance.fontSize || 18}px
            </span>
            <button
              onClick={() => handleFontSizeDelta(2)}
              disabled={(appearance.fontSize || 18) >= 32}
              className="w-5 h-5 rounded hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center font-bold text-[11px] text-gray-300 cursor-pointer"
              title="Perbesar Ukuran Font (A+)"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* If in Dark Mode: Quick toggle for Dark vs Original White PDF Paper */}
          {isDarkMode && (
            <button
              onClick={handleToggleInvertPaper}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium transition-colors cursor-pointer ${
                appearance.invertPdfInDarkMode !== false
                  ? "bg-blue-950/60 border-blue-500/50 text-blue-300"
                  : "bg-[#1F242F] border-[#2D333B] text-gray-400 hover:text-gray-200"
              }`}
              title={
                appearance.invertPdfInDarkMode !== false
                  ? "Kertas PDF digelapkan. Klik untuk melihat kertas putih asli."
                  : "Kertas PDF putih asli. Klik untuk menggelapkan kertas PDF."
              }
            >
              {appearance.invertPdfInDarkMode !== false ? (
                <>
                  <Moon className="w-3 h-3 text-blue-400" />
                  <span className="hidden md:inline">Kertas: Gelap</span>
                </>
              ) : (
                <>
                  <Sun className="w-3 h-3 text-amber-400" />
                  <span className="hidden md:inline">Kertas: Asli</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onOpenAppearanceModal}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1F242F] hover:bg-[#2A313F] border border-[#2D333B] text-[11px] font-medium text-gray-300 transition-colors cursor-pointer"
            title="Buka Pengaturan Tipografi, Warna Latar & Font Lengkap"
          >
            <Type className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">Tipografi</span>
          </button>
        </div>
      </div>

      {/* Karaoke / Active reading sentence banner */}
      {activeReadingSentence && !isReadingBannerDismissed && (
        <div
          id="active-reading-karaoke-banner"
          className="sticky top-1 sm:top-2 z-20 mb-3 sm:mb-4 max-w-2xl w-full px-3 sm:px-4 py-2 rounded-lg bg-[#14171D]/95 backdrop-blur-xs border border-blue-500/40 text-blue-200 shadow-2xl flex items-center gap-2.5 sm:gap-3 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="w-7 h-7 rounded bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            <Volume2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-blue-400 block">
              MEMBACA SUARA (READING ALOUD)
            </span>
            <p className="text-xs sm:text-sm font-medium leading-relaxed text-gray-200 line-clamp-2">
              "{activeReadingSentence}"
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1">
            {onStopSpeaking && (
              <button
                type="button"
                id="btn-stop-reading-banner"
                onClick={onStopSpeaking}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                title="Hentikan Pembacaan Suara (Stop)"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="hidden xs:inline sm:inline">Stop</span>
              </button>
            )}
            <button
              type="button"
              id="btn-close-reading-banner"
              onClick={() => {
                setIsReadingBannerDismissed(true);
                onStopSpeaking?.();
              }}
              className="p-1 sm:p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Tutup & Hentikan Read Aloud"
              aria-label="Tutup dan hentikan Read Aloud"
            >
              <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center my-auto py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-xs font-mono text-gray-400">
            MEMUAT HALAMAN {currentPage}...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="max-w-md p-6 my-auto text-center rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-3">
          <p className="text-sm font-semibold">Gagal Membuka PDF</p>
          <p className="text-xs leading-relaxed text-rose-200/90 break-words">{error}</p>
          {(onOpenOtherPdf || onLoadSamplePdf) && (
            <div className="flex items-center justify-center gap-2 pt-2">
              {onOpenOtherPdf && (
                <button
                  onClick={onOpenOtherPdf}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors"
                >
                  Buka PDF Lain
                </button>
              )}
              {onLoadSamplePdf && (
                <button
                  onClick={onLoadSamplePdf}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs font-medium cursor-pointer border border-neutral-700 transition-colors"
                >
                  Buka Dokumen Contoh
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: REFLOW TYPOGRAPHY TEXT MODE */}
      {!isLoading && !error && appearance.viewMode === "text" && (
        <div
          id="pdf-reflow-text-wrapper"
          className={`w-full max-w-3xl my-2 sm:my-4 rounded-xl border p-5 sm:p-10 shadow-2xl transition-all select-text mb-14 sm:mb-10 ${
            flipDirection === "next"
              ? "animate-in slide-in-from-right-4 duration-200"
              : flipDirection === "prev"
              ? "animate-in slide-in-from-left-4 duration-200"
              : ""
          }`}
          style={{
            backgroundColor: paperBgColor,
            borderColor: isDarkMode ? "#2D333B" : "#e5e7eb",
            color: isDarkMode ? activeTone.textColorDark : activeTone.textColorLight,
            fontFamily: activeFont.fontFamily,
            fontSize: `${appearance.fontSize || 18}px`,
            lineHeight: appearance.lineHeight || 1.6,
            transform: isSwiping && dragOffset !== 0 ? `translateX(${dragOffset}px)` : "none",
            transition: isSwiping ? "none" : "transform 0.2s ease-out",
          }}
        >
          {/* Chapter / Page Sub-header */}
          <div className="flex flex-wrap items-center justify-between pb-3 mb-6 border-b border-gray-700/30 text-xs text-gray-400 select-none gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wide uppercase text-[10px] text-blue-400">
                {activeFont.name} &bull; {appearance.fontSize || 18}px
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                {pageParagraphs.length || (pageTextContent ? 1 : 0)} Paragraf
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              {/* Indent toggle */}
              <button
                type="button"
                id="btn-reflow-toggle-indent"
                onClick={() => setParagraphIndent((prev) => !prev)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                  paragraphIndent
                    ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                    : "bg-[#1F242F] border-[#2D333B] text-gray-400 hover:text-gray-200"
                }`}
                title="Aktifkan / Nonaktifkan lekuk baris pertama paragraf (Indentation)"
              >
                {paragraphIndent ? "Indentasi: Aktif" : "Indentasi: Rata"}
              </button>

              {/* Text align toggle */}
              <button
                type="button"
                id="btn-reflow-toggle-align"
                onClick={() => setTextAlign((prev) => (prev === "justify" ? "left" : "justify"))}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1F242F] border border-[#2D333B] text-gray-400 hover:text-gray-200 transition-colors cursor-pointer flex items-center gap-1"
                title="Ganti perataan teks (Rata Kiri vs Rata Kanan-Kiri/Justify)"
              >
                {textAlign === "justify" ? (
                  <>
                    <AlignJustify className="w-3 h-3" />
                    <span className="hidden sm:inline">Justify</span>
                  </>
                ) : (
                  <>
                    <AlignLeft className="w-3 h-3" />
                    <span className="hidden sm:inline">Rata Kiri</span>
                  </>
                )}
              </button>

              <span className="font-mono text-gray-400 hidden sm:inline ml-1">
                {pageTextContent.split(/\s+/).filter(Boolean).length} Kata
              </span>
            </div>
          </div>

          {/* Rendered Paragraphs */}
          {pageParagraphs.length > 0 || pageTextContent ? (
            <div
              className={`space-y-5 sm:space-y-6 ${
                textAlign === "justify" ? "text-justify" : "text-left"
              }`}
            >
              {(pageParagraphs.length > 0
                ? pageParagraphs
                : pageTextContent.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
              ).map((paragraph, pIdx) => {
                const isCurrentKaraoke =
                  activeReadingSentence &&
                  paragraph.toLowerCase().includes(activeReadingSentence.toLowerCase());

                const isHeading =
                  paragraph.length <= 85 &&
                  !/[.?!]\s*$/.test(paragraph) &&
                  (pIdx === 0 ||
                    /^[A-Z0-9\s:—–-]+$/.test(paragraph) ||
                    /^Bab\s+\d+|^Chapter\s+\d+/i.test(paragraph));

                if (isHeading) {
                  return (
                    <h3
                      key={pIdx}
                      className={`font-bold tracking-tight text-left transition-colors duration-150 ${
                        pIdx === 0
                          ? "text-xl sm:text-2xl mt-2 mb-4"
                          : "text-base sm:text-lg mt-6 mb-3"
                      } ${
                        isCurrentKaraoke
                          ? "bg-blue-600/20 text-blue-200 rounded p-1.5 ring-1 ring-blue-500/40"
                          : ""
                      }`}
                      style={{
                        color: isDarkMode ? "#F3F4F6" : "#111827",
                      }}
                    >
                      {paragraph}
                    </h3>
                  );
                }

                return (
                  <p
                    key={pIdx}
                    className={`transition-colors duration-150 leading-relaxed whitespace-pre-line ${
                      paragraphIndent ? "indent-6 sm:indent-8" : "indent-0"
                    } ${
                      isCurrentKaraoke
                        ? "bg-blue-600/20 text-blue-200 rounded p-2 ring-1 ring-blue-500/40"
                        : ""
                    }`}
                  >
                    {paragraph}
                  </p>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm italic">
              Tidak ada teks yang dapat diekstrak pada halaman ini (halaman mungkin berupa gambar hasil scan). Silakan gunakan Tampilan Halaman Asli.
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ORIGINAL CANVAS PAPER CONTAINER */}
      {!isLoading && !error && appearance.viewMode !== "text" && (
        <div
          id="pdf-canvas-wrapper"
          className={`relative shadow-2xl rounded-sm border transition-transform duration-150 mb-14 sm:mb-10 ${
            flipDirection === "next"
              ? "animate-in slide-in-from-right-4 duration-200"
              : flipDirection === "prev"
              ? "animate-in slide-in-from-left-4 duration-200"
              : ""
          }`}
          style={{
            backgroundColor: paperBgColor,
            borderColor: isDarkMode ? "#2D333B" : "#e5e7eb",
            isolation: "isolate",
            transform: isSwiping && dragOffset !== 0 ? `translateX(${dragOffset}px)` : "none",
            transition: isSwiping ? "none" : "transform 0.2s ease-out",
          }}
        >
          <canvas
            id="pdf-render-canvas"
            ref={canvasRef}
            className="block select-text"
            style={{
              filter: canvasFilter,
              WebkitFilter: canvasFilter,
              transition: "filter 0.2s ease-in-out",
            }}
          />
        </div>
      )}
    </div>
  );
};
