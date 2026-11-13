import React from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  dangerLevel?: "normal" | "all";
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Hapus",
  cancelText = "Batal",
  dangerLevel = "normal",
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-[#121620] border border-[#2B3547] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon + Close */}
        <div className="p-5 pb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                dangerLevel === "all"
                  ? "bg-red-500/20 border border-red-500/40 text-red-400"
                  : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
              }`}
            >
              {dangerLevel === "all" ? (
                <Trash2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">
                {title}
              </h3>
              <span className="text-[10px] font-mono text-gray-400">
                Konfirmasi Tindakan
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#1E2738] text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description Body */}
        <div className="px-5 py-2">
          <p className="text-xs text-gray-300 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 pt-4 mt-2 bg-[#0F131C] border-t border-[#1F2937] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-[#1B2332] hover:bg-[#232D40] text-xs font-medium text-gray-300 hover:text-white transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-medium text-xs shadow-lg shadow-red-950/40 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
