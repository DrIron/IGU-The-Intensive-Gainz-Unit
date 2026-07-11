import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";

type Attribution = "full_name" | "first_initial" | "anonymous";

interface CoachTestimonialRow {
  id: string;
  rating: number;
  feedback: string;
  attribution: Attribution;
  author_display_name: string | null;
  display_consent: boolean;
  withdrawn_at: string | null;
  hidden_by_admin: boolean;
  show_on_coach_page: boolean;
}

/**
 * Mirror of get_coach_public_testimonials' server-side derivation so the coach
 * sees exactly the name the public sees. full_name → snapshot; first_initial →
 * "First L." (fallback first token); anonymous → "IGU client".
 */
function deriveDisplayName(attribution: Attribution, authorDisplayName: string | null): string {
  const raw = (authorDisplayName ?? "").trim();
  if (attribution === "anonymous") return "IGU client";
  if (attribution === "full_name") return raw || "IGU client";
  const [first, second] = raw.split(/\s+/);
  if (first && second) return `${first} ${second.charAt(0)}.`;
  return first || "IGU client";
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-4 w-4 ${s <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

function TestimonialCard({ row }: { row: CoachTestimonialRow }) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  // Local authoritative copy (de478a4): optimistic + rollback on RPC error, no
  // post-write re-read (the pooler can return a read-after-write-stale row).
  const [shown, setShown] = useState(row.show_on_coach_page);
  const [busy, setBusy] = useState(false);

  // A review is publicly showable only when it will actually be visible per the
  // §2 rule — otherwise the toggle is disabled with the blocking reason.
  const blockedReason = !row.display_consent
    ? t("coachTestimonialsNeedConsent", { defaultValue: "Waiting on client consent." })
    : row.withdrawn_at != null
      ? t("coachTestimonialsWithdrawn", { defaultValue: "Client withdrew this." })
      : row.hidden_by_admin
        ? t("coachTestimonialsHidden", { defaultValue: "Hidden by IGU." })
        : null;

  const toggle = async (next: boolean) => {
    const prev = shown;
    setBusy(true);
    setShown(next); // optimistic
    try {
      const { error } = await supabase.rpc("set_testimonial_coach_visibility", {
        p_id: row.id,
        p_show: next,
      });
      if (error) throw error;
    } catch (error) {
      setShown(prev); // roll back on failure
      captureException(error, { source: "coach_testimonials_toggle" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{deriveDisplayName(row.attribution, row.author_display_name)}</span>
          <Stars rating={row.rating} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground whitespace-pre-line">{row.feedback}</p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div className="min-w-0">
            <Label htmlFor={`show-${row.id}`} className="text-sm font-normal cursor-pointer">
              {t("coachTestimonialsShowToggle", { defaultValue: "Show on my public page" })}
            </Label>
            {blockedReason && <p className="text-xs text-muted-foreground mt-0.5">{blockedReason}</p>}
          </div>
          <Switch
            id={`show-${row.id}`}
            checked={shown}
            onCheckedChange={toggle}
            disabled={busy || blockedReason != null}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function CoachTestimonials({ coachUserId }: { coachUserId: string }) {
  const { t } = useTranslation("common");
  const [rows, setRows] = useState<CoachTestimonialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // "Coaches can view their clients' testimonials" SELECT policy (coach_id = auth.uid()).
      const { data, error } = await supabase
        .from("testimonials")
        .select(
          "id, rating, feedback, attribution, author_display_name, display_consent, withdrawn_at, hidden_by_admin, show_on_coach_page, created_at",
        )
        .eq("coach_id", coachUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as CoachTestimonialRow[]);
    } catch (error) {
      captureException(error, { source: "coach_testimonials_load" });
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="py-10 text-center text-muted-foreground">
          {t("coachTestimonialsEmpty", {
            defaultValue: "No testimonials yet — your clients can leave one from their dashboard.",
          })}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {rows.map((row) => (
        <TestimonialCard key={row.id} row={row} />
      ))}
    </div>
  );
}

export default CoachTestimonials;
