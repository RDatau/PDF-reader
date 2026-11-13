import "../polyfills";
import React, { useEffect, useState } from "react";
import { X, Bookmark, BookmarkCheck, ListTree } from "lucide-react";
import { ReadingTheme } from "../types";

interface OutlineSidebarProps {
  pdfDoc: any | null;
  currentPage: number;
  bookmarks: number[];
  onPageSelect: (page: number) => void;
  onRemoveBookmark: (page: number) => void;
  onClose: () => void;
  theme: ReadingTheme;
}

export const OutlineSidebar: React.FC<OutlineSidebarProps> = ({
  pdfDoc,
  currentPage,
  bookmarks,
  onPageSelect,
  onRemoveBookmark,
  onClose,
  theme,
}) => {
  const [outline, setOutline] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"outline" | "bookmarks">("bookmarks");

  useEffect(() => {
    if (!pdfDoc) {
      setOutline([]);
      return;
    }
    pdfDoc
      .getOutline()
      .then((docOutline: any) => {
        if (docOutline && docOutline.length > 0) {
          setOutline(docOutline);
          setActiveTab("outline");
        } else {
          setActiveTab("bookmarks");
        }
      })
      .catch(() => {});
  }, [pdfDoc]);

  const themeClasses = {
    light: "bg-white border-neutral-200 text-neutral-800",
    night: "bg-[#14171D] border-[#1F2937] text-[#E5E7EB]",
    sepia: "bg-[#f5ecda] border-[#ded3ba] text-[#4a3b2c]",
    midnight: "bg-[#0b1329] border-[#1e293b] text-slate-100",
  }[theme];

  return (
    <aside
      id="outline-sidebar"
      className={`absolute inset-y-0 left-0 z-40 sm:relative sm:z-20 w-72 sm:w-64 border-r flex flex-col shrink-0 shadow-2xl sm:shadow-none transition-colors ${themeClasses}`}
      style={{ minHeight: 0 }}
    >
      <div className="p-3 border-b border-[#1F2937] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("outline")}
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeTab === "outline"
                ? "bg-blue-600 text-white font-semibold shadow-xs"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Outline
          </button>
          <button
            onClick={() => setActiveTab("bookmarks")}
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "bookmarks"
                ? "bg-blue-600 text-white font-semibold shadow-xs"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Bookmark className="w-3 h-3" />
            <span>Saved ({bookmarks.length})</span>
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white cursor-pointer"
          title="Close Outline"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {activeTab === "outline" ? (
          outline.length > 0 ? (
            <div className="space-y-1">
              {outline.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    // Jump to dest if known
                    if (typeof item.dest === "number") {
                      onPageSelect(item.dest + 1);
                    }
                  }}
                  className="p-2 rounded hover:bg-[#1F2937] text-gray-300 cursor-pointer flex items-center gap-2 transition-colors"
                >
                  <ListTree className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-1 font-mono text-xs">NO EMBEDDED OUTLINE</p>
              <p className="text-[11px] text-gray-400">Use bookmarks to save key pages.</p>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {bookmarks.length > 0 ? (
              bookmarks.map((bPage) => (
                <div
                  key={bPage}
                  className={`p-2.5 rounded border flex items-center justify-between transition-colors ${
                    bPage === currentPage
                      ? "border-blue-500 bg-blue-600/10 text-blue-400"
                      : "border-[#1F2937] bg-[#0F1115]/50 hover:bg-[#1F2937] text-gray-300"
                  }`}
                >
                  <div
                    onClick={() => onPageSelect(bPage)}
                    className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="font-mono text-xs font-semibold truncate">PAGE {bPage}</span>
                  </div>
                  <button
                    onClick={() => onRemoveBookmark(bPage)}
                    className="p-1 rounded hover:bg-[#2D333B] text-gray-400 hover:text-rose-400 cursor-pointer"
                    title="Remove bookmark"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-30 text-blue-500" />
                <p className="text-xs font-mono">NO BOOKMARKS SAVED</p>
                <p className="text-[11px] mt-1 text-gray-400">
                  Click the bookmark icon in the toolbar to pin important pages.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
