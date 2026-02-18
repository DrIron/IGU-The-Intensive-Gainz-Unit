import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Send, Users, UserCheck } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WaitlistSettings {
  id: string;
  is_enabled: boolean;
  heading: string | null;
  subheading: string | null;
}

export function WaitlistManager() {
  const [loading, setLoading] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [settings, setSettings] = useState<WaitlistSettings | null>(null);
  const [totalLeads, setTotalLeads] = useState(0);
  const [uninvitedLeads, setUninvitedLeads] = useState(0);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("waitlist_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
      }
    } catch (error: unknown) {
      console.error("Error loading waitlist settings:", error);
      toast({
        title: "Error",
        description: "Failed to load waitlist settings",
        variant: "destructive",
      });
    }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      // Total waitlist leads
      const { count: total } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("source", "waitlist");

      // Uninvited waitlist leads
      const { count: uninvited } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("source", "waitlist")
        .is("invited_at", null);

      setTotalLeads(total ?? 0);
      setUninvitedLeads(uninvited ?? 0);
    } catch (error: unknown) {
      console.error("Error loading waitlist stats:", error);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadStats();
  }, [loadSettings, loadStats]);

  const handleSave = async () => {
    if (!settings) return;

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("waitlist_settings")
        .update({
          is_enabled: settings.is_enabled,
          heading: settings.heading,
          subheading: settings.subheading,
          updated_by: user?.id,
        })
        .eq("id", settings.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Waitlist settings updated successfully",
      });
    } catch (error: unknown) {
      console.error("Error saving waitlist settings:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvites = async () => {
    setSendingInvites(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-waitlist-invites"
      );

      if (error) throw error;

      const result = data as { sent: number; failed: number; errors: string[] };

      toast({
        title: "Invites Sent",
        description: `${result.sent} invite${result.sent !== 1 ? "s" : ""} sent${result.failed > 0 ? `, ${result.failed} failed` : ""}.`,
      });

      // Refresh stats
      loadStats();
    } catch (error: unknown) {
      console.error("Error sending invites:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSendingInvites(false);
    }
  };

  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waitlist Settings</CardTitle>
        <CardDescription>
          Control pre-launch waitlist redirect and send invites to collected
          leads
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="waitlist-toggle">Waitlist Mode</Label>
            <p className="text-sm text-muted-foreground">
              {settings.is_enabled
                ? "Waitlist is active -- visitors are redirected"
                : "Waitlist is off -- normal access"}
            </p>
          </div>
          <Switch
            id="waitlist-toggle"
            checked={settings.is_enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, is_enabled: checked })
            }
          />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <Label htmlFor="waitlist-heading">Heading</Label>
          <Input
            id="waitlist-heading"
            placeholder="Coming Soon"
            value={settings.heading || ""}
            onChange={(e) =>
              setSettings({ ...settings, heading: e.target.value })
            }
          />
        </div>

        {/* Subheading */}
        <div className="space-y-2">
          <Label htmlFor="waitlist-subheading">Subheading</Label>
          <Textarea
            id="waitlist-subheading"
            placeholder="Join the waitlist to be first in line."
            value={settings.subheading || ""}
            onChange={(e) =>
              setSettings({ ...settings, subheading: e.target.value })
            }
            rows={3}
          />
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total:</span>
            <span className="font-semibold">{totalLeads}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Uninvited:</span>
            <span className="font-semibold">{uninvitedLeads}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={loading} className="flex-1">
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={uninvitedLeads === 0 || sendingInvites}
                className="flex-1"
              >
                {sendingInvites ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Invites ({uninvitedLeads})
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send Invite Emails?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will send an invite email to {uninvitedLeads} waitlist
                  lead{uninvitedLeads !== 1 ? "s" : ""} who haven't been invited
                  yet. Each email contains a link to create their account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSendInvites}>
                  Send {uninvitedLeads} Invite{uninvitedLeads !== 1 ? "s" : ""}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
