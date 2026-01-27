import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, DollarSign, Users, ChevronDown, ChevronUp, Package, X, UserPlus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Database } from "@/integrations/supabase/types";

type StaffSpecialty = Database["public"]["Enums"]["staff_specialty"];

interface SubscriptionWithDetails {
  id: string;
  user_id: string;
  service_id: string;
  coach_id: string | null;
  status: string | null;
  base_price_kwd: number | null;
  addons_total_kwd: number | null;
  total_price_kwd: number | null;
  billing_amount_kwd: number | null;
  next_billing_date: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    payment_exempt: boolean;
  };
  service: {
    name: string;
    price_kwd: number;
    type: string;
  };
  coach?: {
    first_name: string;
    last_name: string | null;
  } | null;
  addons?: SubscriptionAddon[];
}

interface SubscriptionAddon {
  id: string;
  specialty: StaffSpecialty;
  name: string;
  price_kwd: number;
  payout_kwd: number;
  status: string;
  staff_user_id: string | null;
  staff_profile?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

const SPECIALTY_LABELS: Record<StaffSpecialty, string> = {
  nutrition: "Nutrition",
  lifestyle: "Lifestyle",
  bodybuilding: "Bodybuilding",
  powerlifting: "Powerlifting",
  running: "Running",
  calisthenics: "Calisthenics",
  mobility: "Mobility",
  physiotherapy: "Physiotherapy",
};

export function ClientBillingManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      
      // Load subscriptions with related data
      const { data: subsData, error: subsError } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          service_id,
          coach_id,
          status,
          base_price_kwd,
          addons_total_kwd,
          total_price_kwd,
          billing_amount_kwd,
          next_billing_date,
          profile:profiles!subscriptions_user_id_fkey(
            first_name,
            last_name,
            email,
            payment_exempt
          ),
          service:services!subscriptions_service_id_fkey(
            name,
            price_kwd,
            type
          )
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (subsError) throw subsError;

      // Load addons for all subscriptions
      const subIds = subsData?.map(s => s.id) || [];
      const { data: addonsData } = await supabase
        .from("subscription_addons")
        .select(`
          id,
          subscription_id,
          specialty,
          name,
          price_kwd,
          payout_kwd,
          status,
          staff_user_id
        `)
        .in("subscription_id", subIds)
        .eq("status", "active");

      // Load coach names
      const coachIds = [...new Set(subsData?.filter(s => s.coach_id).map(s => s.coach_id) || [])];
      const { data: coachesData } = await supabase
        .from("coaches")
        .select("user_id, first_name, last_name")
        .in("user_id", coachIds);

      const coachMap = new Map(coachesData?.map(c => [c.user_id, c]) || []);

      // Load staff names for addons - admin uses profiles view (security_invoker=true)
      const staffIds = [...new Set(addonsData?.filter(a => a.staff_user_id).map(a => a.staff_user_id) || [])];
      const { data: staffData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", staffIds);

      const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);

      // Group addons by subscription
      const addonsBySubscription = new Map<string, SubscriptionAddon[]>();
      addonsData?.forEach(addon => {
        const list = addonsBySubscription.get(addon.subscription_id) || [];
        list.push({
          ...addon,
          staff_profile: addon.staff_user_id ? staffMap.get(addon.staff_user_id) : null,
        } as SubscriptionAddon);
        addonsBySubscription.set(addon.subscription_id, list);
      });

      // Combine data with explicit typing
      const enrichedSubs = subsData?.map(sub => {
        const profile = sub.profile as any;
        return {
          ...sub,
          profile: Array.isArray(profile) ? profile[0] : profile,
          coach: sub.coach_id ? coachMap.get(sub.coach_id) : null,
          addons: addonsBySubscription.get(sub.id) || [],
        };
      }) as unknown as SubscriptionWithDetails[];

      setSubscriptions(enrichedSubs || []);
    } catch (error: any) {
      console.error("Error loading subscriptions:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const clientName = `${sub.profile?.first_name || ''} ${sub.profile?.last_name || ''}`.toLowerCase();
    const email = sub.profile?.email?.toLowerCase() || '';
    return clientName.includes(query) || email.includes(query);
  });

  const cancelAddon = async (addonId: string) => {
    try {
      const { error } = await supabase
        .from("subscription_addons")
        .update({
          status: "cancelled",
          end_date: new Date().toISOString(),
        })
        .eq("id", addonId);

      if (error) throw error;

      toast({
        title: "Add-on cancelled",
        description: "The add-on will be removed next billing cycle.",
      });

      loadSubscriptions();
    } catch (error: any) {
      console.error("Error cancelling addon:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getClientName = (sub: SubscriptionWithDetails) => {
    const first = sub.profile?.first_name || '';
    const last = sub.profile?.last_name || '';
    return `${first} ${last}`.trim() || sub.profile?.email || 'Unknown';
  };

  const getCoachName = (sub: SubscriptionWithDetails) => {
    if (!sub.coach) return '—';
    return `${sub.coach.first_name} ${sub.coach.last_name || ''}`.trim();
  };

  const getStaffName = (addon: SubscriptionAddon) => {
    if (!addon.staff_profile) return 'Unassigned';
    return `${addon.staff_profile.first_name || ''} ${addon.staff_profile.last_name || ''}`.trim();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Client Billing</CardTitle>
              <CardDescription>
                View and manage subscription billing for all active clients
              </CardDescription>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Add-ons</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No active subscriptions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubscriptions.map((sub) => (
                  <>
                    <TableRow key={sub.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                          disabled={sub.addons.length === 0}
                        >
                          {sub.addons.length > 0 ? (
                            expandedId === sub.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{getClientName(sub)}</p>
                          <p className="text-xs text-muted-foreground">{sub.profile?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sub.service?.name}</Badge>
                      </TableCell>
                      <TableCell>{getCoachName(sub)}</TableCell>
                      <TableCell className="text-right">
                        {sub.base_price_kwd ?? sub.service?.price_kwd ?? 0} KWD
                      </TableCell>
                      <TableCell className="text-right">
                        {sub.addons.length > 0 ? (
                          <Badge variant="outline" className="gap-1">
                            <Package className="h-3 w-3" />
                            +{sub.addons_total_kwd ?? sub.addons.reduce((sum, a) => sum + a.price_kwd, 0)} KWD
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {sub.total_price_kwd ?? (sub.base_price_kwd ?? sub.service?.price_kwd ?? 0) + (sub.addons_total_kwd ?? 0)} KWD
                      </TableCell>
                      <TableCell className="text-center">
                        {sub.profile?.payment_exempt ? (
                          <Badge variant="outline">Exempt</Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {/* Expanded add-ons row */}
                    {expandedId === sub.id && sub.addons.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium mb-3">Active Add-ons</p>
                            {sub.addons.map((addon) => (
                              <div 
                                key={addon.id}
                                className="flex items-center justify-between p-3 bg-background rounded-lg border"
                              >
                                <div className="flex items-center gap-3">
                                  <Badge variant="secondary">
                                    {SPECIALTY_LABELS[addon.specialty] || addon.specialty}
                                  </Badge>
                                  <div>
                                    <p className="font-medium text-sm">{addon.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Staff: {getStaffName(addon)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-sm font-medium">{addon.price_kwd} KWD/mo</p>
                                    <p className="text-xs text-muted-foreground">
                                      Payout: {addon.payout_kwd} KWD
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => cancelAddon(addon.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
