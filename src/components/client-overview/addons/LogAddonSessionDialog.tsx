import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import { toast } from "sonner";
import type { UnusedAddonRow } from "@/hooks/useUnusedAddons";

interface LogAddonSessionDialogProps {
  purchase: UnusedAddonRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful log so parents can refetch unused + past lists. */
  onLogged?: () => void;
}

const NOTES_MAX = 1000;

function todayKuwaitISO(): string {
  // RPC uses Asia/Kuwait day boundary. Pin the picker's default to the same
  // wall clock so a coach logging at 10pm UTC = 1am next day in Kuwait
  // doesn't get rejected. dateformat: YYYY-MM-DD.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function LogAddonSessionDialog({
  purchase,
  open,
  onOpenChange,
  onLogged,
}: LogAddonSessionDialogProps) {
  const { t } = useTranslation("addons");
  const [sessionDate, setSessionDate] = useState<string>(todayKuwaitISO());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSessionDate(todayKuwaitISO());
    setNotes("");
    setSubmitError(null);
  }, [open]);

  const maxDate = useMemo(() => todayKuwaitISO(), []);

  if (!purchase) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("log_addon_session_atomic", {
        p_purchase_id: purchase.purchase_id,
        p_session_date: sessionDate,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;

      const result = (data ?? {}) as { sessions_remaining_after?: number; status_after?: string };
      const remaining = result.sessions_remaining_after ?? 0;
      toast.success(t("logSessionToastSuccess"), {
        description: t("logSessionToastRemaining", { count: remaining }),
      });
      onLogged?.();
      onOpenChange(false);
    } catch (err) {
      captureException(err, { context: "log_addon_session" });
      setSubmitError(sanitizeErrorForUser(err) || t("logSessionToastFailed"));
      setIsSubmitting(false);
    }
  };

  const dateValid = !!sessionDate && sessionDate <= maxDate;
  const canConfirm = !isSubmitting && dateValid;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        title={t("logSessionTitle", { name: purchase.service_name })}
      >
        <div className="space-y-5 py-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">{t("logSessionRemainingLabel")}</span>
              <span className="font-semibold tabular-nums">
                {purchase.sessions_remaining} / {purchase.sessions_total}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("logSessionExpiresOn", {
                date: format(new Date(purchase.expires_at), "MMM d, yyyy"),
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="log-session-date" className="text-sm font-medium">
              {t("logSessionDate")}
            </Label>
            <Input
              id="log-session-date"
              type="date"
              value={sessionDate}
              max={maxDate}
              onChange={(e) => setSessionDate(e.target.value)}
              disabled={isSubmitting}
              className="h-10 text-base md:h-9 md:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t("logSessionDateHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="log-session-notes" className="text-sm font-medium">
              {t("logSessionNotes")}
              <span className="text-muted-foreground font-normal">
                {" "}{t("logSessionNotesOptional")}
              </span>
            </Label>
            <Textarea
              id="log-session-notes"
              value={notes}
              maxLength={NOTES_MAX}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder={t("logSessionNotesPlaceholder")}
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground text-right tabular-nums">
              {notes.length} / {NOTES_MAX}
            </p>
          </div>

          {submitError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
        </div>

        <ResponsiveDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("checkoutCancel")}
          </Button>
          <Button
            type="button"
            variant="gradient"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("logSessionSubmitting")}
              </>
            ) : (
              t("logSessionConfirm")
            )}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
