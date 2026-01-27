import { useLocation } from "react-router-dom";

interface DebugBannerProps {
  role?: string;
  viewMode?: string;
  activeTab?: string;
  counts?: {
    pending?: number;
    active?: number;
    old?: number;
  };
}

/**
 * Debug banner - DISABLED in production.
 * Shows route/role/tab info in development only.
 */
export function DebugBanner({ 
  role, 
  viewMode, 
  activeTab, 
  counts 
}: DebugBannerProps) {
  // PRODUCTION SAFETY: Always return null in production builds
  // This ensures no debug info leaks to end users
  const isDevelopment = import.meta.env.DEV;
  if (!isDevelopment) return null;

  // Also disable if explicitly set via env
  const disableDebug = import.meta.env.VITE_DISABLE_DEBUG === 'true';
  if (disableDebug) return null;

  const location = useLocation();

  return (
    <div
      className="fixed bottom-3 left-3 z-[99999] bg-black/90 text-white 
                 px-3 py-2 rounded-lg text-xs font-mono shadow-lg 
                 max-w-[400px] overflow-hidden"
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="text-cyan-400">route:</span>
        <span className="truncate">{location.pathname}{location.search}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {role && (
          <>
            <span className="text-yellow-400">role:</span>
            <span>{role}</span>
          </>
        )}
        {viewMode && (
          <>
            <span className="text-purple-400">viewMode:</span>
            <span>{viewMode}</span>
          </>
        )}
        {activeTab && (
          <>
            <span className="text-green-400">tab:</span>
            <span>{activeTab}</span>
          </>
        )}
      </div>
      {counts && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="text-orange-400">counts:</span>
          <span>
            pending={counts.pending ?? 0}, 
            active={counts.active ?? 0}, 
            old={counts.old ?? 0}
          </span>
        </div>
      )}
    </div>
  );
}
