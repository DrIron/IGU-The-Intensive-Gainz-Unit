import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, GraduationCap, Briefcase, Award, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LevelUpRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLevel: ProfessionalLevel;
  coachName: string;
  coachEmail: string;
}

const SENIOR_CRITERIA = {
  mandatory: [
    { id: "exp_3yr", label: "3+ years of paid coaching experience" },
    { id: "cert_valid", label: "At least 1 accredited certification (currently valid)" },
    { id: "platform_6mo", label: "6+ months on IGU with 5+ active clients" },
    { id: "retention_70", label: "70%+ client retention rate over 3 months" },
  ],
  optional: [
    { id: "degree", label: "Bachelor's or higher in Exercise Science, Kinesiology, Sports Science, Nutrition, or related", icon: GraduationCap },
    { id: "adv_cert", label: "Specialty certification (CSCS, CISSN, Pn1/Pn2, FMS, or equivalent)", icon: Award },
    { id: "cont_ed", label: "20+ hours of workshops/courses in the past 12 months", icon: BookOpen },
    { id: "results", label: "Portfolio of 5+ documented client transformations", icon: Briefcase },
  ],
  optionalRequired: 2,
};

const LEAD_CRITERIA = {
  mandatory: [
    { id: "exp_5yr", label: "5+ years of paid coaching experience" },
    { id: "cert_2", label: "At least 2 recognized certifications (can be different specialties)" },
    { id: "platform_12mo", label: "12+ months on IGU with 10+ active clients" },
    { id: "retention_80", label: "80%+ client retention rate over 6 months" },
  ],
  optional: [
    { id: "degree", label: "Bachelor's or higher in a relevant field", icon: GraduationCap },
    { id: "adv_cert_2", label: "2+ specialty certifications (CSCS, CISSN, Pn2, SFL, RKC, etc.)", icon: Award },
    { id: "mentorship", label: "Has mentored/trained at least 2 junior coaches on the platform", icon: Briefcase },
    { id: "cont_ed_40", label: "40+ hours of professional development in the past 12 months", icon: BookOpen },
    { id: "competition", label: "Competed at regional+ level, presented at a workshop, or published content with 1000+ reach", icon: Award },
  ],
  optionalRequired: 3,
};

export function LevelUpRequestDialog({ open, onOpenChange, currentLevel, coachName, coachEmail }: LevelUpRequestDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [certifications, setCertifications] = useState("");
  const [experience, setExperience] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const targetLevel = currentLevel === "junior" ? "senior" : "lead";
  const criteria = targetLevel === "senior" ? SENIOR_CRITERIA : LEAD_CRITERIA;

  const mandatoryMet = criteria.mandatory.every(c => checkedItems.has(c.id));
  const optionalMet = criteria.optional.filter(c => checkedItems.has(c.id)).length >= criteria.optionalRequired;
  const canSubmit = mandatoryMet && optionalMet && certifications.trim() && experience.trim();

  const toggleItem = (id: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const mandatoryChecked = criteria.mandatory.filter(c => checkedItems.has(c.id)).map(c => c.label);
      const optionalChecked = criteria.optional.filter(c => checkedItems.has(c.id)).map(c => c.label);

      const { error } = await supabase.functions.invoke("send-level-up-request", {
        body: {
          coachName,
          coachEmail,
          currentLevel,
          targetLevel,
          mandatoryChecked,
          optionalChecked,
          certifications: certifications.trim(),
          experience: experience.trim(),
          additionalNotes: additionalNotes.trim(),
        },
      });

      if (error) throw error;

      toast.success("Level-up request submitted! We'll review and get back to you via email.");
      onOpenChange(false);
      setCheckedItems(new Set());
      setCertifications("");
      setExperience("");
      setAdditionalNotes("");
    } catch (err) {
      console.error("Level-up request error:", err);
      toast.error("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (currentLevel === "lead") return null;

  const LEVEL_COLORS: Record<string, string> = {
    senior: "text-blue-400",
    lead: "text-amber-400",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Request Promotion to{" "}
            <Badge className={cn(
              "font-semibold",
              targetLevel === "lead" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"
            )}>
              {LEVEL_LABELS[targetLevel]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Complete the checklist and provide your qualifications. Our team will review within 3-5 business days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Mandatory requirements */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              Required
              <span className="text-xs font-normal text-muted-foreground">(all must be met)</span>
            </h4>
            <div className="space-y-2">
              {criteria.mandatory.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                    checkedItems.has(item.id) ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={checkedItems.has(item.id)}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Optional requirements */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              Additional Qualifications
              <span className="text-xs font-normal text-muted-foreground">
                (select at least {criteria.optionalRequired})
              </span>
            </h4>
            <div className="space-y-2">
              {criteria.optional.map((item) => {
                const Icon = item.icon;
                return (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                      checkedItems.has(item.id) ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checkedItems.has(item.id)}
                      onCheckedChange={() => toggleItem(item.id)}
                      className="mt-0.5"
                    />
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm leading-relaxed">{item.label}</span>
                  </label>
                );
              })}
            </div>
            {!optionalMet && (
              <p className="text-xs text-muted-foreground">
                {criteria.optional.filter(c => checkedItems.has(c.id)).length} of {criteria.optionalRequired} selected
              </p>
            )}
          </div>

          {/* Text fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="certifications" className="text-sm font-medium">
                Certifications & Degrees
              </Label>
              <Textarea
                id="certifications"
                placeholder="List your certifications, issuing body, and expiry dates. Include any degrees and the institution."
                value={certifications}
                onChange={(e) => setCertifications(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="experience" className="text-sm font-medium">
                Coaching Experience
              </Label>
              <Textarea
                id="experience"
                placeholder="Describe your coaching experience — years, settings (gym, online, team), number of clients coached, specialties."
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm font-medium text-muted-foreground">
                Anything else? <span className="font-normal">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Links to client results, workshops attended, competition history, etc."
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
