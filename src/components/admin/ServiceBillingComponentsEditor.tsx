import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, AlertTriangle, Save } from "lucide-react";

interface BillingComponent {
  id?: string;
  service_id: string;
  label: string;
  component_type: "base" | "add_on";
  module_key: string | null;
  amount_kwd: number;
  sort_order: number;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface ServiceBillingComponentsEditorProps {
  serviceId: string;
  servicePriceKwd: number;
}

const MODULE_KEY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "primary_coaching", label: "Primary Coaching" },
  { value: "nutrition_support", label: "Nutrition Support" },
  { value: "specialty_support", label: "Specialty Support" },
  { value: "physio_support", label: "Physio Support" },
];

export function ServiceBillingComponentsEditor({ 
  serviceId, 
  servicePriceKwd 
}: ServiceBillingComponentsEditorProps) {
  const { toast } = useToast();
  const [components, setComponents] = useState<BillingComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadComponents();
  }, [serviceId]);

  const loadComponents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("service_billing_components")
        .select("*")
        .eq("service_id", serviceId)
        .order("sort_order");

      if (error) throw error;

      setComponents(
        (data || []).map((c) => ({
          ...c,
          component_type: c.component_type as "base" | "add_on",
        }))
      );
    } catch (error: any) {
      console.error("Error loading billing components:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addComponent = () => {
    const newComponent: BillingComponent = {
      service_id: serviceId,
      label: "",
      component_type: "base",
      module_key: null,
      amount_kwd: 0,
      sort_order: components.filter(c => !c.isDeleted).length,
      isNew: true,
    };
    setComponents([...components, newComponent]);
  };

  const updateComponent = (index: number, field: keyof BillingComponent, value: any) => {
    const updated = [...components];
    updated[index] = { ...updated[index], [field]: value };
    setComponents(updated);
  };

  const deleteComponent = (index: number) => {
    const updated = [...components];
    if (updated[index].isNew) {
      // Remove new components entirely
      updated.splice(index, 1);
    } else {
      // Mark existing components as deleted
      updated[index] = { ...updated[index], isDeleted: true };
    }
    setComponents(updated);
  };

  const restoreComponent = (index: number) => {
    const updated = [...components];
    updated[index] = { ...updated[index], isDeleted: false };
    setComponents(updated);
  };

  const saveComponents = async () => {
    setSaving(true);
    try {
      // Validate
      const activeComponents = components.filter(c => !c.isDeleted);
      for (const comp of activeComponents) {
        if (!comp.label.trim()) {
          throw new Error("All components must have a label");
        }
        if (comp.amount_kwd < 0) {
          throw new Error("Amount cannot be negative");
        }
      }

      // Delete removed components
      const toDelete = components.filter(c => c.isDeleted && c.id);
      for (const comp of toDelete) {
        const { error } = await supabase
          .from("service_billing_components")
          .delete()
          .eq("id", comp.id);
        if (error) throw error;
      }

      // Upsert active components
      for (let i = 0; i < activeComponents.length; i++) {
        const comp = activeComponents[i];
        const payload = {
          service_id: comp.service_id,
          label: comp.label,
          component_type: comp.component_type,
          module_key: comp.module_key || null,
          amount_kwd: comp.amount_kwd,
          sort_order: i,
        };

        if (comp.id && !comp.isNew) {
          // Update existing
          const { error } = await supabase
            .from("service_billing_components")
            .update(payload)
            .eq("id", comp.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from("service_billing_components")
            .insert(payload);
          if (error) throw error;
        }
      }

      toast({
        title: "Saved",
        description: "Billing components updated successfully",
      });

      // Reload to get fresh IDs
      await loadComponents();
    } catch (error: any) {
      console.error("Error saving billing components:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const activeComponents = components.filter(c => !c.isDeleted);
  const breakdownTotal = activeComponents.reduce((sum, c) => sum + (c.amount_kwd || 0), 0);
  const hasMismatch = activeComponents.length > 0 && Math.abs(breakdownTotal - servicePriceKwd) > 0.001;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Price Breakdown (Optional)</h4>
          <p className="text-sm text-muted-foreground">
            These components are for display and internal reporting. The actual charged price remains the service's total Price (KWD).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addComponent}>
          <Plus className="h-4 w-4 mr-1" />
          Add Component
        </Button>
      </div>

      {activeComponents.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
          No breakdown defined yet. You can add base and add-ons here.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Label</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[150px]">Module Key</TableHead>
                <TableHead className="w-[100px]">Amount (KWD)</TableHead>
                <TableHead className="w-[80px]">Order</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((comp, index) => {
                if (comp.isDeleted) return null;
                return (
                  <TableRow key={comp.id || `new-${index}`}>
                    <TableCell>
                      <Input
                        placeholder="e.g., Base 1:1 Coaching"
                        value={comp.label}
                        onChange={(e) => updateComponent(index, "label", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={comp.component_type}
                        onValueChange={(v) => updateComponent(index, "component_type", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">Base</SelectItem>
                          <SelectItem value="add_on">Add-on</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={comp.module_key || "none"}
                        onValueChange={(v) => updateComponent(index, "module_key", v === "none" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          {MODULE_KEY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={comp.amount_kwd}
                        onChange={(e) => updateComponent(index, "amount_kwd", parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={comp.sort_order}
                        onChange={(e) => updateComponent(index, "sort_order", parseInt(e.target.value) || 0)}
                        className="w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteComponent(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Summary */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Total breakdown:</span>{" "}
                <span className="font-semibold">{breakdownTotal.toFixed(3)} KWD</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Plan price:</span>{" "}
                <span className="font-semibold">{servicePriceKwd.toFixed(3)} KWD</span>
              </div>
              {hasMismatch && (
                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Breakdown total does not match plan price. Billing still uses the plan price.
                </Badge>
              )}
            </div>
            <Button onClick={saveComponents} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Components
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
