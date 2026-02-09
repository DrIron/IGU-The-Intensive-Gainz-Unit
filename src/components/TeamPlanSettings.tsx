import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Calendar, RefreshCw } from "lucide-react";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

export function TeamPlanSettings() {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<{
    id: string;
    is_registration_open: boolean;
    next_program_start_date: string | null;
    announcement_text: string | null;
  } | null>(null);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('team_plan_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // If no settings exist, create default ones
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('team_plan_settings')
          .insert({
            is_registration_open: true,
            next_program_start_date: null,
            announcement_text: null,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings);
      } else {
        setSettings(data);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      toast({
        title: "Error",
        description: "Failed to load team plan settings",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!settings) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('team_plan_settings')
        .update({
          is_registration_open: settings.is_registration_open,
          next_program_start_date: settings.next_program_start_date,
          announcement_text: settings.announcement_text,
          updated_by: user?.id,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Team plan settings updated successfully",
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Plan Registration Settings</CardTitle>
        <CardDescription>
          Control team plan availability and program start date
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="registration-toggle">Registration Open</Label>
            <p className="text-sm text-muted-foreground">
              {settings.is_registration_open 
                ? "Team plans are visible and accepting registrations" 
                : "Team plans are hidden from the services page"}
            </p>
          </div>
          <Switch
            id="registration-toggle"
            checked={settings.is_registration_open}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, is_registration_open: checked })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start-date">
            <Calendar className="inline h-4 w-4 mr-2" />
            Next Program Start Date
          </Label>
          <Input
            id="start-date"
            type="datetime-local"
            value={settings.next_program_start_date?.slice(0, 16) || ''}
            onChange={(e) =>
              setSettings({
                ...settings,
                next_program_start_date: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
          <p className="text-sm text-muted-foreground">
            This date will be displayed on the home page
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="announcement">Announcement Text</Label>
          <Textarea
            id="announcement"
            placeholder="Next team program starts soon!"
            value={settings.announcement_text || ''}
            onChange={(e) =>
              setSettings({ ...settings, announcement_text: e.target.value })
            }
            rows={3}
          />
          <p className="text-sm text-muted-foreground">
            Custom message to display on the home page
          </p>
        </div>

        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
