import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface ChangeRow {
  id: string;
  user_id: string;
  current_subscription_id: string;
  target_service_id: string;
  target_price_kwd: number | null;
  effective_at: string;
  block_reason: string | null;
  requested_at: string;
  clientName: string;
  fromName: string;
  toName: string;
}

/**
 * Admin resolution surface for plan-change requests the self-serve guardrail sent
 * to needs_admin (min-profit block). Approve -> scheduled (the cron applies it at
 * effective_at, accepting the lower margin); Reject -> cancelled (plan unchanged).
 * The block_reason (IGU profit math) is admin-only and never shown to clients.
 */
export function PlanChangeRequestsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const fetched = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: reqs } = await supabase
        .from("subscription_change_requests")
        .select("id, user_id, current_subscription_id, target_service_id, target_price_kwd, effective_at, block_reason, requested_at")
        .eq("status", "needs_admin")
        .order("requested_at", { ascending: false });

      const list = reqs ?? [];
      if (list.length === 0) {
        setRows([]);
        return;
      }

      // Batch-resolve names.
      const userIds = [...new Set(list.map((r) => r.user_id))];
      const targetIds = [...new Set(list.map((r) => r.target_service_id))];
      const subIds = [...new Set(list.map((r) => r.current_subscription_id))];

      const [{ data: profiles }, { data: targetSvcs }, { data: subs }] = await Promise.all([
        supabase.from("profiles_public").select("id, first_name").in("id", userIds),
        supabase.from("services").select("id, name").in("id", targetIds),
        supabase.from("subscriptions").select("id, service_id").in("id", subIds),
      ]);
      const curSvcIds = [...new Set((subs ?? []).map((s) => s.service_id))];
      const { data: curSvcs } = await supabase.from("services").select("id, name").in("id", curSvcIds);

      const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.first_name]));
      const svcName = new Map([...(targetSvcs ?? []), ...(curSvcs ?? [])].map((s) => [s.id, s.name]));
      const svcBySub = new Map((subs ?? []).map((s) => [s.id, s.service_id]));

      setRows(
        list.map((r) => ({
          ...r,
          clientName: nameByUser.get(r.user_id) || "Client",
          fromName: svcName.get(svcBySub.get(r.current_subscription_id) ?? "") || "Current plan",
          toName: svcName.get(r.target_service_id) || "New plan",
        })),
      );
    } catch (error) {
      console.error("[PlanChangeRequestsPanel]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    load();
  }, [load]);

  const resolve = async (id: string, decision: "approve" | "reject") => {
    setResolving(id);
    try {
      // Admin RLS (scr_admin_all) allows this. Approve -> scheduled (cron applies
      // at effective_at); Reject -> cancelled.
      const patch =
        decision === "approve"
          ? { status: "scheduled", block_reason: null }
          : { status: "cancelled" };
      const { error } = await supabase.from("subscription_change_requests").update(patch).eq("id", id);
      if (error) throw error;
      toast({
        title: decision === "approve" ? "Change approved" : "Change rejected",
        description: decision === "approve" ? "It will apply on the client's next due date." : "The client's plan stays the same.",
      });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      toast({ title: "Couldn't resolve", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setResolving(null);
    }
  };

  // Nothing to review -> stay out of the way.
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-500/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden />
          <CardTitle>Plan changes to review</CardTitle>
        </div>
        <CardDescription>
          Self-serve changes held by a margin guardrail. Approve to let them apply at the next due date, or reject.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.clientName}</span>
                  <span className="text-muted-foreground">{r.fromName}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{r.toName}</span>
                  {r.target_price_kwd != null && <Badge variant="outline">{r.target_price_kwd} KWD</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">Effective {format(new Date(r.effective_at), "d MMM yyyy")}</span>
              </div>
              {r.block_reason && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{r.block_reason}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => resolve(r.id, "approve")} disabled={resolving === r.id}>
                  {resolving === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" />Approve</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolve(r.id, "reject")} disabled={resolving === r.id}>
                  <XCircle className="h-4 w-4 mr-1" />Reject
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
