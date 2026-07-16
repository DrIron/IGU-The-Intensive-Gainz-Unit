import { forwardRef, KeyboardEvent, MouseEvent } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * ClickableCard — accessible clickable Card wrapper.
 *
 * Use this whenever a Card represents a navigation target or primary action.
 * Handles keyboard activation (Enter / Space), screen reader announcement
 * (role="button"), focus visibility, and the hover affordance in one place so
 * individual cards don't re-implement a11y plumbing.
 *
 * DS3: the hover is FLAT — a border + background shift, no shadow. Elevation-on-hover
 * was retired platform-wide (shadow-discipline ruling); changing it here reflats every
 * ClickableCard at once.
 *
 * Example:
 *   <ClickableCard onClick={() => navigate("/x")} ariaLabel="Go to X">
 *     <CardHeader>...</CardHeader>
 *     <CardContent>...</CardContent>
 *   </ClickableCard>
 */
interface ClickableCardProps extends React.HTMLAttributes<HTMLDivElement> {
  onClick: (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => void;
  /**
   * Accessible name announced to screen readers. Required — a clickable card
   * with no label is unusable with AT.
   */
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const ClickableCard = forwardRef<HTMLDivElement, ClickableCardProps>(
  function ClickableCard({ onClick, ariaLabel, children, className, disabled, ...rest }, ref) {
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(e);
      }
    };

    return (
      <Card
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "cursor-pointer transition-colors",
          // DS3 flat hover: shift the border + a faint background, NO shadow.
          "hover:border-primary/40 hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          disabled && "cursor-not-allowed opacity-60",
          className
        )}
        {...rest}
      >
        {children}
      </Card>
    );
  }
);
