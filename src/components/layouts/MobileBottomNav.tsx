import { Link, useLocation } from "react-router-dom";
import { LucideIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface MobileBottomNavProps {
  items: NavItem[];
  /** Max items to show before overflow menu (default: 4) */
  maxVisible?: number;
  className?: string;
}

/**
 * Mobile bottom navigation bar.
 * Shows primary nav items with icons, overflow items in "More" menu.
 * Only visible on mobile (< md breakpoint).
 */
export function MobileBottomNav({ 
  items, 
  maxVisible = 4,
  className 
}: MobileBottomNavProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    // Exact match for root paths, startsWith for nested
    if (path === "/dashboard" || path === "/client" || path === "/coach" || path === "/admin") {
      return location.pathname === path || location.pathname.startsWith(path + "/");
    }
    return location.pathname === path;
  };

  const visibleItems = items.slice(0, maxVisible);
  const overflowItems = items.slice(maxVisible);
  const hasOverflow = overflowItems.length > 0;

  // Check if any overflow item is active
  const isOverflowActive = overflowItems.some(item => isActive(item.path));

  return (
    <nav 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 md:hidden",
        "bg-background border-t",
        "safe-area-inset-bottom", // iOS safe area
        className
      )}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 px-3 rounded-lg",
                "transition-colors touch-manipulation",
                active 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium truncate max-w-[64px]">
                {item.label}
              </span>
            </Link>
          );
        })}

        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 px-3 rounded-lg",
                  "transition-colors touch-manipulation",
                  isOverflowActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 mb-2">
              {overflowItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                
                return (
                  <DropdownMenuItem key={item.path} asChild>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2 w-full",
                        active && "bg-primary/10 text-primary"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
}
