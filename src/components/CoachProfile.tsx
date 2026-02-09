import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload } from "lucide-react";
import { calculateAge, formatDateForInput } from "@/lib/dateUtils";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface CoachData {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  location: string | null;
  bio: string | null;
  short_bio: string | null;
  profile_picture_url: string | null;
  qualifications: string[] | null;
  specializations: string[] | null;
  nickname: string | null;
}

interface CoachContactData {
  email: string;
  whatsapp_number: string | null;
  date_of_birth: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  snapchat_url: string | null;
  youtube_url: string | null;
}

export default function CoachProfile() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [contactData, setContactData] = useState<CoachContactData | null>(null);
  const [coachData, setCoachData] = useState<CoachData | null>(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "",
    location: "",
    bio: "",
    short_bio: "",
    qualifications: "",
    specializations: "",
    whatsapp_number: "",
    whatsapp_country_code: "+965",
    nickname: "",
    instagram_url: "",
    tiktok_url: "",
    snapchat_url: "",
    youtube_url: "",
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCoachData();
  }, []);

  const fetchCoachData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch coach profile from coaches_public table (public fields only)
      const { data, error } = await supabase
        .from("coaches_public")
        .select("id, user_id, first_name, last_name, location, bio, short_bio, profile_picture_url, qualifications, specializations, nickname")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      // Note: gender is stored in coaches_private now
      setCoachData({ ...data, gender: null });
      
      // Fetch contact/private info from coaches_private table
      const { data: contact } = await supabase
        .from("coaches_private")
        .select("email, whatsapp_number, date_of_birth, gender, instagram_url, tiktok_url, snapchat_url, youtube_url")
        .eq("coach_public_id", data.id)
        .maybeSingle();
      
      setContactData(contact);
      
      // Merge gender from private data
      if (contact?.gender) {
        setCoachData(prev => prev ? { ...prev, gender: contact.gender } : prev);
      }
      
      // Extract country code from WhatsApp number
      const whatsappWithCode = contact?.whatsapp_number || "";
      let extractedCode = "+965";
      let extractedNumber = whatsappWithCode;
      
      if (whatsappWithCode) {
        const match = whatsappWithCode.match(/^(\+\d+)\s*(.*)$/);
        if (match) {
          extractedCode = match[1];
          extractedNumber = match[2];
        }
      }
      
      const genderValue = contact?.gender || "";
      
      setFormData({
        first_name: data.first_name,
        last_name: data.last_name,
        date_of_birth: formatDateForInput(contact?.date_of_birth),
        gender: genderValue,
        location: data.location || "",
        bio: data.bio || "",
        short_bio: data.short_bio || "",
        qualifications: (data.qualifications || []).join("\n"),
        specializations: (data.specializations || []).join(", "),
        whatsapp_number: extractedNumber,
        whatsapp_country_code: extractedCode,
        nickname: data.nickname || "",
        instagram_url: contact?.instagram_url || "",
        tiktok_url: contact?.tiktok_url || "",
        snapchat_url: contact?.snapchat_url || "",
        youtube_url: contact?.youtube_url || "",
      });
    } catch (error: any) {
      console.error("Error fetching coach data:", error);
    }
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !coachData) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${coachData.user_id}/profile.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('coach-profiles')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('coach-profiles')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("coaches_public")
        .update({ profile_picture_url: publicUrl })
        .eq("id", coachData.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
      fetchCoachData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coachData) return;

    setLoading(true);
    try {
      // Combine country code and WhatsApp number
      const fullWhatsApp = formData.whatsapp_number 
        ? `${formData.whatsapp_country_code} ${formData.whatsapp_number}` 
        : "";
      
      // Update coach profile (public fields only) in coaches_public table
      const { error } = await supabase
        .from("coaches_public")
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          location: formData.location,
          bio: formData.bio,
          short_bio: formData.short_bio,
          qualifications: formData.qualifications 
            ? formData.qualifications.split("\n").map(q => q.trim()).filter(Boolean)
            : [],
          specializations: formData.specializations
            ? formData.specializations.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          nickname: formData.nickname,
        })
        .eq("id", coachData.id);

      if (error) throw error;

      // Update private info in coaches_private table (sensitive fields including gender)
      const { error: contactError } = await supabase
        .from("coaches_private")
        .update({
          gender: formData.gender || null,
          whatsapp_number: fullWhatsApp,
          date_of_birth: formData.date_of_birth || null,
          instagram_url: formData.instagram_url || null,
          tiktok_url: formData.tiktok_url || null,
          snapchat_url: formData.snapchat_url || null,
          youtube_url: formData.youtube_url || null,
        })
        .eq("coach_public_id", coachData.id);

      if (contactError) {
        console.error("Error updating contact info:", contactError);
      }

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      fetchCoachData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!coachData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading profile...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coach Profile</CardTitle>
        <CardDescription>Update your coach information</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={coachData.profile_picture_url || undefined} />
              <AvatarFallback>
                {coachData.first_name?.slice(0, 1).toUpperCase() || ''}{coachData.last_name?.slice(0, 1).toUpperCase() || ''}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <Input
                id="profile-picture"
                type="file"
                accept="image/*"
                onChange={handleProfilePictureUpload}
                className="hidden"
              />
              <Label htmlFor="profile-picture" className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? "Uploading..." : "Upload Photo"}
                  </span>
                </Button>
              </Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={contactData?.email || ""}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              />
              {formData.date_of_birth && (
                <p className="text-sm text-muted-foreground">
                  Age: {calculateAge(formData.date_of_birth)} years
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="short_bio">Short Bio (for team page card)</Label>
            <Textarea
              id="short_bio"
              value={formData.short_bio}
              onChange={(e) => setFormData({ ...formData, short_bio: e.target.value })}
              placeholder="Brief description for your profile card"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Full Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Tell us about yourself in detail"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qualifications">Qualifications (comma separated)</Label>
            <Input
              id="qualifications"
              type="text"
              value={formData.qualifications}
              onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
              placeholder="e.g., BS in Exercise Science, Certified Personal Trainer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="specializations">Specializations (comma separated)</Label>
            <Input
              id="specializations"
              type="text"
              value={formData.specializations}
              onChange={(e) => setFormData({ ...formData, specializations: e.target.value })}
              placeholder="e.g., Strength Training, Nutrition, Powerlifting"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp_country_code">WhatsApp Code</Label>
              <Select
                value={formData.whatsapp_country_code}
                onValueChange={(value) => setFormData({ ...formData, whatsapp_country_code: value })}
              >
                <SelectTrigger id="whatsapp_country_code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="+965">+965 (Kuwait)</SelectItem>
                  <SelectItem value="+966">+966 (Saudi Arabia)</SelectItem>
                  <SelectItem value="+971">+971 (UAE)</SelectItem>
                  <SelectItem value="+973">+973 (Bahrain)</SelectItem>
                  <SelectItem value="+974">+974 (Qatar)</SelectItem>
                  <SelectItem value="+968">+968 (Oman)</SelectItem>
                  <SelectItem value="+962">+962 (Jordan)</SelectItem>
                  <SelectItem value="+961">+961 (Lebanon)</SelectItem>
                  <SelectItem value="+20">+20 (Egypt)</SelectItem>
                  <SelectItem value="+1">+1 (USA/Canada)</SelectItem>
                  <SelectItem value="+44">+44 (UK)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="whatsapp">WhatsApp Number</Label>
              <Input
                id="whatsapp"
                type="tel"
                value={formData.whatsapp_number}
                onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                placeholder="12345678"
              />
              <p className="text-xs text-muted-foreground">
                Your clients will see this number.
              </p>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold text-lg">Social Media</h3>
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname (e.g. Instagram Handle)</Label>
              <Input
                id="nickname"
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="@username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram URL</Label>
              <Input
                id="instagram_url"
                type="url"
                value={formData.instagram_url}
                onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                placeholder="https://instagram.com/username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok_url">TikTok URL</Label>
              <Input
                id="tiktok_url"
                type="url"
                value={formData.tiktok_url}
                onChange={(e) => setFormData({ ...formData, tiktok_url: e.target.value })}
                placeholder="https://tiktok.com/@username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapchat_url">Snapchat URL</Label>
              <Input
                id="snapchat_url"
                type="url"
                value={formData.snapchat_url}
                onChange={(e) => setFormData({ ...formData, snapchat_url: e.target.value })}
                placeholder="https://snapchat.com/add/username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube_url">YouTube URL</Label>
              <Input
                id="youtube_url"
                type="url"
                value={formData.youtube_url}
                onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                placeholder="https://youtube.com/@username"
              />
            </div>
          </div>
          
          <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Update Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
