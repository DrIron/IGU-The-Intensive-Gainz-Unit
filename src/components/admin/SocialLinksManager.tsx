import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { getSocialIcon, getSocialLabel } from "@/hooks/useSocialLinks";

interface SocialLinkRow {
  id: string;
  key: string;
  value: string;
  is_active: boolean;
  sort_order: number;
}

export function SocialLinksManager() {
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<SocialLinkRow[]>([]);
  const { toast } = useToast();

  const loadLinks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("site_content")
        .select("id, key, value, is_active, sort_order")
        .eq("page", "global")
        .eq("section", "social_links")
        .order("sort_order");

      if (error) throw error;
      setLinks(data || []);
    } catch (error: unknown) {
      console.error("Error loading social links:", error);
      toast({
        title: "Error",
        description: "Failed to load social links",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleSave = async () => {
    setLoading(true);
    try {
      for (const link of links) {
        const { error } = await supabase
          .from("site_content")
          .update({ value: link.value, is_active: link.is_active })
          .eq("id", link.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Social links updated successfully",
      });
    } catch (error: unknown) {
      console.error("Error saving social links:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateLink = (id: string, field: "value" | "is_active", val: string | boolean) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  };

  if (links.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Social Media Links</CardTitle>
        <CardDescription>
          Manage social media links shown across the site (footer, waitlist page).
          Toggle visibility and enter the full URL for each platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.map((link) => {
          const Icon = getSocialIcon(link.key);
          const label = getSocialLabel(link.key);

          return (
            <div key={link.id} className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <Label className="w-28 shrink-0 text-sm font-medium">{label}</Label>
              <Input
                placeholder="https://..."
                value={link.value}
                onChange={(e) => updateLink(link.id, "value", e.target.value)}
                className="flex-1"
              />
              <Switch
                checked={link.is_active}
                onCheckedChange={(checked) => updateLink(link.id, "is_active", checked)}
              />
            </div>
          );
        })}

        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Social Links"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
