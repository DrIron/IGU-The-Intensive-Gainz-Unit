// src/components/client-overview/workouts/AssignProgramPicker.tsx
//
// WK10-a — the in-context "Assign program" template picker. Lets a coach choose
// one of their program templates WITHOUT leaving the Client Overview shell (the
// button used to navigate to /coach/programs, abandoning the client).
//
// This owns only the pick step: it lists the coach's assignable templates and
// fires `onPick(programId, programTitle)`. The parent then hands that to the
// existing AssignFromLibraryDialog (mode="client") for the actual assignment —
// we deliberately do NOT rebuild assignment here.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "@/components/ui/responsive-dialog";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, BookOpen } from "lucide-react";

interface TemplateRow {
  id: string;
  title: string;
  level: string | null;
  tags: string[];
}

interface AssignProgramPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  /** Fired with the chosen template; the parent opens AssignFromLibraryDialog. */
  onPick: (programId: string, programTitle: string) => void;
}

/** Only surface the search box once the library is long enough to need it. */
const SEARCH_THRESHOLD = 8;

export function AssignProgramPicker({
  open,
  onOpenChange,
  coachUserId,
  onPick,
}: AssignProgramPickerProps) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Refetch each time the picker opens so a template created elsewhere shows up.
  // Deps are [open, coachUserId] only — the setState calls below don't re-trigger
  // the effect, so there's no fetch loop despite the lack of a ref guard.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setQuery("");
    supabase
      .from("program_templates")
      .select("id, title, level, tags")
      .eq("owner_coach_id", coachUserId)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          captureException(error, { source: "AssignProgramPicker" });
          setTemplates([]);
        } else {
          setTemplates(
            (data ?? []).map((t) => ({
              id: t.id,
              title: t.title ?? "Untitled program",
              level: t.level ?? null,
              tags: (t.tags ?? []) as string[],
            })),
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, coachUserId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [templates, query]);

  const handlePick = (t: TemplateRow) => {
    onPick(t.id, t.title);
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        title="Assign a program"
        description="Pick one of your program templates to assign to this client."
      >
        <div className="space-y-4 py-1" data-assign-program-picker>
          {templates.length > SEARCH_THRESHOLD && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search programs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <BookOpen className="h-6 w-6" aria-hidden="true" />
              <p className="text-sm">You have no program templates yet.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No programs match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((t) => (
                <ClickableCard
                  key={t.id}
                  ariaLabel={`Assign ${t.title}`}
                  onClick={() => handlePick(t)}
                  className="p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{t.title}</p>
                      {t.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {t.level && (
                      <Badge variant="secondary" className="shrink-0 capitalize">
                        {t.level}
                      </Badge>
                    )}
                  </div>
                </ClickableCard>
              ))}
            </div>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
