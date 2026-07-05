import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, Save } from "lucide-react";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface Service {
  id: string;
  name: string;
  type: string;
}

interface ServiceLimit {
  id: string;
  coach_id: string;
  service_id: string;
  max_clients: number;
  services?: Service;
}

interface CoachServiceLimitsProps {
  coachId: string;
  coachName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoachServiceLimits({ coachId, coachName, open, onOpenChange }: CoachServiceLimitsProps) {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [limits, setLimits] = useState<ServiceLimit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchServicesAndLimits = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch all services
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("id, name, type")
        .eq("is_active", true)
        .order("name");

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      // Fetch existing limits for this coach
      const { data: limitsData, error: limitsError } = await supabase
        .from("coach_service_limits")
        .select("*")
        .eq("coach_id", coachId);

      if (limitsError) throw limitsError;
      setLimits(limitsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachId, toast]);

  useEffect(() => {
    if (open) {
      fetchServicesAndLimits();
    }
  }, [open, fetchServicesAndLimits]);

  const getLimitForService = (serviceId: string): number => {
    const limit = limits.find(l => l.service_id === serviceId);
    return limit ? limit.max_clients : 0;
  };

  const updateLimit = (serviceId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    const existingLimit = limits.find(l => l.service_id === serviceId);
    
    if (existingLimit) {
      setLimits(limits.map(l => 
        l.service_id === serviceId 
          ? { ...l, max_clients: numValue } 
          : l
      ));
    } else {
      setLimits([...limits, {
        id: crypto.randomUUID(),
        coach_id: coachId,
        service_id: serviceId,
        max_clients: numValue,
      }]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Capacity v2: UPSERT the admin ceiling (max_clients) on (coach_id, service_id) — NOT
      // delete-all-then-insert, which would wipe the coach-set fields (coach_max_clients,
      // is_accepting). Only max_clients is written here; the coach's own fields are preserved.
      const rows = limits.map((l) => ({
        coach_id: coachId,
        service_id: l.service_id,
        max_clients: l.max_clients,
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("coach_service_limits")
          .upsert(rows, { onConflict: "coach_id,service_id" });

        if (upsertError) throw upsertError;
      }

      toast({
        title: "Success",
        description: "Client limits updated successfully",
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Client Limits for {coachName}
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Service Limits</CardTitle>
                <CardDescription>
                  Set the maximum number of clients this coach can handle for each service type.
                  Set to 0 for unlimited clients.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {services.map((service) => (
                  <div key={service.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-1">
                      <Label htmlFor={`limit-${service.id}`} className="text-base font-medium">
                        {service.name}
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {service.type}
                      </p>
                    </div>
                    <div className="w-32">
                      <Input
                        id={`limit-${service.id}`}
                        type="number"
                        min="0"
                        value={getLimitForService(service.id)}
                        onChange={(e) => updateLimit(service.id, e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Limits"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
