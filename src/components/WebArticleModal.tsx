import React, { useState } from "react";
import {
  Globe,
  X,
  Loader2,
  BookOpen,
  Trash2,
  ShieldCheck,
  Clock,
  ExternalLink,
  AlertCircle,
  FileText,
} from "lucide-react";
import { StoredArticle, StoredArticleMeta } from "../types";
import { fetchCleanArticleFromUrl, getArticleById } from "../lib/articleStorage";

interface WebArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedArticles: StoredArticleMeta[];
  activeArticleId: string | null;
  readerSource: "pdf" | "article";
  hasLoadedPdf: boolean;
  onOpenArticle: (article: StoredArticle) => void;
  onDeleteArticle: (id: string) => void;
  onRefreshArticles: () => Promise<void>;
  onSwitchBackToPdf: () => void;
}

export const WebArticleModal: React.FC<WebArticleModalProps> = ({
  isOpen,
  onClose,
  savedArticles,
  activeArticleId,
  readerSource,
  hasLoadedPdf,
  onOpenArticle,
  onDeleteArticle,
  onRefreshArticles,
  onSwitchBackToPdf,
}) => {
  const [urlInput, setUrlInput] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFetchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = urlInput.trim();
    if (!cleaned) {
      setError("Tempel tautan/URL artikel situs terlebih dahulu.");
      return;
    }

    setError(null);
    setIsFetching(true);
    try {
      const article = await fetchCleanArticleFromUrl(cleaned);
      await onRefreshArticles();
      setUrlInput("");
      onOpenArticle(article);
      onClose();
    } catch (err: any) {
      setError(
        err?.message ||
          "Gagal memuat artikel. Pastikan URL valid dan tidak diblokir oleh situs."
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleOpenSaved = async (id: string) => {
    setError(null);
    setOpeningId(id);
    try {
      const full = await getArticleById(id);
      if (!full) {
        setError("Artikel tidak ditemukan di penyimpanan lokal.");
        return;
      }
      onOpenArticle(full);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal membuka artikel tersimpan.");
    } finally {
      setOpeningId(null);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      id="web-article-modal-overlay"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        id="web-article-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#14171D] border border-[#1F2937] text-[#E5E7EB] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1F2937] flex items-center justify-between bg-[#14171D]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-100">
                Mode Baca Artikel Situs (Bebas Iklan)
              </h3>
              <p className="text-[11px] text-gray-400">
                Buka tautan artikel blog/berita tanpa iklan, banner, sidebar, dan popup
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* URL Fetch Form */}
        <form
          onSubmit={handleFetchSubmit}
          className="p-4 border-b border-[#1F2937] bg-[#0F1115]/70 space-y-2.5"
        >
          <label
            htmlFor="web-article-url-input"
            className="text-xs font-semibold text-gray-300 flex items-center justify-between"
          >
            <span>Tempel URL Artikel Situs</span>
            <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Iklan &amp; pelacak disaring otomatis
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="web-article-url-input"
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://id.wikipedia.org/wiki/... atau URL artikel lainnya"
              disabled={isFetching}
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg bg-[#14171D] border border-[#2D333B] text-xs sm:text-sm text-gray-100 placeholder-gray-500 focus:outline-hidden focus:border-emerald-500 transition-colors"
            />
            <button
              id="btn-fetch-web-article"
              type="submit"
              disabled={isFetching || !urlInput.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
            >
              {isFetching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membersihkan...</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" />
                  <span>Buka Mode Baca</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Artikel yang berhasil dimuat otomatis tersimpan di penyimpanan lokal agar tetap dapat dibaca offline dan dibacakan dengan Gemini TTS / Suara AI.
          </p>
        </form>

        {/* Saved Offline Articles List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Artikel Tersimpan Offline ({savedArticles.length})
            </span>
          </div>

          {savedArticles.length === 0 ? (
            <div className="text-center py-10 text-gray-400 space-y-2">
              <Globe className="w-9 h-9 mx-auto opacity-30 text-emerald-400" />
              <p className="text-xs font-semibold text-gray-300">
                Belum ada artikel situs yang disimpan
              </p>
              <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                Masukkan URL artikel berita, blog, atau dokumentasi di atas untuk membacanya dalam tampilan bersih bebas iklan.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedArticles.map((art) => {
                const isActive = readerSource === "article" && activeArticleId === art.id;
                const isOpening = openingId === art.id;
                return (
                  <div
                    key={art.id}
                    className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-all ${
                      isActive
                        ? "border-emerald-500 bg-emerald-600/10"
                        : "border-[#1F2937] hover:border-gray-600 bg-[#0F1115]/60 hover:bg-[#1A1F28]"
                    }`}
                  >
                    <div
                      onClick={() => handleOpenSaved(art.id)}
                      className="flex items-start gap-3 cursor-pointer flex-1 min-w-0"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#0F1115] border border-[#1F2937] flex items-center justify-center shrink-0 mt-0.5">
                        <Globe className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-semibold truncate text-gray-100">
                            {art.title}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-600/25 text-emerald-300 font-bold shrink-0">
                              AKTIF
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="text-emerald-400/90 font-medium truncate max-w-[160px]">
                            {art.siteName || art.domain}
                          </span>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            ~{art.readingMinutes} mnt ({art.wordCount} kata)
                          </span>
                          <span>&bull;</span>
                          <span>{formatDate(art.lastReadAt || art.savedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded hover:bg-[#252B36] text-gray-400 hover:text-gray-200 transition-colors"
                        title="Buka tautan sumber asli"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleOpenSaved(art.id)}
                        disabled={isOpening}
                        className="px-2.5 py-1 rounded bg-[#1F2937] hover:bg-[#2D333B] text-gray-100 text-xs flex items-center gap-1 border border-[#2D333B] cursor-pointer"
                        title="Baca artikel offline"
                      >
                        {isOpening ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span className="hidden sm:inline font-medium text-[11px]">Baca</span>
                      </button>
                      <button
                        onClick={() => onDeleteArticle(art.id)}
                        className="p-1.5 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Hapus artikel dari penyimpanan offline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#1F2937] bg-[#14171D] flex items-center justify-between gap-2">
          <div>
            {readerSource === "article" && hasLoadedPdf && (
              <button
                onClick={() => {
                  onSwitchBackToPdf();
                  onClose();
                }}
                className="px-3 py-1.5 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Kembali ke Dokumen PDF</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
