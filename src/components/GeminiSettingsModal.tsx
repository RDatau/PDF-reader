import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  Volume2,
  Sparkles,
  RotateCcw,
  Check,
  Radio,
  Play,
  Square,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  GeminiSettings,
  loadGeminiSettings,
  saveGeminiSettings,
  DEFAULT_GEMINI_SETTINGS,
  TEXT_MODEL_OPTIONS,
  TTS_MODEL_OPTIONS,
  LIVE_MODEL_OPTIONS,
  GLOBAL_VOICE_OPTIONS,
  getRotationIndex,
  setRotationIndex,
  clearApiKeyCooldowns,
} from "../lib/geminiSettings";
import { parseApiKeys, normalizeApiKeysText, maskApiKey } from "../lib/apiConfig";
import { verifyApiKey, ApiKeyCheckItem, streamGeminiTtsAudio } from "../lib/geminiApiBridge";
import { StreamingTtsPlayer } from "../lib/audioUtils";

interface GeminiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: GeminiSettings) => void;
}

export const GeminiSettingsModal: React.FC<GeminiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [settings, setSettings] = useState<GeminiSettings>(loadGeminiSettings);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
    items?: ApiKeyCheckItem[];
  }>({ status: "idle", message: "" });
  const [nextRotationIdx, setNextRotationIdx] = useState<number>(0);

  // Voice Preview State
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewPlayerRef = React.useRef<StreamingTtsPlayer>(new StreamingTtsPlayer(24000));
  const previewAbortRef = React.useRef<AbortController | null>(null);

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<"text" | "tts" | "live" | "voice" | null>(null);

  // Save feedback state
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Sync settings whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const loaded = loadGeminiSettings();
      setSettings(loaded);
      const count = parseApiKeys(loaded.apiKey).length;
      setNextRotationIdx(count > 0 ? getRotationIndex(count) : 0);
      setCheckResult({ status: "idle", message: "" });
      setPreviewError(null);
      setOpenDropdown(null);
    } else {
      if (previewAbortRef.current) {
        previewAbortRef.current.abort();
        previewAbortRef.current = null;
      }
      previewPlayerRef.current.stop();
      setIsPlayingPreview(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parsedKeys = parseApiKeys(settings.apiKey);

  // Handle API Key Verification via universal bridge (supports single or multi-line keys)
  const handleCheckApiKey = async () => {
    const normalized = normalizeApiKeysText(settings.apiKey);
    if (normalized !== settings.apiKey) {
      setSettings((prev) => ({ ...prev, apiKey: normalized }));
    }

    const keys = parseApiKeys(normalized);
    if (keys.length === 0) {
      setCheckResult({
        status: "error",
        message: "Silakan tempel minimal satu API Key Anda terlebih dahulu sebelum menguji koneksi.",
      });
      return;
    }

    setIsCheckingKey(true);
    setCheckResult({ status: "idle", message: "" });

    try {
      const res = await verifyApiKey(normalized);
      if (res.ok) {
        setCheckResult({
          status: "success",
          message: res.message || "API Key valid dan berhasil terhubung!",
          items: res.results,
        });
      } else {
        setCheckResult({
          status: "error",
          message: res.message || "Gagal memverifikasi API Key. Periksa kembali kunci Anda.",
          items: res.results,
        });
      }
    } catch (err: any) {
      setCheckResult({
        status: "error",
        message: "Gagal menghubungkan API Key. Periksa koneksi internet Anda.",
      });
    } finally {
      setIsCheckingKey(false);
    }
  };

  // Play streaming audio sample for the selected voice
  const handleTestVoiceSample = async () => {
    if (isPlayingPreview) {
      if (previewAbortRef.current) {
        previewAbortRef.current.abort();
        previewAbortRef.current = null;
      }
      previewPlayerRef.current.stop();
      setIsPlayingPreview(false);
      return;
    }

    setIsPlayingPreview(true);
    setPreviewError(null);

    const sampleText = `Halo, saya adalah suara ${settings.voice}. Saya siap membacakan dokumen PDF Anda secara streaming langsung dengan artikulasi yang jernih dan nyaman didengarkan.`;
    const controller = new AbortController();
    previewAbortRef.current = controller;
    previewPlayerRef.current.start(1.0);

    try {
      await streamGeminiTtsAudio({
        text: sampleText,
        voice: settings.voice,
        model: settings.ttsModel,
        styleInstruction: settings.styleInstruction,
        signal: controller.signal,
        onChunk: (pcmBase64) => {
          previewPlayerRef.current.enqueuePcmBase64(pcmBase64);
        },
      });
      await previewPlayerRef.current.waitUntilDrain();
      if (!controller.signal.aborted) {
        setIsPlayingPreview(false);
      }
    } catch (e: any) {
      if (e?.name === "AbortError" || controller.signal.aborted) return;
      previewPlayerRef.current.stop();
      setIsPlayingPreview(false);
      setPreviewError(e.message || "Gagal memutar sampel suara.");
    }
  };

  // Save Settings
  const handleSave = () => {
    const cleanKeysText = normalizeApiKeysText(settings.apiKey);
    const sanitized = { ...settings, apiKey: cleanKeysText };
    const totalKeys = parseApiKeys(cleanKeysText).length;
    if (totalKeys > 0 && nextRotationIdx >= totalKeys) {
      setRotationIndex(0);
    }
    clearApiKeyCooldowns();
    saveGeminiSettings(sanitized);
    if (onSaved) onSaved(sanitized);
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
      onClose();
    }, 450);
  };

  // Reset to default
  const handleReset = () => {
    setSettings({ ...DEFAULT_GEMINI_SETTINGS });
    setRotationIndex(0);
    setNextRotationIdx(0);
    clearApiKeyCooldowns();
    setCheckResult({ status: "idle", message: "" });
  };

  const selectedTextModel =
    TEXT_MODEL_OPTIONS.find((m) => m.id === settings.textModel) || TEXT_MODEL_OPTIONS[0];
  const selectedTtsModel =
    TTS_MODEL_OPTIONS.find((m) => m.id === settings.ttsModel) || TTS_MODEL_OPTIONS[0];
  const selectedLiveModel =
    LIVE_MODEL_OPTIONS.find((m) => m.id === settings.liveModel) || LIVE_MODEL_OPTIONS[0];
  const selectedVoice =
    GLOBAL_VOICE_OPTIONS.find((v) => v.id === settings.voice) || GLOBAL_VOICE_OPTIONS[0];

  return (
    <div
      id="modal-gemini-settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-[#121622] border border-[#2B3547] rounded-2xl shadow-2xl overflow-hidden text-gray-200"
        onClick={(e) => {
          e.stopPropagation();
          setOpenDropdown(null);
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1E2638] bg-[#0E121C] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                Pengaturan Gemini
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Google AI
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">
                Konfigurasi API Key, Model Text, Model TTS & Suara Global
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-gemini-settings"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1E2638] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 font-sans">
          {/* SECTION 1: API KEY (GEMINI) - MULTI-KEY PARSE & ROTATION */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="input-gemini-api-key"
                className="text-[11px] font-mono tracking-wider font-semibold text-gray-300 uppercase flex items-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5 text-blue-400" />
                <span>API KEY (GEMINI)</span>
                {parsedKeys.length > 1 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 normal-case">
                    <RefreshCw className="w-2.5 h-2.5" />
                    Rotasi {parsedKeys.length} Key
                  </span>
                )}
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                title="Buka Google AI Studio untuk membuat API Key gratis"
              >
                <span>AMBIL KEY</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Multi-line API Key Input Container with Parse & Rotation */}
            <div className="bg-[#0B0E16] border border-[#273144] focus-within:border-blue-500/70 rounded-2xl p-3 transition-all shadow-inner space-y-2">
              <textarea
                id="input-gemini-api-key"
                rows={parsedKeys.length > 1 ? Math.min(5, parsedKeys.length + 1) : 2}
                value={settings.apiKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings({ ...settings, apiKey: val });
                  setCheckResult({ status: "idle", message: "" });
                  const count = parseApiKeys(val).length;
                  if (count > 0 && nextRotationIdx >= count) {
                    setNextRotationIdx(0);
                  }
                }}
                onBlur={() => {
                  const normalized = normalizeApiKeysText(settings.apiKey);
                  if (normalized !== settings.apiKey) {
                    setSettings((prev) => ({ ...prev, apiKey: normalized }));
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!pasted) return;
                  const el = e.currentTarget;
                  const isReplacingAll =
                    settings.apiKey.trim() === "" ||
                    (el.selectionStart === 0 && el.selectionEnd === settings.apiKey.length);
                  if (isReplacingAll) {
                    const normalized = normalizeApiKeysText(pasted);
                    if (normalized) {
                      e.preventDefault();
                      setSettings((prev) => ({ ...prev, apiKey: normalized }));
                      setCheckResult({ status: "idle", message: "" });
                    }
                  }
                }}
                placeholder={"Tempel satu atau lebih Gemini API Key\nPisahkan setiap API Key dengan baris baru (Enter) untuk rotasi otomatis"}
                className={`w-full bg-transparent text-xs font-mono text-white placeholder-gray-500 focus:outline-hidden resize-y leading-relaxed tracking-wide ${
                  showApiKey ? "" : "[-webkit-text-security:disc]"
                }`}
                autoComplete="off"
                spellCheck="false"
              />

              {/* Bottom Controls inside API Key Box */}
              <div className="flex items-center justify-between pt-1.5 border-t border-[#1A2233] gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <button
                    type="button"
                    id="btn-toggle-key-visibility"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141A28] hover:bg-[#1C2436] text-gray-300 hover:text-white transition-colors cursor-pointer"
                    title={showApiKey ? "Sembunyikan API Key" : "Tampilkan API Key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>{showApiKey ? "Sembunyikan" : "Lihat Key"}</span>
                  </button>

                  {settings.apiKey.trim().length > 0 && (
                    <button
                      type="button"
                      id="btn-parse-api-keys"
                      onClick={() => {
                        const normalized = normalizeApiKeysText(settings.apiKey);
                        setSettings((prev) => ({ ...prev, apiKey: normalized }));
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141A28] hover:bg-[#1C2436] text-blue-300 hover:text-blue-200 transition-colors cursor-pointer"
                      title="Rapikan baris, hapus duplikat, dan parse daftar API Key"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Parse ({parsedKeys.length})</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  id="btn-check-gemini-api"
                  onClick={handleCheckApiKey}
                  disabled={isCheckingKey}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-md shadow-blue-950/40 shrink-0 cursor-pointer"
                  title="Uji koneksi semua API Key ke server Gemini"
                >
                  {isCheckingKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Key className="w-3 h-3 text-blue-200" />
                  )}
                  <span>
                    {isCheckingKey
                      ? "MENGECEK..."
                      : parsedKeys.length > 1
                      ? `CEK ${parsedKeys.length} API`
                      : "CEK API"}
                  </span>
                </button>
              </div>
            </div>

            {/* Parsed Keys Rotation Chips */}
            {parsedKeys.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {parsedKeys.map((k, idx) => {
                  const isNext = idx === nextRotationIdx % parsedKeys.length;
                  const checkItem = checkResult.items?.find((item) => item.index === idx);
                  return (
                    <button
                      key={`${k}-${idx}`}
                      type="button"
                      onClick={() => {
                        setRotationIndex(idx);
                        setNextRotationIdx(idx);
                      }}
                      title={
                        parsedKeys.length > 1
                          ? `Klik untuk jadikan Key #${idx + 1} sebagai giliran berikutnya`
                          : `Key #${idx + 1}`
                      }
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-mono border transition-colors cursor-pointer ${
                        checkItem
                          ? checkItem.ok
                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/40 text-rose-300"
                          : isNext && parsedKeys.length > 1
                          ? "bg-blue-600/20 border-blue-500/50 text-blue-200"
                          : "bg-[#111624] border-[#252E42] text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      <span className="font-bold">#{idx + 1}</span>
                      <span>{maskApiKey(k)}</span>
                      {isNext && parsedKeys.length > 1 && (
                        <span className="text-[9px] px-1 rounded bg-blue-500/30 text-blue-200">
                          Next
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Check Result Feedback / Helper Info */}
            {checkResult.status === "success" && (
              <div className="space-y-1.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="leading-snug font-medium">{checkResult.message}</span>
                </div>
                {checkResult.items && checkResult.items.length > 1 && (
                  <div className="pl-6 space-y-0.5 text-[11px] font-mono">
                    {checkResult.items.map((item) => (
                      <div
                        key={item.index}
                        className={item.ok ? "text-emerald-300/90" : "text-amber-300/90"}
                      >
                        #{item.index + 1} ({item.maskedKey}): {item.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {checkResult.status === "error" && (
              <div className="space-y-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-snug font-medium">{checkResult.message}</span>
                </div>
                {checkResult.items && checkResult.items.length > 1 && (
                  <div className="pl-6 space-y-0.5 text-[11px] font-mono">
                    {checkResult.items.map((item) => (
                      <div key={item.index} className="text-rose-300/90">
                        #{item.index + 1} ({item.maskedKey}): {item.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {checkResult.status === "idle" && (
              <p className="text-[11px] text-gray-400 leading-normal flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400/80 shrink-0 mt-0.5" />
                {parsedKeys.length > 1 ? (
                  <span className="text-emerald-300/90">
                    <strong>{parsedKeys.length} API Key</strong> terdeteksi. Sistem akan merotasi key secara otomatis (round-robin) dan beralih ke key cadangan jika salah satu limit (429).
                  </span>
                ) : parsedKeys.length === 1 ? (
                  <span className="text-blue-300">
                    1 kunci terpasang. Tekan Enter untuk menambah key cadangan agar otomatis dirotasi, atau klik <strong>CEK API</strong>.
                  </span>
                ) : (
                  <span>
                    Kosongkan untuk key bawaan server, atau tempel satu/banyak key (pisahkan baris baru) untuk rotasi kuota otomatis.
                  </span>
                )}
              </p>
            )}
          </div>

          {/* SECTION 2: MODEL TEXT */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono tracking-wider font-semibold text-gray-300 uppercase block">
              MODEL TEXT
            </label>
            <div className="relative">
              <button
                type="button"
                id="select-text-model"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === "text" ? null : "text");
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0B0E16] hover:bg-[#10141F] border border-[#273144] hover:border-blue-500/40 rounded-2xl text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-white">
                    <span>{selectedTextModel.name}</span>
                    {selectedTextModel.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                          selectedTextModel.badgeColor || "bg-gray-800 text-gray-300"
                        }`}
                      >
                        {selectedTextModel.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {selectedTextModel.description}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    openDropdown === "text" ? "rotate-180 text-blue-400" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {openDropdown === "text" && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#121622] border border-[#2D384D] rounded-2xl shadow-2xl p-1.5 z-40 space-y-1">
                  {TEXT_MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSettings({ ...settings, textModel: opt.id });
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        settings.textModel === opt.id
                          ? "bg-blue-600/20 border border-blue-500/30 text-white"
                          : "hover:bg-[#1A2030] text-gray-300 hover:text-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span>{opt.name}</span>
                          {opt.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                                opt.badgeColor || "bg-gray-800 text-gray-300"
                              }`}
                            >
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      </div>
                      {settings.textModel === opt.id && (
                        <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: MODEL VOICE (TTS) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono tracking-wider font-semibold text-gray-300 uppercase block">
              MODEL VOICE (TTS)
            </label>
            <div className="relative">
              <button
                type="button"
                id="select-tts-model"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === "tts" ? null : "tts");
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0B0E16] hover:bg-[#10141F] border border-[#273144] hover:border-blue-500/40 rounded-2xl text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-white">
                    <span>{selectedTtsModel.name}</span>
                    {selectedTtsModel.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                          selectedTtsModel.badgeColor || "bg-gray-800 text-gray-300"
                        }`}
                      >
                        {selectedTtsModel.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {selectedTtsModel.description}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    openDropdown === "tts" ? "rotate-180 text-blue-400" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {openDropdown === "tts" && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#121622] border border-[#2D384D] rounded-2xl shadow-2xl p-1.5 z-40 space-y-1">
                  {TTS_MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSettings({ ...settings, ttsModel: opt.id });
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        settings.ttsModel === opt.id
                          ? "bg-blue-600/20 border border-blue-500/30 text-white"
                          : "hover:bg-[#1A2030] text-gray-300 hover:text-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span>{opt.name}</span>
                          {opt.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                                opt.badgeColor || "bg-gray-800 text-gray-300"
                              }`}
                            >
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      </div>
                      {settings.ttsModel === opt.id && (
                        <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: LIVE MODEL (STREAMING AUDIO) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono tracking-wider font-semibold text-gray-300 uppercase block">
              LIVE MODEL (AUDIO REAL-TIME)
            </label>
            <div className="relative">
              <button
                type="button"
                id="select-live-model"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === "live" ? null : "live");
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0B0E16] hover:bg-[#10141F] border border-[#273144] hover:border-blue-500/40 rounded-2xl text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-white">
                    <span>{selectedLiveModel.name}</span>
                    {selectedLiveModel.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                          selectedLiveModel.badgeColor || "bg-gray-800 text-gray-300"
                        }`}
                      >
                        {selectedLiveModel.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {selectedLiveModel.description}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    openDropdown === "live" ? "rotate-180 text-blue-400" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {openDropdown === "live" && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#121622] border border-[#2D384D] rounded-2xl shadow-2xl p-1.5 z-40 space-y-1">
                  {LIVE_MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSettings({ ...settings, liveModel: opt.id });
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        settings.liveModel === opt.id
                          ? "bg-blue-600/20 border border-blue-500/30 text-white"
                          : "hover:bg-[#1A2030] text-gray-300 hover:text-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span>{opt.name}</span>
                          {opt.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                                opt.badgeColor || "bg-gray-800 text-gray-300"
                              }`}
                            >
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      </div>
                      {settings.liveModel === opt.id && (
                        <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 5: PILIH SUARA (GLOBAL) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono tracking-wider font-semibold text-gray-300 uppercase block">
                PILIH SUARA (GLOBAL)
              </label>

              {/* Quick Audio Preview Button */}
              <button
                type="button"
                id="btn-preview-voice"
                onClick={handleTestVoiceSample}
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  isPlayingPreview
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-[#1E2738] hover:bg-[#253147] border-[#2E3C56] text-gray-300 hover:text-white"
                }`}
                title="Dengarkan contoh suara Gemini ini"
              >
                {isPlayingPreview ? (
                  <>
                    <Square className="w-3 h-3 fill-current text-amber-400" />
                    <span>Hentikan</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3 h-3 text-blue-400" />
                    <span>Dengarkan Suara</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <button
                type="button"
                id="select-voice-option"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === "voice" ? null : "voice");
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0B0E16] hover:bg-[#10141F] border border-[#273144] hover:border-blue-500/40 rounded-2xl text-left transition-all cursor-pointer shadow-xs"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-white">
                    <span>{selectedVoice.name}</span>
                    <span className="text-[10px] font-mono text-gray-400">
                      ({selectedVoice.tone})
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {selectedVoice.description}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    openDropdown === "voice" ? "rotate-180 text-blue-400" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {openDropdown === "voice" && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#121622] border border-[#2D384D] rounded-2xl shadow-2xl p-1.5 z-40 space-y-1 max-h-64 overflow-y-auto">
                  {GLOBAL_VOICE_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSettings({ ...settings, voice: v.id });
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        settings.voice === v.id
                          ? "bg-blue-600/20 border border-blue-500/30 text-white"
                          : "hover:bg-[#1A2030] text-gray-300 hover:text-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
                          <span>{v.name}</span>
                          {v.isNew38 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                              3.8 Baru
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 font-mono">
                            &bull; {v.tone}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">
                          {v.description}
                        </p>
                      </div>
                      {settings.voice === v.id && (
                        <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {previewError && (
              <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {previewError}
              </p>
            )}
          </div>

          {/* SECTION 6: STYLE INSTRUCTION (GAYA BICARA TTS) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-gemini-style-instruction"
                className="text-[11px] font-mono tracking-wider font-semibold text-gray-300 uppercase block"
              >
                STYLE INSTRUCTION (GAYA BICARA TTS)
              </label>
              {settings.styleInstruction.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, styleInstruction: "" })}
                  className="text-[10px] text-gray-400 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
            <textarea
              id="input-gemini-style-instruction"
              rows={2}
              value={settings.styleInstruction}
              onChange={(e) => setSettings({ ...settings, styleInstruction: e.target.value })}
              placeholder='Tempel StyleInstruction di sini (contoh: "Warm audiobook narrator, steady and clear")'
              className="w-full px-3.5 py-2.5 bg-[#0B0E16] border border-[#273144] focus:border-blue-500/70 rounded-2xl text-xs text-white placeholder-gray-500 focus:outline-hidden resize-y leading-relaxed"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-[#0E121C] border-t border-[#1E2638] flex items-center justify-between shrink-0">
          <button
            type="button"
            id="btn-reset-gemini-settings"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-[#1C2333] cursor-pointer"
            title="Kembalikan semua pengaturan ke opsi default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Default</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="btn-cancel-gemini-settings"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-[#1B2332] hover:bg-[#232D40] text-xs font-medium text-gray-300 hover:text-white transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              id="btn-save-gemini-settings"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs shadow-lg shadow-blue-950/40 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{showSavedToast ? "Tersimpan!" : "Simpan Pengaturan"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
