import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Coach {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
}

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
  services?: {
    name: string;
  };
}

interface CoachWithLimits extends Coach {
  service_limits: ServiceLimit[];
  current_clients: Map<string, number>;
}

export function CoachCapacityManager() {
  const { toast } = useToast();
  const [coaches, setCoaches] = useState<CoachWithLimits[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingLimit, setEditingLimit] = useState<ServiceLimit | null>(null);
  const [newLimit, setNewLimit] = useState({ coach_id: "", service_id: "", max_clients: 0 });
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load all coaches with coach role
      const { data: coachRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'coach');

      const coachUserIds = coachRoles?.map(r => r.user_id) || [];

      if (coachUserIds.length === 0) {
        setCoaches([]);
        setLoading(false);
        return;
      }

      // Load coach details
      const { data: coachesData, error: coachesError } = await supabase
        .from('coaches')
        .select('id, user_id, first_name, last_name')
        .eq('status', 'active')
        .in('user_id', coachUserIds);

      if (coachesError) throw coachesError;

      // Load all services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      // Load service limits for all coaches
      const { data: limitsData, error: limitsError } = await supabase
        .from('coach_service_limits')
        .select(`
          id,
          coach_id,
          service_id,
          max_clients,
          services (name)
        `);

      if (limitsError) throw limitsError;

      // Load current client counts
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('coach_id, service_id')
        .eq('status', 'active');

      // Calculate current client counts per coach per service
      const clientCounts = new Map<string, Map<string, number>>();
      subscriptions?.forEach(sub => {
        if (!sub.coach_id || !sub.service_id) return;
        
        if (!clientCounts.has(sub.coach_id)) {
          clientCounts.set(sub.coach_id, new Map());
        }
        const serviceCounts = clientCounts.get(sub.coach_id)!;
        serviceCounts.set(sub.service_id, (serviceCounts.get(sub.service_id) || 0) + 1);
      });

      // Combine data
      const coachesWithLimits: CoachWithLimits[] = (coachesData || []).map(coach => ({
        ...coach,
        service_limits: limitsData?.filter(l => l.coach_id === coach.id) || [],
        current_clients: clientCounts.get(coach.user_id) || new Map(),
      }));

      setCoaches(coachesWithLimits);
    } catch (error: any) {
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateLimit = async (limitId: string, maxClients: number) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('coach_service_limits')
        .update({ max_clients: maxClients })
        .eq('id', limitId);

      if (error) throw error;

      toast({
        title: "Limit updated",
        description: "Coach service limit has been updated successfully.",
      });

      setEditingLimit(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: "Error updating limit",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddLimit = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('coach_service_limits')
        .insert({
          coach_id: newLimit.coach_id,
          service_id: newLimit.service_id,
          max_clients: newLimit.max_clients,
        });

      if (error) throw error;

      toast({
        title: "Limit added",
        description: "New coach service limit has been added successfully.",
      });

      setShowAddDialog(false);
      setNewLimit({ coach_id: "", service_id: "", max_clients: 0 });
      await loadData();
    } catch (error: any) {
      toast({
        title: "Error adding limit",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLimit = async (limitId: string) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('coach_service_limits')
        .delete()
        .eq('id', limitId);

      if (error) throw error;

      toast({
        title: "Limit deleted",
        description: "Coach service limit has been removed.",
      });

      await loadData();
    } catch (error: any) {
      toast({
        title: "Error deleting limit",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Coach Capacity Management</h2>
          <p className="text-muted-foreground mt-2">
            Manage service limits and availability for each coach
          </p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Service Limit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Service Limit</DialogTitle>
              <DialogDescription>
                Set a capacity limit for a coach on a specific service
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Coach</Label>
                <Select
                  value={newLimit.coach_id}
                  onValueChange={(value) => setNewLimit({ ...newLimit, coach_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.first_name} {coach.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Service</Label>
                <Select
                  value={newLimit.service_id}
                  onValueChange={(value) => setNewLimit({ ...newLimit, service_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Maximum Clients</Label>
                <Input
                  type="number"
                  min="0"
                  value={newLimit.max_clients}
                  onChange={(e) => setNewLimit({ ...newLimit, max_clients: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddLimit}
                disabled={!newLimit.coach_id || !newLimit.service_id || saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Limit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {coaches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No coaches found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {coaches.map((coach) => (
            <Card key={coach.id}>
              <CardHeader>
                <CardTitle>
                  {coach.first_name} {coach.last_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {coach.service_limits.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No service limits configured
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Current / Max Clients</TableHead>
                        <TableHead>Availability</TableHead>
                        <TableHead>Max Clients</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coach.service_limits.map((limit) => {
                        const currentCount = coach.current_clients.get(limit.service_id) || 0;
                        const availableSpots = limit.max_clients - currentCount;
                        const percentFull = (currentCount / limit.max_clients) * 100;

                        return (
                          <TableRow key={limit.id}>
                            <TableCell className="font-medium">
                              {limit.services?.name || 'Unknown Service'}
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold">{currentCount}</span> / {limit.max_clients}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  availableSpots === 0
                                    ? "destructive"
                                    : percentFull >= 80
                                    ? "secondary"
                                    : "default"
                                }
                              >
                                {availableSpots} spots available
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {editingLimit?.id === limit.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={currentCount}
                                    value={editingLimit.max_clients}
                                    onChange={(e) =>
                                      setEditingLimit({
                                        ...editingLimit,
                                        max_clients: parseInt(e.target.value) || 0,
                                      })
                                    }
                                    className="w-24"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleUpdateLimit(limit.id, editingLimit.max_clients)
                                    }
                                    disabled={saving}
                                  >
                                    {saving ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingLimit(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <span>{limit.max_clients}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {!editingLimit && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingLimit(limit)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleDeleteLimit(limit.id)}
                                      disabled={saving}
                                    >
                                      {saving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
