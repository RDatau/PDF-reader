import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Volume2, Sparkles, MessageSquare, AlertCircle, FileText, CheckCircle, Trash2 } from "lucide-react";
import { LiveAudioPlayer, floatTo16BitPCMBase64 } from "../lib/audioUtils";
import { LiveVoiceMessage } from "../types";
import { loadSavedPersonality } from "../lib/personalityPresets";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ChatMessageContent } from "./ChatMessageContent";
import { loadGeminiSettings, getCustomApiKey } from "../lib/geminiSettings";
import { getWsBaseUrl } from "../lib/apiConfig";

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  docTitle: string;
  currentPage: number;
  currentPageText: string;
  initialModel?: string;
  initialVoice?: string;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  docTitle,
  currentPage,
  currentPageText,
  initialModel = "gemini-3.1-flash-live-preview",
  initialVoice = "Aoede",
}) => {
  const [selectedLiveModel, setSelectedLiveModel] = useState<string>(() => {
    return loadGeminiSettings().liveModel || initialModel;
  });
  const [activeConnectedModel, setActiveConnectedModel] = useState<string>(() => {
    return loadGeminiSettings().liveModel || initialModel;
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Menghubungkan ke Gemini Live...");
  const [isGeminiSpeaking, setIsGeminiSpeaking] = useState(false);
  const [conversation, setConversation] = useState<LiveVoiceMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In-app Delete Confirmation Dialog State
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    type: "clear_all" | "single_message";
    targetIndex?: number;
    title: string;
    description: string;
    dangerLevel: "normal" | "all";
  }>({
    isOpen: false,
    type: "clear_all",
    title: "",
    description: "",
    dangerLevel: "normal",
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<LiveAudioPlayer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const hasPageText = Boolean(currentPageText && currentPageText.trim().length > 0);
  const wordCount = hasPageText ? currentPageText.trim().split(/\s+/).filter(Boolean).length : 0;

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      return;
    }

    startLiveSession(selectedLiveModel);

    return () => {
      cleanup();
    };
  }, [isOpen, selectedLiveModel]);

  // Synchronize context when page or text updates while Live session is connected
  useEffect(() => {
    if (isOpen && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "update_page",
          docTitle: docTitle || "Dokumen PDF",
          pageNumber: currentPage,
          context: (currentPageText || "").slice(0, 8000),
        })
      );
    }
  }, [isOpen, currentPage, currentPageText, docTitle]);

  const startLiveSession = (modelToConnect: string) => {
    cleanup();
    setErrorMessage(null);
    setStatusMessage(`Menghubungkan ke ${modelToConnect}...`);

    audioPlayerRef.current = new LiveAudioPlayer(24000);

    const savedSettings = loadGeminiSettings();
    const effectiveVoice = initialVoice || savedSettings.voice || "Fola";
    const apiKey = getCustomApiKey();

    const wsBase = getWsBaseUrl();
    const apiKeyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : "";
    const wsUrl = `${wsBase}/api/live?model=${encodeURIComponent(
      modelToConnect
    )}&voice=${encodeURIComponent(effectiveVoice)}${apiKeyParam}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setStatusMessage("Menghubungkan teks dokumen ke Gemini Live...");

      // Send initial context with docTitle, page, exact page text, and user personality
      ws.send(
        JSON.stringify({
          type: "init",
          docTitle: docTitle || "Dokumen PDF",
          pageNumber: currentPage,
          context: (currentPageText || "").slice(0, 8000),
          model: modelToConnect,
          voice: effectiveVoice,
          personality: loadSavedPersonality().systemPrompt,
          apiKey: apiKey || undefined,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready") {
          if (data.model) setActiveConnectedModel(data.model);
          if (data.hasContext) {
            setStatusMessage(`Siap! Teks Halaman ${data.pageNumber || currentPage} telah terhubung. Bicaralah atau klik Bacakan Teks.`);
          } else {
            setStatusMessage(`Terhubung. Perhatian: Halaman ini tidak memiliki teks yang terdeteksi.`);
          }
          // Automatically request mic
          startMicrophone(ws);
        } else if (data.type === "audio" && data.audio) {
          setIsGeminiSpeaking(true);
          audioPlayerRef.current?.playChunk(data.audio);
        } else if (data.type === "interrupted") {
          audioPlayerRef.current?.stop();
          setIsGeminiSpeaking(false);
        } else if (data.type === "text" && data.text) {
          setConversation((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.sender === "gemini") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + data.text },
              ];
            }
            return [
              ...prev,
              { sender: "gemini", text: data.text, timestamp: Date.now() },
            ];
          });
        } else if (data.type === "error") {
          setErrorMessage(data.error);
        }
      } catch (e) {
        console.error("Error parsing WS message:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("Live WebSocket error:", err);
      setErrorMessage("Tidak dapat terhubung ke server suara Gemini Live.");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsMicActive(false);
    };
  };

  const startMicrophone = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      micStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // Buffer size 4096 gives ~256ms audio chunks
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const base64Audio = floatTo16BitPCMBase64(inputData);
          ws.send(JSON.stringify({ type: "audio", audio: base64Audio }));
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsMicActive(true);
    } catch (err: any) {
      console.warn("Microphone access denied or failed:", err);
      setStatusMessage("Microphone permission required for voice conversation.");
    }
  };

  const toggleMic = () => {
    if (isMicActive) {
      micStreamRef.current?.getTracks().forEach((t) => (t.enabled = false));
      setIsMicActive(false);
    } else {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => (t.enabled = true));
        setIsMicActive(true);
      } else if (wsRef.current) {
        startMicrophone(wsRef.current);
      }
    }
  };

  const sendReadPagePrompt = () => {
    if (!hasPageText || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setConversation((prev) => [
      ...prev,
      {
        sender: "user",
        text: `Tolong bacakan teks Halaman ${currentPage} ini persis kata demi kata.`,
        timestamp: Date.now(),
      },
    ]);

    const fullPrompt = `Tolong bacakan teks halaman ${currentPage} dari dokumen "${docTitle || "Dokumen"}" ini sekarang secara lengkap persis kata demi kata:\n\n"""\n${currentPageText.trim()}\n"""`;
    wsRef.current.send(JSON.stringify({ type: "text", text: fullPrompt }));
  };

  const sendQuickPrompt = (prompt: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setConversation((prev) => [
        ...prev,
        { sender: "user", text: prompt, timestamp: Date.now() },
      ]);
      wsRef.current.send(JSON.stringify({ type: "text", text: prompt }));
    }
  };

  const cleanup = () => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {}
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
      audioPlayerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsMicActive(false);
    setIsGeminiSpeaking(false);
  };

  if (!isOpen) return null;

  return (
    <div
      id="live-voice-overlay"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="live-voice-dialog"
        className="w-full max-w-lg bg-[#14171D] border border-[#1F2937] text-[#E5E7EB] rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-[#1F2937] flex items-center justify-between bg-[#14171D]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-gray-200">
                GEMINI LIVE VOICE (REAL-TIME)
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 font-mono">
                  {activeConnectedModel === "gemini-2.5-flash-native-audio-preview-12-2025"
                    ? "2.5 Native Audio"
                    : "3.1 Flash Live"}
                </span>
              </h3>
              <p className="text-[10px] font-mono text-gray-400 truncate max-w-xs">
                {docTitle || "DOCUMENT"} &bull; Halaman {currentPage}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Model Selector Bar */}
        <div className="px-3.5 py-2 bg-[#0C0E12] border-b border-[#1F2937] flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider shrink-0">
            Model Audio Live:
          </span>
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedLiveModel("gemini-3.1-flash-live-preview")}
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border transition-all cursor-pointer whitespace-nowrap ${
                selectedLiveModel === "gemini-3.1-flash-live-preview"
                  ? "bg-blue-600/20 border-blue-500 text-blue-300 font-bold"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              3.1 Flash Live
            </button>
            <button
              onClick={() => setSelectedLiveModel("gemini-2.5-flash-native-audio-preview-12-2025")}
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border transition-all cursor-pointer whitespace-nowrap ${
                selectedLiveModel === "gemini-2.5-flash-native-audio-preview-12-2025"
                  ? "bg-purple-600/20 border-purple-500 text-purple-300 font-bold"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              2.5 Native Audio (12-2025)
            </button>
          </div>
        </div>

        {/* Open Document Page Text Context Status Card */}
        <div className="mx-3.5 mt-2.5 p-2.5 rounded-lg bg-[#0F1115] border border-[#1F2937]">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-gray-200">
                Teks Halaman Terbuka (Hal. {currentPage})
              </span>
            </div>
            {hasPageText ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" />
                {wordCount} kata terhubung
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Teks tidak terdeteksi
              </span>
            )}
          </div>

          {hasPageText ? (
            <p className="text-[11px] font-sans text-gray-300 bg-[#14171D] p-2 rounded border border-[#252B36] max-h-16 overflow-y-auto leading-relaxed italic line-clamp-3">
              "{currentPageText.slice(0, 240)}{currentPageText.length > 240 ? "..." : ""}"
            </p>
          ) : (
            <p className="text-[10px] text-amber-400/90 bg-amber-950/20 p-2 rounded border border-amber-500/20 leading-tight">
              ⚠️ Perhatian: Halaman ini tidak memiliki teks yang dapat diekstrak (misalnya dokumen scan murni). AI tidak dapat membacakan halaman kosong.
            </p>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-3.5 mt-2 p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Animated Visualizer Centerpiece */}
        <div className="p-5 flex flex-col items-center justify-center bg-[#0F1115] border-b border-[#1F2937] mt-2">
          <div className="relative flex items-center justify-center mb-3">
            {/* Pulsing rings */}
            {(isMicActive || isGeminiSpeaking) && (
              <div
                className={`absolute w-32 h-32 rounded-full opacity-20 animate-ping ${
                  isGeminiSpeaking ? "bg-blue-400" : "bg-indigo-400"
                }`}
              />
            )}
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-2xl ${
                isGeminiSpeaking
                  ? "border-blue-500 bg-blue-600/20 text-blue-400 scale-105"
                  : isMicActive
                  ? "border-indigo-500 bg-indigo-600/20 text-indigo-400"
                  : "border-[#1F2937] bg-[#14171D] text-gray-500"
              }`}
            >
              {isGeminiSpeaking ? (
                <Volume2 className="w-9 h-9 animate-pulse" />
              ) : isMicActive ? (
                <Mic className="w-9 h-9 animate-pulse" />
              ) : (
                <MicOff className="w-9 h-9" />
              )}
            </div>
          </div>

          <p className="text-xs font-mono text-center text-gray-200 mb-1">
            {isGeminiSpeaking
              ? "GEMINI SEDANG BERBICARA..."
              : isMicActive
              ? "MENDENGARKAN... BICARALAH BEBAS"
              : statusMessage.toUpperCase()}
          </p>

          <p className="text-[10px] font-mono text-gray-500 text-center">
            AUDIO DUA ARAH REAL-TIME (GEMINI LIVE WEBSOCKET)
          </p>

          {/* Mic Toggle Button */}
          <button
            id="btn-live-toggle-mic"
            onClick={toggleMic}
            className={`mt-3 px-4 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all shadow-xs active:scale-95 cursor-pointer uppercase tracking-wider ${
              isMicActive
                ? "bg-rose-500 hover:bg-rose-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {isMicActive ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                Matikan Mikrofon
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                Nyalakan & Bicara
              </>
            )}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-3.5 py-2 border-b border-[#1F2937] bg-[#14171D] flex flex-wrap gap-1.5 items-center justify-center">
          <button
            id="btn-live-read-page"
            onClick={sendReadPagePrompt}
            disabled={!hasPageText}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-xs cursor-pointer ${
              hasPageText
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
            }`}
            title={
              hasPageText
                ? `Bacakan teks Halaman ${currentPage} ini sekarang secara langsung`
                : "Halaman ini tidak memiliki teks untuk dibaca"
            }
          >
            <Volume2 className="w-3 h-3" />
            <span>Bacakan Teks Halaman Ini</span>
          </button>
          <button
            onClick={() => sendQuickPrompt("Bisa rangkumkan poin-poin terpenting dari halaman ini?")}
            disabled={!hasPageText}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              hasPageText
                ? "bg-[#0F1115] hover:bg-[#1F2937] border-[#1F2937] text-gray-300"
                : "bg-gray-900/50 border-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            "Rangkumkan poin kunci"
          </button>
          <button
            onClick={() => sendQuickPrompt("Jelaskan konsep utama di halaman ini dengan bahasa sederhana.")}
            disabled={!hasPageText}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              hasPageText
                ? "bg-[#0F1115] hover:bg-[#1F2937] border-[#1F2937] text-gray-300"
                : "bg-gray-900/50 border-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            "Jelaskan konsep"
          </button>
          <button
            onClick={() => sendQuickPrompt("Buatkan pertanyaan kuis singkat mengenai isi halaman ini!")}
            disabled={!hasPageText}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              hasPageText
                ? "bg-[#0F1115] hover:bg-[#1F2937] border-[#1F2937] text-gray-300"
                : "bg-gray-900/50 border-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            "Tanya jawab kuis"
          </button>
        </div>

        {/* Conversation Transcript Log Header & List */}
        <div className="flex items-center justify-between px-3.5 pt-2 pb-1 border-b border-[#1F2937]/50 bg-[#10131A] text-[10px] text-gray-400">
          <span className="font-mono uppercase tracking-wider">Transkrip Percakapan</span>
          {conversation.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmState({
                  isOpen: true,
                  type: "clear_all",
                  title: "Clear Transkrip Percakapan",
                  description: "Hapus seluruh riwayat rekaman percakapan suara sesi ini?",
                  dangerLevel: "all",
                });
              }}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-red-500/10"
              title="Clear transcript / Hapus riwayat obrolan"
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>

        {/* Conversation Transcript Log */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 min-h-[120px] text-xs">
          {conversation.length === 0 ? (
            <div className="text-center py-5 text-gray-500">
              <MessageSquare className="w-5 h-5 mx-auto mb-1.5 opacity-30 text-blue-400" />
              <p className="font-mono text-[11px]">SIAP UNTUK INTERAKSI SUARA REAL-TIME</p>
              <p className="text-[10px] text-gray-400 mt-1">
                Katakan "Bacakan halaman ini" atau klik tombol di atas.
              </p>
            </div>
          ) : (
            conversation.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col group ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-gray-500">
                    {msg.sender === "user" ? "YOU" : "GEMINI LIVE"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmState({
                        isOpen: true,
                        type: "single_message",
                        targetIndex: idx,
                        title: "Hapus Pesan Transkrip",
                        description: `Hapus pesan ${msg.sender === "user" ? "Anda" : "Gemini Live"} ini dari transkrip?`,
                        dangerLevel: "normal",
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-red-400 transition-opacity cursor-pointer"
                    title="Hapus balon pesan ini"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
                <div
                  className={`p-2.5 rounded max-w-[85%] leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white font-medium"
                      : "bg-[#0F1115] text-gray-200 rounded border border-[#1F2937] font-sans"
                  }`}
                >
                  <ChatMessageContent
                    content={msg.text}
                    isUser={msg.sender === "user"}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteConfirmState.isOpen}
        onClose={() => setDeleteConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          if (deleteConfirmState.type === "clear_all") {
            setConversation([]);
          } else if (
            deleteConfirmState.type === "single_message" &&
            typeof deleteConfirmState.targetIndex === "number"
          ) {
            setConversation((prev) =>
              prev.filter((_, i) => i !== deleteConfirmState.targetIndex)
            );
          }
        }}
        title={deleteConfirmState.title}
        description={deleteConfirmState.description}
        dangerLevel={deleteConfirmState.dangerLevel}
        confirmText={deleteConfirmState.type === "clear_all" ? "Ya, Clear" : "Ya, Hapus"}
        cancelText="Batal"
      />
    </div>
  );
};
