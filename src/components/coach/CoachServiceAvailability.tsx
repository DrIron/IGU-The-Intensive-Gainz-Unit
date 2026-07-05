import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Users } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface CoachServiceAvailabilityProps {
  coachUserId: string;
}

// Only subscriptions counted toward a coach's current load for availability.
const LOAD_SUBSCRIPTION_STATUSES = ["pending", "active"];

interface ServiceRow {
  serviceId: string;
  serviceName: string;
  adminCeiling: number; // 0 = unlimited
  coachMaxClients: number | null; // null = unlimited
  isAccepting: boolean;
  activeClients: number;
  // editable draft state
  capInput: string;
  acceptingDraft: boolean;
  saving: boolean;
}

// Effective cap = min(admin ceiling [0 => unlimited], coach cap [null => unlimited]).
function effectiveCap(adminCeiling: number, coachMax: number | null): number | null {
  const candidates: number[] = [];
  if (adminCeiling > 0) candidates.push(adminCeiling);
  if (coachMax !== null) candidates.push(coachMax);
  if (candidates.length === 0) return null; // unlimited
  return Math.min(...candidates);
}

export function CoachServiceAvailability({ coachUserId }: CoachServiceAvailabilityProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const hasFetched = useRef(false);

  const fetchAvailability = useCallback(async () => {
    try {
      setLoading(true);

      // coach_service_limits.coach_id = coaches.id (NOT the auth user id).
      const { data: coach, error: coachError } = await supabase
        .from("coaches")
        .select("id")
        .eq("user_id", coachUserId)
        .maybeSingle();

      if (coachError) throw coachError;
      if (!coach) {
        setRows([]);
        return;
      }

      const { data: limits, error: limitsError } = await supabase
        .from("coach_service_limits")
        .select("service_id, max_clients, coach_max_clients, is_accepting")
        .eq("coach_id", coach.id);

      if (limitsError) throw limitsError;

      if (!limits || limits.length === 0) {
        setRows([]);
        return;
      }

      const serviceIds = limits.map((l) => l.service_id);

      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds);

      if (servicesError) throw servicesError;

      const nameMap = new Map<string, string>();
      services?.forEach((s) => nameMap.set(s.id, s.name));

      // Current load: subscriptions for this coach (coach_id = user_id) in the
      // provisioned services with pending/active status.
      const { data: subscriptions, error: subsError } = await supabase
        .from("subscriptions")
        .select("service_id, status")
        .eq("coach_id", coachUserId)
        .in("service_id", serviceIds)
        .in("status", LOAD_SUBSCRIPTION_STATUSES);

      if (subsError) throw subsError;

      const countMap = new Map<string, number>();
      subscriptions?.forEach((sub) => {
        if (!sub.service_id) return;
        countMap.set(sub.service_id, (countMap.get(sub.service_id) || 0) + 1);
      });

      const nextRows: ServiceRow[] = limits.map((l) => ({
        serviceId: l.service_id,
        serviceName: nameMap.get(l.service_id) || "Unknown service",
        adminCeiling: l.max_clients,
        coachMaxClients: l.coach_max_clients,
        isAccepting: l.is_accepting,
        activeClients: countMap.get(l.service_id) || 0,
        capInput: l.coach_max_clients !== null ? String(l.coach_max_clients) : "",
        acceptingDraft: l.is_accepting,
        saving: false,
      }));

      nextRows.sort((a, b) => a.serviceName.localeCompare(b.serviceName));

      setRows(nextRows);
    } catch (error) {
      console.error("Error fetching service availability:", error);
      toast({
        title: "Error loading services",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    if (coachUserId) {
      hasFetched.current = true;
      fetchAvailability();
    }
  }, [coachUserId, fetchAvailability]);

  const capError = (row: ServiceRow): string | null => {
    const raw = row.capInput.trim();
    if (raw === "") return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      return "Enter a whole number of clients (0 or more).";
    }
    if (row.adminCeiling > 0 && value > row.adminCeiling) {
      return `Cannot exceed the admin ceiling of ${row.adminCeiling}.`;
    }
    return null;
  };

  const updateRow = (serviceId: string, patch: Partial<ServiceRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.serviceId === serviceId ? { ...r, ...patch } : r)),
    );
  };

  const handleSave = async (row: ServiceRow) => {
    if (capError(row)) return;

    updateRow(row.serviceId, { saving: true });
    try {
      const raw = row.capInput.trim();
      const coachMax = raw === "" ? null : Number(raw);

      const { error } = await supabase.rpc("set_coach_service_availability", {
        p_service_id: row.serviceId,
        p_coach_max_clients: coachMax,
        p_is_accepting: row.acceptingDraft,
      });

      if (error) throw error;

      toast({
        title: "Saved",
        description: `Updated availability for ${row.serviceName}.`,
      });

      hasFetched.current = false;
      await fetchAvailability();
    } catch (error) {
      console.error("Error saving service availability:", error);
      toast({
        title: "Could not save",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      updateRow(row.serviceId, { saving: false });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Services & availability
        </CardTitle>
        <CardDescription>
          Set your own client cap and open or close each service to new clients.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            An admin hasn't set up any services for you yet.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const error = capError(row);
              const effective = effectiveCap(row.adminCeiling, row.coachMaxClients);
              const dirty =
                row.capInput.trim() !== (row.coachMaxClients !== null ? String(row.coachMaxClients) : "") ||
                row.acceptingDraft !== row.isAccepting;

              return (
                <div
                  key={row.serviceId}
                  className="rounded-lg border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{row.serviceName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Admin ceiling: {row.adminCeiling === 0 ? "Unlimited" : row.adminCeiling}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {effective === null
                          ? `${row.activeClients} clients`
                          : `${row.activeClients} / ${effective} clients`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label
                        htmlFor={`accepting-${row.serviceId}`}
                        className="text-sm text-muted-foreground"
                      >
                        {row.acceptingDraft ? "Open" : "Closed"}
                      </Label>
                      <Switch
                        id={`accepting-${row.serviceId}`}
                        checked={row.acceptingDraft}
                        onCheckedChange={(checked) =>
                          updateRow(row.serviceId, { acceptingDraft: checked })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="space-y-1 flex-1">
                      <Label htmlFor={`cap-${row.serviceId}`} className="text-sm">
                        Your cap
                      </Label>
                      <Input
                        id={`cap-${row.serviceId}`}
                        type="number"
                        min={0}
                        max={row.adminCeiling > 0 ? row.adminCeiling : undefined}
                        inputMode="numeric"
                        placeholder="No limit"
                        value={row.capInput}
                        onChange={(e) =>
                          updateRow(row.serviceId, { capInput: e.target.value })
                        }
                        className="max-w-[160px]"
                      />
                      {error ? (
                        <p className="text-xs text-destructive">{error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Leave blank for no personal limit.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSave(row)}
                      disabled={row.saving || !!error || !dirty}
                    >
                      {row.saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
