import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Production domains - add your final domain(s) here
const PRODUCTION_DOMAINS = [
  "theigu.com",
  "www.theigu.com",
];

export function TestEnvironmentBanner() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  // Don't show banner on production domains
  const isProduction = PRODUCTION_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );

  // Bump the global top-offset so dashboard layouts and fixed sidebars sit
  // below banner + navbar instead of behind the banner.
  useEffect(() => {
    if (isProduction) return;
    const root = document.documentElement;
    root.style.setProperty("--app-top-offset", "calc(4rem + 2rem)");
    return () => {
      root.style.removeProperty("--app-top-offset");
    };
  }, [isProduction]);

  if (isProduction) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-amber-950 text-center py-1.5 px-4 text-sm font-medium flex items-center justify-center gap-2 sticky top-0 z-[60]">
      <AlertTriangle className="h-4 w-4" />
      <span>Test Environment – Not Live</span>
    </div>
  );
}
