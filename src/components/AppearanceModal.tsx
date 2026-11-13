import React from "react";
import {
  X,
  Moon,
  Sun,
  Palette,
  Check,
  Smartphone,
  MoveHorizontal,
  RotateCcw,
  Sparkles,
  Type,
  BookOpen,
  FileText,
  Minus,
  Plus,
  AlignLeft,
} from "lucide-react";
import { AppearanceSettings } from "../types";
import {
  DARK_PRESETS,
  LIGHT_PRESETS,
  TEXT_TONES,
  FONT_OPTIONS,
} from "../lib/themePresets";

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  appearance: AppearanceSettings;
  onChange: (settings: AppearanceSettings) => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({
  isOpen,
  onClose,
  appearance,
  onChange,
}) => {
  if (!isOpen) return null;

  const isDark = appearance.mode === "dark";
  const activeFont =
    FONT_OPTIONS.find((f) => f.id === appearance.fontFamily) || FONT_OPTIONS[0];

  const handleModeChange = (mode: "dark" | "light") => {
    onChange({
      ...appearance,
      mode,
    });
  };

  const handleDarkPresetSelect = (id: string, color: string) => {
    onChange({
      ...appearance,
      darkBgId: id,
      darkBgColor: color,
    });
  };

  const handleLightPresetSelect = (id: string, color: string) => {
    onChange({
      ...appearance,
      lightBgId: id,
      lightBgColor: color,
    });
  };

  const handleCustomColor = (color: string) => {
    if (isDark) {
      onChange({
        ...appearance,
        darkBgId: "custom",
        darkBgColor: color,
      });
    } else {
      onChange({
        ...appearance,
        lightBgId: "custom",
        lightBgColor: color,
      });
    }
  };

  const handleReset = () => {
    onChange({
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
    });
  };

  const activeTextTone = TEXT_TONES.find((t) => t.id === appearance.textTone) || TEXT_TONES[0];
  const currentBgColor = isDark ? appearance.darkBgColor : appearance.lightBgColor;
  const currentTextColor = isDark ? activeTextTone.textColorDark : activeTextTone.textColorLight;

  return (
    <div
      id="appearance-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="appearance-modal-container"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[#2D333B] bg-[#14171D] text-[#E5E7EB] shadow-2xl p-4 sm:p-6 space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222731]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Tampilan & Mode Membaca
              </h2>
              <p className="text-[11px] text-gray-400">
                Sesuaikan warna latar belakang, teks, dan gesture geser halaman
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#222731] transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Dark vs Light Mode Switch */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
            Mode Tema Utama
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#0D1017] border border-[#222731]">
            <button
              onClick={() => handleModeChange("dark")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                isDark
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Mode Gelap (Dark)</span>
            </button>
            <button
              onClick={() => handleModeChange("light")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                !isDark
                  ? "bg-amber-500 text-neutral-900 shadow-md"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>Mode Terang (Light)</span>
            </button>
          </div>
        </div>

        {/* 2. Background Color Chooser for Dark / Light */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              {isDark
                ? "Warna Latar Belakang Gelap (Dark Background)"
                : "Warna Latar Belakang Terang (Light Background)"}
            </label>
            <span className="text-[11px] font-mono text-blue-400">
              {isDark ? appearance.darkBgColor : appearance.lightBgColor}
            </span>
          </div>
          <p className="text-[11px] text-gray-400">
            {isDark
              ? "Halaman PDF putih otomatis diubah menjadi gelap sesuai warna pilihan ini."
              : "Latar kertas PDF disesuaikan dengan kehangatan warna yang dipilih."}
          </p>

          {/* Preset Buttons Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(isDark ? DARK_PRESETS : LIGHT_PRESETS).map((preset) => {
              const isSelected = isDark
                ? appearance.darkBgId === preset.id
                : appearance.lightBgId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() =>
                    isDark
                      ? handleDarkPresetSelect(preset.id, preset.color)
                      : handleLightPresetSelect(preset.id, preset.color)
                  }
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/30 bg-[#1C212B]"
                      : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="w-5 h-5 rounded-full border border-gray-600 shadow-xs flex items-center justify-center shrink-0"
                      style={{ backgroundColor: preset.color }}
                    >
                      {isSelected && (
                        <Check
                          className={`w-3 h-3 ${
                            preset.color === "#ffffff" || preset.color.startsWith("#f")
                              ? "text-neutral-900"
                              : "text-white"
                          }`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-gray-500">
                      {preset.color}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-200 leading-tight">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-gray-400 line-clamp-1">
                      {preset.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Color Input */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0F131A] border border-[#252B36]">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-xs font-semibold text-gray-200 block">
                  Pilih Warna Sendiri (Custom Hex)
                </span>
                <span className="text-[10px] text-gray-400">
                  Gunakan palet warna bebas untuk latar belakang
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isDark ? appearance.darkBgColor : appearance.lightBgColor}
                onChange={(e) => handleCustomColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-600 bg-transparent cursor-pointer p-0"
                title="Pilih warna latar kustom"
              />
            </div>
          </div>

          {/* Opsi Khusus Mode Gelap: Gelapkan Kertas PDF */}
          {isDark && (
            <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-200">
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>Gelapkan Kertas Dokumen PDF</span>
                </div>
                <p className="text-[10px] text-gray-300 leading-relaxed">
                  Berkas PDF aslinya memiliki latar kertas putih. Fitur ini membalik warna kertas PDF menjadi gelap ({appearance.darkBgId === "oled" ? "Hitam Pekat OLED" : "Charcoal Gelap"}) agar nyaman di mata saat malam hari.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={appearance.invertPdfInDarkMode !== false}
                onClick={() =>
                  onChange({
                    ...appearance,
                    invertPdfInDarkMode: appearance.invertPdfInDarkMode === false ? true : false,
                  })
                }
                className={`w-11 h-6 shrink-0 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  appearance.invertPdfInDarkMode !== false ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    appearance.invertPdfInDarkMode !== false ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* 3. Text Tone Customization */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
            Penyesuaian Warna Teks ({isDark ? "Teks Terang" : "Teks Gelap"})
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TEXT_TONES.map((tone) => {
              const isSelected = appearance.textTone === tone.id;
              const previewTextColor = isDark ? tone.textColorDark : tone.textColorLight;
              return (
                <button
                  key={tone.id}
                  onClick={() => onChange({ ...appearance, textTone: tone.id })}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/30 bg-[#1C212B]"
                      : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-bold"
                      style={{ color: previewTextColor }}
                    >
                      Aa Teks
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-blue-400" />}
                  </div>
                  <div className="text-[11px] font-medium text-gray-300">
                    {tone.name}
                  </div>
                  <div className="text-[9px] text-gray-400 line-clamp-1">
                    {tone.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Pengaturan Tipografi: Jenis Font, Ukuran Font & Format Baca */}
        <div className="space-y-4 pt-3 border-t border-[#222731]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
              Pengaturan Font & Tipografi Membaca
            </label>
            <span className="text-[11px] text-blue-400 font-mono font-medium">
              {activeFont.name} &bull; {appearance.fontSize || 18}px
            </span>
          </div>

          {/* Mode Tampilan Baca (View Mode) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChange({ ...appearance, viewMode: "canvas" })}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                appearance.viewMode !== "text"
                  ? "border-blue-500 bg-[#1C222E] ring-2 ring-blue-500/20"
                  : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
              }`}
            >
              <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Halaman Asli</span>
                  {appearance.viewMode !== "text" && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                  Tata letak asli PDF dengan filter gelap instan
                </p>
              </div>
            </button>

            <button
              onClick={() => onChange({ ...appearance, viewMode: "text" })}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                appearance.viewMode === "text"
                  ? "border-blue-500 bg-[#1C222E] ring-2 ring-blue-500/20"
                  : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
              }`}
            >
              <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Mode Teks (Reflow)</span>
                  {appearance.viewMode === "text" && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                  Format teks e-reader, font & spasi bebas diubah
                </p>
              </div>
            </button>
          </div>

          {/* Pilihan Jenis Huruf (Font Family) */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-400 block">
              Pilihan Jenis Huruf (Font Family)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FONT_OPTIONS.map((font) => {
                const isSelected = (appearance.fontFamily || "sans") === font.id;
                return (
                  <button
                    key={font.id}
                    onClick={() => onChange({ ...appearance, fontFamily: font.id })}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/30 bg-[#1C212B]"
                        : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-sm font-bold text-white"
                        style={{ fontFamily: font.fontFamily }}
                      >
                        Aa
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <div className="text-xs font-semibold text-gray-200">
                      {font.name}
                    </div>
                    <div className="text-[10px] text-gray-400 line-clamp-1">
                      {font.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ukuran Huruf (Font Size) Slider & Buttons */}
          <div className="p-3 rounded-xl bg-[#0F131A] border border-[#252B36] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-gray-200">
                  Ukuran Huruf (Font Size)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    onChange({
                      ...appearance,
                      fontSize: Math.max(12, (appearance.fontSize || 18) - 2),
                    })
                  }
                  disabled={(appearance.fontSize || 18) <= 12}
                  className="w-7 h-7 rounded bg-[#1F242F] hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center text-xs font-bold text-gray-200 cursor-pointer"
                  title="Perkecil Ukuran Font (A-)"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs font-bold text-white min-w-[36px] text-center">
                  {appearance.fontSize || 18}px
                </span>
                <button
                  onClick={() =>
                    onChange({
                      ...appearance,
                      fontSize: Math.min(32, (appearance.fontSize || 18) + 2),
                    })
                  }
                  disabled={(appearance.fontSize || 18) >= 32}
                  className="w-7 h-7 rounded bg-[#1F242F] hover:bg-gray-700 disabled:opacity-30 flex items-center justify-center text-xs font-bold text-gray-200 cursor-pointer"
                  title="Perbesar Ukuran Font (A+)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Slider Ukuran */}
            <input
              type="range"
              min="12"
              max="32"
              step="1"
              value={appearance.fontSize || 18}
              onChange={(e) =>
                onChange({
                  ...appearance,
                  fontSize: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-blue-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg"
            />

            {/* Preset Cepat Ukuran */}
            <div className="flex items-center justify-between text-[11px] gap-1">
              {[
                { label: "14px", val: 14, desc: "Kecil" },
                { label: "16px", val: 16, desc: "Biasa" },
                { label: "18px", val: 18, desc: "Nyaman" },
                { label: "22px", val: 22, desc: "Besar" },
                { label: "26px", val: 26, desc: "Ekstra" },
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => onChange({ ...appearance, fontSize: s.val })}
                  className={`px-2 py-1 rounded text-center flex-1 transition-colors cursor-pointer ${
                    (appearance.fontSize || 18) === s.val
                      ? "bg-blue-600 text-white font-bold"
                      : "bg-[#1C212B] hover:bg-gray-700 text-gray-400"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Jarak Antar Baris (Line Spacing / Height) */}
          <div className="p-3 rounded-xl bg-[#0F131A] border border-[#252B36] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlignLeft className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-xs font-semibold text-gray-200 block">
                  Jarak Baris Kalimat (Line Height)
                </span>
                <span className="text-[10px] text-gray-400">
                  Spasi vertikal antar baris untuk kenyamanan mata
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { label: "1.4 Rapat", val: 1.4 },
                { label: "1.6 Standar", val: 1.6 },
                { label: "1.9 Longgar", val: 1.9 },
              ].map((lh) => (
                <button
                  key={lh.val}
                  onClick={() => onChange({ ...appearance, lineHeight: lh.val })}
                  className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                    (appearance.lineHeight || 1.6) === lh.val
                      ? "bg-blue-600 text-white font-bold"
                      : "bg-[#1F242F] hover:bg-gray-700 text-gray-400"
                  }`}
                >
                  {lh.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Interactive Typography Preview Box */}
          <div
            className="p-4 rounded-xl border transition-all shadow-inner"
            style={{
              backgroundColor: currentBgColor,
              borderColor: isDark ? "#2D333B" : "#e5e7eb",
              color: currentTextColor,
              fontFamily: activeFont.fontFamily,
            }}
          >
            <div className="text-[10px] uppercase font-mono tracking-widest opacity-60 mb-1 select-none">
              Pratinjau Tipografi Langsung ({activeFont.name})
            </div>
            <p
              style={{
                fontSize: `${appearance.fontSize || 18}px`,
                lineHeight: appearance.lineHeight || 1.6,
              }}
            >
              Membaca adalah petualangan pikiran yang sunyi. Teks ini disesuaikan dengan mata Anda agar tidak mudah lelah.
            </p>
          </div>
        </div>

        {/* 5. Mobile & Slide Gestures Optimization */}
        <div className="space-y-2.5 pt-2 border-t border-[#222731]">
          <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
            Fitur Layar Ponsel & Geser Halaman
          </label>

          {/* Slide to flip toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F131A] border border-[#252B36]">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                <MoveHorizontal className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-200 block">
                  Slide / Geser untuk Balik Halaman (Swipe to Flip)
                </span>
                <span className="text-[11px] text-gray-400">
                  Usap layar ke kiri atau kanan untuk berpindah halaman secara halus
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={appearance.slideGesturesEnabled}
                onChange={(e) =>
                  onChange({
                    ...appearance,
                    slideGesturesEnabled: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Mobile Vertical Auto-Fit */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F131A] border border-[#252B36]">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-200 block">
                  Optimasi Layar Vertikal Ponsel (Auto-Fit Width)
                </span>
                <span className="text-[11px] text-gray-400">
                  Menyesuaikan dokumen penuh ke lebar layar ponsel tanpa terpotong
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={appearance.mobileFitWidth}
                onChange={(e) =>
                  onChange({
                    ...appearance,
                    mobileFitWidth: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#222731]">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 py-1.5 px-2.5 rounded hover:bg-[#222731] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset ke Bawaan</span>
          </button>
          <button
            onClick={onClose}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md cursor-pointer"
          >
            Terapkan & Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
