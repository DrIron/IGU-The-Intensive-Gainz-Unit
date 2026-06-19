// SwipeableRow — touch swipe-left to reveal a right-aligned action tray
// (CAL1 Phase 2, mobile list rows). Horizontal-intent detection so vertical
// scroll and tap-to-edit are preserved (touch-action: pan-y lets the browser
// own vertical pans). No-op (renders children bare) when disabled / no actions.
import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Token classes for the tray button bg/text (e.g. destructive). */
  className?: string;
}

const ACTION_W = 64; // px per action button

export function SwipeableRow({
  actions,
  children,
  disabled,
}: {
  actions: SwipeAction[];
  children: ReactNode;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horiz = useRef(false);

  if (disabled || actions.length === 0) return <>{children}</>;

  const trayWidth = actions.length * ACTION_W;

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    horiz.current = false;
  };

  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const t = e.touches[0];
    const ddx = t.clientX - start.current.x;
    const ddy = t.clientY - start.current.y;
    if (!horiz.current) {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) {
        horiz.current = true;
        setDragging(true);
      } else if (Math.abs(ddy) > 8) {
        start.current = null; // vertical scroll — bail out of this gesture
        return;
      } else {
        return;
      }
    }
    const base = open ? -trayWidth : 0;
    setDx(Math.max(-trayWidth, Math.min(0, base + ddx)));
  };

  const onTouchEnd = () => {
    if (!horiz.current) {
      start.current = null;
      return; // a tap (not a drag) — let the child's onClick run
    }
    const shouldOpen = dx < -trayWidth / 2;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -trayWidth : 0);
    setDragging(false);
    horiz.current = false;
    start.current = null;
  };

  const close = () => {
    setOpen(false);
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action tray (revealed behind the row) */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => {
              a.onClick();
              close();
            }}
            style={{ width: ACTION_W }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              a.className ?? "bg-muted text-foreground",
            )}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      {/* Foreground row */}
      <div
        className="relative bg-card transition-transform"
        style={{ transform: `translateX(${dx}px)`, transitionDuration: dragging ? "0ms" : "150ms", touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={(e) => {
          // When the tray is open, a tap closes it and is swallowed (no edit).
          if (open) {
            e.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
