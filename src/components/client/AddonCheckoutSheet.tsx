import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import type { AddonServiceCatalogRow } from "@/hooks/useAddonsCatalog";

interface AddonCheckoutSheetProps {
  addon: AddonServiceCatalogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active subscription's service slug, used for tier-restriction display. */
  activeSubscriptionSlug: string | null;
}

const MAX_QUANTITY = 10;

interface ProfileSnapshot {
  userId: string;
  email: string;
  fullName: string;
}

async function loadProfileSnapshot(): Promise<ProfileSnapshot | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, display_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const first = (profile?.first_name as string | null) ?? "";
  const last = (profile?.last_name as string | null) ?? "";
  const display = (profile?.display_name as string | null) ?? "";
  const fullName = `${first} ${last}`.trim() || display || user.email?.split("@")[0] || "Client";
  return {
    userId: user.id,
    email: (profile?.email as string | null) ?? user.email ?? "",
    fullName,
  };
}

export function AddonCheckoutSheet({
  addon,
  open,
  onOpenChange,
  activeSubscriptionSlug,
}: AddonCheckoutSheetProps) {
  const { t } = useTranslation("addons");
  const [quantity, setQuantity] = useState(1);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setSubmitError(null);
    setProfileError(false);
    let cancelled = false;
    loadProfileSnapshot()
      .then((snap) => {
        if (cancelled) return;
        if (!snap) setProfileError(true);
        else setProfile(snap);
      })
      .catch(() => {
        if (!cancelled) setProfileError(true);
      });
    return () => { cancelled = true; };
  }, [open]);

  const unitPrice = useMemo(() => {
    if (!addon) return 0;
    return addon.pack_size && addon.pack_price_kwd
      ? Number(addon.pack_price_kwd)
      : Number(addon.base_price_kwd);
  }, [addon]);

  const totalPrice = useMemo(
    () => Math.round(unitPrice * quantity * 100) / 100,
    [unitPrice, quantity],
  );

  const isTierLocked = useMemo(() => {
    if (!addon?.tier_restrictions || addon.tier_restrictions.length === 0) return false;
    if (!activeSubscriptionSlug) return true;
    return !addon.tier_restrictions.includes(activeSubscriptionSlug);
  }, [addon, activeSubscriptionSlug]);

  if (!addon) return null;

  const canConfirm = !isSubmitting && !isTierLocked && !profileError && !!profile;

  const handleConfirm = async () => {
    if (!profile || !addon) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-tap-addon-payment",
        {
          body: {
            addonServiceId: addon.id,
            userId: profile.userId,
            customerEmail: profile.email,
            customerName: profile.fullName,
            quantity,
          },
        },
      );

      if (error) throw error;
      if (!data?.success || !data?.paymentUrl) {
        throw new Error(data?.error || "Payment provider returned no URL");
      }

      window.location.assign(data.paymentUrl as string);
    } catch (err) {
      captureException(err, { context: "addon_checkout_invoke" });
      setSubmitError(sanitizeErrorForUser(err) || t("checkoutFailed"));
      setIsSubmitting(false);
    }
  };

  const tierJoined = (addon.tier_restrictions ?? []).join(", ");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        title={t("checkoutTitle", { name: addon.name })}
      >
        <div className="space-y-5 py-4">
          {profileError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("checkoutMissingProfile")}</AlertDescription>
            </Alert>
          )}

          {isTierLocked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("tierLockedTitle", { tiers: tierJoined })}</AlertTitle>
              <AlertDescription>
                {t("checkoutTierWarning", { tiers: tierJoined })}
              </AlertDescription>
            </Alert>
          )}

          {addon.pack_size && addon.pack_size > 1 && (
            <p className="text-sm text-muted-foreground">
              {t("packSizeMany", { count: addon.pack_size })}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="addon-quantity" className="text-sm font-medium">
              {t("checkoutQuantity")}
            </Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || isSubmitting}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span
                id="addon-quantity"
                className="text-xl font-semibold tabular-nums w-10 text-center"
                aria-live="polite"
              >
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                disabled={quantity >= MAX_QUANTITY || isSubmitting}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground">{t("checkoutQuantityHelp")}</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{t("checkoutPriceLabel")}</span>
              <span className="text-2xl font-bold tabular-nums">
                {t("totalPrice", { price: totalPrice.toFixed(2) })}
              </span>
            </div>
            {addon.pack_expiry_months && (
              <p className="text-xs text-muted-foreground">
                {t("checkoutExpiryNote", { months: addon.pack_expiry_months })}
              </p>
            )}
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
                {t("checkoutPreparing")}
              </>
            ) : (
              t("checkoutConfirm")
            )}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
