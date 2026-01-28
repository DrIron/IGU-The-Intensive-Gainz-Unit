import { ReactNode } from "react";
import { LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface EmptyStateProps {
  /** Icon to display (defaults to Inbox) */
  icon?: LucideIcon;
  /** Main title text */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Custom content below description */
  children?: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

/**
 * Standardized empty state component.
 * Use when a list, table, or section has no data to display.
 * 
 * @example
 * <EmptyState
 *   icon={Users}
 *   title="No clients yet"
 *   description="Your assigned clients will appear here."
 *   action={{ label: "Refresh", onClick: () => refetch() }}
 * />
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: "py-6 px-4",
      icon: "h-8 w-8",
      title: "text-sm",
      description: "text-xs",
    },
    md: {
      container: "py-12 px-6",
      icon: "h-12 w-12",
      title: "text-base",
      description: "text-sm",
    },
    lg: {
      container: "py-16 px-8",
      icon: "h-16 w-16",
      title: "text-lg",
      description: "text-base",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizes.container,
        className
      )}
    >
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className={cn("text-muted-foreground", sizes.icon)} />
      </div>
      
      <h3 className={cn("font-semibold text-foreground mb-1", sizes.title)}>
        {title}
      </h3>
      
      {description && (
        <p className={cn("text-muted-foreground max-w-sm mb-4", sizes.description)}>
          {description}
        </p>
      )}
      
      {children}
      
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-4">
          {secondaryAction && (
            <Button variant="outline" size={size === "sm" ? "sm" : "default"} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button size={size === "sm" ? "sm" : "default"} onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
