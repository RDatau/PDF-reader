import React, { useState, useEffect } from "react";
import { WifiOff, X } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [isDismissed, setIsDismissed] = useState(false);

  // When connection goes offline, show the toast and auto-dismiss after 5 seconds
  useEffect(() => {
    if (!isOnline) {
      setIsDismissed(false);
      const timer = setTimeout(() => {
        setIsDismissed(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setIsDismissed(false);
    }
  }, [isOnline]);

  if (isOnline || isDismissed) return null;

  return (
    <div
      id="toast-offline-mode"
      role="status"
      aria-live="polite"
      className="fixed bottom-16 sm:bottom-6 left-4 sm:left-6 z-50 flex items-center justify-between gap-3 max-w-sm sm:max-w-md rounded-xl bg-amber-600/95 backdrop-blur-md px-3.5 py-2.5 text-xs font-medium text-white shadow-2xl border border-amber-400/40 animate-in fade-in slide-in-from-bottom-3 duration-300"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-200" />
        <span className="leading-snug">
          Mode Offline Aktif &mdash; Teks dan dokumen tersimpan di cache lokal.
        </span>
      </div>
      <button
        type="button"
        id="btn-close-offline-toast"
        onClick={() => setIsDismissed(true)}
        className="p-1 -mr-1 rounded-lg text-amber-200 hover:text-white hover:bg-amber-700/60 transition-colors cursor-pointer shrink-0"
        title="Tutup pemberitahuan offline"
        aria-label="Tutup pemberitahuan offline"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
