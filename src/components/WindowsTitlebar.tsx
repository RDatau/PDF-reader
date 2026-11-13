import React, { useState, useEffect } from "react";
import { Minus, Square, Copy, X, BookOpen } from "lucide-react";

interface WindowsTitlebarProps {
  currentDocName: string;
  isDark: boolean;
}

export const WindowsTitlebar: React.FC<WindowsTitlebarProps> = ({
  currentDocName,
  isDark,
}) => {
  const isElectron =
    typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
      const unsubscribe = window.electronAPI.onWindowStateChanged((state) => {
        setIsMaximized(state.isMaximized);
      });
      return () => {
        unsubscribe();
      };
    }
  }, [isElectron]);

  // WebApp / PWA uses the browser's native window titlebar; render custom titlebar only in Electron
  if (!isElectron) {
    return null;
  }

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  const barBg = isDark ? "bg-[#0B0D11] text-gray-300 border-[#1B1F27]" : "bg-[#F3F4F6] text-gray-700 border-gray-200";

  return (
    <div
      id="windows-titlebar"
      className={`h-8 w-full border-b flex items-center justify-between text-xs select-none transition-colors duration-200 z-40 ${barBg}`}
      style={{
        // Electron drag region
        WebkitAppRegion: isElectron ? "drag" : "no-drag",
      } as any}
    >
      {/* Left: App Logo & Windows Label */}
      <div
        className="flex items-center gap-2 px-3 h-full"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <div className="flex items-center gap-1.5 cursor-default">
          <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center text-white">
            <BookOpen className="w-2.5 h-2.5" />
          </div>
          <span className="font-bold text-[11px] tracking-wide text-blue-400">
            VOX<span className="text-white font-semibold">READER</span>
          </span>
        </div>
      </div>

      {/* Center: Window Title & Document Name */}
      <div className="flex-1 flex items-center justify-center h-full px-4 overflow-hidden pointer-events-none">
        <span className="truncate text-[11px] font-medium text-gray-400 max-w-sm sm:max-w-md md:max-w-lg font-mono">
          {currentDocName ? `${currentDocName} — VOXReader` : "VOXReader — Pembaca PDF Windows"}
        </span>
      </div>

      {/* Right: Windows 11 Style Window Action Buttons */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          id="win-btn-minimize"
          onClick={handleMinimize}
          className={`h-full px-3.5 flex items-center justify-center transition-colors cursor-pointer ${
            isDark ? "hover:bg-[#1E232E] text-gray-400 hover:text-gray-100" : "hover:bg-gray-200 text-gray-600"
          }`}
          title="Minimalkan"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          id="win-btn-maximize"
          onClick={handleMaximize}
          className={`h-full px-3.5 flex items-center justify-center transition-colors cursor-pointer ${
            isDark ? "hover:bg-[#1E232E] text-gray-400 hover:text-gray-100" : "hover:bg-gray-200 text-gray-600"
          }`}
          title={isMaximized ? "Pulihkan Ukuran" : "Maksimalkan"}
        >
          {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>

        <button
          id="win-btn-close"
          onClick={handleClose}
          className="h-full px-4 flex items-center justify-center transition-colors hover:bg-[#E81123] hover:text-white text-gray-400 cursor-pointer"
          title="Tutup (Alt+F4)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
