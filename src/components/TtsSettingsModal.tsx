import React, { useState } from "react";
import {
  X,
  Volume2,
  Sparkles,
  Zap,
  Radio,
  Play,
  Square,
  Check,
  Headphones,
  Mic,
  Cpu,
  Info,
  Loader2,
  MessageSquareQuote,
  Eraser,
} from "lucide-react";
import { TtsEngine, GeminiTtsModelId } from "../types";
import { GEMINI_TTS_MODELS, GEMINI_VOICE_OPTIONS } from "../lib/geminiModels";
import { streamGeminiTtsAudio } from "../lib/geminiApiBridge";
import { StreamingTtsPlayer } from "../lib/audioUtils";

interface TtsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ttsEngine: TtsEngine;
  onTtsEngineChange: (engine: TtsEngine) => void;
  geminiModel: GeminiTtsModelId;
  onGeminiModelChange: (model: GeminiTtsModelId) => void;
  geminiVoice: string;
  onGeminiVoiceChange: (voice: string) => void;
  styleInstruction: string;
  onStyleInstructionChange: (style: string) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (auto: boolean) => void;
  onOpenLiveVoice: () => void;
  geminiQuotaReached: boolean;
}

const STYLE_PRESETS: { label: string; value: string }[] = [
  {
    label: "Narator Buku Hangat",
    value: "Warm, calm, expressive audiobook narrator with natural pauses",
  },
  {
    label: "Podcast Santai",
    value: "Friendly, engaging conversational podcast host, natural pacing",
  },
  {
    label: "Berita Profesional",
    value: "Clear, crisp, authoritative professional news anchor",
  },
  {
    label: "Tutor Edukatif",
    value: "Patient, encouraging, articulate teacher explaining clearly",
  },
];

export const TtsSettingsModal: React.FC<TtsSettingsModalProps> = ({
  isOpen,
  onClose,
  ttsEngine,
  onTtsEngineChange,
  geminiModel,
  onGeminiModelChange,
  geminiVoice,
  onGeminiVoiceChange,
  styleInstruction,
  onStyleInstructionChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  autoAdvance,
  onAutoAdvanceChange,
  onOpenLiveVoice,
  geminiQuotaReached,
}) => {
  const [testingAudio, setTestingAudio] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [voiceFilter, setVoiceFilter] = useState<"all" | "38" | "classic">("all");
  const streamPlayerRef = React.useRef<StreamingTtsPlayer>(new StreamingTtsPlayer(24000));
  const streamAbortRef = React.useRef<AbortController | null>(null);

  if (!isOpen) return null;

  const handleTestVoice = async () => {
    handleStopTest();
    setTestingAudio(true);
    setTestError(null);

    const sampleText =
      "Halo, ini adalah pengujian suara streaming Gemini tiga titik delapan untuk membaca dokumen PDF Anda secara langsung dan lancar.";

    if (ttsEngine === "webspeech") {
      if (!window.speechSynthesis) {
        setTestError("Web Speech API tidak didukung pada browser ini.");
        setTestingAudio(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sampleText);
      utterance.rate = playbackSpeed;
      utterance.onend = () => setTestingAudio(false);
      utterance.onerror = () => {
        setTestingAudio(false);
        setTestError("Gagal memutar audio peramban.");
      };
      window.speechSynthesis.speak(utterance);
      return;
    }

    const controller = new AbortController();
    streamAbortRef.current = controller;
    streamPlayerRef.current.start(playbackSpeed);

    try {
      await streamGeminiTtsAudio({
        text: sampleText,
        voice: geminiVoice,
        model: geminiModel,
        styleInstruction,
        signal: controller.signal,
        onChunk: (pcmBase64) => {
          streamPlayerRef.current.enqueuePcmBase64(pcmBase64);
        },
      });
      await streamPlayerRef.current.waitUntilDrain();
      if (!controller.signal.aborted) {
        setTestingAudio(false);
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) return;
      console.warn("Test voice failed:", err);
      setTestError(err?.message || "Gagal memutar contoh suara model.");
      streamPlayerRef.current.stop();
      setTestingAudio(false);
    }
  };

  const handleStopTest = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    streamPlayerRef.current.stop();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setTestingAudio(false);
  };

  return (
    <div
      id="tts-settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        handleStopTest();
        onClose();
      }}
    >
      <div
        id="tts-settings-modal-container"
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl border border-[#2D333B] bg-[#14171D] text-[#E5E7EB] shadow-2xl p-4 sm:p-6 space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222731]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Pengaturan Suara & Model Gemini (TTS)</span>
              </h2>
              <p className="text-[11px] text-gray-400">
                Pilih model sintesis AI, latensi, karakter suara, dan opsi real-time
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleStopTest();
              onClose();
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#222731] transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. TTS Engine Switch */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
            Engine Pembaca Teks (TTS Engine)
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#0D1017] border border-[#222731]">
            <button
              onClick={() => onTtsEngineChange("gemini")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                ttsEngine === "gemini"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              <span>Gemini AI Audio Studio</span>
            </button>
            <button
              onClick={() => onTtsEngineChange("webspeech")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                ttsEngine === "webspeech"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Perangkat Lokal (Offline)</span>
            </button>
          </div>
        </div>

        {/* 2. Gemini TTS Model Selector (Crucial Section) */}
        {ttsEngine === "gemini" && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>Pilihan Model Gemini TTS</span>
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                {geminiModel}
              </span>
            </div>

            <div className="space-y-2">
              {GEMINI_TTS_MODELS.map((model) => {
                const isSelected = geminiModel === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => onGeminiModelChange(model.id)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer relative flex flex-col gap-1.5 ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/30 bg-[#171E2B]"
                        : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-gray-600 bg-transparent"
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-3" />}
                        </div>
                        <span className="text-xs font-bold text-gray-100 font-mono">
                          {model.name}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${model.badgeColor}`}
                      >
                        {model.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-400 pl-6 leading-relaxed">
                      {model.description}
                    </p>

                    {model.id === "gemini-3.8-flash-lite-tts" && (
                      <div className="ml-6 mt-1 flex items-center gap-1.5 text-[10px] text-emerald-300/90 font-medium">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>Streaming audio real-time langsung diputar pada chunk pertama</span>
                      </div>
                    )}

                    {model.isLiveSupported && isSelected && (
                      <div className="ml-6 mt-1.5 pt-1.5 border-t border-[#252B36] flex items-center justify-between">
                        <span className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
                          <Radio className="w-3 h-3 animate-pulse text-amber-400" />
                          Mendukung percakapan dan streaming suara langsung dua arah
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStopTest();
                            onClose();
                            onOpenLiveVoice();
                          }}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold border border-amber-500/30 transition-colors cursor-pointer"
                        >
                          Buka Gemini Live →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {geminiQuotaReached && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Batas kuota permintaan Gemini TTS tercapai (429). Tambahkan API Key cadangan di Pengaturan Gemini untuk rotasi otomatis atau tunggu beberapa saat.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3. Gemini Voice Persona Selector */}
        {ttsEngine === "gemini" && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Karakter Suara (Voice Persona)
              </label>
              <div className="flex items-center gap-1 bg-[#0D1017] border border-[#222731] rounded-lg p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setVoiceFilter("all")}
                  className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                    voiceFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Semua ({GEMINI_VOICE_OPTIONS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceFilter("38")}
                  className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                    voiceFilter === "38"
                      ? "bg-emerald-600 text-white"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Terbaru 3.8 ({GEMINI_VOICE_OPTIONS.filter((v) => v.isNew38).length})
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceFilter("classic")}
                  className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                    voiceFilter === "classic"
                      ? "bg-indigo-600 text-white"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Klasik ({GEMINI_VOICE_OPTIONS.filter((v) => !v.isNew38).length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
              {GEMINI_VOICE_OPTIONS.filter((v) => {
                if (voiceFilter === "38") return Boolean(v.isNew38);
                if (voiceFilter === "classic") return !v.isNew38;
                return true;
              }).map((voice) => {
                const isSelected = geminiVoice === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => onGeminiVoiceChange(voice.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/30 bg-[#171E2B]"
                        : "border-[#252B36] hover:border-gray-600 bg-[#0F131A]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-gray-600 bg-transparent"
                          }`}
                        >
                          {isSelected && <Check className="w-2 h-2 stroke-3" />}
                        </div>
                        <span className="text-xs font-bold text-gray-200 truncate">
                          {voice.name}
                        </span>
                        {voice.isNew38 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono shrink-0">
                            3.8 Baru
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-blue-400 font-medium shrink-0">
                        {voice.tone}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 pl-5 leading-tight">
                      {voice.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3B. StyleInstruction (Speech Style / Direction) */}
        {ttsEngine === "gemini" && (
          <div className="space-y-2 pt-2 border-t border-[#222731]">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="input-tts-style-instruction"
                className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5"
              >
                <MessageSquareQuote className="w-3.5 h-3.5 text-blue-400" />
                <span>StyleInstruction (Gaya Bicara TTS)</span>
              </label>
              {styleInstruction.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => onStyleInstructionChange("")}
                  className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-rose-300 px-1.5 py-0.5 rounded bg-[#0D1017] border border-[#252B36] transition-colors cursor-pointer"
                  title="Hapus StyleInstruction"
                >
                  <Eraser className="w-3 h-3" />
                  <span>Kosongkan</span>
                </button>
              )}
            </div>

            <textarea
              id="input-tts-style-instruction"
              rows={2}
              value={styleInstruction}
              onChange={(e) => onStyleInstructionChange(e.target.value)}
              placeholder='Tempel StyleInstruction di sini (contoh: "Clear, warm audiobook narrator, calm pacing" atau "Pembawa acara podcast santai dan ekspresif")'
              className="w-full rounded-lg border border-[#252B36] focus:border-blue-500 bg-[#0D1017] px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-hidden resize-y leading-relaxed"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-gray-500 mr-0.5">Contoh cepat:</span>
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onStyleInstructionChange(preset.value)}
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    styleInstruction === preset.value
                      ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                      : "bg-[#0F131A] border-[#252B36] text-gray-400 hover:text-gray-200 hover:border-gray-600"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4. Reading Speed & Auto Advance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#222731]">
          {/* Speed Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300 block">
              Kecepatan Pembacaan
            </label>
            <div className="flex items-center gap-1.5">
              {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => onPlaybackSpeedChange(speed)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    playbackSpeed === speed
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-[#0F131A] border-[#252B36] text-gray-300 hover:border-gray-600"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Auto Advance Toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300 block">
              Otomatis Lanjut Halaman
            </label>
            <button
              onClick={() => onAutoAdvanceChange(!autoAdvance)}
              className={`w-full py-1.5 px-3 rounded-md text-xs font-medium border flex items-center justify-between transition-all cursor-pointer ${
                autoAdvance
                  ? "bg-blue-600/15 border-blue-500/40 text-blue-300"
                  : "bg-[#0F131A] border-[#252B36] text-gray-400 hover:border-gray-600"
              }`}
            >
              <span>Lanjut ke halaman berikutnya</span>
              <div
                className={`w-8 h-4 rounded-full transition-colors relative ${
                  autoAdvance ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                    autoAdvance ? "left-4.5" : "left-0.5"
                  }`}
                />
              </div>
            </button>
          </div>
        </div>

        {/* 5. Voice Preview & Test Playback */}
        <div className="p-3 rounded-lg bg-[#0F131A] border border-[#252B36] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-xs font-bold text-gray-200 block">
                  Uji Coba Suara Model Ini
                </span>
                <span className="text-[10px] text-gray-400">
                  Dengarkan sampel suara model {geminiModel} ({geminiVoice})
                </span>
              </div>
            </div>

            {!testingAudio ? (
              <button
                type="button"
                onClick={handleTestVoice}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Tes Suara</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopTest}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Hentikan Tes</span>
              </button>
            )}
          </div>

          {testingAudio && (
            <div className="flex items-center gap-2 text-xs text-blue-300 font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Memutar sampel suara dengan model {geminiModel}...</span>
            </div>
          )}

          {testError && (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">
              {testError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#222731]">
          <button
            type="button"
            onClick={() => {
              handleStopTest();
              onClose();
              onOpenLiveVoice();
            }}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Mode Percakapan Suara Live (Real-Time)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleStopTest();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
