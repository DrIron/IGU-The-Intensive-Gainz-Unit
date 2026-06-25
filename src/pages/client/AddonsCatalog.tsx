import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Loader2, Lock, ShoppingBag, Sparkles } from "lucide-react";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useAddonsCatalog, type AddonServiceCatalogRow, type AddonServiceType } from "@/hooks/useAddonsCatalog";
import { useUnusedAddons } from "@/hooks/useUnusedAddons";
import { AddonCheckoutSheet } from "@/components/client/AddonCheckoutSheet";
import { supabase } from "@/integrations/supabase/client";

type Filter = "all" | AddonServiceType;

const FILTER_ORDER: Filter[] = ["all", "session_pack", "specialist", "one_time", "monthly_addon"];
const FILTER_LABEL_KEY: Record<Filter, string> = {
  all: "filterAll",
  session_pack: "filterSessionPack",
  specialist: "filterSpecialist",
  one_time: "filterOneTime",
  monthly_addon: "filterMonthlyAddon",
};
const TYPE_LABEL_KEY: Record<AddonServiceType, string> = {
  session_pack: "typeLabelSessionPack",
  specialist: "typeLabelSpecialist",
  one_time: "typeLabelOneTime",
  monthly_addon: "typeLabelMonthlyAddon",
};

/**
 * Fetches the caller's active subscription's service slug for client-side
 * tier-restriction display. The edge function re-validates server-side, so
 * a slug mismatch here just hides the buy CTA -- never grants access.
 */
function useActiveSubscriptionSlug(userId: string | null) {
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!userId) {
      setSlug(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("service_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub?.service_id) {
        if (!cancelled) {
          setSlug(null);
          setLoaded(true);
        }
        return;
      }
      const { data: svc } = await supabase
        .from("services")
        .select("slug")
        .eq("id", sub.service_id as string)
        .maybeSingle();
      if (cancelled) return;
      setSlug((svc?.slug as string | null) ?? null);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);
  return { slug, loaded };
}

export default function AddonsCatalog() {
  const { t } = useTranslation("addons");
  const { user } = useAuthSession();
  const userId = user?.id ?? null;

  const catalog = useAddonsCatalog();
  const unused = useUnusedAddons(userId);
  const { slug: subscriptionSlug, loaded: subSlugLoaded } = useActiveSubscriptionSlug(userId);

  const [filter, setFilter] = useState<Filter>("all");
  const [checkoutAddon, setCheckoutAddon] = useState<AddonServiceCatalogRow | null>(null);

  const filtered = useMemo(() => {
    if (!catalog.data) return [];
    if (filter === "all") return catalog.data;
    return catalog.data.filter((a) => a.type === filter);
  }, [catalog.data, filter]);

  const hasNoActiveSub = subSlugLoaded && !subscriptionSlug;

  return (
    <ClientPageLayout>
      <div className="space-y-6 px-4 pt-6 pb-24 md:pb-8 max-w-5xl mx-auto">
        <div className="space-y-1">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
            {t("breadcrumbBack")}
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" aria-hidden="true" />
            {t("pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>

        {hasNoActiveSub && (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">{t("noActiveSubTitle")}</span>
              {" -- "}
              {t("noActiveSubHelp")}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("filterAll")}>
          {FILTER_ORDER.map((f) => (
            <Button
              key={f}
              type="button"
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              role="tab"
              aria-selected={filter === f}
            >
              {t(FILTER_LABEL_KEY[f])}
            </Button>
          ))}
        </div>

        {catalog.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loading")}
          </div>
        )}

        {catalog.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("loadFailed")}</AlertDescription>
          </Alert>
        )}

        {catalog.data && filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {t("emptyCatalog")}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((addon) => {
            const tierLocked = !!addon.tier_restrictions
              && addon.tier_restrictions.length > 0
              && (!subscriptionSlug || !addon.tier_restrictions.includes(subscriptionSlug));
            const unusedForService = unused.byServiceId.get(addon.id);
            const unitPrice = addon.pack_size && addon.pack_price_kwd
              ? Number(addon.pack_price_kwd)
              : Number(addon.base_price_kwd);
            const showPerSession = !!addon.pack_size && addon.pack_size > 1;
            const perSession = showPerSession
              ? Math.round((unitPrice / addon.pack_size!) * 100) / 100
              : null;
            const tierJoined = (addon.tier_restrictions ?? []).join(", ");

            return (
              <Card key={addon.id} className="flex flex-col">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <Badge variant="secondary" className="text-xs">
                        {t(TYPE_LABEL_KEY[addon.type])}
                      </Badge>
                      <CardTitle className="text-lg md:text-xl">{addon.name}</CardTitle>
                    </div>
                    {unusedForService && unusedForService.total_unused > 0 && (
                      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                        {t("alreadyHaveBadge", { count: unusedForService.total_unused })}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tabular-nums">
                        {t("totalPrice", { price: unitPrice.toFixed(2) })}
                      </span>
                      {showPerSession && (
                        <span className="text-xs text-muted-foreground">
                          ({t("totalPrice", { price: perSession!.toFixed(2) })} {t("perSession")})
                        </span>
                      )}
                    </div>
                    {addon.pack_size ? (
                      <p className="text-sm text-muted-foreground">
                        {addon.pack_size === 1
                          ? t("packSizeOne")
                          : t("packSizeMany", { count: addon.pack_size })}
                      </p>
                    ) : null}
                    {addon.pack_expiry_months ? (
                      <p className="text-xs text-muted-foreground">
                        {t("expiresInMonths", { count: addon.pack_expiry_months })}
                      </p>
                    ) : null}
                  </div>

                  {tierLocked && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-xs space-y-1">
                      <p className="font-medium flex items-center gap-1 text-amber-900 dark:text-amber-200">
                        <Lock className="h-3 w-3" />
                        {t("tierLockedTitle", { tiers: tierJoined })}
                      </p>
                      <p className="text-amber-800 dark:text-amber-300">{t("tierLockedHelp")}</p>
                    </div>
                  )}

                  <div className="mt-auto pt-2">
                    <Button
                      type="button"
                      variant="gradient"
                      className="w-full"
                      disabled={tierLocked || hasNoActiveSub}
                      onClick={() => setCheckoutAddon(addon)}
                    >
                      {t("buyCta")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <AddonCheckoutSheet
        addon={checkoutAddon}
        open={!!checkoutAddon}
        onOpenChange={(open) => { if (!open) setCheckoutAddon(null); }}
        activeSubscriptionSlug={subscriptionSlug}
      />
    </ClientPageLayout>
  );
}
