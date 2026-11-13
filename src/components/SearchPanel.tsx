import "../polyfills";
import React, { useState } from "react";
import { Search, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { ReadingTheme } from "../types";

interface SearchMatchResult {
  pageNumber: number;
  snippet: string;
}

interface SearchPanelProps {
  pdfDoc: any | null;
  totalPages: number;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
  theme: ReadingTheme;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  pdfDoc,
  totalPages,
  onJumpToPage,
  onClose,
  theme,
}) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchMatchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || !pdfDoc) return;

    setIsSearching(true);
    setResults([]);
    setHasSearched(true);

    try {
      const matches: SearchMatchResult[] = [];
      const total = pdfDoc.numPages || totalPages;

      for (let i = 1; i <= total; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map((it: any) => it.str).join(" ");
        const lowerText = fullText.toLowerCase();
        const lowerQ = cleanQuery.toLowerCase();

        let index = lowerText.indexOf(lowerQ);
        while (index !== -1) {
          const start = Math.max(0, index - 35);
          const end = Math.min(fullText.length, index + cleanQuery.length + 45);
          const snippet = (start > 0 ? "..." : "") + fullText.slice(start, end) + (end < fullText.length ? "..." : "");

          matches.push({
            pageNumber: i,
            snippet,
          });

          if (matches.length >= 50) break; // cap search results
          index = lowerText.indexOf(lowerQ, index + cleanQuery.length);
        }

        if (matches.length >= 50) break;
      }

      setResults(matches);
    } catch (e: any) {
      if (
        e?.message?.includes("Transport destroyed") ||
        e?.message?.includes("Worker was destroyed")
      ) {
        return;
      }
      console.error("Search error:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const themeClasses = {
    light: "bg-white border-neutral-200 text-neutral-800",
    night: "bg-[#14171D] border-[#1F2937] text-[#E5E7EB]",
    sepia: "bg-[#f5ecda] border-[#ded3ba] text-[#4a3b2c]",
    midnight: "bg-[#0b1329] border-[#1e293b] text-slate-100",
  }[theme];

  return (
    <div
      id="search-panel"
      className={`absolute inset-y-0 right-0 z-40 sm:relative sm:z-20 w-80 sm:w-80 border-l flex flex-col shrink-0 transition-colors shadow-2xl ${themeClasses}`}
      style={{ minHeight: 0 }}
    >
      <div className="p-3 border-b border-[#1F2937] flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-blue-400" />
          FIND IN DOCUMENT
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#1F2937] text-gray-400 hover:text-white cursor-pointer"
          title="Close search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="p-3 border-b border-[#1F2937]">
        <div className="relative">
          <input
            id="input-search-term"
            type="text"
            placeholder="Search keywords or phrases..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-16 py-1.5 rounded border border-[#1F2937] bg-[#0F1115] text-gray-200 text-xs focus:outline-hidden focus:border-blue-500 placeholder-gray-500"
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="absolute right-1 top-1 bottom-1 px-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
          >
            {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : "FIND"}
          </button>
        </div>
      </form>

      {/* Search Results */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-2">
        {isSearching && (
          <div className="py-8 text-center text-gray-400 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span className="font-mono text-xs">SCANNING PAGES...</span>
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="py-8 text-center text-gray-400">
            <p className="font-mono text-xs">NO MATCHES FOUND</p>
            <p className="text-[11px] text-gray-500 mt-1">Try another keyword or term.</p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-400 mb-2 font-mono font-bold uppercase tracking-wider">
              FOUND {results.length} MATCH{results.length === 1 ? "" : "ES"}:
            </div>
            <div className="space-y-2">
              {results.map((res, idx) => (
                <div
                  key={idx}
                  onClick={() => onJumpToPage(res.pageNumber)}
                  className="p-2.5 rounded border border-[#1F2937] bg-[#0F1115]/50 hover:border-blue-500 hover:bg-[#1F2937] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase text-blue-400">
                      PAGE {res.pageNumber}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-snug">
                    {res.snippet}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
