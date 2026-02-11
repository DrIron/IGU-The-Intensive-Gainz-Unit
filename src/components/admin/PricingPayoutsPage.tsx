import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Percent, Edit2, X, Check, Plus, Package, Wallet, Calculator, Info, History, Eye } from "lucide-react";
import { format } from "date-fns";
import { PayoutRatesManager } from "./PayoutRatesManager";
import { CoachPaymentCalculator } from "./CoachPaymentCalculator";
import { PricingAuditLogDialog } from "./PricingAuditLogDialog";
import { SubscriptionPayoutPreview } from "./SubscriptionPayoutPreview";
import { AddonServicesManager } from "./AddonServicesManager";
import { logPricingChange, logCreateAction } from "@/lib/auditLog";

interface ServicePricingRow {
  id: string;
  service_id: string;
  price_kwd: number;
  billing_mode: "manual" | "recurring";
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
  service_name: string;
  service_type: string;
  updater_name?: string;
}

interface AddonPricingRow {
  id: string;
  code: string;
  name: string;
  price_kwd: number;
  is_billable: boolean;
  is_active: boolean;
  allowed_plan_types: string[];
  created_at: string;
  updated_at: string;
}

/**
 * PricingPayoutsPage - Centralized admin page for all pricing and payout configurations
 * 
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Service pricing (service_pricing table)
 * - Add-on catalog (addon_pricing table)
 * - Coach payout rules (payout_rules table)
 * - Add-on payout rules (addon_payout_rules table)
 * - Monthly payment calculations
 * 
 * IMPORTANT: Coach payouts are calculated from GROSS prices.
 * Discounts do NOT reduce coach compensation.
 */
export function PricingPayoutsPage() {
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header with Admin Badge */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pricing & Payouts</h1>
          <p className="text-muted-foreground mt-1">
            Centralized management for service prices, add-ons, and coach payout rules.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setAuditDialogOpen(true)}>
            <History className="h-4 w-4 mr-2" />
            View Audit Log
          </Button>
          <Badge variant="destructive">
            Admin only
          </Badge>
        </div>
      </div>

      {/* Central Management Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Single source of truth.</strong> All pricing and payout configurations are managed here. 
          Coach payouts are calculated from <strong>GROSS prices</strong> — discounts do not reduce coach compensation.
        </AlertDescription>
      </Alert>

      {/* Audit Log Dialog */}
      <PricingAuditLogDialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen} />

      {/* Tabs */}
      <Tabs defaultValue="pricing" className="w-full">
        <TabsList className="grid w-full grid-cols-6 max-w-4xl">
          <TabsTrigger value="pricing" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Services</span>
          </TabsTrigger>
          <TabsTrigger value="careteam" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Care Team</span>
          </TabsTrigger>
          <TabsTrigger value="addons" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Add-ons</span>
          </TabsTrigger>
          <TabsTrigger value="payouts" className="gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Payouts</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-2">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Monthly</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pricing" className="mt-6">
          <ServicePricingSection />
        </TabsContent>

        <TabsContent value="careteam" className="mt-6">
          <CareTeamPricingSection />
        </TabsContent>

        <TabsContent value="addons" className="mt-6">
          <AddonCatalogSection />
          <AddonServicesManager />
        </TabsContent>

        <TabsContent value="payouts" className="mt-6">
          <PayoutRatesManager />
        </TabsContent>

        <TabsContent value="preview" className="mt-6">
          <SubscriptionPayoutPreview />
        </TabsContent>

        <TabsContent value="monthly" className="mt-6">
          <CoachPaymentCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ServicePricingSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [services, setServices] = useState<ServicePricingRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ServicePricingRow>>({});

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      // First get all services
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("id, name, type")
        .order("name");

      if (servicesError) throw servicesError;

      // Then get pricing data
      const { data: pricingData, error: pricingError } = await supabase
        .from("service_pricing")
        .select("*");

      if (pricingError) throw pricingError;

      // Get updater names if we have updated_by values
      const updaterIds = pricingData?.filter(p => p.updated_by).map(p => p.updated_by) || [];
      const updaterNames: Record<string, string> = {};
      
      if (updaterIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("id, display_name, first_name")
          .in("id", updaterIds);
        
        profiles?.forEach(p => {
          updaterNames[p.id] = p.display_name || p.first_name || "Unknown";
        });
      }

      // Merge services with pricing
      const merged: ServicePricingRow[] = (servicesData || []).map(service => {
        const pricing = pricingData?.find(p => p.service_id === service.id);
        return {
          id: pricing?.id || "",
          service_id: service.id,
          price_kwd: pricing?.price_kwd || 0,
          billing_mode: pricing?.billing_mode || "manual",
          is_active: pricing?.is_active ?? true,
          updated_at: pricing?.updated_at || "",
          updated_by: pricing?.updated_by || null,
          service_name: service.name,
          service_type: service.type,
          updater_name: pricing?.updated_by ? updaterNames[pricing.updated_by] : undefined,
        };
      });

      setServices(merged);
    } catch (error: any) {
      toast({
        title: "Error loading services",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const startEdit = (row: ServicePricingRow) => {
    setEditingId(row.service_id);
    setEditForm({
      price_kwd: row.price_kwd,
      billing_mode: row.billing_mode,
      is_active: row.is_active,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (row: ServicePricingRow) => {
    if (editForm.price_kwd !== undefined && editForm.price_kwd < 0) {
      toast({
        title: "Validation Error",
        description: "Price must be >= 0",
        variant: "destructive",
      });
      return;
    }

    setSaving(row.service_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Capture before state for audit log
      const beforeState = {
        price_kwd: row.price_kwd,
        billing_mode: row.billing_mode,
        is_active: row.is_active,
      };
      const afterState = {
        price_kwd: editForm.price_kwd,
        billing_mode: editForm.billing_mode,
        is_active: editForm.is_active,
      };
      
      if (row.id) {
        // Update existing
        const { error } = await supabase
          .from("service_pricing")
          .update({
            price_kwd: editForm.price_kwd,
            billing_mode: editForm.billing_mode,
            is_active: editForm.is_active,
            updated_by: user?.id,
          })
          .eq("id", row.id);

        if (error) throw error;

        // Log audit entry
        await logPricingChange('service_pricing', row.id, row.service_name, beforeState, afterState);
      } else {
        // Insert new
        const { data: insertedData, error } = await supabase
          .from("service_pricing")
          .insert({
            service_id: row.service_id,
            price_kwd: editForm.price_kwd,
            billing_mode: editForm.billing_mode,
            is_active: editForm.is_active,
            updated_by: user?.id,
          })
          .select('id')
          .single();

        if (error) throw error;

        // Log create action
        await logCreateAction('service_pricing', insertedData.id, row.service_name, afterState);
      }

      toast({
        title: "Saved",
        description: `Pricing for "${row.service_name}" updated successfully.`,
      });

      setEditingId(null);
      setEditForm({});
      await loadServices();
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (row: ServicePricingRow) => {
    setSaving(row.service_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (row.id) {
        const { error } = await supabase
          .from("service_pricing")
          .update({
            is_active: !row.is_active,
            updated_by: user?.id,
          })
          .eq("id", row.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("service_pricing")
          .insert({
            service_id: row.service_id,
            price_kwd: row.price_kwd,
            billing_mode: row.billing_mode,
            is_active: !row.is_active,
            updated_by: user?.id,
          });

        if (error) throw error;
      }

      await loadServices();
    } catch (error: any) {
      toast({
        title: "Error updating",
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
            <Package className="h-5 w-5" />
            Service Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Service Pricing
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop Table View */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead>Plan Type</TableHead>
                <TableHead>Price (KWD)</TableHead>
                <TableHead>Billing Mode</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((row) => (
                <TableRow key={row.service_id}>
                  <TableCell className="font-medium">{row.service_name}</TableCell>
                  <TableCell>
                    <Badge variant={row.service_type === "one_to_one" ? "default" : "secondary"}>
                      {row.service_type === "one_to_one" ? "1:1" : "Team"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingId === row.service_id ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.price_kwd ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, price_kwd: parseFloat(e.target.value) || 0 })}
                        className="w-24"
                      />
                    ) : (
                      <span>{row.price_kwd.toFixed(2)} KWD</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.service_id ? (
                      <Select
                        value={editForm.billing_mode}
                        onValueChange={(v) => setEditForm({ ...editForm, billing_mode: v as "manual" | "recurring" })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="recurring">Recurring</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">
                        {row.billing_mode === "manual" ? "Manual Pay" : "Recurring"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={editingId === row.service_id ? editForm.is_active : row.is_active}
                      onCheckedChange={(checked) => {
                        if (editingId === row.service_id) {
                          setEditForm({ ...editForm, is_active: checked });
                        } else {
                          toggleActive(row);
                        }
                      }}
                      disabled={saving === row.service_id}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.updated_at ? (
                      <div>
                        <div>{format(new Date(row.updated_at), "MMM d, yyyy")}</div>
                        {row.updater_name && (
                          <div className="text-xs">by {row.updater_name}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.service_id ? (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => saveEdit(row)}
                          disabled={saving === row.service_id}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={cancelEdit}
                          disabled={saving === row.service_id}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(row)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {services.map((row) => (
            <Card key={row.service_id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{row.service_name}</h3>
                  <Badge variant={row.service_type === "one_to_one" ? "default" : "secondary"} className="mt-1">
                    {row.service_type === "one_to_one" ? "1:1" : "Team"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={() => toggleActive(row)}
                    disabled={saving === row.service_id}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(row)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Price:</span>
                  <span className="ml-2 font-medium">{row.price_kwd.toFixed(2)} KWD</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Billing:</span>
                  <span className="ml-2">{row.billing_mode === "manual" ? "Manual" : "Recurring"}</span>
                </div>
              </div>
              
              {row.updated_at && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Updated {format(new Date(row.updated_at), "MMM d, yyyy")}
                  {row.updater_name && ` by ${row.updater_name}`}
                </div>
              )}
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AddonCatalogSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [addons, setAddons] = useState<AddonPricingRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<AddonPricingRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    price_kwd: 0,
    is_billable: true,
    is_active: true,
    allowed_plan_types: ["one_to_one", "team"] as string[],
  });

  const loadAddons = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("addon_pricing")
        .select("*")
        .order("name");

      if (error) throw error;
      setAddons(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading add-ons",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAddons();
  }, [loadAddons]);

  const openCreate = () => {
    setEditingAddon(null);
    setForm({
      code: "",
      name: "",
      price_kwd: 0,
      is_billable: true,
      is_active: true,
      allowed_plan_types: ["one_to_one", "team"],
    });
    setDialogOpen(true);
  };

  const openEdit = (addon: AddonPricingRow) => {
    setEditingAddon(addon);
    setForm({
      code: addon.code,
      name: addon.name,
      price_kwd: addon.price_kwd,
      is_billable: addon.is_billable,
      is_active: addon.is_active,
      allowed_plan_types: addon.allowed_plan_types || ["one_to_one", "team"],
    });
    setDialogOpen(true);
  };

  const saveAddon = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Code and Name are required.",
        variant: "destructive",
      });
      return;
    }

    if (form.price_kwd < 0) {
      toast({
        title: "Validation Error",
        description: "Price must be >= 0",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const afterState = {
        code: form.code.toLowerCase().trim(),
        name: form.name.trim(),
        price_kwd: form.price_kwd,
        is_billable: form.is_billable,
        is_active: form.is_active,
        allowed_plan_types: form.allowed_plan_types,
      };

      if (editingAddon) {
        const beforeState = {
          code: editingAddon.code,
          name: editingAddon.name,
          price_kwd: editingAddon.price_kwd,
          is_billable: editingAddon.is_billable,
          is_active: editingAddon.is_active,
          allowed_plan_types: editingAddon.allowed_plan_types,
        };

        const { error } = await supabase
          .from("addon_pricing")
          .update(afterState)
          .eq("id", editingAddon.id);

        if (error) throw error;

        // Log audit entry
        await logPricingChange('addon_pricing', editingAddon.id, form.name, beforeState, afterState);

        toast({
          title: "Updated",
          description: `Add-on "${form.name}" updated successfully.`,
        });
      } else {
        const { data: insertedData, error } = await supabase
          .from("addon_pricing")
          .insert(afterState)
          .select('id')
          .single();

        if (error) throw error;

        // Log create action
        await logCreateAction('addon_pricing', insertedData.id, form.name, afterState);

        toast({
          title: "Created",
          description: `Add-on "${form.name}" created successfully.`,
        });
      }

      setDialogOpen(false);
      await loadAddons();
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

  const toggleActive = async (addon: AddonPricingRow) => {
    try {
      const { error } = await supabase
        .from("addon_pricing")
        .update({ is_active: !addon.is_active })
        .eq("id", addon.id);

      if (error) throw error;
      await loadAddons();
    } catch (error: any) {
      toast({
        title: "Error updating",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const togglePlanType = (type: string) => {
    setForm(prev => {
      const types = prev.allowed_plan_types.includes(type)
        ? prev.allowed_plan_types.filter(t => t !== type)
        : [...prev.allowed_plan_types, type];
      return { ...prev, allowed_plan_types: types };
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add-on Catalog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add-on Catalog
          </CardTitle>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Add-on
          </Button>
        </CardHeader>
        <CardContent>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Price (KWD)</TableHead>
                  <TableHead>Allowed Plans</TableHead>
                  <TableHead>Billable</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.map((addon) => (
                  <TableRow key={addon.id}>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">{addon.code}</code>
                    </TableCell>
                    <TableCell className="font-medium">{addon.name}</TableCell>
                    <TableCell>{addon.price_kwd.toFixed(2)} KWD</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {addon.allowed_plan_types?.includes("one_to_one") && (
                          <Badge variant="outline" className="text-xs">1:1</Badge>
                        )}
                        {addon.allowed_plan_types?.includes("team") && (
                          <Badge variant="outline" className="text-xs">Team</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={addon.is_billable ? "default" : "secondary"}>
                        {addon.is_billable ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={addon.is_active}
                        onCheckedChange={() => toggleActive(addon)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(addon)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {addons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No add-ons configured yet. Click "Create Add-on" to add one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {addons.map((addon) => (
              <Card key={addon.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <code className="bg-muted px-2 py-1 rounded text-sm">{addon.code}</code>
                    <h3 className="font-semibold mt-1">{addon.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={addon.is_active}
                      onCheckedChange={() => toggleActive(addon)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(addon)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">Price:</span>
                    <span className="ml-2 font-medium">{addon.price_kwd.toFixed(2)} KWD</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Plans:</span>
                    {addon.allowed_plan_types?.includes("one_to_one") && (
                      <Badge variant="outline" className="text-xs">1:1</Badge>
                    )}
                    {addon.allowed_plan_types?.includes("team") && (
                      <Badge variant="outline" className="text-xs">Team</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {addons.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No add-ons configured yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAddon ? "Edit Add-on" : "Create Add-on"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="e.g., nutrition"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={!!editingAddon}
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier (lowercase, no spaces)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Nutrition Coaching"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="price">Price (KWD)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price_kwd}
                onChange={(e) => setForm({ ...form, price_kwd: parseFloat(e.target.value) || 0 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Allowed Plan Types</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowed_plan_types.includes("one_to_one")}
                    onChange={() => togglePlanType("one_to_one")}
                    className="rounded"
                  />
                  <span>1:1</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowed_plan_types.includes("team")}
                    onChange={() => togglePlanType("team")}
                    className="rounded"
                  />
                  <span>Team</span>
                </label>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="billable">Billable</Label>
              <Switch
                id="billable"
                checked={form.is_billable}
                onCheckedChange={(checked) => setForm({ ...form, is_billable: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveAddon} disabled={saving}>
              {saving ? "Saving..." : editingAddon ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Types for Care Team
type StaffSpecialty = 'nutrition' | 'lifestyle' | 'bodybuilding' | 'powerlifting' | 'running' | 'calisthenics' | 'mobility' | 'physiotherapy';

interface CareTeamAddonRow {
  id: string;
  specialty: StaffSpecialty;
  default_name: string;
  default_price_kwd: number;
  default_payout_kwd: number;
  is_active: boolean;
  updated_at: string;
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

/**
 * Care Team Pricing Section
 * 
 * Manages the addon_catalog table which defines default pricing for 
 * care team specialists (nutrition coaches, physios, etc.).
 * 
 * Primary Coach payout is handled in the "Payouts" tab via payout_rules.
 * Add-on staff payouts are defined here per specialty.
 */
function CareTeamPricingSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addons, setAddons] = useState<CareTeamAddonRow[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<CareTeamAddonRow | null>(null);
  const [editForm, setEditForm] = useState({
    default_name: "",
    default_price_kwd: 0,
    default_payout_kwd: 0,
    is_active: true,
  });

  const loadAddons = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("addon_catalog")
        .select("*")
        .order("specialty");

      if (error) throw error;
      setAddons(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading care team catalog",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAddons();
  }, [loadAddons]);

  const openEditDialog = (addon: CareTeamAddonRow) => {
    setSelectedAddon(addon);
    setEditForm({
      default_name: addon.default_name,
      default_price_kwd: addon.default_price_kwd,
      default_payout_kwd: addon.default_payout_kwd,
      is_active: addon.is_active,
    });
    setEditDialogOpen(true);
  };

  const saveAddon = async () => {
    if (!selectedAddon) return;

    setSaving(selectedAddon.id);
    try {
      // Capture before state for audit log
      const beforeState = {
        default_name: selectedAddon.default_name,
        default_price_kwd: selectedAddon.default_price_kwd,
        default_payout_kwd: selectedAddon.default_payout_kwd,
        is_active: selectedAddon.is_active,
      };
      const afterState = {
        default_name: editForm.default_name,
        default_price_kwd: editForm.default_price_kwd,
        default_payout_kwd: editForm.default_payout_kwd,
        is_active: editForm.is_active,
      };

      const { error } = await supabase
        .from("addon_catalog")
        .update(afterState)
        .eq("id", selectedAddon.id);

      if (error) throw error;

      // Log audit entry
      await logPricingChange(
        'addon_catalog',
        selectedAddon.id,
        `${SPECIALTY_LABELS[selectedAddon.specialty]} Add-on`,
        beforeState,
        afterState
      );

      toast({
        title: "Success",
        description: "Care team pricing updated successfully",
      });

      setEditDialogOpen(false);
      await loadAddons();
    } catch (error: any) {
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
            <DollarSign className="h-5 w-5" />
            Care Team Specialist Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Care Team Specialist Pricing</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Default pricing for care team add-ons. When a coach adds a specialist to a client's care team,
                these defaults are used. Staff payouts are defined per specialty.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Default Name</TableHead>
                  <TableHead className="text-right">Client Price (KWD)</TableHead>
                  <TableHead className="text-right">Staff Payout (KWD)</TableHead>
                  <TableHead className="text-right">Platform Margin</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.map((addon) => {
                  const margin = addon.default_price_kwd - addon.default_payout_kwd;
                  const marginPercent = addon.default_price_kwd > 0 
                    ? ((margin / addon.default_price_kwd) * 100).toFixed(0)
                    : 0;
                  
                  return (
                    <TableRow key={addon.id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {SPECIALTY_LABELS[addon.specialty] || addon.specialty}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{addon.default_name}</TableCell>
                      <TableCell className="text-right">{addon.default_price_kwd.toFixed(2)} KWD</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {addon.default_payout_kwd.toFixed(2)} KWD
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {margin.toFixed(2)} KWD ({marginPercent}%)
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={addon.is_active ? "default" : "outline"}>
                          {addon.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(addon)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {addons.map((addon) => {
              const margin = addon.default_price_kwd - addon.default_payout_kwd;
              
              return (
                <Card key={addon.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Badge variant="secondary" className="mb-2">
                        {SPECIALTY_LABELS[addon.specialty] || addon.specialty}
                      </Badge>
                      <h3 className="font-semibold">{addon.default_name}</h3>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(addon)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Client Price:</span>
                      <span className="ml-2 font-medium">{addon.default_price_kwd} KWD</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Staff Payout:</span>
                      <span className="ml-2 font-medium text-green-600">{addon.default_payout_kwd} KWD</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Margin:</span>
                      <span className="ml-2">{margin.toFixed(2)} KWD</span>
                    </div>
                    <div>
                      <Badge variant={addon.is_active ? "default" : "outline"} className="text-xs">
                        {addon.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Care Team Pricing</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Update pricing for {selectedAddon && SPECIALTY_LABELS[selectedAddon.specialty]} specialists.
              Changes apply to new subscriptions only.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="careteam_name">Default Name</Label>
              <Input
                id="careteam_name"
                value={editForm.default_name}
                onChange={(e) => setEditForm({ ...editForm, default_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="careteam_price">Client Price (KWD/month)</Label>
                <Input
                  id="careteam_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.default_price_kwd}
                  onChange={(e) => setEditForm({ ...editForm, default_price_kwd: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Added to client's bill</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="careteam_payout">Staff Payout (KWD/month)</Label>
                <Input
                  id="careteam_payout"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.default_payout_kwd}
                  onChange={(e) => setEditForm({ ...editForm, default_payout_kwd: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Paid to specialist</p>
              </div>
            </div>

            {/* Margin preview */}
            {editForm.default_price_kwd > 0 && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <div className="flex justify-between">
                  <span>Platform Margin:</span>
                  <span className="font-medium">
                    {(editForm.default_price_kwd - editForm.default_payout_kwd).toFixed(2)} KWD
                    ({((editForm.default_price_kwd - editForm.default_payout_kwd) / editForm.default_price_kwd * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="careteam_active">Active</Label>
              <Switch
                id="careteam_active"
                checked={editForm.is_active}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAddon} disabled={!!saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
