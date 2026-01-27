import { useLocation, useSearchParams } from "react-router-dom";
import { useMemo } from "react";

/**
 * Hook to derive the active sidebar section from the current URL.
 * This ensures sidebar state persists across navigation and page reloads.
 */
export function useSidebarSection(sectionMap: Record<string, string>) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const activeSection = useMemo(() => {
    const pathname = location.pathname;
    
    // Check for exact path matches first
    for (const [path, section] of Object.entries(sectionMap)) {
      if (pathname === path) {
        return section;
      }
    }
    
    // Check for partial matches (e.g., /admin/coaches matches /admin)
    for (const [path, section] of Object.entries(sectionMap)) {
      if (path !== "/" && pathname.startsWith(path)) {
        return section;
      }
    }
    
    // Check search params for section override
    const sectionParam = searchParams.get("section");
    if (sectionParam) {
      return sectionParam;
    }
    
    // Default to first section
    return Object.values(sectionMap)[0] || "overview";
  }, [location.pathname, searchParams, sectionMap]);
  
  return activeSection;
}

/**
 * Get section from path for consistent sidebar highlighting
 */
export function getSectionFromPath(pathname: string, basePath: string): string {
  // Remove base path and get the section
  const relativePath = pathname.replace(basePath, "").replace(/^\//, "");
  return relativePath.split("/")[0] || "dashboard";
}
