import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/useAuthSession";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface AssignableClient {
  client_id: string;
  first_name: string | null;
  display_name: string | null;
}

export type AssignTarget =
  | { kind: "video"; id: string; title: string }
  | { kind: "playlist"; id: string; title: string };

interface AssignToClientDialogProps {
  open: boolean;
  onClose: () => void;
  target: AssignTarget | null;
}

export function AssignToClientDialog({ open, onClose, target }: AssignToClientDialogProps) {
  const { toast } = useToast();
  const { user } = useAuthSession();
  const [clients, setClients] = useState<AssignableClient[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [dueBy, setDueBy] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    const { data, error } = await supabase.rpc("get_my_assignable_clients");
    if (error) {
      toast({ title: "Failed to load clients", description: sanitizeErrorForUser(error), variant: "destructive" });
      setClientsLoading(false);
      return;
    }
    setClients((data ?? []) as AssignableClient[]);
    setClientsLoaded(true);
    setClientsLoading(false);
  }, [toast]);

  useEffect(() => {
    if (open && !clientsLoaded) {
      loadClients();
    }
    if (!open) {
      setSelectedIds(new Set());
      setSearch("");
      setDueBy("");
      setNote("");
    }
  }, [open, clientsLoaded, loadClients]);

  const toggleClient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredClients = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.display_name?.toLowerCase().includes(q) ?? false) ||
      (c.first_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const submit = async () => {
    if (!target || !user?.id) return;
    if (selectedIds.size === 0) {
      toast({ title: "Pick at least one client", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const rows = Array.from(selectedIds).map((clientId) => ({
      coach_id: user.id,
      client_id: clientId,
      ...(target.kind === "video"
        ? { video_id: target.id, playlist_id: null }
        : { playlist_id: target.id, video_id: null }),
      due_by: dueBy ? new Date(dueBy).toISOString() : null,
      note: note.trim() || null,
    }));

    const conflict = target.kind === "video"
      ? "coach_id,client_id,video_id"
      : "coach_id,client_id,playlist_id";

    const { data, error } = await supabase
      .from("coach_content_assignments")
      .upsert(rows, { onConflict: conflict, ignoreDuplicates: true })
      .select("id, client_id");

    setSubmitting(false);

    if (error) {
      toast({ title: "Failed to assign", description: sanitizeErrorForUser(error), variant: "destructive" });
      return;
    }

    const insertedRows = (data ?? []) as Array<{ id: string; client_id: string }>;
    const insertedCount = insertedRows.length;
    const skipped = rows.length - insertedCount;
    const skippedSuffix = skipped > 0 ? ` -- ${skipped} already assigned` : "";
    const kindLabel = target.kind === "video" ? "video" : "learning path";
    toast({
      title: "Assigned",
      description: `Assigned ${kindLabel} to ${insertedCount} client${insertedCount === 1 ? "" : "s"}${skippedSuffix}.`,
    });
    onClose();

    // PR H: fire-and-forget email notification for each NEW assignment.
    // Already-assigned clients are excluded by ignoreDuplicates -> no re-email.
    // Errors logged, never surfaced to the user.
    const insertedClientIds = new Set(insertedRows.map((r) => r.client_id));
    if (insertedClientIds.size > 0) {
      void Promise.all(
        Array.from(insertedClientIds).map((cid) =>
          supabase.functions
            .invoke("send-content-assignment-email", {
              body: {
                client_id: cid,
                items: [{ kind: target.kind, id: target.id, title: target.title }],
                due_by: dueBy ? new Date(dueBy).toISOString() : null,
                note: note.trim() || null,
              },
            })
            .catch((err) => console.error("[content-assignment-email]", err))
        )
      );
    }
  };

  const targetLabel = target?.title ?? (target?.kind === "playlist" ? "learning path" : "video");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign &ldquo;{targetLabel}&rdquo; to client(s)</DialogTitle>
          <DialogDescription>
            Pick the clients who should watch this. They will see it in their &ldquo;From your coach&rdquo; section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
            {clientsLoading ? (
              <p className="text-sm text-muted-foreground p-2">Loading clients...</p>
            ) : filteredClients.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">
                {clients.length === 0 ? "No active clients found." : "No clients match your search."}
              </p>
            ) : (
              filteredClients.map((c) => {
                const label = c.display_name || c.first_name || c.client_id.slice(0, 8);
                return (
                  <label
                    key={c.client_id}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedIds.has(c.client_id)}
                      onCheckedChange={() => toggleClient(c.client_id)}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label htmlFor="due-by">Due by (optional)</Label>
              <Input
                id="due-by"
                type="date"
                value={dueBy}
                onChange={(e) => setDueBy(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={2}
                placeholder="Why this matters for them..."
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground text-right">{note.length}/200</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || selectedIds.size === 0}>
            {submitting ? "Assigning..." : `Assign to ${selectedIds.size} client${selectedIds.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
