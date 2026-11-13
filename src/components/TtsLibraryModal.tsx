import React, { useEffect, useMemo, useRef, useState } from "react";
import { StoredTtsAudioMeta } from "../types";
import {
  buildTtsDownloadFilename,
  cleanPdfDisplayTitle,
  clearAllTtsClips,
  deleteTtsClip,
  formatMergedPageTtsTitle,
  getTtsClipById,
  mergePageWavClips,
  saveTtsClip,
} from "../lib/ttsAudioStorage";
import {
  X,
  Download,
  Play,
  Pause,
  Trash2,
  Search,
  Headphones,
  FileAudio,
  Loader2,
  Volume2,
  FolderDown,
  Layers,
} from "lucide-react";

interface TtsLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips: StoredTtsAudioMeta[];
  currentDocId: string;
  currentDocName: string;
  onRefreshClips: () => Promise<void> | void;
}

export const TtsLibraryModal: React.FC<TtsLibraryModalProps> = ({
  isOpen,
  onClose,
  clips,
  currentDocId,
  currentDocName,
  onRefreshClips,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState<"all" | "current">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "merged" | "parts">("all");
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [isPausedClip, setIsPausedClip] = useState(false);
  const [loadingClipId, setLoadingClipId] = useState<string | null>(null);
  const [downloadingClipId, setDownloadingClipId] = useState<string | null>(null);
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const stopAudioPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setPlayingClipId(null);
    setIsPausedClip(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopAudioPreview();
      setConfirmClearAll(false);
      setPlaybackError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopAudioPreview();
    };
  }, []);

  const mergedCount = useMemo(
    () => clips.filter((c) => Boolean(c.isMergedPage || c.id.endsWith("::full"))).length,
    [clips]
  );

  // Detect pages that have >= 2 generated parts without a merged page entry yet
  const unmergedPageGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        docId: string;
        docTitle: string;
        pageNumber: number;
        parts: StoredTtsAudioMeta[];
        hasMerged: boolean;
      }
    >();

    for (const clip of clips) {
      if (scope === "current" && clip.docId !== currentDocId) continue;
      if (clip.id.includes("::sel_")) continue;

      const key = `${clip.docId}::p${clip.pageNumber}`;
      let entry = groups.get(key);
      if (!entry) {
        entry = {
          key,
          docId: clip.docId,
          docTitle: clip.docTitle,
          pageNumber: clip.pageNumber,
          parts: [],
          hasMerged: false,
        };
        groups.set(key, entry);
      }

      if (clip.isMergedPage || clip.id.endsWith("::full")) {
        entry.hasMerged = true;
      } else if (clip.partNumber >= 1) {
        entry.parts.push(clip);
      }
    }

    return Array.from(groups.values())
      .filter((g) => !g.hasMerged && g.parts.length >= 2)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }, [clips, scope, currentDocId]);

  const filteredClips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = clips.filter((clip) => {
      if (scope === "current" && clip.docId !== currentDocId) {
        return false;
      }
      const isMerged = Boolean(clip.isMergedPage || clip.id.endsWith("::full"));
      if (kindFilter === "merged" && !isMerged) return false;
      if (kindFilter === "parts" && isMerged) return false;

      if (!q) return true;
      return (
        clip.title.toLowerCase().includes(q) ||
        clip.docTitle.toLowerCase().includes(q) ||
        clip.textExcerpt.toLowerCase().includes(q) ||
        `hal ${clip.pageNumber}`.includes(q)
      );
    });

    // Sort cleanly: merged page entry first inside each (docId, pageNumber) group, followed by 01, 02, ...
    return [...list].sort((a, b) => {
      if (a.docId === b.docId && a.pageNumber === b.pageNumber) {
        const aMerged = Boolean(a.isMergedPage || a.id.endsWith("::full"));
        const bMerged = Boolean(b.isMergedPage || b.id.endsWith("::full"));
        if (aMerged !== bMerged) return aMerged ? -1 : 1;
        if (a.partNumber !== b.partNumber) return a.partNumber - b.partNumber;
      }
      if (scope === "current") {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        return b.createdAt - a.createdAt;
      }
      return b.createdAt - a.createdAt;
    });
  }, [clips, scope, kindFilter, currentDocId, searchQuery]);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalBytes = clips.reduce((acc, c) => acc + (c.sizeBytes || 0), 0);

  const handleMergeGroup = async (group: {
    key: string;
    docId: string;
    docTitle: string;
    pageNumber: number;
    parts: StoredTtsAudioMeta[];
  }) => {
    if (mergingGroupKey) return;
    setMergingGroupKey(group.key);
    setPlaybackError(null);
    try {
      const sortedParts = [...group.parts].sort((a, b) => a.partNumber - b.partNumber);
      const loadedBuffers: ArrayBuffer[] = [];
      let firstVoice = sortedParts[0]?.voice || "Kore";
      let firstModel = sortedParts[0]?.model || "gemini-3.8-flash-lite-tts";
      let firstExcerpt = sortedParts[0]?.textExcerpt || "";

      for (const meta of sortedParts) {
        const full = await getTtsClipById(meta.id);
        if (full?.audioData && full.audioData.byteLength > 44) {
          loadedBuffers.push(full.audioData);
        }
      }

      if (loadedBuffers.length === 0) {
        setPlaybackError("Data bagian audio tidak ditemukan untuk digabungkan.");
        return;
      }

      const { wavBuffer, durationSeconds, mergedBy } = await mergePageWavClips(
        loadedBuffers,
        180
      );
      const mergedTitle = formatMergedPageTtsTitle(group.docTitle, group.pageNumber);
      await saveTtsClip({
        id: `${group.docId}::p${group.pageNumber}::full`,
        title: mergedTitle,
        docId: group.docId,
        docTitle: group.docTitle,
        pageNumber: group.pageNumber,
        partNumber: 0,
        totalParts: loadedBuffers.length,
        textExcerpt:
          firstExcerpt ||
          `Gabungan lengkap ${loadedBuffers.length} bagian audio halaman ${group.pageNumber}`,
        voice: firstVoice,
        model: firstModel,
        durationSeconds,
        sizeBytes: wavBuffer.byteLength,
        mimeType: "audio/wav",
        audioData: wavBuffer,
        createdAt: Date.now(),
        isMergedPage: true,
        mergedBy,
      });

      await onRefreshClips();
    } catch (err: any) {
      setPlaybackError(err?.message || "Gagal menggabungkan bagian audio halaman.");
    } finally {
      setMergingGroupKey(null);
    }
  };

  const handlePlayToggle = async (clip: StoredTtsAudioMeta) => {
    setPlaybackError(null);

    if (playingClipId === clip.id && audioRef.current) {
      if (isPausedClip) {
        await audioRef.current.play().catch(() => {});
        setIsPausedClip(false);
      } else {
        audioRef.current.pause();
        setIsPausedClip(true);
      }
      return;
    }

    stopAudioPreview();
    setLoadingClipId(clip.id);

    try {
      const fullClip = await getTtsClipById(clip.id);
      if (!fullClip || !fullClip.audioData) {
        setPlaybackError("Data audio tidak ditemukan di database lokal.");
        setLoadingClipId(null);
        return;
      }

      const blob = new Blob([fullClip.audioData], {
        type: fullClip.mimeType || "audio/wav",
      });
      const blobUrl = URL.createObjectURL(blob);
      activeBlobUrlRef.current = blobUrl;

      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.onended = () => {
        stopAudioPreview();
      };
      audio.onerror = () => {
        setPlaybackError("Gagal memutar berkas audio TTS.");
        stopAudioPreview();
      };

      setPlayingClipId(clip.id);
      setIsPausedClip(false);
      setLoadingClipId(null);
      await audio.play();
    } catch (err: any) {
      console.warn("Error playing stored TTS clip:", err);
      setPlaybackError(err?.message || "Gagal memuat audio dari database.");
      setLoadingClipId(null);
      stopAudioPreview();
    }
  };

  const triggerClipDownload = async (clipMeta: StoredTtsAudioMeta) => {
    const fullClip = await getTtsClipById(clipMeta.id);
    if (!fullClip || !fullClip.audioData) return;

    const blob = new Blob([fullClip.audioData], {
      type: fullClip.mimeType || "audio/wav",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildTtsDownloadFilename(fullClip.title, "wav");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleDownloadClip = async (clipMeta: StoredTtsAudioMeta) => {
    setDownloadingClipId(clipMeta.id);
    setPlaybackError(null);
    try {
      await triggerClipDownload(clipMeta);
    } catch (err: any) {
      setPlaybackError(err?.message || "Gagal mengunduh file audio TTS.");
    } finally {
      setDownloadingClipId(null);
    }
  };

  const handleDownloadAllFiltered = async () => {
    if (filteredClips.length === 0 || isBatchDownloading) return;
    setIsBatchDownloading(true);
    setPlaybackError(null);
    try {
      for (const clip of filteredClips) {
        await triggerClipDownload(clip);
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err: any) {
      setPlaybackError(err?.message || "Gagal mengunduh seluruh file audio TTS.");
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const handleDeleteClip = async (id: string) => {
    if (playingClipId === id) {
      stopAudioPreview();
    }
    await deleteTtsClip(id);
    await onRefreshClips();
  };

  const handleClearAll = async () => {
    stopAudioPreview();
    await clearAllTtsClips();
    setConfirmClearAll(false);
    await onRefreshClips();
  };

  return (
    <div
      id="tts-library-modal-overlay"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="tts-library-modal-dialog"
        className="w-full max-w-2xl bg-[#14171D] border border-[#2D333B] text-[#E5E7EB] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#222731] flex items-center justify-between bg-[#14171D]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileAudio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-100">
                HASIL GENERATE AUDIO TTS
              </h3>
              <p className="text-[10px] font-mono text-gray-400">
                {clips.length} AUDIO TERSIMPAN ({mergedCount} GABUNGAN HALAMAN &bull;{" "}
                {formatFileSize(totalBytes)})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#222731] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="p-3 border-b border-[#222731] bg-[#0F131A] space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="input-search-tts-clips"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul TTS, nama PDF, halaman, atau kutipan teks..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#252B36] bg-[#14171D] text-xs text-gray-100 placeholder-gray-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-[#14171D] border border-[#252B36] rounded-lg p-0.5 text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  scope === "all"
                    ? "bg-emerald-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Semua ({clips.length})
              </button>
              <button
                type="button"
                onClick={() => setScope("current")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer truncate max-w-[170px] ${
                  scope === "current"
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
                title={`Filter khusus dokumen aktif: ${cleanPdfDisplayTitle(currentDocName)}`}
              >
                PDF Aktif
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-[#14171D] border border-[#252B36] rounded-lg p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setKindFilter("all")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  kindFilter === "all"
                    ? "bg-[#262E3D] text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Semua Tipe
              </button>
              <button
                type="button"
                onClick={() => setKindFilter("merged")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  kindFilter === "merged"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Gabungan Halaman ({mergedCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setKindFilter("parts")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  kindFilter === "parts"
                    ? "bg-[#262E3D] text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Per Bagian ({Math.max(0, clips.length - mergedCount)})
              </button>
            </div>
          </div>

          {unmergedPageGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-2.5 py-1.5 text-[11px] text-indigo-200">
              <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Halaman siap digabung via Python:</span>
              {unmergedPageGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => handleMergeGroup(g)}
                  disabled={Boolean(mergingGroupKey)}
                  className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                  title={`Gabungkan ${g.parts.length} bagian audio dari ${g.docTitle} Hal ${g.pageNumber}`}
                >
                  {mergingGroupKey === g.key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Layers className="w-3 h-3" />
                  )}
                  <span>
                    Gabung {g.docTitle.slice(0, 18)}
                    {g.docTitle.length > 18 ? "…" : ""} - Hal {g.pageNumber} ({g.parts.length})
                  </span>
                </button>
              ))}
            </div>
          )}

          {playbackError && (
            <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
              {playbackError}
            </div>
          )}
        </div>

        {/* Clips List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {filteredClips.length === 0 ? (
            <div className="text-center py-12 text-gray-400 space-y-2.5">
              <Headphones className="w-10 h-10 mx-auto opacity-30 text-emerald-400" />
              <p className="text-xs font-mono font-bold text-gray-300">
                {clips.length === 0
                  ? "BELUM ADA AUDIO TTS YANG DIGENERATE"
                  : "TIDAK ADA AUDIO TTS YANG COCOK"}
              </p>
              <p className="text-[11px] text-gray-500 max-w-md mx-auto leading-relaxed">
                Setiap kali Anda memutar halaman menggunakan <strong>Gemini AI Audio</strong>, setiap bagian (01, 02, dst.) tersimpan otomatis dan langsung digabung oleh <strong>Python</strong> menjadi 1 file utuh per halaman setelah seluruh bagian halaman tersebut selesai digenerate.
              </p>
            </div>
          ) : (
            filteredClips.map((clip) => {
              const isMerged = Boolean(clip.isMergedPage || clip.id.endsWith("::full"));
              const isPlayingThis = playingClipId === clip.id && !isPausedClip;
              const isPausedThis = playingClipId === clip.id && isPausedClip;
              const isLoadingThis = loadingClipId === clip.id;
              const isDownloadingThis = downloadingClipId === clip.id;
              const downloadFilename = buildTtsDownloadFilename(clip.title, "wav");

              return (
                <div
                  key={clip.id}
                  className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    playingClipId === clip.id
                      ? "border-emerald-500/60 bg-emerald-600/10"
                      : isMerged
                      ? "border-indigo-500/40 bg-indigo-950/20 hover:border-indigo-400/60"
                      : "border-[#252B36] hover:border-gray-600 bg-[#0F1115]/80"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isMerged ? (
                        <Layers
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isPlayingThis ? "text-emerald-400 animate-pulse" : "text-indigo-400"
                          }`}
                        />
                      ) : (
                        <Volume2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isPlayingThis ? "text-emerald-400 animate-pulse" : "text-blue-400"
                          }`}
                        />
                      )}
                      <span
                        className="text-xs font-bold text-gray-100 truncate"
                        title={clip.title}
                      >
                        {clip.title}
                      </span>
                      {isMerged && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[9px] font-bold uppercase tracking-wider shrink-0">
                          Gabungan Halaman
                          {clip.mergedBy === "python"
                            ? " • Python"
                            : clip.mergedBy === "local"
                            ? " • Lokal"
                            : ""}
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] font-mono text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5">
                      <span className="text-emerald-300/90">Hal {clip.pageNumber}</span>
                      <span>&bull;</span>
                      {isMerged ? (
                        <span className="text-indigo-300">
                          Gabungan {clip.totalParts} Bagian
                        </span>
                      ) : (
                        <span>
                          Bagian {String(clip.partNumber).padStart(2, "0")}/
                          {String(clip.totalParts).padStart(2, "0")}
                        </span>
                      )}
                      <span>&bull;</span>
                      <span>{formatDuration(clip.durationSeconds)}</span>
                      <span>&bull;</span>
                      <span>{formatFileSize(clip.sizeBytes)}</span>
                      <span>&bull;</span>
                      <span>{clip.voice}</span>
                      <span>&bull;</span>
                      <span>{formatDate(clip.createdAt)}</span>
                    </div>

                    {clip.textExcerpt && (
                      <p className="text-[11px] text-gray-400 pl-5 line-clamp-2 leading-relaxed">
                        "{clip.textExcerpt}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pl-5 sm:pl-0">
                    {/* Play / Pause preview */}
                    <button
                      type="button"
                      onClick={() => handlePlayToggle(clip)}
                      disabled={isLoadingThis}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        isPlayingThis
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
                          : "bg-[#1F242F] hover:bg-[#2A313F] border-[#2D333B] text-gray-200"
                      }`}
                      title={
                        isPlayingThis
                          ? "Jeda audio"
                          : isPausedThis
                          ? "Lanjutkan audio"
                          : "Putar pratinjau audio"
                      }
                    >
                      {isLoadingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isPlayingThis ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>{isPlayingThis ? "Jeda" : "Putar"}</span>
                    </button>

                    {/* Download button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadClip(clip)}
                      disabled={isDownloadingThis}
                      className={`px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-60 ${
                        isMerged
                          ? "bg-indigo-600 hover:bg-indigo-500"
                          : "bg-emerald-600 hover:bg-emerald-500"
                      }`}
                      title={`Unduh sebagai ${downloadFilename}`}
                    >
                      {isDownloadingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Download</span>
                    </button>

                    {/* Delete clip */}
                    <button
                      type="button"
                      onClick={() => handleDeleteClip(clip.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Hapus audio ini dari database"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-3.5 border-t border-[#222731] bg-[#14171D] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {filteredClips.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllFiltered}
                disabled={isBatchDownloading}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                title="Unduh semua audio TTS yang ditampilkan saat ini sesuai judul masing-masing"
              >
                {isBatchDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderDown className="w-3.5 h-3.5" />
                )}
                <span>Download Semua ({filteredClips.length})</span>
              </button>
            )}

            {clips.length > 0 && !confirmClearAll && (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="px-2.5 py-1.5 rounded-lg bg-[#1F242F] hover:bg-rose-500/15 border border-[#2D333B] hover:border-rose-500/30 text-gray-400 hover:text-rose-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Kosongkan Database
              </button>
            )}

            {confirmClearAll && (
              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1">
                <span className="text-[11px] text-rose-300 font-medium">
                  Hapus semua {clips.length} audio?
                </span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                >
                  Ya, Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-0.5 rounded bg-[#1F242F] text-gray-300 text-[11px] cursor-pointer"
                >
                  Batal
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1F242F] hover:bg-[#2A313F] border border-[#2D333B] text-gray-200 text-xs font-semibold transition-colors cursor-pointer ml-auto"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
