import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ClientPageLayout } from "@/components/layouts/ClientPageLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { ErrorFallback } from "@/components/ui/error-fallback";
import { FoodLogDayView } from "@/components/nutrition/food-log/FoodLogDayView";

/**
 * Client food diary — its own sub-page (1A), open to ALL active members on ANY plan.
 *
 * The diary used to live inline on the 1:1 /nutrition landing only. It moved here so every
 * plan (team + all 1:1 tiers) reaches the same surface, and the landings collapse to a compact
 * TodayFoodCard that links in. The access gate is deliberately plan-AGNOSTIC — active profile
 * + active subscription, no service.type check — because the food_log RLS
 * (client_id = auth.uid()) and getActiveNutritionTarget already work for every plan. A team
 * member who set a goal gets a target + bar; one who hasn't logs targetless.
 */
export default function ClientNutritionDiary() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadUser = useCallback(
    async (user: SupabaseUser | null) => {
      try {
        if (!user) {
          navigate("/dashboard");
          return;
        }

        // Active member on ANY plan — mirrors Nutrition.tsx's activation gate, minus the
        // service-type branch. No nested FK join on subscriptions (CLAUDE.md).
        const [{ data: profile }, { data: subscription }] = await Promise.all([
          supabase.from("profiles_public").select("status").eq("id", user.id).maybeSingle(),
          supabase
            .from("subscriptions")
            .select("id, status")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const isActiveClient = profile?.status === "active" && subscription?.status === "active";
        if (!isActiveClient) {
          toast({
            title: "Access Restricted",
            description: "Your account must be active to access your food diary.",
            variant: "destructive",
          });
          navigate("/dashboard");
          return;
        }

        setUser(user);
        setLoading(false);
      } catch (err) {
        console.error("Error loading food diary:", err);
        setError(true);
        setLoading(false);
      }
    },
    [navigate, toast],
  );

  // Keyed on session state so the effect retries once a late-arriving session resolves.
  const hasFetched = useRef<string | null>(null);
  useEffect(() => {
    const key = sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    if (sessionLoading) return;
    loadUser(sessionUser ?? null);
  }, [sessionUser, sessionLoading, loadUser]);

  if (error) {
    return (
      <ClientPageLayout>
        <div className="container mx-auto px-4 pt-6 md:pt-8">
          <ErrorFallback onRetry={() => window.location.reload()} />
        </div>
      </ClientPageLayout>
    );
  }

  return (
    <ClientPageLayout>
      <div className="container mx-auto max-w-6xl px-4 pt-6 pb-24 md:pt-8 md:pb-12">
        <button
          type="button"
          onClick={() => navigate("/nutrition")}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Nutrition
        </button>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          user?.id && <FoodLogDayView clientUserId={user.id} />
        )}
      </div>
    </ClientPageLayout>
  );
}
