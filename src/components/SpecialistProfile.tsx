import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SpecializationTagPicker } from "@/components/ui/SpecializationTagPicker";
import { Upload } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

// Specialist parity (S4) — self-service profile page for a non-coach specialist (dietitian first).
// Reads/writes the per-role dietitians row via the S1 coach-parity fields. Name/email/level are
// read-only (name from profiles_public, level admin-set on staff_professional_info). Renders null
// when the signed-in user has no dietitians row, so it stays invisible to pure coaches.

const LEVEL_LABELS: Record<string, string> = { junior: "Junior", senior: "Senior", lead: "Lead" };

interface DietitianRow {
  user_id: string;
  bio: string | null;
  short_bio: string | null;
  qualifications: string[] | null;
  specializations: string[] | null;
  profile_picture_url: string | null;
  location: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
}

export default function SpecialistProfile() {
  const { toast } = useToast();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [row, setRow] = useState<DietitianRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [level, setLevel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    bio: "",
    short_bio: "",
    qualifications: "",
    specializations: [] as string[],
    location: "",
    instagram_url: "",
    tiktok_url: "",
    youtube_url: "",
  });

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("dietitians")
        .select("user_id, bio, short_bio, qualifications, specializations, profile_picture_url, location, instagram_url, tiktok_url, youtube_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setRow(null);
        return;
      }
      setRow(data);
      setForm({
        bio: data.bio || "",
        short_bio: data.short_bio || "",
        qualifications: (data.qualifications || []).join("\n"),
        specializations: data.specializations || [],
        location: data.location || "",
        instagram_url: data.instagram_url || "",
        tiktok_url: data.tiktok_url || "",
        youtube_url: data.youtube_url || "",
      });

      // Read-only name (client-safe fields) + admin-set level.
      const { data: profile } = await supabase
        .from("profiles_public")
        .select("first_name, display_name")
        .eq("id", userId)
        .maybeSingle();
      setDisplayName(profile?.display_name || profile?.first_name || "");

      const { data: staff } = await supabase
        .from("staff_professional_info")
        .select("level")
        .eq("user_id", userId)
        .maybeSingle();
      setLevel(staff?.level ?? null);
    } catch (error: unknown) {
      console.error("Error fetching specialist profile:", error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    fetchProfile(sessionUser.id);
  }, [sessionUser, sessionLoading, fetchProfile]);

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionUser) return;
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${sessionUser.id}/profile.${fileExt}`;
      // Reuse the coach-profiles bucket (own-folder-scoped for any authenticated user).
      const { error: uploadError } = await supabase.storage
        .from("coach-profiles")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("coach-profiles").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("dietitians")
        .update({ profile_picture_url: publicUrl })
        .eq("user_id", sessionUser.id);
      if (updateError) throw updateError;

      toast({ title: "Success", description: "Profile picture updated." });
      fetchProfile(sessionUser.id);
    } catch (error: unknown) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionUser || !row) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("dietitians")
        .update({
          bio: form.bio || null,
          short_bio: form.short_bio || null,
          qualifications: form.qualifications
            ? form.qualifications.split("\n").map((q) => q.trim()).filter(Boolean)
            : [],
          specializations: form.specializations,
          location: form.location || null,
          instagram_url: form.instagram_url || null,
          tiktok_url: form.tiktok_url || null,
          youtube_url: form.youtube_url || null,
        })
        .eq("user_id", sessionUser.id);
      if (error) throw error;

      toast({ title: "Success", description: "Profile updated successfully." });
      fetchProfile(sessionUser.id);
    } catch (error: unknown) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Invisible to users without a specialist (dietitians) row — e.g. pure coaches.
  if (!loaded || !row) return null;

  const initials = displayName.split(" ").map((n) => n.charAt(0)).join("").toUpperCase().slice(0, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Specialist Profile</CardTitle>
        <CardDescription>Update your specialist profile shown to your assigned clients.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={row.profile_picture_url || undefined} />
              <AvatarFallback>{initials || "SP"}</AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <Input id="specialist-picture" type="file" accept="image/*" onChange={handlePictureUpload} className="hidden" />
              <Label htmlFor="specialist-picture" className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? "Uploading..." : "Upload Photo"}
                  </span>
                </Button>
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={displayName} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Professional Level</Label>
              <div className="flex h-10 items-center">
                {level ? (
                  <Badge variant="secondary">{LEVEL_LABELS[level] || level}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Not set</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Set by an administrator.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Kuwait City"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="short_bio">Short Bio (for your client card)</Label>
            <Textarea
              id="short_bio"
              value={form.short_bio}
              onChange={(e) => setForm({ ...form, short_bio: e.target.value })}
              placeholder="Brief description shown on your profile card"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Full Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Tell your clients about yourself"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qualifications">Qualifications (one per line)</Label>
            <Textarea
              id="qualifications"
              value={form.qualifications}
              onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
              placeholder={"e.g., Registered Dietitian\nMSc Clinical Nutrition"}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Specializations</Label>
            <SpecializationTagPicker
              selectedTags={form.specializations}
              onToggle={(tagValue) =>
                setForm((prev) => ({
                  ...prev,
                  specializations: prev.specializations.includes(tagValue)
                    ? prev.specializations.filter((v) => v !== tagValue)
                    : [...prev.specializations, tagValue],
                }))
              }
              maxTags={15}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold text-lg">Social Media</h3>
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram URL</Label>
              <Input
                id="instagram_url"
                type="url"
                value={form.instagram_url}
                onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
                placeholder="https://instagram.com/username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok_url">TikTok URL</Label>
              <Input
                id="tiktok_url"
                type="url"
                value={form.tiktok_url}
                onChange={(e) => setForm({ ...form, tiktok_url: e.target.value })}
                placeholder="https://tiktok.com/@username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube_url">YouTube URL</Label>
              <Input
                id="youtube_url"
                type="url"
                value={form.youtube_url}
                onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                placeholder="https://youtube.com/@username"
              />
            </div>
          </div>

          <Button type="submit" variant="default" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Update Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
