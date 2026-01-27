import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "muted" | "card";
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className,
  variant = "default"
}: EmptyStateProps) {
  const baseStyles = "flex flex-col items-center justify-center text-center py-8 px-4";
  
  const variantStyles = {
    default: "",
    muted: "bg-muted/30 rounded-lg",
    card: "bg-card border rounded-lg shadow-sm",
  };

  return (
    <div className={cn(baseStyles, variantStyles[variant], className)}>
      {Icon && (
        <div className="p-3 rounded-full bg-muted/50 mb-4">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
