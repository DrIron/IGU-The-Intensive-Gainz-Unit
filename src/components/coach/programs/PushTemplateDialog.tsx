import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { pushTemplateToAssignees, type TemplateAssignees } from "@/lib/templatePush";

interface PushTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templatePlanId: string;
  assignees: TemplateAssignees;
}

/**
 * S4 — post-save "push changes to assignees?" dialog (Part C). A checkbox
 * multiselect of the 1:1 clients + teams following the template; pushing
 * overwrites each selected clone with the latest template, EXCEPT sessions they've
 * already completed (kept as performed). board_v2-gated by the caller.
 */
export function PushTemplateDialog({ open, onOpenChange, templatePlanId, assignees }: PushTemplateDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);

  const allCloneIds = useMemo(
    () => [...assignees.clients.map((c) => c.clonePlanId), ...assignees.teams.map((t) => t.clonePlanId)],
    [assignees],
  );
  const total = allCloneIds.length;
  const allSelected = total > 0 && selected.size === total;

  const toggle = (cloneId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cloneId)) next.delete(cloneId);
      else next.add(cloneId);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allCloneIds));

  const handlePush = async () => {
    const targets = allCloneIds.filter((id) => selected.has(id));
    if (targets.length === 0) return;
    setPushing(true);
    try {
      const res = await pushTemplateToAssignees(templatePlanId, targets);
      const replaced = res.targets.reduce((a, t) => a + t.sessions_replaced, 0);
      const preserved = res.targets.reduce((a, t) => a + t.sessions_preserved, 0);
      toast({
        title: `Pushed to ${res.targets.length} ${res.targets.length === 1 ? "assignee" : "assignees"}`,
        description: `${replaced} session${replaced === 1 ? "" : "s"} updated · ${preserved} completed session${preserved === 1 ? "" : "s"} preserved.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Push failed", description: sanitizeErrorForUser(err), variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Push changes to assignees?</DialogTitle>
          <DialogDescription>
            Pushing updates these plans to your latest template. Sessions they've already
            completed stay as-is.
          </DialogDescription>
        </DialogHeader>

        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No clients or teams follow this template yet.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <span className="text-xs text-muted-foreground">{selected.size}/{total} selected</span>
            </div>
            <ScrollArea className="max-h-72 -mx-1 px-1">
              <div className="space-y-1.5">
                {assignees.teams.map((t) => (
                  <Row
                    key={t.clonePlanId}
                    checked={selected.has(t.clonePlanId)}
                    onToggle={() => toggle(t.clonePlanId)}
                    icon={<Users className="h-4 w-4 text-muted-foreground shrink-0" />}
                    label={t.name}
                    meta={`${t.memberCount} member${t.memberCount === 1 ? "" : "s"}`}
                    customized={t.customized}
                  />
                ))}
                {assignees.clients.map((c) => (
                  <Row
                    key={c.clonePlanId}
                    checked={selected.has(c.clonePlanId)}
                    onToggle={() => toggle(c.clonePlanId)}
                    icon={<User className="h-4 w-4 text-muted-foreground shrink-0" />}
                    label={c.name}
                    customized={c.customized}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>
            Not now
          </Button>
          <Button onClick={handlePush} disabled={pushing || selected.size === 0}>
            {pushing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Pushing...
              </>
            ) : (
              `Push to ${selected.size || ""} selected`.trim()
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  checked,
  onToggle,
  icon,
  label,
  meta,
  customized,
}: {
  checked: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  meta?: string;
  customized: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 cursor-pointer hover:bg-muted/40">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{label}</p>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      </div>
      {customized && (
        <Badge variant="outline" className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/40">
          customized
        </Badge>
      )}
    </label>
  );
}
