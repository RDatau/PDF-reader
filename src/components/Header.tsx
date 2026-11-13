import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Upload,
  Library,
  Moon,
  Sun,
  FileText,
  Sliders,
  Sparkles,
  Mic,
  Palette,
  Settings,
} from "lucide-react";
import { ReadingTheme, AppearanceSettings } from "../types";

interface HeaderProps {
  currentDocName: string;
  theme: ReadingTheme;
  appearance: AppearanceSettings;
  onThemeChange: (theme: ReadingTheme) => void;
  onOpenAppearanceModal: () => void;
  onOpenGeminiSettings: () => void;
  dimmerLevel: number;
  onDimmerChange: (level: number) => void;
  onUploadClick: () => void;
  onLoadSampleClick: () => void;
  onOpenLibraryClick: () => void;
  onOpenLiveVoice: () => void;
  onOpenAiChat: () => void;
  libraryCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentDocName,
  theme,
  appearance,
  onThemeChange,
  onOpenAppearanceModal,
  onOpenGeminiSettings,
  dimmerLevel,
  onDimmerChange,
  onUploadClick,
  onLoadSampleClick,
  onOpenLibraryClick,
  onOpenLiveVoice,
  onOpenAiChat,
  libraryCount,
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showDimmerMenu, setShowDimmerMenu] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const isDark = appearance.mode === "dark";

  const themeClasses = isDark
    ? "bg-[#14171D] border-[#1F2937] text-[#E5E7EB]"
    : "bg-white border-neutral-200 text-neutral-800";

  return (
    <header
      id="app-header"
      className={`h-13 sm:h-14 border-b px-2.5 sm:px-4 flex items-center justify-between transition-colors duration-200 select-none z-30 ${themeClasses}`}
    >
      {/* Left branding and document title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-xs">
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <span className="font-bold text-xs sm:text-sm tracking-tight hidden md:inline-block">
            VOX<span className="text-blue-500">READER</span>
          </span>
        </div>

        <div className="h-4 w-px bg-[#1F2937] mx-0.5 hidden sm:block" />

        <div className="flex items-center gap-1.5 min-w-0 max-w-[130px] sm:max-w-xs md:max-w-md">
          <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span
            className="text-[11px] sm:text-xs font-medium text-gray-300 truncate font-mono"
            title={currentDocName || "Tidak ada dokumen"}
          >
            {currentDocName || "Untitled.pdf"}
          </span>
        </div>

        {/* Network status */}
        <div
          className={`hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium transition-colors ${
            isOnline
              ? "bg-[#1F2937] border border-green-500/30 text-green-400"
              : "bg-[#1F2937] border border-blue-500/30 text-blue-400"
          }`}
          title={isOnline ? "Online: AI Siap" : "Offline Mode"}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-green-400 animate-pulse" : "bg-blue-400 animate-pulse"}`} />
          <span className="text-[9px] uppercase tracking-wider font-semibold">
            {isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Right Actions: Upload, Live Voice, Appearance / Dark Mode, Dimmer */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Upload Button */}
        <button
          id="btn-upload-pdf"
          onClick={onUploadClick}
          className="flex items-center gap-1 sm:gap-1.5 text-xs font-semibold px-2 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-xs active:scale-95 cursor-pointer"
          title="Buka file PDF"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden xs:inline sm:inline">Buka PDF</span>
        </button>

        {/* Sample Doc Button */}
        <button
          id="btn-sample-pdf"
          onClick={onLoadSampleClick}
          className="text-xs px-2 py-1.5 rounded bg-[#1F2937] hover:bg-[#2D333B] border border-[#2D333B] text-gray-300 transition-colors hidden xl:inline-flex items-center gap-1 cursor-pointer"
          title="Buka file contoh panduan"
        >
          Contoh
        </button>

        {/* Library Modal Trigger */}
        <button
          id="btn-library"
          onClick={onOpenLibraryClick}
          className="relative text-xs px-2 sm:px-2.5 py-1.5 rounded bg-[#1F2937] hover:bg-[#2D333B] border border-[#2D333B] text-gray-300 transition-colors flex items-center gap-1 cursor-pointer"
          title="Perpustakaan Offline"
        >
          <Library className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Koleksi</span>
          {libraryCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-600/30 text-blue-400 text-[10px] font-mono font-bold">
              {libraryCount}
            </span>
          )}
        </button>

        {/* Live Voice Conversation Button */}
        <button
          id="btn-live-voice"
          onClick={onOpenLiveVoice}
          className="flex items-center gap-1 sm:gap-1.5 text-xs font-semibold px-2 sm:px-2.5 py-1.5 rounded bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 transition-all shadow-xs active:scale-95 cursor-pointer"
          title="Percakapan Suara AI Real-time"
        >
          <Mic className="w-3.5 h-3.5 text-blue-200 animate-pulse" />
          <span className="hidden md:inline">Suara AI</span>
        </button>

        {/* Page AI Insights Button */}
        <button
          id="btn-ai-chat"
          onClick={onOpenAiChat}
          className="hidden md:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded bg-[#1F2937] hover:bg-[#2D333B] border border-blue-500/30 text-blue-400 transition-colors cursor-pointer"
          title="Jelaskan atau rangkum halaman dengan AI"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Analisis AI</span>
        </button>

        <div className="h-4 w-px bg-[#1F2937] mx-0.5" />

        {/* Appearance & Dark Mode Customizer Trigger */}
        <button
          id="btn-appearance-header"
          onClick={onOpenAppearanceModal}
          className="flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1.5 rounded bg-[#1F2937] hover:bg-[#2D333B] border border-indigo-500/40 text-indigo-300 transition-all cursor-pointer shadow-xs active:scale-95"
          title="Buka Pengaturan Mode Gelap, Warna Latar, dan Teks"
        >
          <Palette className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Warna & Tema</span>
        </button>

        {/* Gemini Settings Trigger */}
        <button
          id="btn-gemini-settings-header"
          onClick={onOpenGeminiSettings}
          className="flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1.5 rounded bg-[#1F2937] hover:bg-[#2D333B] border border-blue-500/40 text-blue-300 hover:text-white transition-all cursor-pointer shadow-xs active:scale-95"
          title="Buka Pengaturan Gemini (Model Text, Model TTS, Live Model & API Key)"
        >
          <Settings className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Pengaturan</span>
        </button>

        {/* Quick Dark/Light Toggle Icon */}
        <button
          id="btn-quick-theme-toggle"
          onClick={() => {
            onThemeChange(isDark ? "light" : "night");
          }}
          className="p-1.5 rounded bg-[#1F2937] hover:bg-[#2D333B] border border-[#2D333B] text-gray-300 transition-colors cursor-pointer"
          title={isDark ? "Ganti ke Mode Terang (Light)" : "Ganti ke Mode Gelap (Dark)"}
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-blue-400" />}
        </button>

        {/* Dimmer Controls */}
        <div className="relative">
          <button
            id="btn-dimmer-toggle"
            onClick={() => setShowDimmerMenu(!showDimmerMenu)}
            className={`p-1.5 rounded border transition-colors cursor-pointer ${
              dimmerLevel > 0
                ? "border-blue-500 text-blue-400 bg-blue-600/15"
                : "border-[#1F2937] hover:bg-[#1F2937] text-gray-400 hover:text-white"
            }`}
            title="Peredup Layar Malam Hari"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {showDimmerMenu && (
            <div
              id="dimmer-menu"
              className="absolute right-0 top-full mt-2 w-56 p-3 rounded-md bg-[#14171D] border border-[#2D333B] shadow-2xl z-50 text-gray-200"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Peredup Layar</span>
                <span className="text-[11px] text-blue-400 font-mono font-bold">
                  {Math.round(dimmerLevel * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mb-2 leading-tight">
                Meredupkan intensitas layar untuk membaca di ruangan gelap.
              </p>
              <input
                id="dimmer-slider"
                type="range"
                min="0"
                max="0.7"
                step="0.05"
                value={dimmerLevel}
                onChange={(e) => onDimmerChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                <span>MATI</span>
                <span>REDUP</span>
                <span>GELAP TOTAL</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
