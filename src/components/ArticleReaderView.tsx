import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Globe,
  ShieldCheck,
  ExternalLink,
  Volume2,
  Sparkles,
  Copy,
  Check,
  Square,
  X,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Type,
  AlignJustify,
  AlignLeft,
  FileText,
  Clock,
} from "lucide-react";
import { AppearanceSettings, StoredArticle, TtsFilterSettings } from "../types";
import { DARK_PRESETS, LIGHT_PRESETS, TEXT_TONES, FONT_OPTIONS } from "../lib/themePresets";
import { buildArticlePageTtsText, paginateArticleBlocks } from "../lib/articleStorage";

interface ArticleReaderViewProps {
  article: StoredArticle;
  currentPage: number;
  onPageChange: (page: number) => void;
  appearance: AppearanceSettings;
  onAppearanceChange: (settings: AppearanceSettings) => void;
  onOpenAppearanceModal: () => void;
  dimmerLevel: number;
  onPageTextExtracted: (text: string) => void;
  onPageTtsTextExtracted: (filteredText: string, filteredHeaders: string[]) => void;
  ttsFilterSettings?: TtsFilterSettings;
  activeReadingSentence?: string;
  onReadSelectedText: (text: string) => void;
  onAskAiAboutText: (text: string) => void;
  onStopSpeaking?: () => void;
  onOpenWebArticleModal: () => void;
  onSwitchBackToPdf?: () => void;
  hasLoadedPdf: boolean;
}

export const ArticleReaderView: React.FC<ArticleReaderViewProps> = ({
  article,
  currentPage,
  onPageChange,
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
  onOpenWebArticleModal,
  onSwitchBackToPdf,
  hasLoadedPdf,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [selectedText, setSelectedText] = useState("");
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isReadingBannerDismissed, setIsReadingBannerDismissed] = useState(false);

  const [paragraphIndent, setParagraphIndent] = useState<boolean>(false);
  const [textAlign, setTextAlign] = useState<"left" | "justify">("left");

  // Touch slide gestures
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev" | null>(null);

  const pages = useMemo(() => paginateArticleBlocks(article.blocks), [article.id, article.blocks]);
  const totalPages = pages.length;
  const safePageIndex = Math.max(0, Math.min(totalPages - 1, currentPage - 1));
  const currentSlice = pages[safePageIndex] || pages[0];

  useEffect(() => {
    if (activeReadingSentence) {
      setIsReadingBannerDismissed(false);
    }
  }, [activeReadingSentence]);

  // Reset scroll to top on page change
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [article.id, currentPage]);

  // Emit current page text for TTS (filtered), AI Q&A, and Live Voice
  useEffect(() => {
    const { plainText, ttsText, filteredHeaders } = buildArticlePageTtsText(
      article,
      currentSlice,
      ttsFilterSettings
    );
    onPageTextExtracted(plainText);
    onPageTtsTextExtracted(ttsText, filteredHeaders);
  }, [
    article,
    currentPage,
    currentSlice,
    ttsFilterSettings?.skipHeadersFooters,
    ttsFilterSettings?.skipChapterHeadings,
    ttsFilterSettings?.customIgnoredLines,
  ]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!appearance.slideGesturesEnabled) return;
    if (e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setDragOffset(0);
      setIsSwiping(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!appearance.slideGesturesEnabled || touchStartX === null || touchStartY === null) return;
    if (e.touches.length > 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    if (Math.abs(diffX) > 25 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
      setIsSwiping(true);
      setDragOffset(Math.max(-90, Math.min(90, diffX * 0.45)));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!appearance.slideGesturesEnabled || touchStartX === null || touchStartY === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - touchStartX;
    const diffY = endY - touchStartY;

    if (diffX < -60 && Math.abs(diffX) > Math.abs(diffY) * 1.3 && currentPage < totalPages) {
      setFlipDirection("next");
      onPageChange(currentPage + 1);
    } else if (diffX > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.3 && currentPage > 1) {
      setFlipDirection("prev");
      onPageChange(currentPage - 1);
    }

    setIsSwiping(false);
    setDragOffset(0);
    setTouchStartX(null);
    setTouchStartY(null);
    setTimeout(() => setFlipDirection(null), 280);
  };

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

  const paperBgColor = isDarkMode ? appearance.darkBgColor : appearance.lightBgColor;
  const viewportBgColor = isDarkMode
    ? activeDarkPreset.viewportColor || appearance.darkBgColor
    : activeLightPreset.viewportColor || appearance.lightBgColor;
  const textColor = isDarkMode ? activeTone.textColorDark : activeTone.textColorLight;
  const headingColor = isDarkMode ? "#F3F4F6" : "#111827";
  const mutedColor = isDarkMode ? "#9CA3AF" : "#6B7280";

  const handleFontSizeDelta = (delta: number) => {
    const currentSize = appearance.fontSize || 18;
    const newSize = Math.max(12, Math.min(32, currentSize + delta));
    onAppearanceChange({ ...appearance, fontSize: newSize });
  };

  return (
    <div
      id="article-viewport-container"
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
      {/* Night Dimmer Overlay */}
      {dimmerLevel > 0 && (
        <div
          id="screen-dimmer-overlay"
          className="fixed inset-0 pointer-events-none z-40 transition-opacity duration-200"
          style={{ backgroundColor: `rgba(0, 0, 0, ${dimmerLevel})` }}
        />
      )}

      {/* Floating Slide Gesture Feedback */}
      {appearance.slideGesturesEnabled && Math.abs(dragOffset) > 20 && (
        <div className="fixed bottom-16 sm:bottom-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-2xl text-xs font-bold flex items-center gap-2 pointer-events-none bg-emerald-600 text-white border border-emerald-400/40">
          {dragOffset < 0 ? (
            <>
              <span>Bagian Berikutnya ({Math.min(totalPages, currentPage + 1)})</span>
              <ChevronRight className="w-4 h-4 animate-pulse" />
            </>
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 animate-pulse" />
              <span>Bagian Sebelumnya ({Math.max(1, currentPage - 1)})</span>
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
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Jelaskan</span>
          </button>

          <button
            onClick={handleCopySelection}
            className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Salin teks"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Top Quick Article Reader Bar */}
      <div className="w-full max-w-3xl flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 mb-2 rounded-lg bg-[#14171D]/90 border border-[#2D333B] text-xs text-gray-300 backdrop-blur-xs shadow-md select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-semibold text-[11px] shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Bebas Iklan</span>
          </span>

          <button
            onClick={onOpenWebArticleModal}
            className="px-2 py-0.5 rounded bg-[#1F242F] hover:bg-[#2A313F] border border-[#2D333B] text-gray-200 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
            title="Buka URL artikel situs lain atau lihat daftar artikel tersimpan"
          >
            <Globe className="w-3 h-3 text-emerald-400" />
            <span>Ganti Artikel</span>
          </button>

          {hasLoadedPdf && onSwitchBackToPdf && (
            <button
              onClick={onSwitchBackToPdf}
              className="px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
              title="Kembali membaca dokumen PDF"
            >
              <FileText className="w-3 h-3" />
              <span className="hidden sm:inline">Kembali ke PDF</span>
            </button>
          )}
        </div>

        {/* Font & Typography Quick Controls */}
        <div className="flex items-center gap-1.5">
          <select
            value={appearance.fontFamily || "sans"}
            onChange={(e) =>
              onAppearanceChange({
                ...appearance,
                fontFamily: e.target.value as AppearanceSettings["fontFamily"],
              })
            }
            className="hidden sm:block text-[11px] py-0.5 px-1.5 rounded bg-[#1F242F] border border-[#2D333B] text-gray-200 font-medium focus:outline-hidden cursor-pointer"
            title="Ganti Jenis Huruf"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-[#1F242F] px-1.5 py-0.5 rounded border border-[#2D333B]">
            <button
              onClick={() => handleFontSizeDelta(-2)}
              disabled={(appearance.fontSize || 18) <= 12}
              className="w-5 h-5 rounded hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center text-gray-300 cursor-pointer"
              title="Perkecil Ukuran Font"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono text-[11px] font-bold px-1 text-blue-400 min-w-[28px] text-center">
              {appearance.fontSize || 18}px
            </span>
            <button
              onClick={() => handleFontSizeDelta(2)}
              disabled={(appearance.fontSize || 18) >= 32}
              className="w-5 h-5 rounded hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center text-gray-300 cursor-pointer"
              title="Perbesar Ukuran Font"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={onOpenAppearanceModal}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1F242F] hover:bg-[#2A313F] border border-[#2D333B] text-[11px] font-medium text-gray-300 transition-colors cursor-pointer"
            title="Pengaturan Tema, Warna & Tipografi"
          >
            <Type className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">Tipografi</span>
          </button>
        </div>
      </div>

      {/* Karaoke / Active Reading Banner */}
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
              &ldquo;{activeReadingSentence}&rdquo;
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1">
            {onStopSpeaking && (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsReadingBannerDismissed(true);
                onStopSpeaking?.();
              }}
              className="p-1 sm:p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Clean Ad-Free Article Paper Container */}
      <article
        id="web-article-paper"
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
          color: textColor,
          fontFamily: activeFont.fontFamily,
          fontSize: `${appearance.fontSize || 18}px`,
          lineHeight: appearance.lineHeight || 1.65,
          transform: isSwiping && dragOffset !== 0 ? `translateX(${dragOffset}px)` : "none",
          transition: isSwiping ? "none" : "transform 0.2s ease-out",
        }}
      >
        {/* Editorial Header on Page 1 */}
        {currentPage === 1 && (
          <header className="pb-6 mb-6 border-b border-gray-500/25 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: mutedColor }}>
              <div className="flex items-center gap-2 font-sans">
                <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-semibold text-emerald-500">
                  {article.siteName || article.domain}
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ~{article.readingMinutes} menit baca
                </span>
              </div>

              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-sans text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
              >
                <span>Buka Situs Asli</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <h1
              className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight"
              style={{ color: headingColor }}
            >
              {article.title}
            </h1>

            {(article.byline || article.publishedTime) && (
              <div className="text-xs sm:text-sm font-sans flex flex-wrap items-center gap-2" style={{ color: mutedColor }}>
                {article.byline && <span>Oleh {article.byline}</span>}
                {article.byline && article.publishedTime && <span>&bull;</span>}
                {article.publishedTime && (
                  <span>
                    {(() => {
                      const d = new Date(article.publishedTime);
                      return Number.isNaN(d.getTime())
                        ? article.publishedTime
                        : d.toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          });
                    })()}
                  </span>
                )}
              </div>
            )}
          </header>
        )}

        {/* Typography Sub-header */}
        <div className="flex flex-wrap items-center justify-between pb-3 mb-6 border-b border-gray-500/20 text-xs text-gray-400 select-none gap-2 font-sans">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-wide uppercase text-[10px] text-emerald-400">
              Bagian {currentPage} / {totalPages}
            </span>
            <span>&bull;</span>
            <span className="text-[11px]">{activeFont.name}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setParagraphIndent((prev) => !prev)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                paragraphIndent
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                  : "bg-[#1F242F] border-[#2D333B] text-gray-400 hover:text-gray-200"
              }`}
            >
              {paragraphIndent ? "Indentasi: Aktif" : "Indentasi: Rata"}
            </button>

            <button
              type="button"
              onClick={() => setTextAlign((prev) => (prev === "justify" ? "left" : "justify"))}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1F242F] border border-[#2D333B] text-gray-400 hover:text-gray-200 transition-colors cursor-pointer flex items-center gap-1"
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
          </div>
        </div>

        {/* Clean Article Content Blocks */}
        <div className={`space-y-5 sm:space-y-6 ${textAlign === "justify" ? "text-justify" : "text-left"}`}>
          {currentSlice.blocks.map((block, idx) => {
            if (block.type === "heading") {
              const isCurrentKaraoke =
                activeReadingSentence &&
                block.text.toLowerCase().includes(activeReadingSentence.toLowerCase());
              const headingClass =
                block.level === 1 || block.level === 2
                  ? "text-xl sm:text-2xl mt-6 mb-2"
                  : "text-base sm:text-lg mt-5 mb-2";
              return (
                <h2
                  key={idx}
                  className={`font-bold tracking-tight text-left transition-colors duration-150 ${headingClass} ${
                    isCurrentKaraoke ? "bg-blue-600/20 rounded p-1.5 ring-1 ring-blue-500/40" : ""
                  }`}
                  style={{ color: headingColor }}
                >
                  {block.text}
                </h2>
              );
            }

            if (block.type === "blockquote") {
              return (
                <blockquote
                  key={idx}
                  className="pl-4 py-1 border-l-4 border-emerald-500/70 italic opacity-90 text-left"
                >
                  {block.text}
                </blockquote>
              );
            }

            if (block.type === "list") {
              const ListTag = block.ordered ? "ol" : "ul";
              return (
                <ListTag
                  key={idx}
                  className={`pl-6 space-y-2 text-left ${
                    block.ordered ? "list-decimal" : "list-disc"
                  }`}
                >
                  {block.items.map((item, i) => (
                    <li key={i} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ListTag>
              );
            }

            if (block.type === "image") {
              return (
                <figure key={idx} className="my-6 flex flex-col items-center">
                  <img
                    src={block.src}
                    alt={block.alt || "Ilustrasi artikel"}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget.parentElement as HTMLElement | null)?.classList.add("hidden");
                    }}
                    className="max-w-full max-h-[460px] rounded-lg object-contain border border-gray-500/20 shadow-md"
                  />
                  {block.alt && (
                    <figcaption className="mt-2 text-xs text-center font-sans" style={{ color: mutedColor }}>
                      {block.alt}
                    </figcaption>
                  )}
                </figure>
              );
            }

            const isCurrentKaraoke =
              activeReadingSentence &&
              block.text.toLowerCase().includes(activeReadingSentence.toLowerCase());

            return (
              <p
                key={idx}
                className={`transition-colors duration-150 leading-relaxed ${
                  paragraphIndent ? "indent-6 sm:indent-8" : "indent-0"
                } ${
                  isCurrentKaraoke ? "bg-blue-600/20 rounded p-2 ring-1 ring-blue-500/40" : ""
                }`}
              >
                {block.text}
              </p>
            );
          })}
        </div>

        {/* Bottom Section Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-10 pt-5 border-t border-gray-500/25 flex items-center justify-between gap-2 font-sans select-none">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-lg bg-[#1F2937] hover:bg-[#2D333B] disabled:opacity-35 disabled:cursor-not-allowed text-gray-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            <span className="text-xs font-mono" style={{ color: mutedColor }}>
              Bagian {currentPage} dari {totalPages}
            </span>

            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Selanjutnya</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </article>
    </div>
  );
};
