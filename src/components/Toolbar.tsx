import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Search,
  Bookmark,
  LayoutGrid,
  ListTree,
  Volume2,
  Square,
  Play,
  Pause,
  Maximize2,
  Sparkles,
  Palette,
  MoveHorizontal,
  Smartphone,
  MoreVertical,
  X,
  Type,
  Minus,
  Plus,
  BookOpen,
  FileText,
  Moon,
  Sun,
  Sliders,
  Cpu,
  Headphones,
  FileAudio,
} from "lucide-react";
import { ReadingTheme, TtsEngine, AppearanceSettings, GeminiTtsModelId } from "../types";
import { FONT_OPTIONS } from "../lib/themePresets";
import { GEMINI_TTS_MODELS, GEMINI_VOICE_OPTIONS } from "../lib/geminiModels";

interface ToolbarProps {
  theme: ReadingTheme;
  appearance: AppearanceSettings;
  onAppearanceChange?: (settings: AppearanceSettings) => void;
  onOpenAppearanceModal: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onRotate: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  showThumbnails: boolean;
  onToggleThumbnails: () => void;
  showOutline: boolean;
  onToggleOutline: () => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  onToggleAiChat?: () => void;
  // TTS props
  ttsEngine: TtsEngine;
  onTtsEngineChange: (engine: TtsEngine) => void;
  geminiModel?: GeminiTtsModelId;
  onGeminiModelChange?: (model: GeminiTtsModelId) => void;
  geminiVoice: string;
  onGeminiVoiceChange: (voice: string) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  isSpeaking: boolean;
  isPaused: boolean;
  onPlayPage: () => void;
  onPauseSpeaking: () => void;
  onResumeSpeaking: () => void;
  onStopSpeaking: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  hasSelectedText: boolean;
  onReadSelectedText: () => void;
  geminiQuotaReached?: boolean;
  hasStyleInstruction?: boolean;
  onOpenTtsSettings?: () => void;
  onOpenTtsLibrary?: () => void;
  ttsClipsCount?: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  theme,
  appearance,
  onAppearanceChange,
  onOpenAppearanceModal,
  currentPage,
  totalPages,
  onPageChange,
  zoom,
  onZoomChange,
  onFitWidth,
  onFitPage,
  onRotate,
  isBookmarked,
  onToggleBookmark,
  showThumbnails,
  onToggleThumbnails,
  showOutline,
  onToggleOutline,
  showSearch,
  onToggleSearch,
  onToggleAiChat,
  ttsEngine,
  onTtsEngineChange,
  geminiModel = "gemini-3.8-flash-lite-tts",
  onGeminiModelChange,
  geminiVoice,
  onGeminiVoiceChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  isSpeaking,
  isPaused,
  onPlayPage,
  onPauseSpeaking,
  onResumeSpeaking,
  onStopSpeaking,
  autoAdvance,
  onToggleAutoAdvance,
  hasSelectedText,
  onReadSelectedText,
  geminiQuotaReached,
  hasStyleInstruction,
  onOpenTtsSettings,
  onOpenTtsLibrary,
  ttsClipsCount = 0,
}) => {
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState(String(currentPage));

  const isDark = appearance.mode === "dark";

  const themeClasses = isDark
    ? "bg-[#14171D] border-[#1F2937] text-[#E5E7EB]"
    : "bg-neutral-50 border-neutral-200 text-neutral-800";

  const handleFontSizeDelta = (delta: number) => {
    if (!onAppearanceChange) return;
    const currentSize = appearance.fontSize || 18;
    const newSize = Math.max(12, Math.min(32, currentSize + delta));
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

  const handleToggleViewMode = () => {
    if (!onAppearanceChange) return;
    const nextMode = appearance.viewMode === "text" ? "canvas" : "text";
    onAppearanceChange({ ...appearance, viewMode: nextMode });
  };

  const handleToggleInvertPaper = () => {
    if (!onAppearanceChange) return;
    const nextInvert = appearance.invertPdfInDarkMode === false ? true : false;
    onAppearanceChange({ ...appearance, invertPdfInDarkMode: nextInvert });
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      onPageChange(p);
      setShowJumpModal(false);
    }
  };

  return (
    <>
      {/* 1. DESKTOP / TABLET TOP TOOLBAR (Hidden on mobile portrait) */}
      <div
        id="app-toolbar"
        className={`hidden sm:flex border-b px-3 py-1.5 items-center justify-between gap-y-2 gap-x-3 text-xs select-none z-20 ${themeClasses}`}
      >
        {/* Left Group: Navigation & Views */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Toggle Thumbnails */}
          <button
            id="btn-toggle-thumbnails"
            onClick={onToggleThumbnails}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showThumbnails
                ? "bg-blue-600 text-white font-semibold"
                : "hover:bg-[#1F2937] text-gray-400 hover:text-gray-200"
            }`}
            title="Page Thumbnails"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Outline / TOC */}
          <button
            id="btn-toggle-outline"
            onClick={onToggleOutline}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showOutline
                ? "bg-blue-600 text-white font-semibold"
                : "hover:bg-[#1F2937] text-gray-400 hover:text-gray-200"
            }`}
            title="Table of Contents / Bookmarks"
          >
            <ListTree className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Search */}
          <button
            id="btn-toggle-search"
            onClick={onToggleSearch}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showSearch
                ? "bg-blue-600 text-white font-semibold"
                : "hover:bg-[#1F2937] text-gray-400 hover:text-gray-200"
            }`}
            title="Search in Document (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <div className="h-5 w-px bg-[#1F2937] mx-0.5" />

          {/* Page Nav */}
          <div className="flex items-center gap-1">
            <button
              id="btn-prev-page"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Previous Page (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              <input
                id="input-page-number"
                type="number"
                min={1}
                max={totalPages || 1}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    onPageChange(val);
                  }
                }}
                className="w-11 text-center py-0.5 px-1 rounded border border-[#1F2937] bg-[#0F1115] text-gray-200 font-mono text-xs font-semibold focus:outline-hidden focus:border-blue-500"
              />
              <span className="text-gray-500 font-mono text-xs">/ {totalPages || 1}</span>
            </div>

            <button
              id="btn-next-page"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Next Page (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Bookmark page */}
          <button
            id="btn-bookmark"
            onClick={onToggleBookmark}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isBookmarked
                ? "text-blue-400 bg-blue-600/15 font-semibold"
                : "hover:bg-[#1F2937] text-gray-400 hover:text-gray-200"
            }`}
            title={isBookmarked ? "Remove Bookmark" : "Bookmark this Page"}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-blue-500 text-blue-500" : ""}`} />
          </button>
        </div>

        {/* Center Group: Read Aloud / Audio Player */}
        <div className="flex items-center gap-2 bg-[#1F2937] px-2.5 py-1 rounded border border-[#2D333B]">
          <div className="flex items-center gap-1.5">
            <Volume2
              className={`w-3.5 h-3.5 ${
                isSpeaking ? "text-blue-400 animate-pulse" : "text-gray-400"
              }`}
            />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 hidden lg:inline">
              Read Aloud:
            </span>
          </div>

          {/* Read Current Page or Read Selection */}
          {hasSelectedText ? (
            <button
              id="btn-read-selection"
              onClick={onReadSelectedText}
              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] shadow-xs active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
              title="Read highlighted text snippet"
            >
              <Sparkles className="w-3 h-3" />
              Read Selection
            </button>
          ) : null}

          {!isSpeaking ? (
            <button
              id="btn-play-page"
              onClick={onPlayPage}
              className="px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] shadow-xs active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
              title="Read entire page aloud"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Read Page</span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {isPaused ? (
                <button
                  id="btn-resume-speaking"
                  onClick={onResumeSpeaking}
                  className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  title="Resume reading"
                >
                  <Play className="w-3 h-3 fill-current" />
                </button>
              ) : (
                <button
                  id="btn-pause-speaking"
                  onClick={onPauseSpeaking}
                  className="p-1 rounded bg-[#2D333B] hover:bg-gray-700 text-gray-200 cursor-pointer"
                  title="Pause reading"
                >
                  <Pause className="w-3 h-3" />
                </button>
              )}
              <button
                id="btn-stop-speaking"
                onClick={onStopSpeaking}
                className="p-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                title="Stop reading"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            </div>
          )}

          {/* TTS Engine Selector */}
          <select
            id="select-tts-engine"
            value={ttsEngine}
            onChange={(e) => onTtsEngineChange(e.target.value as TtsEngine)}
            className="text-[11px] py-0.5 px-1.5 rounded border border-[#1F2937] bg-[#0F1115] text-gray-300 font-medium focus:outline-hidden focus:border-blue-500 cursor-pointer"
            title="Pilih Engine Suara"
          >
            <option value="gemini">
              {geminiQuotaReached ? "Gemini TTS (Quota Reached)" : "Gemini AI Audio"}
            </option>
            <option value="webspeech">Perangkat Lokal (Offline)</option>
          </select>

          {/* Gemini Model & Voice Selector (when Gemini engine active) */}
          {ttsEngine === "gemini" && onGeminiModelChange && (
            <select
              id="select-gemini-tts-model"
              value={geminiModel}
              onChange={(e) => onGeminiModelChange(e.target.value as GeminiTtsModelId)}
              className="text-[11px] py-0.5 px-1.5 rounded border border-blue-500/30 bg-[#0F1115] text-blue-300 font-medium focus:outline-hidden focus:border-blue-500 cursor-pointer max-w-[155px] truncate"
              title="Pilih Model Gemini 3.8 Stream TTS"
            >
              {GEMINI_TTS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortLabel} (Stream)
                </option>
              ))}
            </select>
          )}

          {ttsEngine === "gemini" && (
            <select
              id="select-gemini-voice"
              value={geminiVoice}
              onChange={(e) => onGeminiVoiceChange(e.target.value)}
              className="text-[11px] py-0.5 px-1.5 rounded border border-[#1F2937] bg-[#0F1115] text-gray-200 font-medium focus:outline-hidden focus:border-blue-500 cursor-pointer max-w-[125px] truncate hidden md:inline-block"
              title="Pilih Suara Gemini 3.8 TTS"
            >
              {GEMINI_VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.isNew38 ? "(3.8)" : ""}
                </option>
              ))}
            </select>
          )}

          {/* Speed Selector */}
          <select
            id="select-playback-speed"
            value={playbackSpeed}
            onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
            className="text-[11px] py-0.5 px-1 rounded border border-[#1F2937] bg-[#0F1115] text-gray-300 font-mono font-medium focus:outline-hidden focus:border-blue-500 cursor-pointer"
            title="Kecepatan Pembacaan"
          >
            <option value="0.75">0.75x</option>
            <option value="1.0">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </select>

          {/* Detailed TTS, Voice & StyleInstruction Settings Button */}
          {onOpenTtsSettings && (
            <button
              id="btn-open-tts-settings"
              onClick={onOpenTtsSettings}
              className={`relative p-1 rounded border transition-colors cursor-pointer ${
                hasStyleInstruction
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30"
                  : "bg-[#0F1115] hover:bg-[#2D333B] text-gray-300 hover:text-white border-[#2D333B]"
              }`}
              title={
                hasStyleInstruction
                  ? "Pengaturan Model, Suara 3.8 & StyleInstruction (Aktif)"
                  : "Buka Pengaturan Lengkap Model Gemini, Suara TTS & StyleInstruction"
              }
            >
              <Sliders className="w-3 h-3 text-blue-400" />
              {hasStyleInstruction && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400"
                  aria-hidden="true"
                />
              )}
            </button>
          )}

          {/* Saved Generated TTS Audio Library Button */}
          {onOpenTtsLibrary && (
            <button
              id="btn-open-tts-library"
              onClick={onOpenTtsLibrary}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 hover:text-emerald-200 text-[11px] font-semibold transition-colors cursor-pointer"
              title="Lihat & Download Semua Hasil Generate Audio TTS"
            >
              <FileAudio className="w-3 h-3 text-emerald-400" />
              <span className="hidden xl:inline">Hasil TTS</span>
              {ttsClipsCount > 0 && (
                <span className="px-1 rounded-full bg-emerald-500/25 text-emerald-200 text-[10px] font-mono font-bold">
                  {ttsClipsCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right Group: Typography, Appearance Modal Trigger, & Zoom Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Mode Teks (Reflow) / Halaman Asli Toggle */}
          <button
            id="btn-toolbar-toggle-viewmode"
            onClick={handleToggleViewMode}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer font-medium ${
              appearance.viewMode === "text"
                ? "bg-blue-600 text-white shadow-xs"
                : "hover:bg-[#1F2937] text-gray-300 border border-[#2D333B]"
            }`}
            title={appearance.viewMode === "text" ? "Beralih ke Tampilan Halaman PDF Asli" : "Beralih ke Mode Baca Teks (Reflow E-Reader)"}
          >
            {appearance.viewMode === "text" ? (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Mode Teks</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden lg:inline">Reflow</span>
              </>
            )}
          </button>

          {/* Font Family Selector Dropdown */}
          <div
            className="hidden md:flex items-center gap-1 bg-[#0F1115] border border-[#1F2937] rounded px-1.5 py-0.5"
            title="Pilih Jenis Huruf (Font Family)"
          >
            <Type className="w-3 h-3 text-blue-400 shrink-0" />
            <select
              id="select-toolbar-font-family"
              value={appearance.fontFamily || "sans"}
              onChange={(e) => handleFontFamilySelect(e.target.value)}
              className="bg-transparent text-gray-200 text-xs font-medium focus:outline-hidden cursor-pointer"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.id} value={f.id} className="bg-[#14171D] text-gray-200">
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size Stepper */}
          <div
            className="flex items-center gap-0.5 bg-[#0F1115] border border-[#1F2937] rounded px-1 py-0.5"
            title="Ukuran Font (A- / A+)"
          >
            <button
              id="btn-toolbar-font-dec"
              onClick={() => handleFontSizeDelta(-2)}
              disabled={(appearance.fontSize || 18) <= 12}
              className="p-0.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 cursor-pointer"
              title="Perkecil Ukuran Font (A-)"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono text-xs font-bold text-blue-400 px-1 min-w-[28px] text-center">
              {appearance.fontSize || 18}px
            </span>
            <button
              id="btn-toolbar-font-inc"
              onClick={() => handleFontSizeDelta(2)}
              disabled={(appearance.fontSize || 18) >= 32}
              className="p-0.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 cursor-pointer"
              title="Perbesar Ukuran Font (A+)"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* If in Dark Mode: Quick toggle for Inverted Dark Paper vs Original White Paper */}
          {isDark && (
            <button
              id="btn-toolbar-toggle-paper"
              onClick={handleToggleInvertPaper}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-colors cursor-pointer ${
                appearance.invertPdfInDarkMode !== false
                  ? "bg-blue-950/60 border-blue-500/50 text-blue-300"
                  : "bg-[#1F2937] border-[#2D333B] text-gray-400 hover:text-gray-200"
              }`}
              title={
                appearance.invertPdfInDarkMode !== false
                  ? "Kertas PDF digelapkan. Klik untuk melihat kertas putih asli."
                  : "Kertas PDF putih asli. Klik untuk menggelapkan kertas PDF."
              }
            >
              {appearance.invertPdfInDarkMode !== false ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden xl:inline">Kertas: Gelap</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xl:inline">Kertas: Asli</span>
                </>
              )}
            </button>
          )}

          {/* Appearance & Dark Mode Color Picker Button */}
          <button
            id="btn-open-appearance-modal"
            onClick={onOpenAppearanceModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gradient-to-r from-indigo-600/20 to-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 transition-all cursor-pointer font-medium"
            title="Atur Warna Latar Gelap/Terang & Mode Teks"
          >
            <Palette className="w-3.5 h-3.5 text-blue-400" />
            <span>Tema & Warna</span>
          </button>

          <div className="h-4 w-px bg-[#1F2937] mx-0.5" />

          {/* Zoom Out */}
          <button
            id="btn-zoom-out"
            disabled={zoom <= 0.4}
            onClick={() => onZoomChange(Math.max(0.4, zoom - 0.15))}
            className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Zoom display & dropdown */}
          <select
            id="select-zoom"
            value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="text-xs py-0.5 px-1 rounded border border-[#1F2937] bg-[#0F1115] text-gray-300 font-mono font-medium focus:outline-hidden focus:border-blue-500 cursor-pointer"
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1.0">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2.0">200%</option>
          </select>

          {/* Zoom In */}
          <button
            id="btn-zoom-in"
            disabled={zoom >= 3.0}
            onClick={() => onZoomChange(Math.min(3.0, zoom + 0.15))}
            className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Fit Width */}
          <button
            id="btn-fit-width"
            onClick={onFitWidth}
            className="px-2 py-0.5 rounded hover:bg-[#1F2937] text-gray-300 text-[11px] font-medium border border-[#2D333B] cursor-pointer"
            title="Fit Page to Width"
          >
            Fit Width
          </button>

          {/* Rotate Page */}
          <button
            id="btn-rotate"
            onClick={onRotate}
            className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-gray-200 cursor-pointer"
            title="Rotate 90 degrees"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. DEDICATED MOBILE BOTTOM NAVIGATION BAR (Visible on mobile screens) */}
      <div
        id="mobile-bottom-navbar"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#14171D]/95 backdrop-blur-md border-t border-[#222731] px-3 py-2 flex items-center justify-between select-none shadow-2xl"
      >
        {/* Prev Page Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-9 h-9 rounded-lg bg-[#1F242F] disabled:opacity-30 flex items-center justify-center text-gray-200 active:scale-95 transition-transform"
          title="Halaman Sebelumnya"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Center: Tap to Jump Page + Slide hint */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setJumpPageInput(String(currentPage));
              setShowJumpModal(true);
            }}
            className="px-3 py-1 rounded-md bg-[#1F242F] border border-[#2D333B] text-xs font-mono font-bold text-white flex items-center gap-1.5"
            title="Ketuk untuk lompat halaman"
          >
            <span>{currentPage}</span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{totalPages || 1}</span>
          </button>

          {/* Quick Play/Pause Audio */}
          {!isSpeaking ? (
            <button
              onClick={onPlayPage}
              className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform"
              title="Baca Halaman Ini"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          ) : (
            <button
              onClick={isPaused ? onResumeSpeaking : onPauseSpeaking}
              className="w-9 h-9 rounded-lg bg-amber-500 text-neutral-900 flex items-center justify-center shadow-md active:scale-95 transition-transform"
              title={isPaused ? "Lanjutkan Membaca" : "Jeda Suara"}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current ml-0.5" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          {/* Quick Appearance & Dark Mode trigger */}
          <button
            onClick={onOpenAppearanceModal}
            className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center active:scale-95 transition-transform"
            title="Warna Latar Gelap & Tampilan"
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>

        {/* Next Page Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="w-9 h-9 rounded-lg bg-[#1F242F] disabled:opacity-30 flex items-center justify-center text-gray-200 active:scale-95 transition-transform"
            title="Halaman Berikutnya"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* More options drawer trigger */}
          <button
            onClick={() => setShowMobileMoreMenu(!showMobileMoreMenu)}
            className="w-9 h-9 rounded-lg bg-[#1F242F] text-gray-400 hover:text-white flex items-center justify-center"
            title="Menu Tambahan"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. MOBILE MORE OPTIONS BOTTOM SHEET */}
      {showMobileMoreMenu && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end"
          onClick={() => setShowMobileMoreMenu(false)}
        >
          <div
            className="bg-[#14171D] border-t border-[#2D333B] rounded-t-2xl p-4 space-y-4 max-h-[75vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#222731]">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                Menu & Fitur Membaca
              </span>
              <button
                onClick={() => setShowMobileMoreMenu(false)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  onToggleSearch();
                  setShowMobileMoreMenu(false);
                }}
                className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex flex-col items-center gap-1.5 text-gray-200"
              >
                <Search className="w-5 h-5 text-blue-400" />
                <span className="text-[11px] font-medium">Cari Teks</span>
              </button>

              <button
                onClick={() => {
                  onToggleOutline();
                  setShowMobileMoreMenu(false);
                }}
                className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex flex-col items-center gap-1.5 text-gray-200"
              >
                <ListTree className="w-5 h-5 text-indigo-400" />
                <span className="text-[11px] font-medium">Daftar Isi</span>
              </button>

              <button
                onClick={() => {
                  onToggleThumbnails();
                  setShowMobileMoreMenu(false);
                }}
                className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex flex-col items-center gap-1.5 text-gray-200"
              >
                <LayoutGrid className="w-5 h-5 text-purple-400" />
                <span className="text-[11px] font-medium">Miniatur</span>
              </button>

              <button
                onClick={() => {
                  onToggleBookmark();
                  setShowMobileMoreMenu(false);
                }}
                className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex flex-col items-center gap-1.5 text-gray-200"
              >
                <Bookmark
                  className={`w-5 h-5 ${
                    isBookmarked ? "fill-blue-500 text-blue-500" : "text-gray-400"
                  }`}
                />
                <span className="text-[11px] font-medium">
                  {isBookmarked ? "Bookmark ✓" : "Beri Marka"}
                </span>
              </button>

              <button
                onClick={() => {
                  onRotate();
                  setShowMobileMoreMenu(false);
                }}
                className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex flex-col items-center gap-1.5 text-gray-200"
              >
                <RotateCw className="w-5 h-5 text-amber-400" />
                <span className="text-[11px] font-medium">Putar 90°</span>
              </button>

              <button
                onClick={() => {
                  if (onToggleAiChat) onToggleAiChat();
                  setShowMobileMoreMenu(false);
                }}
                className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex flex-col items-center gap-1.5 text-gray-200"
              >
                <Sparkles className="w-5 h-5 text-blue-400" />
                <span className="text-[11px] font-medium">AI Analisis</span>
              </button>
            </div>

            {/* Mobile TTS Model & Voice Quick Settings */}
            <div className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Headphones className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-200 block">
                    Model TTS & Suara AI
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {ttsEngine === "gemini" ? geminiModel : "Perangkat Lokal (Offline)"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  if (onOpenTtsSettings) onOpenTtsSettings();
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Ubah Model
              </button>
            </div>

            {onOpenTtsLibrary && (
              <div className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <FileAudio className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-200 block">
                      Hasil Generate Audio TTS
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {ttsClipsCount} audio tersimpan
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowMobileMoreMenu(false);
                    onOpenTtsLibrary();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Lihat &amp; Unduh
                </button>
              </div>
            )}

            {/* Mobile Typography & Reading Mode Section */}
            <div className="p-3 rounded-xl bg-[#1A1F29] border border-[#252B36] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-blue-400" />
                  Format & Tipografi
                </span>
                <button
                  onClick={() => {
                    handleToggleViewMode();
                    setShowMobileMoreMenu(false);
                  }}
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    appearance.viewMode === "text"
                      ? "bg-blue-600 text-white"
                      : "bg-[#252B36] text-blue-300"
                  }`}
                >
                  {appearance.viewMode === "text" ? "Mode Teks (Aktif)" : "Beralih Mode Teks"}
                </button>
              </div>

              {/* Mobile Font Family & Font Size */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Jenis Huruf</label>
                  <select
                    value={appearance.fontFamily || "sans"}
                    onChange={(e) => handleFontFamilySelect(e.target.value)}
                    className="w-full text-xs py-1 px-2 rounded-lg bg-[#0F1115] border border-[#2D333B] text-gray-200 font-medium focus:outline-hidden"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id} className="bg-[#14171D]">
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Ukuran Huruf</label>
                  <div className="flex items-center justify-between bg-[#0F1115] border border-[#2D333B] rounded-lg p-1">
                    <button
                      onClick={() => handleFontSizeDelta(-2)}
                      disabled={(appearance.fontSize || 18) <= 12}
                      className="w-6 h-6 rounded bg-[#1F242F] flex items-center justify-center text-xs font-bold text-gray-300 disabled:opacity-30"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs font-bold text-blue-400">
                      {appearance.fontSize || 18}px
                    </span>
                    <button
                      onClick={() => handleFontSizeDelta(2)}
                      disabled={(appearance.fontSize || 18) >= 32}
                      className="w-6 h-6 rounded bg-[#1F242F] flex items-center justify-center text-xs font-bold text-gray-300 disabled:opacity-30"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Dark Paper Toggle & Full Settings Button */}
              <div className="flex gap-2 pt-1">
                {isDark && (
                  <button
                    onClick={handleToggleInvertPaper}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium ${
                      appearance.invertPdfInDarkMode !== false
                        ? "bg-blue-950/60 border-blue-500/50 text-blue-300"
                        : "bg-[#0F1115] border-[#2D333B] text-gray-400"
                    }`}
                  >
                    {appearance.invertPdfInDarkMode !== false ? (
                      <>
                        <Moon className="w-3.5 h-3.5 text-blue-400" />
                        <span>Kertas Gelap</span>
                      </>
                    ) : (
                      <>
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Kertas Putih</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    onOpenAppearanceModal();
                    setShowMobileMoreMenu(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-medium"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Semua Tema</span>
                </button>
              </div>
            </div>

            {/* Gesture notification */}
            <div className="p-3 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center gap-3 text-blue-300 text-xs">
              <MoveHorizontal className="w-5 h-5 text-blue-400 shrink-0" />
              <span>
                <strong>Tip Gestur:</strong> Geser layar ponsel ke kiri atau kanan untuk membalik halaman secara instan!
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. QUICK JUMP PAGE MODAL (For mobile tap) */}
      {showJumpModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowJumpModal(false)}
        >
          <form
            onSubmit={handleJumpSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-[#14171D] border border-[#2D333B] rounded-xl p-4 space-y-3 shadow-2xl text-white"
          >
            <h3 className="text-sm font-bold">Lompat ke Halaman</h3>
            <p className="text-xs text-gray-400">
              Masukkan nomor halaman antara 1 hingga {totalPages}.
            </p>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              className="w-full text-center py-2 text-lg font-mono font-bold rounded-lg border border-[#2D333B] bg-[#0A0C10] text-white focus:outline-hidden focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowJumpModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white shadow-md"
              >
                Buka
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
