import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import { SEOHead } from "@/components/SEOHead";

type Attribution = "full_name" | "first_initial" | "anonymous";

interface MyTestimonial {
  id: string;
  coach_id: string;
  rating: number;
  feedback: string;
  display_consent: boolean;
  attribution: Attribution;
  withdrawn_at: string | null;
  coachName: string | null;
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

function TestimonialRow({ row, onChanged }: { row: MyTestimonial; onChanged: () => void }) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [consent, setConsent] = useState(row.display_consent);
  const [attribution, setAttribution] = useState<Attribution>(row.attribution);
  const [saving, setSaving] = useState(false);
  const [busyWithdraw, setBusyWithdraw] = useState(false);

  const withdrawn = row.withdrawn_at != null;
  const dirty = consent !== row.display_consent || attribution !== row.attribution;

  const saveConsent = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_testimonial_consent", {
        p_id: row.id,
        p_consent: consent,
        p_attribution: attribution,
      });
      if (error) throw error;
      toast({ title: t("testimonialConsentUpdated", { defaultValue: "Your preferences were updated." }) });
      onChanged();
    } catch (error) {
      captureException(error, { source: "my_testimonials_consent" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleWithdraw = async () => {
    setBusyWithdraw(true);
    try {
      const { error } = await supabase.rpc("withdraw_testimonial", { p_id: row.id, p_withdrawn: !withdrawn });
      if (error) throw error;
      onChanged();
    } catch (error) {
      captureException(error, { source: "my_testimonials_withdraw" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setBusyWithdraw(false);
    }
  };

  const statusBadge = withdrawn
    ? { label: t("testimonialWithdrawn", { defaultValue: "Withdrawn" }), variant: "outline" as const }
    : row.display_consent
      ? { label: t("testimonialShownPublicly", { defaultValue: "Shown publicly" }), variant: "default" as const }
      : { label: t("testimonialPrivate", { defaultValue: "Private" }), variant: "secondary" as const };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            {t("testimonialForCoach", { name: row.coachName || "your coach", defaultValue: "For {{name}}" })}
          </CardTitle>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>
        <Stars rating={row.rating} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground whitespace-pre-line">{row.feedback}</p>

        <div className="flex items-start gap-3">
          <Checkbox
            id={`consent-${row.id}`}
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            disabled={withdrawn}
            className="mt-0.5"
          />
          <Label htmlFor={`consent-${row.id}`} className="text-sm font-normal leading-snug cursor-pointer">
            {t("testimonialConsentLabel", {
              defaultValue: "Show this on IGU publicly (you can change or withdraw this later).",
            })}
          </Label>
        </div>

        <RadioGroup
          value={attribution}
          onValueChange={(v) => setAttribution(v as Attribution)}
          disabled={withdrawn}
          className="gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="full_name" id={`attr-full-${row.id}`} />
            <Label htmlFor={`attr-full-${row.id}`} className="font-normal cursor-pointer">
              {t("testimonialAttribFullName", { defaultValue: "Full name" })}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="first_initial" id={`attr-initial-${row.id}`} />
            <Label htmlFor={`attr-initial-${row.id}`} className="font-normal cursor-pointer">
              {t("testimonialAttribFirstInitial", { defaultValue: "First name + initial" })}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="anonymous" id={`attr-anon-${row.id}`} />
            <Label htmlFor={`attr-anon-${row.id}`} className="font-normal cursor-pointer">
              {t("testimonialAttribAnonymous", { defaultValue: "Anonymous (IGU client)" })}
            </Label>
          </div>
        </RadioGroup>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={saveConsent} disabled={saving || withdrawn || !dirty}>
            {t("testimonialSave", { defaultValue: "Save changes" })}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleWithdraw} disabled={busyWithdraw}>
            {withdrawn
              ? t("testimonialRestore", { defaultValue: "Restore" })
              : t("testimonialWithdraw", { defaultValue: "Withdraw" })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyTestimonials() {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const [rows, setRows] = useState<MyTestimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      // Own-row SELECT policy (user_id = auth.uid()) returns the caller's rows.
      const { data, error } = await supabase
        .from("testimonials")
        .select("id, coach_id, rating, feedback, display_consent, attribution, withdrawn_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const coachIds = [...new Set((data ?? []).map((r) => r.coach_id).filter(Boolean))] as string[];
      const nameById = new Map<string, string>();
      if (coachIds.length > 0) {
        const { data: dir } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name")
          .in("user_id", coachIds);
        for (const c of dir ?? []) {
          if (c.user_id) nameById.set(c.user_id, [c.first_name, c.last_name].filter(Boolean).join(" "));
        }
      }

      setRows(
        (data ?? []).map((r) => ({
          id: r.id,
          coach_id: r.coach_id as string,
          rating: r.rating,
          feedback: r.feedback,
          display_consent: r.display_consent,
          attribution: r.attribution as Attribution,
          withdrawn_at: r.withdrawn_at,
          coachName: nameById.get(r.coach_id as string) || null,
        })),
      );
    } catch (error) {
      captureException(error, { source: "my_testimonials_load" });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background pt-24 pb-24 md:pb-8 px-4">
      <SEOHead
        title="My Testimonials | Intensive Gainz Unit"
        description="Manage the testimonials you've shared with IGU."
      />
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="font-display text-4xl tracking-wide">
            {t("myTestimonialsTitle", { defaultValue: "My testimonials" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("myTestimonialsSubtitle", { defaultValue: "Manage what you’ve shared and how it appears publicly." })}
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">{t("loading", { defaultValue: "Loading" })}…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t("myTestimonialsEmpty", { defaultValue: "You haven’t left any testimonials yet." })}
            </CardContent>
          </Card>
        ) : (
          rows.map((row) => <TestimonialRow key={row.id} row={row} onChanged={load} />)
        )}
      </div>
    </div>
  );
}
