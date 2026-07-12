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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import { SEOHead } from "@/components/SEOHead";
import { formatWeightChange } from "@/lib/weightChangeFormat";

type Attribution = "full_name" | "first_initial" | "anonymous";

/** get_attachable_weight_phases preview / stored attachment snapshot (same shape). */
interface WeightChangeSnapshot {
  phase_id: string;
  phase_name: string;
  goal_type: string | null;
  start_kg: number;
  end_kg: number;
  delta_kg: number;
  weeks: number;
  from_date: string;
  to_date: string;
}

interface MyTestimonial {
  id: string;
  coach_id: string;
  rating: number;
  feedback: string;
  display_consent: boolean;
  attribution: Attribution;
  withdrawn_at: string | null;
  coachName: string | null;
  attachment_type: string;
  attachment: WeightChangeSnapshot | null;
  attachment_note: string | null;
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

function TestimonialRow({ row }: { row: MyTestimonial }) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  // Persisted state — a local authoritative copy seeded once from props. We update
  // it optimistically and roll it back on RPC error, and deliberately do NOT re-read
  // after a write: IGU's connection pooler can return a read-after-write-stale row,
  // which previously left the badge showing a change the DB hadn't accepted.
  const [withdrawn, setWithdrawn] = useState(row.withdrawn_at != null);
  const [savedConsent, setSavedConsent] = useState(row.display_consent);
  const [savedAttribution, setSavedAttribution] = useState<Attribution>(row.attribution);
  // Editable draft for the consent checkbox + attribution radio.
  const [consent, setConsent] = useState(row.display_consent);
  const [attribution, setAttribution] = useState<Attribution>(row.attribution);
  const [saving, setSaving] = useState(false);
  const [busyWithdraw, setBusyWithdraw] = useState(false);

  // Weight-change proof — local authoritative copy (de478a4): optimistic + rollback,
  // no post-write re-read.
  const [attachment, setAttachment] = useState<WeightChangeSnapshot | null>(
    row.attachment_type === "weight_change" ? row.attachment : null,
  );
  const [attachmentNote, setAttachmentNote] = useState<string | null>(row.attachment_note);
  const [proofBusy, setProofBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phases, setPhases] = useState<WeightChangeSnapshot[]>([]);
  const [pickedPhase, setPickedPhase] = useState("none");
  const [noteDraft, setNoteDraft] = useState("");

  const dirty = consent !== savedConsent || attribution !== savedAttribution;

  const openPicker = async () => {
    setPickerOpen(true);
    const { data } = await supabase.rpc("get_attachable_weight_phases", { p_coach_user_id: row.coach_id });
    setPhases((data as unknown as WeightChangeSnapshot[]) ?? []);
  };

  const cancelPicker = () => {
    setPickerOpen(false);
    setPickedPhase("none");
    setNoteDraft("");
  };

  const attachProof = async () => {
    if (pickedPhase === "none") return;
    const preview = phases.find((p) => p.phase_id === pickedPhase) ?? null;
    const prevAttachment = attachment;
    const prevNote = attachmentNote;
    setProofBusy(true);
    setAttachment(preview); // optimistic
    setAttachmentNote(noteDraft.trim() || null);
    const { data, error } = await supabase.rpc("attach_weight_change", {
      p_testimonial_id: row.id,
      p_phase_id: pickedPhase,
      p_note: noteDraft.trim() || null,
    });
    if (error) {
      setAttachment(prevAttachment); // rollback
      setAttachmentNote(prevNote);
      captureException(error, { source: "my_testimonials_attach" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    } else {
      setAttachment(data as unknown as WeightChangeSnapshot); // authoritative snapshot
      toast({ title: t("proofAttached", { defaultValue: "Proof attached." }) });
      cancelPicker();
    }
    setProofBusy(false);
  };

  const removeProof = async () => {
    const prevAttachment = attachment;
    const prevNote = attachmentNote;
    setProofBusy(true);
    setAttachment(null); // optimistic
    setAttachmentNote(null);
    const { error } = await supabase.rpc("clear_testimonial_attachment", { p_testimonial_id: row.id });
    if (error) {
      setAttachment(prevAttachment); // rollback
      setAttachmentNote(prevNote);
      captureException(error, { source: "my_testimonials_clear" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    }
    setProofBusy(false);
  };

  const saveConsent = async () => {
    const prevConsent = savedConsent;
    const prevAttribution = savedAttribution;
    setSaving(true);
    setSavedConsent(consent); // optimistic
    setSavedAttribution(attribution);
    try {
      const { error } = await supabase.rpc("set_testimonial_consent", {
        p_id: row.id,
        p_consent: consent,
        p_attribution: attribution,
      });
      if (error) throw error;
      toast({ title: t("testimonialConsentUpdated", { defaultValue: "Your preferences were updated." }) });
    } catch (error) {
      // Roll the badge/persisted state back; keep the draft so the user can retry.
      setSavedConsent(prevConsent);
      setSavedAttribution(prevAttribution);
      captureException(error, { source: "my_testimonials_consent" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleWithdraw = async () => {
    const prev = withdrawn;
    const next = !prev;
    setBusyWithdraw(true);
    setWithdrawn(next); // optimistic
    try {
      const { error } = await supabase.rpc("withdraw_testimonial", { p_id: row.id, p_withdrawn: next });
      if (error) throw error;
    } catch (error) {
      setWithdrawn(prev); // roll back on failure
      captureException(error, { source: "my_testimonials_withdraw" });
      toast({ title: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setBusyWithdraw(false);
    }
  };

  const statusBadge = withdrawn
    ? { label: t("testimonialWithdrawn", { defaultValue: "Withdrawn" }), variant: "outline" as const }
    : savedConsent
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

        {/* Weight-change proof */}
        <div className="pt-3 border-t border-border/50 space-y-2">
          {attachment ? (
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">{formatWeightChange(attachment)}</p>
              {attachmentNote && <p className="mt-1 text-xs text-muted-foreground">{attachmentNote}</p>}
              <Button size="sm" variant="outline" className="mt-2" onClick={removeProof} disabled={proofBusy}>
                {t("removeProof", { defaultValue: "Remove proof" })}
              </Button>
            </div>
          ) : !pickerOpen ? (
            <Button size="sm" variant="outline" onClick={openPicker} disabled={withdrawn}>
              {t("addProof", { defaultValue: "Add proof" })}
            </Button>
          ) : phases.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("addProofNonePhases", { defaultValue: "No weight-change phases available for this coach yet." })}
              </p>
              <Button size="sm" variant="ghost" onClick={cancelPicker}>
                {t("cancel", { defaultValue: "Cancel" })}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={pickedPhase} onValueChange={setPickedPhase}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("addProofNone", { defaultValue: "No proof" })}</SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.phase_id} value={p.phase_id}>
                      {formatWeightChange(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pickedPhase !== "none" && (
                <div className="space-y-1">
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder={t("addProofNotePlaceholder", { defaultValue: "Add context (optional)" })}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">{noteDraft.length}/280</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={attachProof} disabled={proofBusy || pickedPhase === "none"}>
                  {t("saveProof", { defaultValue: "Save proof" })}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelPicker}>
                  {t("cancel", { defaultValue: "Cancel" })}
                </Button>
              </div>
            </div>
          )}
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
        .select(
          "id, coach_id, rating, feedback, display_consent, attribution, withdrawn_at, created_at, attachment_type, attachment, attachment_note",
        )
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
          attachment_type: r.attachment_type,
          attachment: r.attachment as unknown as WeightChangeSnapshot | null,
          attachment_note: r.attachment_note,
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
    <ClientPageLayout>
      <SEOHead
        title="My Testimonials | Intensive Gainz Unit"
        description="Manage the testimonials you've shared with IGU."
      />
      <div className="px-4 pt-6 pb-24 md:pb-8 max-w-2xl mx-auto space-y-4">
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
          rows.map((row) => <TestimonialRow key={row.id} row={row} />)
        )}
      </div>
    </ClientPageLayout>
  );
}
