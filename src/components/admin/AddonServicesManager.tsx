import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, ShoppingBag } from "lucide-react";
import { format } from "date-fns";

interface AddonService {
  id: string;
  name: string;
  type: string;
  base_price_kwd: number;
  professional_payout_kwd: number;
  igu_take_kwd: number;
  pack_size: number | null;
  pack_price_kwd: number | null;
  pack_expiry_months: number | null;
  tier_restrictions: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AddonPurchase {
  id: string;
  client_id: string;
  addon_service_id: string;
  quantity: number;
  sessions_remaining: number | null;
  total_paid_kwd: number;
  expires_at: string | null;
  purchased_at: string;
  clientName?: string;
  serviceName?: string;
}

const TYPE_LABELS: Record<string, string> = {
  session_pack: "Session Pack",
  specialist: "Specialist",
  one_time: "One-Time",
  monthly: "Monthly",
};

const TYPE_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  session_pack: "default",
  specialist: "secondary",
  one_time: "outline",
  monthly: "default",
};

export function AddonServicesManager() {
  const { toast } = useToast();
  const hasFetched = useRef(false);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<AddonService[]>([]);
  const [purchases, setPurchases] = useState<AddonPurchase[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddonService | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "session_pack" as string,
    base_price_kwd: 0,
    professional_payout_kwd: 0,
    igu_take_kwd: 0,
    pack_size: "" as string,
    pack_price_kwd: "" as string,
    pack_expiry_months: "" as string,
    tier_restrictions: [] as string[],
    is_active: true,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch addon services catalog
      const { data: servicesData, error: servicesError } = await supabase
        .from("addon_services")
        .select("*")
        .order("type")
        .order("name");

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      // Fetch recent purchases (last 50)
      const { data: purchasesData, error: purchasesError } = await supabase
        .from("addon_purchases")
        .select("*")
        .order("purchased_at", { ascending: false })
        .limit(50);

      if (purchasesError) throw purchasesError;

      // Get client names and service names for purchases
      if (purchasesData && purchasesData.length > 0) {
        const clientIds = [...new Set(purchasesData.map(p => p.client_id))];
        const addonServiceIds = [...new Set(purchasesData.map(p => p.addon_service_id))];

        const { data: clients } = await supabase
          .from("profiles_public")
          .select("id, first_name, display_name")
          .in("id", clientIds);
        const clientMap = new Map(
          (clients || []).map(c => [c.id, c.display_name || c.first_name || "Unknown"])
        );

        const serviceMap = new Map(
          (servicesData || []).map(s => [s.id, s.name])
        );

        const enriched = purchasesData.map(p => ({
          ...p,
          clientName: clientMap.get(p.client_id) || "Unknown",
          serviceName: serviceMap.get(p.addon_service_id) || "Unknown",
        }));
        setPurchases(enriched);
      } else {
        setPurchases([]);
      }
    } catch (error: any) {
      toast({
        title: "Error loading add-on services",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      type: "session_pack",
      base_price_kwd: 0,
      professional_payout_kwd: 0,
      igu_take_kwd: 0,
      pack_size: "",
      pack_price_kwd: "",
      pack_expiry_months: "",
      tier_restrictions: [],
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (service: AddonService) => {
    setEditing(service);
    setForm({
      name: service.name,
      type: service.type,
      base_price_kwd: service.base_price_kwd,
      professional_payout_kwd: service.professional_payout_kwd,
      igu_take_kwd: service.igu_take_kwd,
      pack_size: service.pack_size?.toString() || "",
      pack_price_kwd: service.pack_price_kwd?.toString() || "",
      pack_expiry_months: service.pack_expiry_months?.toString() || "",
      tier_restrictions: service.tier_restrictions || [],
      is_active: service.is_active,
    });
    setDialogOpen(true);
  };

  const saveService = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type as any,
        base_price_kwd: form.base_price_kwd,
        professional_payout_kwd: form.professional_payout_kwd,
        igu_take_kwd: form.igu_take_kwd,
        pack_size: form.pack_size ? parseInt(form.pack_size) : null,
        pack_price_kwd: form.pack_price_kwd ? parseFloat(form.pack_price_kwd) : null,
        pack_expiry_months: form.pack_expiry_months ? parseInt(form.pack_expiry_months) : null,
        tier_restrictions: form.tier_restrictions.length > 0 ? form.tier_restrictions : null,
        is_active: form.is_active,
      };

      if (editing) {
        const { error } = await supabase
          .from("addon_services")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Updated", description: `"${form.name}" updated successfully.` });
      } else {
        const { error } = await supabase
          .from("addon_services")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Created", description: `"${form.name}" created successfully.` });
      }

      setDialogOpen(false);
      hasFetched.current = false;
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (service: AddonService) => {
    try {
      const { error } = await supabase
        .from("addon_services")
        .update({ is_active: !service.is_active })
        .eq("id", service.id);
      if (error) throw error;
      hasFetched.current = false;
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error updating",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      {/* Add-on Services Catalog */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Add-on Services Catalog
          </CardTitle>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Price (KWD)</TableHead>
                  <TableHead className="text-right">Prof Payout</TableHead>
                  <TableHead className="text-right">IGU Take</TableHead>
                  <TableHead>Tier Restriction</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No add-on services configured yet
                    </TableCell>
                  </TableRow>
                ) : (
                  services.map(service => (
                    <TableRow key={service.id}>
                      <TableCell className="font-medium">{service.name}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_COLORS[service.type] || "secondary"}>
                          {TYPE_LABELS[service.type] || service.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{service.base_price_kwd.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-600">{service.professional_payout_kwd.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{service.igu_take_kwd.toFixed(2)}</TableCell>
                      <TableCell>
                        {service.tier_restrictions && service.tier_restrictions.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {service.tier_restrictions.map(t => (
                              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">All tiers</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={service.is_active}
                          onCheckedChange={() => toggleActive(service)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(service)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Purchases */}
      {purchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sessions Left</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Purchased</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.clientName}</TableCell>
                    <TableCell>{p.serviceName}</TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right">
                      {p.sessions_remaining !== null ? p.sessions_remaining : "—"}
                    </TableCell>
                    <TableCell>
                      {p.expires_at ? format(new Date(p.expires_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.purchased_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Add-on Service" : "Create Add-on Service"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. 5-Session Physio Pack"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="session_pack">Session Pack</SelectItem>
                  <SelectItem value="specialist">Specialist</SelectItem>
                  <SelectItem value="one_time">One-Time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Base Price (KWD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.base_price_kwd}
                  onChange={e => setForm({ ...form, base_price_kwd: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Prof Payout (KWD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.professional_payout_kwd}
                  onChange={e => setForm({ ...form, professional_payout_kwd: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>IGU Take (KWD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.igu_take_kwd}
                  onChange={e => setForm({ ...form, igu_take_kwd: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {form.type === "session_pack" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Pack Size</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.pack_size}
                    onChange={e => setForm({ ...form, pack_size: e.target.value })}
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pack Price (KWD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.pack_price_kwd}
                    onChange={e => setForm({ ...form, pack_price_kwd: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiry (months)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.pack_expiry_months}
                    onChange={e => setForm({ ...form, pack_expiry_months: e.target.value })}
                    placeholder="e.g. 6"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={checked => setForm({ ...form, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveService} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
