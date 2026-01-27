import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Package, Loader2, ChevronDown, ChevronUp, Edit, DollarSign, ExternalLink, Info } from "lucide-react";
import { ServiceBillingComponentsEditor } from "./ServiceBillingComponentsEditor";

interface Service {
  id: string;
  name: string;
  description: string | null;
  price_kwd: number;
  type: string;
  is_active: boolean;
  features: string[] | null;
  discord_role_id: string | null;
  enable_session_booking: boolean;
  default_session_duration_minutes: number | null;
  default_weekly_session_limit: number | null;
  includes_primary_coaching: boolean | null;
  includes_nutrition_support: boolean | null;
  includes_specialty_support: boolean | null;
  includes_physio_support: boolean | null;
}

export function PlansServicesManager() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state - NOTE: price is read-only, managed in Pricing & Payouts
  const [editForm, setEditForm] = useState<Partial<Service>>({});

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("type")
        .order("name");

      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      console.error("Error loading services:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (service: Service) => {
    setSelectedService(service);
    setEditForm({
      name: service.name,
      description: service.description,
      price_kwd: service.price_kwd,
      type: service.type as "one_to_one" | "team",
      is_active: service.is_active,
      features: service.features,
      discord_role_id: service.discord_role_id,
      enable_session_booking: service.enable_session_booking,
      default_session_duration_minutes: service.default_session_duration_minutes,
      default_weekly_session_limit: service.default_weekly_session_limit,
      includes_primary_coaching: service.includes_primary_coaching ?? (service.type === 'one_to_one'),
      includes_nutrition_support: service.includes_nutrition_support ?? false,
      includes_specialty_support: service.includes_specialty_support ?? false,
      includes_physio_support: service.includes_physio_support ?? false,
    });
    setEditDialogOpen(true);
  };

  const saveService = async () => {
    if (!selectedService) return;
    
    setSaving(true);
    try {
      // NOTE: price_kwd is NOT updated here - pricing is managed in Pricing & Payouts page
      const { error } = await supabase
        .from("services")
        .update({
          name: editForm.name,
          description: editForm.description,
          type: editForm.type as "one_to_one" | "team",
          is_active: editForm.is_active,
          features: editForm.features,
          discord_role_id: editForm.discord_role_id,
          enable_session_booking: editForm.enable_session_booking,
          default_session_duration_minutes: editForm.default_session_duration_minutes,
          default_weekly_session_limit: editForm.default_weekly_session_limit,
          includes_primary_coaching: editForm.includes_primary_coaching,
          includes_nutrition_support: editForm.includes_nutrition_support,
          includes_specialty_support: editForm.includes_specialty_support,
          includes_physio_support: editForm.includes_physio_support,
        })
        .eq("id", selectedService.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Service updated successfully",
      });

      setEditDialogOpen(false);
      loadServices();
    } catch (error: any) {
      console.error("Error saving service:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (serviceId: string) => {
    setExpandedServiceId(expandedServiceId === serviceId ? null : serviceId);
  };

  const formatServiceType = (type: string) => {
    const labels: Record<string, string> = {
      one_to_one: "1:1",
      team: "Team",
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pricing redirect alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            <strong>Pricing is managed centrally.</strong> Edit service prices in the Pricing & Payouts page.
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate("/admin/pricing-payouts")}
            className="ml-4 shrink-0"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Go to Pricing
          </Button>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Service Configuration</CardTitle>
              <CardDescription>
                Manage service settings, included modules, and session booking rules
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Price (KWD)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Session Booking</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <>
                  <TableRow key={service.id}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpanded(service.id)}
                      >
                        {expandedServiceId === service.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatServiceType(service.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        {service.price_kwd}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.is_active ? "default" : "outline"}>
                        {service.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {service.enable_session_booking ? (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          Enabled
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(service)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedServiceId === service.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/50 p-4">
                        <ServiceBillingComponentsEditor
                          serviceId={service.id}
                          servicePriceKwd={service.price_kwd}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update service details. Changes to price will affect new subscriptions only.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editForm.name || ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editForm.description || ""}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>

            {/* Read-only pricing info */}
            <div className="rounded-lg border border-dashed p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-muted-foreground">Current Price</Label>
                  <p className="text-lg font-semibold">{selectedService?.price_kwd || 0} KWD</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setEditDialogOpen(false);
                    navigate("/admin/pricing-payouts");
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Edit Pricing
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Service pricing is managed in the Pricing & Payouts page
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={editForm.type || "one_to_one"}
                onValueChange={(v) => setEditForm({ ...editForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_to_one">1:1</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={editForm.is_active ?? true}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discord_role_id">Discord Role ID</Label>
              <Input
                id="discord_role_id"
                placeholder="e.g., 1234567890123456789"
                value={editForm.discord_role_id || ""}
                onChange={(e) => setEditForm({ ...editForm, discord_role_id: e.target.value || null })}
              />
            </div>

            {/* Included Modules Section */}
            <div className="border-t pt-4 space-y-4">
              <div>
                <h4 className="font-medium">Included Modules</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  These modules control which care-team roles can be assigned to this plan. They do not change billing directly (billing uses the plan price above).
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="includes_primary_coaching"
                    checked={editForm.includes_primary_coaching ?? false}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, includes_primary_coaching: !!checked })}
                  />
                  <Label htmlFor="includes_primary_coaching" className="font-normal">
                    Primary Coaching
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="includes_nutrition_support"
                    checked={editForm.includes_nutrition_support ?? false}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, includes_nutrition_support: !!checked })}
                  />
                  <Label htmlFor="includes_nutrition_support" className="font-normal">
                    Nutrition Support
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="includes_specialty_support"
                    checked={editForm.includes_specialty_support ?? false}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, includes_specialty_support: !!checked })}
                  />
                  <Label htmlFor="includes_specialty_support" className="font-normal">
                    Specialty Coaching (Bodybuilding, Powerlifting, Running, etc.)
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="includes_physio_support"
                    checked={editForm.includes_physio_support ?? false}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, includes_physio_support: !!checked })}
                  />
                  <Label htmlFor="includes_physio_support" className="font-normal">
                    Physio Support
                  </Label>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">Session Booking</h4>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="enable_session_booking">Enable Session Booking</Label>
                <Switch
                  id="enable_session_booking"
                  checked={editForm.enable_session_booking ?? false}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, enable_session_booking: checked })}
                />
              </div>

              {editForm.enable_session_booking && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="session_duration">Session Duration (min)</Label>
                    <Input
                      id="session_duration"
                      type="number"
                      min="15"
                      step="15"
                      value={editForm.default_session_duration_minutes || 60}
                      onChange={(e) => setEditForm({ 
                        ...editForm, 
                        default_session_duration_minutes: parseInt(e.target.value) || 60 
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weekly_limit">Weekly Session Limit</Label>
                    <Input
                      id="weekly_limit"
                      type="number"
                      min="0"
                      value={editForm.default_weekly_session_limit || 0}
                      onChange={(e) => setEditForm({ 
                        ...editForm, 
                        default_weekly_session_limit: parseInt(e.target.value) || 0 
                      })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveService} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
