import React, { useState, useEffect } from "react";
import {
  X,
  UserCog,
  Sparkles,
  RotateCcw,
  Check,
  BookOpen,
  GraduationCap,
  HeartHandshake,
  Zap,
  ShieldAlert,
  Lightbulb,
  Plus,
  Info,
} from "lucide-react";
import {
  PERSONALITY_PRESETS,
  DEFAULT_PERSONALITY_ID,
  StoredPersonalityConfig,
  savePersonalityConfig,
  AiPersonalityPreset,
} from "../lib/personalityPresets";

interface AiPersonalityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: StoredPersonalityConfig;
  onSave: (newConfig: StoredPersonalityConfig) => void;
  theme?: string;
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  default: <BookOpen className="w-4 h-4 text-blue-400" />,
  academic: <GraduationCap className="w-4 h-4 text-indigo-400" />,
  friendly_tutor: <HeartHandshake className="w-4 h-4 text-emerald-400" />,
  concise: <Zap className="w-4 h-4 text-amber-400" />,
  critical: <ShieldAlert className="w-4 h-4 text-rose-400" />,
  creative: <Lightbulb className="w-4 h-4 text-purple-400" />,
};

const QUICK_DIRECTIVE_CHIPS = [
  { label: "Gaya Kasual & Santai", prompt: "\nGunakan gaya tutur santai, akrab, dan bersahabat seperti rekan diskusi." },
  { label: "Sangat Padat (Poin-Poin)", prompt: "\nSajikan jawaban hanya dalam poin-poin tegas tanpa pengantar panjang." },
  { label: "Analogi Sederhana", prompt: "\nSelalu sertakan setidaknya satu analogi sederhana dari kehidupan sehari-hari." },
  { label: "Sertakan Contoh Kasus", prompt: "\nSertakan contoh kasus penerapan nyata untuk mengilustrasikan konsep ini." },
  { label: "Tantang Logika Teks", prompt: "\nTunjukkan kelemahan atau asumsi yang perlu dipertanyakan dari argumen teks." },
  { label: "Dukungan Bahasa Inggris", prompt: "\nBeri padanan istilah penting dalam Bahasa Inggris di dalam tanda kurung." },
];

export const AiPersonalityModal: React.FC<AiPersonalityModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSave,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(currentConfig.presetId);
  const [customName, setCustomName] = useState<string>(currentConfig.customName || "Kustom");
  const [promptText, setPromptText] = useState<string>(currentConfig.systemPrompt);
  const [isModified, setIsModified] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<boolean>(false);

  // Sync state with incoming props when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedPresetId(currentConfig.presetId);
      setCustomName(currentConfig.customName || "Kustom");
      setPromptText(currentConfig.systemPrompt);
      setIsModified(false);
      setSaveToast(false);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: AiPersonalityPreset) => {
    setSelectedPresetId(preset.id);
    setCustomName(preset.name);
    setPromptText(preset.systemPrompt);
    setIsModified(true);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPromptText(val);
    setIsModified(true);

    // If text diverges from preset, mark as custom
    const activePreset = PERSONALITY_PRESETS.find((p) => p.id === selectedPresetId);
    if (activePreset && val.trim() !== activePreset.systemPrompt.trim()) {
      setSelectedPresetId("custom");
      setCustomName("Kustom Manual");
    }
  };

  const handleAppendChip = (chipPrompt: string) => {
    setPromptText((prev) => {
      const trimmed = prev.trim();
      const updated = trimmed ? `${trimmed} ${chipPrompt.trim()}` : chipPrompt.trim();
      return updated;
    });
    setSelectedPresetId("custom");
    setCustomName("Kustom Manual");
    setIsModified(true);
  };

  const handleResetToDefault = () => {
    const defaultPreset = PERSONALITY_PRESETS.find((p) => p.id === DEFAULT_PERSONALITY_ID) || PERSONALITY_PRESETS[0];
    setSelectedPresetId(defaultPreset.id);
    setCustomName(defaultPreset.name);
    setPromptText(defaultPreset.systemPrompt);
    setIsModified(true);
  };

  const handleSaveAndApply = () => {
    const trimmed = promptText.trim();
    const finalPrompt = trimmed.length > 0
      ? trimmed
      : PERSONALITY_PRESETS[0].systemPrompt;

    const matchedPreset = PERSONALITY_PRESETS.find((p) => p.id === selectedPresetId);
    const finalName = selectedPresetId === "custom"
      ? "Kustom Manual"
      : matchedPreset?.name || "Kustom";

    const newConfig: StoredPersonalityConfig = {
      presetId: selectedPresetId,
      customName: finalName,
      systemPrompt: finalPrompt,
      isCustomManual: selectedPresetId === "custom",
      lastUpdated: Date.now(),
    };

    savePersonalityConfig(newConfig);
    onSave(newConfig);
    setSaveToast(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl bg-[#11151F] border border-[#263143] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#212B3B] bg-[#141925] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Edit AI Personality
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  Karakter & Gaya AI
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Ubah gaya bicara, nada respon, dan instruksi manual Gemini AI saat menganalisis dokumen PDF.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#20293A] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-gray-300 custom-scrollbar">
          {/* Section 1: Presets Selection Grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Pilih Template Karakter Cepat</span>
              </label>
              <span className="text-[11px] text-gray-500">
                Klik kartu untuk menerapkan template
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PERSONALITY_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between group ${
                      isSelected
                        ? "bg-purple-950/25 border-purple-500/60 shadow-lg shadow-purple-950/20"
                        : "bg-[#141A25] border-[#222C3D] hover:bg-[#1A2230] hover:border-[#324057]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1 rounded-lg bg-[#1D2535] shrink-0">
                          {PRESET_ICONS[preset.id] || <Sparkles className="w-4 h-4 text-gray-400" />}
                        </div>
                        <span className={`font-semibold text-xs truncate ${isSelected ? "text-purple-300" : "text-gray-200"}`}>
                          {preset.name}
                        </span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono shrink-0 ${preset.badgeColor}`}>
                        {preset.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Custom Textarea Prompt Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <UserCog className="w-3.5 h-3.5 text-blue-400" />
                <span>Instruksi Personality Manual (Bisa Diedit Bebas)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-gray-500">
                  {promptText.length} karakter
                </span>
                {selectedPresetId === "custom" ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                    Mode Kustom
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                    {customName}
                  </span>
                )}
              </div>
            </div>

            <div className="relative">
              <textarea
                value={promptText}
                onChange={handleTextChange}
                rows={5}
                placeholder="Tuliskan kepribadian atau instruksi khusus untuk AI di sini. Contoh: Bertindaklah sebagai konsultan bisnis yang tajam, gunakan istilah yang praktis, dan berikan evaluasi risiko."
                className="w-full px-3.5 py-3 rounded-xl bg-[#0D1017] border border-[#263143] focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 text-xs text-gray-100 placeholder-gray-600 outline-hidden leading-relaxed resize-y transition-all font-sans"
              />
            </div>

            {/* Quick Directive Chips */}
            <div className="mt-3">
              <span className="text-[11px] font-medium text-gray-400 block mb-1.5 flex items-center gap-1">
                <Plus className="w-3 h-3 text-purple-400" />
                <span>Tambahkan Atribut Khusus Secara Cepat:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DIRECTIVE_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAppendChip(chip.prompt)}
                    className="px-2.5 py-1 rounded-lg bg-[#161D2B] hover:bg-[#20293D] border border-[#28354A] hover:border-purple-500/40 text-[11px] text-gray-300 hover:text-purple-300 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-2.5 h-2.5 text-purple-400" />
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3.5 p-3 rounded-xl bg-[#141A25]/70 border border-[#212A3A] flex items-start gap-2.5 text-[11px] text-gray-400">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Personality ini akan dikirimkan ke model Gemini pada setiap pertanyaan di panel chat dokumen, ringkasan halaman, maupun sesi suara Live.
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#212B3B] bg-[#141925] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#20293A] text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
            title="Kembalikan instruksi ke karakter standar"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Standar</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#1A2232] hover:bg-[#222C3E] text-xs font-medium text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium text-xs shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
            >
              {saveToast ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Tersimpan!</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan & Terapkan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
