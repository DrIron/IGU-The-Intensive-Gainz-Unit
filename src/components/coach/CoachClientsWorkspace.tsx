import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Loader2, Search, ChevronLeft, ChevronRight, Users, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/interpret";
import { rosterTone, byRosterUrgency } from "@/lib/rosterTone";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCoachRosterAttention } from "@/hooks/useCoachRosterAttention";
import { useCoachRosterStats } from "@/hooks/useCoachRosterStats";
import { useStaffUnreadCounts } from "@/hooks/useStaffUnreadCounts";
import { useCoachDeloadRequestCounts } from "@/hooks/useCoachDeloadRequests";
import { ClientOverviewPanel } from "@/components/client-overview/ClientOverviewPanel";
import { CoachMyClientsPage } from "./CoachMyClientsPage";

interface ActiveClient {
  id: string; // user_id
  display_name: string | null;
  first_name: string | null;
  profile_status: string | null;
  subscription_status: string | null;
  service_name: string | null;
  service_type: string | null;
  payment_failed_at: string | null;
}

type SortKey = "at_risk" | "check_in_due" | "adherence" | "name";

/**
 * CoachClientsWorkspace (CO6) — master-detail inside the coach shell.
 *
 * Master = a condensed, selectable roster of the coach's ACTIVE clients (the
 * full Client Queue with Pending/At-Risk/approvals stays reachable via
 * "Open full queue" -> ?view=queue, rendering CoachMyClientsPage). Detail =
 * <ClientOverviewPanel> for :clientUserId (or a calm empty state). Row click
 * navigates client-side so the workspace + shell stay mounted (no reload).
 */
export function CoachClientsWorkspace({ coachUserId }: { coachUserId: string }) {
  const { clientUserId } = useParams<{ clientUserId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const queueView = searchParams.get("view") === "queue";

  // Batched roster signals (same sources as the full queue), reused condensed.
  const { attention } = useCoachRosterAttention();
  const { stats } = useCoachRosterStats();
  const { counts: unreadCounts } = useStaffUnreadCounts();
  const { counts: deloadCounts } = useCoachDeloadRequestCounts(coachUserId);

  const [clients, setClients] = useState<ActiveClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("at_risk");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop: when a client is open, the master list collapses to a thin rail so
  // the detail pane gets the full canvas. Expanding is a per-session toggle;
  // selecting a client (clientUserId changes) always re-collapses.
  const [listCollapsed, setListCollapsed] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    setListCollapsed(!!clientUserId);
  }, [clientUserId]);

  const fetchClients = useCallback(async () => {
    try {
      setLoadingClients(true);
      const { data: ownedTeams } = await supabase
        .from("coach_teams").select("id").eq("coach_id", coachUserId);
      const teamIds = (ownedTeams || []).map((t) => t.id);

      const coachSubsQ = supabase
        .from("subscriptions")
        .select("id, user_id, status, service_id, payment_failed_at")
        .eq("coach_id", coachUserId);
      const teamSubsQ = teamIds.length > 0
        ? supabase
            .from("subscriptions")
            .select("id, user_id, status, service_id, payment_failed_at")
            .in("team_id", teamIds)
        : Promise.resolve({ data: [], error: null });

      const [{ data: coachSubs }, { data: teamSubs }] = await Promise.all([coachSubsQ, teamSubsQ]);

      // Active subs only, one per user (the master is the active selector).
      const byUser = new Map<string, NonNullable<typeof coachSubs>[number]>();
      for (const s of [...(coachSubs || []), ...(teamSubs || [])]) {
        if (s.status === "active" && !byUser.has(s.user_id)) byUser.set(s.user_id, s);
      }
      const uniqueSubs = [...byUser.values()];
      const userIds = uniqueSubs.map((s) => s.user_id);
      if (userIds.length === 0) {
        setClients([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name, status")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      const serviceIds = [...new Set(uniqueSubs.map((s) => s.service_id).filter((id): id is string => !!id))];
      const serviceMap = new Map<string, { name: string | null; type: string }>();
      if (serviceIds.length > 0) {
        const { data: svcs } = await supabase.from("services").select("id, name, type").in("id", serviceIds);
        for (const s of svcs || []) serviceMap.set(s.id as string, { name: s.name as string, type: s.type as string });
      }

      const list: ActiveClient[] = uniqueSubs
        .map((s) => {
          const p = profileMap.get(s.user_id);
          const svc = s.service_id ? serviceMap.get(s.service_id) ?? null : null;
          return {
            id: s.user_id,
            display_name: p?.display_name ?? null,
            first_name: p?.first_name ?? null,
            profile_status: p?.status ?? null,
            subscription_status: s.status,
            service_name: svc?.name ?? null,
            service_type: svc?.type ?? null,
            payment_failed_at: s.payment_failed_at,
          };
        })
        .filter((c) => c.profile_status === "active");

      setClients(list);
    } catch (err) {
      console.error("[CoachClientsWorkspace] fetch clients:", err);
    } finally {
      setLoadingClients(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    if (coachUserId) fetchClients();
  }, [coachUserId, fetchClients]);

  const nameOf = (c: ActiveClient) => c.display_name || c.first_name || "Client";
  const daysSinceWeighIn = useCallback((id: string): number | null => {
    const d = stats[id]?.last_weigh_in_date;
    return d ? Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)) : null;
  }, [stats]);
  const toneOf = useCallback((c: ActiveClient) =>
    rosterTone({
      profileStatus: c.profile_status,
      subscriptionStatus: c.subscription_status,
      paymentFailedAt: c.payment_failed_at,
      daysSinceCheckIn: daysSinceWeighIn(c.id),
    }), [daysSinceWeighIn]);

  const visible = useMemo(() => {
    let list = clients;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => nameOf(c).toLowerCase().includes(q));
    }
    const sorted = list.slice();
    if (sortBy === "name") {
      sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    } else if (sortBy === "check_in_due") {
      sorted.sort((a, b) => {
        const da = daysSinceWeighIn(a.id);
        const db = daysSinceWeighIn(b.id);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return db - da;
      });
    } else if (sortBy === "adherence") {
      sorted.sort((a, b) => {
        const aa = stats[a.id]?.adherence_pct;
        const ab = stats[b.id]?.adherence_pct;
        if (aa == null && ab == null) return 0;
        if (aa == null) return 1;
        if (ab == null) return -1;
        return aa - ab;
      });
    } else {
      sorted.sort(byRosterUrgency(toneOf, nameOf));
    }
    return sorted;
  }, [clients, search, sortBy, stats, daysSinceWeighIn, toneOf]);

  const selectClient = (id: string) => {
    setDrawerOpen(false);
    navigate(`/coach/clients/${id}`);
  };

  // ---- Master list (used in the grid pane AND the mobile drawer) -----------
  // `condensed` (desktop, a client is open) drops the plan badge + stat line so
  // the rows are just name + urgency rail + alert dots — keeps the open client's
  // detail the focus. Full rows otherwise (and always in the mobile drawer).
  const masterListEl = (condensed: boolean) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Clients</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setSearchParams((p) => { p.set("view", "queue"); return p; })}
        >
          <ListFilter className="h-3.5 w-3.5" />
          Full queue
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>
      <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
        <SelectTrigger className="h-9" aria-label="Sort clients">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="at_risk">At risk first</SelectItem>
          <SelectItem value="check_in_due">Check-in due</SelectItem>
          <SelectItem value="adherence">Adherence (low first)</SelectItem>
          <SelectItem value="name">Name (A–Z)</SelectItem>
        </SelectContent>
      </Select>

      {loadingClients ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search ? "No clients match your search." : "No active clients yet."}
        </p>
      ) : (
        // Direction-3 roster table: avatar + name, plan, inline adherence bar,
        // last weigh-in, status. Replaces the border-rail card list.
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-normal px-3 py-2">Client</th>
                <th className="text-left font-normal px-3 py-2 hidden sm:table-cell">Plan</th>
                <th className="text-left font-normal px-3 py-2 w-[160px]">Adherence</th>
                <th className="text-left font-normal px-3 py-2 hidden md:table-cell">Last weigh-in</th>
                <th className="text-left font-normal px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const tone = toneOf(c);
                const stat = stats[c.id];
                const active = c.id === clientUserId;
                const adherence = stat?.adherence_pct ?? null;
                const lastDays = daysSinceWeighIn(c.id);
                const name = nameOf(c);
                const initials =
                  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
                const dots = [
                  attention.client_ids.check_in_overdue.includes(c.id) && { key: "checkin", cls: "bg-status-attention", label: "Check-in overdue" },
                  attention.client_ids.payment_failed.includes(c.id) && { key: "pay", cls: "bg-status-risk", label: "Payment failed" },
                  attention.client_ids.adjustments_pending.includes(c.id) && { key: "adj", cls: "bg-blue-500", label: "Adjustment pending" },
                  stat && stat.has_program === false && { key: "prog", cls: "bg-status-attention", label: "No program yet" },
                  (unreadCounts[c.id] ?? 0) > 0 && { key: "msg", cls: "bg-destructive", label: "Unread messages" },
                  (deloadCounts.get(c.id) ?? 0) > 0 && { key: "deload", cls: "bg-blue-500", label: "Pending deload" },
                ].filter(Boolean) as Array<{ key: string; cls: string; label: string }>;
                const barColor =
                  adherence == null ? "bg-muted-foreground/30"
                  : adherence >= 80 ? "bg-status-ontrack"
                  : adherence >= 50 ? "bg-status-attention"
                  : "bg-status-risk";

                return (
                  <tr
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-current={active}
                    onClick={() => selectClient(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectClient(c.id);
                      }
                    }}
                    className={cn(
                      "border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50",
                      active && "bg-muted",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                          {initials}
                        </span>
                        <span className="font-medium truncate">{name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      {c.service_name ? (
                        <span className="text-xs text-muted-foreground">{c.service_name}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 max-w-[90px] rounded-full bg-muted overflow-hidden">
                          <span className={cn("block h-full", barColor)} style={{ width: `${adherence ?? 0}%` }} />
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground w-9 shrink-0">
                          {adherence == null ? "—" : `${adherence}%`}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground tabular-nums">
                      {lastDays == null ? "No weigh-in" : lastDays === 0 ? "today" : `${lastDays}d ago`}
                    </td>
                    <td className="px-3 py-2.5">
                      {dots.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                              toneClasses(tone).soft,
                              toneClasses(tone).text,
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", dots[0].cls)} aria-hidden="true" />
                            {dots[0].label}
                          </span>
                          {dots.slice(1).map((d) => (
                            <span key={d.key} className={cn("h-1.5 w-1.5 rounded-full", d.cls)} aria-label={d.label} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-[10px] text-status-ontrack">On track</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ---- Full-queue view (approvals etc. stay reachable) ---------------------
  if (queueView) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => setSearchParams((p) => { p.delete("view"); return p; })}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to workspace
        </Button>
        <CoachMyClientsPage coachUserId={coachUserId} onViewClient={selectClient} />
      </div>
    );
  }

  // ---- Mobile: detail-focused; master in a drawer --------------------------
  if (isMobile) {
    if (!clientUserId) {
      return <div className="pb-24">{masterListEl(false)}</div>;
    }
    return (
      <div className="space-y-4 pb-24">
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/coach/clients")}>
            <ChevronLeft className="h-4 w-4" />
            Clients
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setDrawerOpen(true)}>
            <Users className="h-4 w-4" />
            Clients
          </Button>
        </div>
        <ClientOverviewPanel clientUserId={clientUserId} />
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} repositionInputs={false} shouldScaleBackground={false}>
          <DrawerContent className="max-h-[85dvh] flex flex-col">
            <div className="px-4 pt-3 pb-1">
              <DrawerTitle>Clients</DrawerTitle>
              <DrawerDescription>Select a client to view their overview.</DrawerDescription>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {masterListEl(false)}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // ---- lg+: full-page navigation -------------------------------------------
  // A client open -> full-width detail; otherwise the list IS the page. The old
  // master-detail split (300px list / 48px collapsed rail) was a vertical strip
  // squeezing the detail content; list <-> detail is now full-page (breadcrumb
  // back from the detail header).
  void listCollapsed;
  return (
    <div className="pb-24 md:pb-8">
      {clientUserId ? (
        <ClientOverviewPanel clientUserId={clientUserId} />
      ) : (
        masterListEl(false)
      )}
    </div>
  );
}
