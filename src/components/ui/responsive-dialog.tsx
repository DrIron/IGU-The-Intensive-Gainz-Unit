/**
 * ResponsiveDialog — renders a Dialog on desktop, vaul Drawer (bottom sheet)
 * on mobile. Same trigger/content/title/description/footer API so a caller
 * can replace Dialog imports one-for-one.
 *
 * Usage:
 *   <ResponsiveDialog open={open} onOpenChange={setOpen}>
 *     <ResponsiveDialogTrigger asChild>
 *       <Button>Open</Button>
 *     </ResponsiveDialogTrigger>
 *     <ResponsiveDialogContent title="Heading" description="...">
 *       <div className="space-y-4 py-4">...form fields...</div>
 *       <ResponsiveDialogFooter>
 *         <Button onClick={...}>Save</Button>
 *       </ResponsiveDialogFooter>
 *     </ResponsiveDialogContent>
 *   </ResponsiveDialog>
 *
 * Mobile layout follows the Planning Board `MobileDayDetail` pattern: bottom
 * sheet capped at 92vh, ScrollArea body, safe-area padding so form inputs
 * don't hide behind the mobile dock.
 */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>{children}</Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>
  );
}

interface ResponsiveDialogTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export function ResponsiveDialogTrigger({ asChild, children }: ResponsiveDialogTriggerProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <DrawerTrigger asChild={asChild}>{children}</DrawerTrigger>
  ) : (
    <DialogTrigger asChild={asChild}>{children}</DialogTrigger>
  );
}

interface ResponsiveDialogContentProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * On mobile the body is wrapped in a capped-height ScrollArea so long forms
 * stay navigable with the bottom nav visible. Desktop uses the shadcn Dialog
 * default (centered modal, no special scroll).
 */
export function ResponsiveDialogContent({
  title,
  description,
  className,
  children,
}: ResponsiveDialogContentProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <DrawerContent className={cn("max-h-[92vh] pb-6", className)}>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <ScrollArea className="flex-1 overflow-y-auto px-4">{children}</ScrollArea>
      </DrawerContent>
    );
  }
  return (
    <DialogContent className={className}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
    </DialogContent>
  );
}

interface ResponsiveDialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function ResponsiveDialogFooter({ className, children }: ResponsiveDialogFooterProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <DrawerFooter className={cn("px-0 pt-4", className)}>{children}</DrawerFooter>
  ) : (
    <DialogFooter className={className}>{children}</DialogFooter>
  );
}
