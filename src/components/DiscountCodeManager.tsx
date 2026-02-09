import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Copy } from "lucide-react";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

// Hash the code using SHA-256 (matching the database function)
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code.trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a display prefix like "FE…"
function generateCodePrefix(code: string): string {
  const normalizedCode = code.trim().toUpperCase();
  return normalizedCode.length > 2 ? normalizedCode.slice(0, 2) + '…' : normalizedCode;
}

interface DiscountCode {
  id: string;
  code: string;
  description: string;
  discount_type: string;
  discount_value: number;
  duration_type: string | null;
  duration_cycles: number | null;
  applies_to: string;
  max_cycles: number | null;
  service_id: string | null;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  per_user_limit: number | null;
  min_price_kwd: number | null;
  is_active: boolean;
  created_at: string;
  services?: { name: string } | null;
}

export function DiscountCodeManager() {
  const { toast } = useToast();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [redemptionCounts, setRedemptionCounts] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<{
    code: string;
    description: string;
    discount_type: string;
    discount_value: number;
    duration_type: "one_time" | "limited_cycles" | "lifetime";
    duration_cycles: number;
    service_id: string | undefined;
    starts_at: string;
    expires_at: string;
    max_redemptions: number | null;
    per_user_limit: number | null;
    min_price_kwd: number | null;
    is_active: boolean;
  }>({
    code: "",
    description: "",
    discount_type: "percent",
    discount_value: 0,
    duration_type: "one_time",
    duration_cycles: 3,
    service_id: undefined,
    starts_at: "",
    expires_at: "",
    max_redemptions: null,
    per_user_limit: null,
    min_price_kwd: null,
    is_active: true,
  });

  const loadData = useCallback(async () => {
    try {
      const [codesResponse, servicesResponse] = await Promise.all([
        supabase.from("discount_codes").select("*, services(name)").order("created_at", { ascending: false }),
        supabase.from("services").select("id, name").eq("is_active", true),
      ]);

      if (codesResponse.error) throw codesResponse.error;
      if (servicesResponse.error) throw servicesResponse.error;

      setCodes(codesResponse.data || []);
      setServices(servicesResponse.data || []);

      // Load redemption counts
      if (codesResponse.data) {
        const counts: Record<string, number> = {};
        for (const code of codesResponse.data) {
          const { count } = await supabase
            .from("discount_redemptions")
            .select("id", { count: "exact", head: true })
            .eq("discount_code_id", code.id);
          counts[code.id] = count || 0;
        }
        setRedemptionCounts(counts);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Map duration_type to legacy applies_to for backward compatibility
      // Using the enum values expected by the types
      let legacyAppliesTo: "first_payment" | "limited_payments" | "all_payments" = "first_payment";
      if (formData.duration_type === "one_time") {
        legacyAppliesTo = "first_payment";
      } else if (formData.duration_type === "limited_cycles") {
        legacyAppliesTo = "limited_payments";
      } else if (formData.duration_type === "lifetime") {
        legacyAppliesTo = "all_payments";
      }

      const normalizedCode = formData.code.trim().toUpperCase();
      
      // Generate hash and prefix for new codes
      const codeHash = await hashCode(normalizedCode);
      const codePrefix = generateCodePrefix(normalizedCode);

      const basePayload = {
        description: formData.description,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        duration_type: formData.duration_type,
        duration_cycles: formData.duration_type === "limited_cycles" ? formData.duration_cycles : null,
        // Legacy fields for backward compatibility
        applies_to: legacyAppliesTo,
        max_cycles: formData.duration_type === "limited_cycles" ? formData.duration_cycles : null,
        service_id: formData.service_id && formData.service_id !== "all" ? formData.service_id : null,
        starts_at: formData.starts_at || null,
        expires_at: formData.expires_at || null,
        max_redemptions: formData.max_redemptions,
        per_user_limit: formData.per_user_limit,
        min_price_kwd: formData.min_price_kwd,
        is_active: formData.is_active,
      };

      if (editingCode) {
        // Updates don't change code/hash/prefix
        const { error } = await supabase
          .from("discount_codes")
          .update(basePayload)
          .eq("id", editingCode.id);

        if (error) throw error;

        toast({ title: "Success", description: "Discount code updated" });
      } else {
        // New codes require code, code_hash, and code_prefix
        const insertPayload = {
          ...basePayload,
          code: normalizedCode,
          code_hash: codeHash,
          code_prefix: codePrefix,
        };
        
        const { error } = await supabase.from("discount_codes").insert(insertPayload);

        if (error) throw error;

        toast({ title: "Success", description: "Discount code created" });
      }

      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({
        title: "Failed to save discount code",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      description: "",
      discount_type: "percent",
      discount_value: 0,
      duration_type: "one_time",
      duration_cycles: 3,
      service_id: undefined,
      starts_at: "",
      expires_at: "",
      max_redemptions: null,
      per_user_limit: null,
      min_price_kwd: null,
      is_active: true,
    });
    setEditingCode(null);
  };

  const handleEdit = (code: DiscountCode) => {
    setEditingCode(code);
    
    // Map from legacy or new fields
    let durationType: "one_time" | "limited_cycles" | "lifetime" = "one_time";
    let durationCycles = 3;
    
    if (code.duration_type) {
      durationType = code.duration_type as "one_time" | "limited_cycles" | "lifetime";
      durationCycles = code.duration_cycles || 3;
    } else {
      // Fallback to legacy applies_to (supporting both old and new enum values)
      if (code.applies_to === "first_payment") {
        durationType = "one_time";
      } else if (code.applies_to === "limited_payments" || (code.applies_to === "recurring" && code.max_cycles)) {
        durationType = "limited_cycles";
        durationCycles = code.max_cycles || 3;
      } else if (code.applies_to === "all_payments" || code.applies_to === "all" || code.applies_to === "recurring") {
        durationType = "lifetime";
      }
    }
    
    setFormData({
      code: code.code,
      description: code.description || "",
      discount_type: code.discount_type,
      discount_value: code.discount_value,
      duration_type: durationType,
      duration_cycles: durationCycles,
      service_id: code.service_id || undefined,
      starts_at: code.starts_at ? code.starts_at.split("T")[0] : "",
      expires_at: code.expires_at ? code.expires_at.split("T")[0] : "",
      max_redemptions: code.max_redemptions,
      per_user_limit: code.per_user_limit,
      min_price_kwd: code.min_price_kwd,
      is_active: code.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleClone = (code: DiscountCode) => {
    // Map from legacy or new fields (same logic as handleEdit)
    let durationType: "one_time" | "limited_cycles" | "lifetime" = "one_time";
    let durationCycles = 3;
    
    if (code.duration_type) {
      durationType = code.duration_type as "one_time" | "limited_cycles" | "lifetime";
      durationCycles = code.duration_cycles || 3;
    } else {
      if (code.applies_to === "first_payment") {
        durationType = "one_time";
      } else if (code.applies_to === "limited_payments" || (code.applies_to === "recurring" && code.max_cycles)) {
        durationType = "limited_cycles";
        durationCycles = code.max_cycles || 3;
      } else if (code.applies_to === "all_payments" || code.applies_to === "all" || code.applies_to === "recurring") {
        durationType = "lifetime";
      }
    }
    
    // Pre-fill form with cloned settings but empty code and inactive status
    setFormData({
      code: "", // Empty for new code
      description: code.description ? `Copy of ${code.description}` : "",
      discount_type: code.discount_type,
      discount_value: code.discount_value,
      duration_type: durationType,
      duration_cycles: durationCycles,
      service_id: code.service_id || undefined,
      starts_at: "", // Reset dates for the clone
      expires_at: "",
      max_redemptions: code.max_redemptions,
      per_user_limit: code.per_user_limit,
      min_price_kwd: code.min_price_kwd,
      is_active: false, // Default to inactive for cloned codes
    });
    setEditingCode(null); // Not editing, creating new
    setIsDialogOpen(true);
    
    toast({
      title: "Cloning discount code",
      description: "Settings copied. Enter a new code name and adjust as needed.",
    });
  };

  const getCompactSummary = (code: DiscountCode) => {
    const parts: string[] = [];
    
    // Value
    if (code.discount_type === "percent") {
      parts.push(`${code.discount_value}%`);
    } else {
      parts.push(`${code.discount_value} KWD`);
    }
    
    // Duration
    if (code.duration_type === "one_time" || code.applies_to === "first_payment") {
      parts.push("First payment only");
    } else if (code.duration_type === "lifetime" || code.applies_to === "all_payments" || code.applies_to === "all") {
      parts.push("All payments");
    } else if (code.duration_type === "limited_cycles" || code.applies_to === "limited_payments") {
      const cycles = code.duration_cycles || code.max_cycles;
      if (cycles) {
        parts.push(`${cycles} payments`);
      }
    }
    
    // Service restriction
    if (code.services?.name) {
      parts.push(code.services.name);
    }
    
    return parts.join(" • ");
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("discount_codes")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Code status updated" });
      loadData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const getDurationLabel = (code: DiscountCode) => {
    // Use new duration_type if available
    if (code.duration_type) {
      if (code.duration_type === "one_time") return "First payment only";
      if (code.duration_type === "lifetime") return "All payments (lifetime)";
      if (code.duration_type === "limited_cycles") return `First ${code.duration_cycles} payments`;
    }
    
    // Fallback to legacy applies_to enum values
    if (code.applies_to === "first_payment") return "First payment only";
    if (code.applies_to === "all_payments") return "All payments (lifetime)";
    if (code.applies_to === "limited_payments") {
      if (code.max_cycles) return `First ${code.max_cycles} payments`;
      return "Limited payments";
    }
    // Handle old enum values for backward compatibility
    if (code.applies_to === "all") return "All payments (lifetime)";
    if (code.applies_to === "recurring") {
      if (code.max_cycles) return `First ${code.max_cycles} payments`;
      return "All recurring payments";
    }
    return code.applies_to;
  };

  if (loading) {
    return <div className="text-center py-8">Loading discount codes...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Discount Codes</CardTitle>
            <CardDescription>Manage promo codes for subscriptions</CardDescription>
          </div>
          <Button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              console.log("Create Code clicked");
              toast({ title: "Opening Create Code dialog…", description: "Loading discount code form." });
              setIsDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Code
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              if (!open) resetForm();
              setIsDialogOpen(open);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCode ? "Edit" : "Create"} Discount Code</DialogTitle>
                <DialogDescription>Configure the discount code settings</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="WELCOME20"
                      required
                      disabled={!!editingCode}
                    />
                  </div>
                  <div>
                    <Label htmlFor="discount_type">Type *</Label>
                    <Select value={formData.discount_type} onValueChange={(value) => setFormData({ ...formData, discount_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed Amount (KWD)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="20% off for new clients"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="discount_value">
                      {formData.discount_type === "percent" ? "Percentage (%)" : "Amount (KWD)"} *
                    </Label>
                    <Input
                      id="discount_value"
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.discount_type === "percent" ? "100" : undefined}
                      value={formData.discount_value}
                      onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="duration_type">Duration *</Label>
                    <Select 
                      value={formData.duration_type} 
                      onValueChange={(value: "one_time" | "limited_cycles" | "lifetime") => setFormData({ ...formData, duration_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_time">One-Time (First Payment Only)</SelectItem>
                        <SelectItem value="limited_cycles">Limited Cycles</SelectItem>
                        <SelectItem value="lifetime">Lifetime (All Payments)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.duration_type === "limited_cycles" && (
                  <div>
                    <Label htmlFor="duration_cycles">Number of Cycles *</Label>
                    <Input
                      id="duration_cycles"
                      type="number"
                      min="1"
                      value={formData.duration_cycles}
                      onChange={(e) => setFormData({ ...formData, duration_cycles: parseInt(e.target.value) })}
                      required
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Discount will apply to the first {formData.duration_cycles} payment(s)
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="service_id">Restrict to Service (optional)</Label>
                  <Select 
                    value={formData.service_id} 
                    onValueChange={(value) => setFormData({ ...formData, service_id: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Services" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Services</SelectItem>
                      {(services ?? [])
                        .filter((s) => (s?.id ?? "").trim() !== "")
                        .map((service) => (
                          <SelectItem key={service.id} value={String(service.id)}>
                            {service.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="starts_at">Start Date (optional)</Label>
                    <Input
                      id="starts_at"
                      type="date"
                      value={formData.starts_at}
                      onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expires_at">Expiry Date (optional)</Label>
                    <Input
                      id="expires_at"
                      type="date"
                      value={formData.expires_at}
                      onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="max_redemptions">Max Uses (optional)</Label>
                    <Input
                      id="max_redemptions"
                      type="number"
                      min="1"
                      value={formData.max_redemptions || ""}
                      onChange={(e) => setFormData({ ...formData, max_redemptions: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="per_user_limit">Per-User Limit (optional)</Label>
                    <Input
                      id="per_user_limit"
                      type="number"
                      min="1"
                      value={formData.per_user_limit || ""}
                      onChange={(e) => setFormData({ ...formData, per_user_limit: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="min_price_kwd">Min Price (KWD)</Label>
                    <Input
                      id="min_price_kwd"
                      type="number"
                      step="0.001"
                      min="0"
                      value={formData.min_price_kwd || ""}
                      onChange={(e) => setFormData({ ...formData, min_price_kwd: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => { setIsDialogOpen(false); resetForm(); }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {editingCode ? "Updating…" : "Creating…"}
                      </>
                    ) : (
                      editingCode ? "Update" : "Create"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No discount codes yet
                </TableCell>
              </TableRow>
            ) : (
              codes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell>
                    <div>
                      <p className="font-mono font-semibold">{code.code}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{getCompactSummary(code)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{code.discount_type}</TableCell>
                  <TableCell>
                    {code.discount_type === "percent" ? `${code.discount_value}%` : `${code.discount_value} KWD`}
                  </TableCell>
                  <TableCell>{getDurationLabel(code)}</TableCell>
                  <TableCell>{code.services?.name || "All"}</TableCell>
                  <TableCell>
                    {redemptionCounts[code.id] || 0}
                    {code.max_redemptions && ` / ${code.max_redemptions}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={code.is_active ? "default" : "secondary"}>
                      {code.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(code)} title="Edit code">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleClone(code)} title="Clone code">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={code.is_active}
                        onCheckedChange={() => toggleActive(code.id, code.is_active)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
