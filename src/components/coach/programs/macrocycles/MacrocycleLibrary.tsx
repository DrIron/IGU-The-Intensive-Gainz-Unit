// src/components/coach/programs/macrocycles/MacrocycleLibrary.tsx
// Grid list of the coach's macrocycles. Card actions: Edit, Assign, Delete.
// Empty state offers "+ New macrocycle" inline. Mobile stacks single-column.

import { memo, useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClickableCard } from "@/components/ui/clickable-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, MoreVertical, Edit, Trash2, Share, CalendarRange } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { useMacrocycleList } from "@/hooks/useMacrocycles";
import { AssignMacrocycleDialog } from "./AssignMacrocycleDialog";

interface MacrocycleLibraryProps {
  coachUserId: string;
  onOpenMacrocycle: (macrocycleId: string) => void;
  onNewMacrocycle: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const MacrocycleLibrary = memo(function MacrocycleLibrary({
  coachUserId,
  onOpenMacrocycle,
  onNewMacrocycle,
}: MacrocycleLibraryProps) {
  const { macrocycles, loading, reload } = useMacrocycleList(coachUserId);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<(typeof macrocycles)[number] | null>(null);
  const [assignTarget, setAssignTarget] = useState<(typeof macrocycles)[number] | null>(null);
  const { toast } = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return macrocycles;
    return macrocycles.filter(
      m => m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q),
    );
  }, [macrocycles, search]);

  const deleteMacrocycle = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      // Junction rows cascade; client_programs.macrocycle_id SET NULL keeps assignments intact.
      const { error } = await supabase
        // @ts-expect-error types not regenerated
        .from("macrocycles")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Macrocycle deleted" });
      setDeleteTarget(null);
      reload();
    } catch (e: unknown) {
      toast({
        title: "Error deleting",
        description: sanitizeErrorForUser(e),
        variant: "destructive",
      });
    }
  }, [deleteTarget, reload, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading macrocycles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + search */}
      {macrocycles.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search macrocycles..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={macrocycles.length === 0 ? "No macrocycles yet" : "No matching macrocycles"}
          description={
            macrocycles.length === 0
              ? "Chain mesocycles into a 3-6 month training arc."
              : "Try a different search term."
          }
          action={
            macrocycles.length === 0 ? (
              <Button onClick={onNewMacrocycle}>
                <Plus className="h-4 w-4 mr-2" />
                New Macrocycle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => (
            <div key={m.id} className="relative group">
              <ClickableCard
                ariaLabel={`Open macrocycle ${m.name}`}
                onClick={() => onOpenMacrocycle(m.id)}
                className="h-full hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4 md:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-base md:text-lg font-semibold truncate">{m.name}</p>
                      {m.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {m.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>
                      <strong className="text-foreground">{m.blockCount}</strong>{" "}
                      mesocycle{m.blockCount !== 1 ? "s" : ""}
                    </span>
                    <span>·</span>
                    <span>
                      <strong className="text-foreground">{m.weeksTotal}</strong>{" "}
                      week{m.weeksTotal !== 1 ? "s" : ""}
                    </span>
                    <span>·</span>
                    <span>{timeAgo(m.updatedAt)}</span>
                  </div>
                </CardContent>
              </ClickableCard>

              {/* Action menu positioned outside ClickableCard so clicks don't bubble-open the card */}
              <div className="absolute top-2 right-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={e => e.stopPropagation()}
                      aria-label="Macrocycle actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => onOpenMacrocycle(m.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAssignTarget(m)} disabled={m.blockCount === 0}>
                      <Share className="h-4 w-4 mr-2" />
                      Assign
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(m)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete macrocycle?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently deleted. Assigned client programs will
              NOT be affected — they keep running, they just lose the macrocycle grouping label.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteMacrocycle}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign */}
      {assignTarget && (
        <AssignMacrocycleDialog
          open={!!assignTarget}
          onOpenChange={open => !open && setAssignTarget(null)}
          macrocycleId={assignTarget.id}
          macrocycleName={assignTarget.name}
          coachUserId={coachUserId}
          weeksTotal={assignTarget.weeksTotal}
          blockCount={assignTarget.blockCount}
          onAssigned={reload}
        />
      )}
    </div>
  );
});
