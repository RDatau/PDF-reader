import React from "react";
import { StoredDocument } from "../types";
import { X, FileText, Trash2, BookOpen, Upload, HardDrive } from "lucide-react";

interface DocumentLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Omit<StoredDocument, "data">[];
  currentDocId: string;
  onSelectDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
  onUploadClick: () => void;
}

export const DocumentLibraryModal: React.FC<DocumentLibraryModalProps> = ({
  isOpen,
  onClose,
  documents,
  currentDocId,
  onSelectDoc,
  onDeleteDoc,
  onUploadClick,
}) => {
  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalBytes = documents.reduce((acc, d) => acc + (d.size || 0), 0);

  return (
    <div
      id="library-modal-overlay"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="library-modal-dialog"
        className="w-full max-w-xl bg-[#14171D] border border-[#1F2937] text-[#E5E7EB] rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-[#1F2937] flex items-center justify-between bg-[#14171D]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
                OFFLINE DOCUMENT LIBRARY
              </h3>
              <p className="text-[10px] font-mono text-gray-400">
                {documents.length} DOCUMENT{documents.length === 1 ? "" : "S"} STORED IN INDEXEDDB ({formatFileSize(totalBytes)})
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

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
          {documents.length === 0 ? (
            <div className="text-center py-12 text-gray-400 space-y-2">
              <FileText className="w-10 h-10 mx-auto opacity-30 text-blue-400" />
              <p className="text-xs font-mono font-bold">NO DOCUMENTS STORED OFFLINE YET</p>
              <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                Any PDF you open is automatically cached locally in your browser's IndexedDB so you can read it anytime offline.
              </p>
            </div>
          ) : (
            documents.map((doc) => {
              const isCurrent = doc.id === currentDocId;
              return (
                <div
                  key={doc.id}
                  className={`p-2.5 rounded border flex items-center justify-between gap-3 transition-all ${
                    isCurrent
                      ? "border-blue-500 bg-blue-600/10"
                      : "border-[#1F2937] hover:border-gray-600 bg-[#0F1115]/60 hover:bg-[#1F2937]"
                  }`}
                >
                  <div
                    onClick={() => {
                      onSelectDoc(doc.id);
                      onClose();
                    }}
                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                  >
                    <div className="w-8 h-8 rounded bg-[#0F1115] border border-[#1F2937] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate block text-gray-200">
                          {doc.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-blue-600/30 text-blue-300 font-bold shrink-0">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 flex items-center gap-2 mt-0.5">
                        <span>{doc.totalPages} PAGES</span>
                        <span>&bull;</span>
                        <span>{formatFileSize(doc.size)}</span>
                        <span>&bull;</span>
                        <span>LAST READ {formatDate(doc.lastReadAt).toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        onSelectDoc(doc.id);
                        onClose();
                      }}
                      className="px-2 py-1 rounded bg-[#1F2937] hover:bg-[#2D333B] text-gray-200 text-xs flex items-center gap-1 border border-[#2D333B] cursor-pointer"
                      title="Open document"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline font-medium text-[11px]">Read</span>
                    </button>
                    <button
                      onClick={() => onDeleteDoc(doc.id)}
                      className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete from offline storage"
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
        <div className="p-3 border-t border-[#1F2937] bg-[#14171D] flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onUploadClick();
            }}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer uppercase tracking-wider"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload New PDF</span>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
