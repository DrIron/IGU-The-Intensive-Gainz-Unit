import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_LABELS, MIN_IGU_PROFIT_BY_TIER, type ProfessionalLevel } from "@/auth/roles";
import { Layers, Info, AlertTriangle } from "lucide-react";

/**
 * LevelPricingManager - the editable source of truth for the level-based pricing model.
 *
 * Edits the LIVE tables that calculate_subscription_payout / coach_assignment_would_block
 * read:
 *   - service_level_pricing  (client price per service x coach level)
 *   - coach_payout_rates     (coach payout per service x level)
 *   - igu_operations_costs   (ops cost per service)
 *
 * Shows the calculable split per (service, level): IGU keep = price - coach pay - ops,
 * margin %, and a guardrail flag when keep dips below the per-tier minimum profit floor.
 *
 * On save, the junior-level price is mirrored to services.price_kwd + service_pricing.price_kwd
 * so the public "from" display stays in sync (those are display mirrors, not the charge source).
 *
 * Replaces the retired percentage-based payout_rules editors (PayoutRatesManager /
 * CoachPaymentCalculator), which were orphaned and disagreed with the live RPC.
 */

const LEVELS: ProfessionalLevel[] = ["junior", "senior", "lead"];

// The four live coaching tiers, in display order. 1:1 Complete is retired.
const TIER_ORDER = ["team_plan", "one_to_one_online", "hybrid", "in_person"];

interface LevelCell {
  price: number;
  payout: number;
}

interface ServiceEconomics {
  serviceId: string;
  slug: string;
  name: string;
  type: string;
  opsKwd: number;
  // Team Plan is level-invariant -- still keyed by level for a uniform shape.
  levels: Record<ProfessionalLevel, LevelCell>;
}

function floorFor(slug: string): number {
  return MIN_IGU_PROFIT_BY_TIER[slug] ?? 5;
}

export function LevelPricingManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [rows, setRows] = useState<ServiceEconomics[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: services, error: svcErr },
        { data: levelPrices, error: lpErr },
        { data: payouts, error: poErr },
        { data: ops, error: opsErr },
      ] = await Promise.all([
        supabase.from("services").select("id, name, type, slug").eq("is_active", true),
        supabase.from("service_level_pricing").select("service_id, coach_level, price_kwd"),
        supabase.from("coach_payout_rates").select("service_id, role, level, payout_kwd").eq("role", "coach"),
        supabase.from("igu_operations_costs").select("service_id, payment_processing_kwd, platform_cost_kwd, admin_overhead_kwd"),
      ]);
      if (svcErr) throw svcErr;
      if (lpErr) throw lpErr;
      if (poErr) throw poErr;
      if (opsErr) throw opsErr;

      const priceMap = new Map<string, number>();
      (levelPrices || []).forEach((r) => priceMap.set(`${r.service_id}:${r.coach_level}`, Number(r.price_kwd)));
      const payoutMap = new Map<string, number>();
      (payouts || []).forEach((r) => payoutMap.set(`${r.service_id}:${r.level}`, Number(r.payout_kwd)));
      const opsMap = new Map<string, number>();
      (ops || []).forEach((r) =>
        opsMap.set(
          r.service_id,
          Number(r.payment_processing_kwd || 0) + Number(r.platform_cost_kwd || 0) + Number(r.admin_overhead_kwd || 0)
        )
      );

      const built: ServiceEconomics[] = (services || [])
        .filter((s) => s.slug && TIER_ORDER.includes(s.slug))
        .sort((a, b) => TIER_ORDER.indexOf(a.slug!) - TIER_ORDER.indexOf(b.slug!))
        .map((s) => ({
          serviceId: s.id,
          slug: s.slug!,
          name: s.name,
          type: s.type,
          opsKwd: opsMap.get(s.id) ?? 0,
          levels: LEVELS.reduce((acc, lvl) => {
            acc[lvl] = {
              price: priceMap.get(`${s.id}:${lvl}`) ?? 0,
              payout: payoutMap.get(`${s.id}:${lvl}`) ?? 0,
            };
            return acc;
          }, {} as Record<ProfessionalLevel, LevelCell>),
        }));

      setRows(built);
    } catch (error) {
      toast({
        title: "Error loading level pricing",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const updateCell = (serviceId: string, level: ProfessionalLevel, field: keyof LevelCell, value: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.serviceId === serviceId
          ? { ...r, levels: { ...r.levels, [level]: { ...r.levels[level], [field]: value } } }
          : r
      )
    );
  };

  const updateOps = (serviceId: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.serviceId === serviceId ? { ...r, opsKwd: value } : r)));
  };

  const save = async (row: ServiceEconomics) => {
    setSaving(row.serviceId);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const updatedBy = auth?.user?.id ?? null;

      // 1. Per-level client prices
      const priceRows = LEVELS.map((lvl) => ({
        service_id: row.serviceId,
        coach_level: lvl,
        price_kwd: row.levels[lvl].price,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      }));
      const { error: priceErr } = await supabase
        .from("service_level_pricing")
        .upsert(priceRows, { onConflict: "service_id,coach_level" });
      if (priceErr) throw priceErr;

      // 2. Per-level coach payouts
      const payoutRows = LEVELS.map((lvl) => ({
        service_id: row.serviceId,
        role: "coach" as const,
        level: lvl,
        payout_kwd: row.levels[lvl].payout,
        updated_at: new Date().toISOString(),
      }));
      const { error: payoutErr } = await supabase
        .from("coach_payout_rates")
        .upsert(payoutRows, { onConflict: "service_id,role,level" });
      if (payoutErr) throw payoutErr;

      // 3. Ops cost (single editable total -> payment_processing_kwd; mirrors the RPC, which
      //    just sums the three ops columns).
      const { error: opsErr } = await supabase
        .from("igu_operations_costs")
        .update({
          payment_processing_kwd: row.opsKwd,
          platform_cost_kwd: 0,
          admin_overhead_kwd: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("service_id", row.serviceId);
      if (opsErr) throw opsErr;

      // 4. Mirror the junior price to the public "from" display tables.
      const fromPrice = row.levels.junior.price;
      const { error: svcErr } = await supabase
        .from("services")
        .update({ price_kwd: fromPrice, updated_at: new Date().toISOString() })
        .eq("id", row.serviceId);
      if (svcErr) throw svcErr;
      const { error: spErr } = await supabase
        .from("service_pricing")
        .update({ price_kwd: fromPrice, updated_by: updatedBy, updated_at: new Date().toISOString() })
        .eq("service_id", row.serviceId);
      if (spErr) throw spErr;

      toast({ title: "Saved", description: `${row.name} pricing + payouts updated.` });
      await load();
    } catch (error) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Level-Based Pricing &amp; Payouts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Live source of truth.</strong> These edits drive what clients are charged
          (<code className="text-xs bg-muted px-1 py-0.5 rounded">service_level_pricing</code>) and what coaches
          are paid (<code className="text-xs bg-muted px-1 py-0.5 rounded">coach_payout_rates</code>), via{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">calculate_subscription_payout()</code>. The public
          "from" price mirrors each tier's Junior price. <strong>Ops figures are provisional</strong> — validate
          against Tap's real fee.
        </AlertDescription>
      </Alert>

      {rows.map((row) => {
        const floor = floorFor(row.slug);
        return (
          <Card key={row.serviceId}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-4 w-4" />
                {row.name}
                <Badge variant="outline" className="font-normal">min keep {floor} KWD</Badge>
              </CardTitle>
              <Button size="sm" onClick={() => save(row)} disabled={saving === row.serviceId}>
                {saving === row.serviceId ? "Saving..." : "Save"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 max-w-xs">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Ops / client (KWD)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.opsKwd}
                  onChange={(e) => updateOps(row.serviceId, parseFloat(e.target.value) || 0)}
                  className="w-24"
                />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Level</TableHead>
                      <TableHead>Client Price</TableHead>
                      <TableHead>Coach Pay</TableHead>
                      <TableHead className="text-right">IGU Keep</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {LEVELS.map((lvl) => {
                      const cell = row.levels[lvl];
                      const keep = cell.price - cell.payout - row.opsKwd;
                      const margin = cell.price > 0 ? Math.round((keep / cell.price) * 100) : 0;
                      const breach = keep < floor;
                      return (
                        <TableRow key={lvl}>
                          <TableCell className="font-medium">{LEVEL_LABELS[lvl]}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cell.price}
                              onChange={(e) => updateCell(row.serviceId, lvl, "price", parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cell.payout}
                              onChange={(e) => updateCell(row.serviceId, lvl, "payout", parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={breach ? "text-destructive font-semibold" : "font-medium"}>
                              {keep.toFixed(2)} KWD
                            </span>
                            {breach && (
                              <span className="inline-flex items-center gap-1 ml-2 text-xs text-destructive">
                                <AlertTriangle className="h-3 w-3" /> below floor
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{margin}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {row.type === "team" && (
                <p className="text-xs text-muted-foreground">
                  Team Plan is level-invariant — the head-coach payout is flat. Keep all three levels equal.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
