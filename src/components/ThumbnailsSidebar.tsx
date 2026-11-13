import "../polyfills";
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ReadingTheme } from "../types";

interface ThumbnailsSidebarProps {
  pdfDoc: any | null;
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  onClose: () => void;
  theme: ReadingTheme;
}

export const ThumbnailsSidebar: React.FC<ThumbnailsSidebarProps> = ({
  pdfDoc,
  totalPages,
  currentPage,
  onPageSelect,
  onClose,
  theme,
}) => {
  const [thumbnails, setThumbnails] = useState<{ [page: number]: string }>({});

  useEffect(() => {
    if (!pdfDoc || totalPages <= 0) return;

    let isCancelled = false;

    const renderThumbnails = async () => {
      // Render thumbnails for up to 40 pages lazily
      const maxToRender = Math.min(totalPages, 40);
      for (let i = 1; i <= maxToRender; i++) {
        if (isCancelled) break;
        try {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 0.25 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          if (ctx) {
            await (page.render({ canvasContext: ctx, canvas, viewport } as any)).promise;
            if (!isCancelled) {
              setThumbnails((prev) => ({ ...prev, [i]: canvas.toDataURL() }));
            }
          }
        } catch (e) {
          // ignore page render errors if cancelled
        }
      }
    };

    renderThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, totalPages]);

  const themeClasses = {
    light: "bg-white border-neutral-200 text-neutral-800",
    night: "bg-[#14171D] border-[#1F2937] text-[#E5E7EB]",
    sepia: "bg-[#f5ecda] border-[#ded3ba] text-[#4a3b2c]",
    midnight: "bg-[#0b1329] border-[#1e293b] text-slate-100",
  }[theme];

  return (
    <aside
      id="thumbnails-sidebar"
      className={`absolute inset-y-0 left-0 z-40 sm:relative sm:z-20 w-64 sm:w-56 border-r flex flex-col shrink-0 shadow-2xl sm:shadow-none transition-colors ${themeClasses}`}
      style={{ minHeight: 0 }}
    >
      <div className="p-3 border-b border-[#1F2937] flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          PAGE THUMBNAILS
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white cursor-pointer"
          title="Close thumbnails"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => {
          const isActive = page === currentPage;
          return (
            <div
              key={page}
              onClick={() => onPageSelect(page)}
              className={`group flex flex-col items-center p-2 rounded cursor-pointer transition-all ${
                isActive
                  ? "bg-blue-600/10 border-2 border-blue-500 shadow-sm"
                  : "bg-[#0F1115]/50 hover:bg-[#1F2937] border border-[#1F2937]"
              }`}
            >
              <div className="w-28 h-36 bg-[#0F1115] border border-[#1F2937] rounded-xs overflow-hidden flex items-center justify-center shadow-inner">
                {thumbnails[page] ? (
                  <img
                    src={thumbnails[page]}
                    alt={`Page ${page}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-500 font-mono">P.{page}</span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1.5 font-mono ${
                  isActive ? "text-blue-400 font-bold" : "text-gray-400"
                }`}
              >
                PAGE {page}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
