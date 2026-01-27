import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Save, Loader2 } from "lucide-react";

interface Service {
  id: string;
  name: string;
  discord_role_id: string | null;
  type: string;
}

export function ServiceConfiguration() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleIds, setRoleIds] = useState<Record<string, string>>({});

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, discord_role_id, type')
        .order('name');

      if (error) throw error;

      setServices(data || []);
      
      // Initialize roleIds state
      const ids: Record<string, string> = {};
      data?.forEach(service => {
        ids[service.id] = service.discord_role_id || '';
      });
      setRoleIds(ids);
    } catch (error: any) {
      console.error('Error loading services:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = services.map(service => ({
        id: service.id,
        discord_role_id: roleIds[service.id] || null,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('services')
          .update({ discord_role_id: update.discord_role_id })
          .eq('id', update.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Discord role IDs updated successfully",
      });

      loadServices();
    } catch (error: any) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Service Configuration</CardTitle>
            <CardDescription>
              Configure Discord role IDs for automatic role assignment
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">How to get Discord Role IDs:</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Enable Developer Mode in Discord (User Settings → Advanced)</li>
              <li>Go to your server and right-click the role</li>
              <li>Click "Copy ID"</li>
              <li>Paste it in the field below</li>
            </ol>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Discord Role ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell>
                    <span className="capitalize">{service.type.replace('_', ' ')}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Discord Role ID (e.g., 1234567890123456789)"
                        value={roleIds[service.id] || ''}
                        onChange={(e) => setRoleIds({
                          ...roleIds,
                          [service.id]: e.target.value,
                        })}
                        className="max-w-xs"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
