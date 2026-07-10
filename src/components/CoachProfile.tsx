import { useState, useEffect, useCallback, useRef } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Plus, X } from "lucide-react";
import { calculateAge, formatDateForInput } from "@/lib/dateUtils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { CoachServiceAvailability } from "@/components/coach/CoachServiceAvailability";
import { SpecializationTagPicker } from "@/components/ui/SpecializationTagPicker";
import { GymPicker } from "@/components/ui/GymPicker";
import { computeProfileStrength } from "@/lib/coachProfileStrength";
import { isAllowedVideoUrl } from "@/lib/videoUrl";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { CoachPublicProfile, deriveCoachHeadline } from "@/components/coach/CoachPublicProfile";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "@/components/ui/responsive-dialog";

interface CoachData {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  location: string | null;
  bio: string | null;
  short_bio: string | null;
  profile_picture_url: string | null;
  qualifications: string[] | null;
  specializations: string[] | null;
  nickname: string | null;
  intro_video_url: string | null;
  years_experience: number | null;
  // Read-only (admin-assigned) — not in the form; drives the Preview headline.
  is_head_coach: boolean | null;
  head_coach_specialisation: string | null;
  coach_level: string | null;
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

// Soft display-only caps (§5.3 — no DB CHECK, never block save).
const SHORT_BIO_CAP = 160;
const BIO_CAP = 600;
const MAX_SPECIALIZATIONS = 15;

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().url().safeParse(v).success, { message: "Enter a valid URL" });

const coachProfileSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  nickname: z.string(),
  location: z.string(),
  short_bio: z.string(),
  bio: z.string(),
  specializations: z.array(z.string()),
  qualifications: z.array(z.object({ value: z.string() })),
  years_experience: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,2}$/.test(v) && Number(v) >= 0 && Number(v) <= 70), {
      message: "Enter a whole number of years (0–70)",
    }),
  intro_video_url: z
    .string()
    .trim()
    .refine((v) => v === "" || isAllowedVideoUrl(v), { message: "Use a YouTube, Vimeo, or .mp4 link" }),
  whatsapp_country_code: z.string(),
  whatsapp_number: z.string(),
  gender: z.string(),
  date_of_birth: z.string(),
  instagram_url: optionalUrl,
  tiktok_url: optionalUrl,
  snapchat_url: optionalUrl,
  youtube_url: optionalUrl,
});

type CoachProfileForm = z.infer<typeof coachProfileSchema>;

const EMPTY_FORM: CoachProfileForm = {
  first_name: "",
  nickname: "",
  location: "",
  short_bio: "",
  bio: "",
  specializations: [],
  qualifications: [],
  years_experience: "",
  intro_video_url: "",
  whatsapp_country_code: "+965",
  whatsapp_number: "",
  gender: "",
  date_of_birth: "",
  instagram_url: "",
  tiktok_url: "",
  snapchat_url: "",
  youtube_url: "",
};

/** Section heading — mono uppercase with a top-border divider (mockup .sechead). */
function SectionHead({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <h3
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground mt-6 pt-4 border-t border-border",
        first && "mt-0 pt-0 border-t-0",
      )}
    >
      {children}
    </h3>
  );
}

/** Soft counter (mockup .counter) — warns past the cap but never blocks. */
function Counter({ n, max, suffix }: { n: number; max: number; suffix?: string }) {
  const over = n > max;
  return (
    <p className={cn("font-mono text-[11px] mt-1.5", over ? "text-destructive" : "text-muted-foreground")}>
      <b className={cn("font-medium", over ? "text-destructive" : "text-primary")}>{n}</b> / {max}
      {suffix ? ` ${suffix}` : ""}
    </p>
  );
}

export default function CoachProfile() {
  const { toast } = useToast();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [contactData, setContactData] = useState<CoachContactData | null>(null);
  const [coachData, setCoachData] = useState<CoachData | null>(null);
  const [gymCount, setGymCount] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const { getLabel } = useSpecializationTags();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<CoachProfileForm>({
    resolver: zodResolver(coachProfileSchema),
    defaultValues: EMPTY_FORM,
  });

  const { fields: qualFields, append: appendQual, remove: removeQual } = useFieldArray({
    control,
    name: "qualifications",
  });

  const loadCoach = useCallback(async () => {
    if (!sessionUser) return;
    try {
      const { data, error } = await supabase
        .from("coaches_public")
        .select(
          "id, user_id, first_name, last_name, location, bio, short_bio, profile_picture_url, qualifications, specializations, nickname, intro_video_url, years_experience, is_head_coach, head_coach_specialisation, coach_level",
        )
        .eq("user_id", sessionUser.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setCoachData(null);
        return; // No coach profile row — self-gate below renders nothing.
      }

      setCoachData(data);

      const { data: contact } = await supabase
        .from("coaches_private")
        .select("email, whatsapp_number, date_of_birth, gender, instagram_url, tiktok_url, snapchat_url, youtube_url")
        .eq("user_id", data.user_id)
        .maybeSingle();

      setContactData(contact ?? null);

      // Gym count feeds the completeness meter (GymPicker owns its own writes).
      const { count } = await supabase
        .from("coach_gyms")
        .select("*", { count: "exact", head: true })
        .eq("coach_user_id", data.user_id);
      setGymCount(count ?? 0);

      // Split the stored "+965 12345678" WhatsApp back into code + number.
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

      // Qualifications: split any legacy multi-line entries into rows (back-compat).
      const qualRows = (data.qualifications || [])
        .flatMap((q) => q.split("\n"))
        .map((q) => q.trim())
        .filter(Boolean)
        .map((value) => ({ value }));

      reset({
        first_name: data.first_name,
        nickname: data.nickname || "",
        location: data.location || "",
        short_bio: data.short_bio || "",
        bio: data.bio || "",
        specializations: data.specializations || [],
        qualifications: qualRows,
        years_experience: data.years_experience != null ? String(data.years_experience) : "",
        intro_video_url: data.intro_video_url || "",
        whatsapp_country_code: extractedCode,
        whatsapp_number: extractedNumber,
        gender: contact?.gender || "",
        date_of_birth: formatDateForInput(contact?.date_of_birth),
        instagram_url: contact?.instagram_url || "",
        tiktok_url: contact?.tiktok_url || "",
        snapchat_url: contact?.snapchat_url || "",
        youtube_url: contact?.youtube_url || "",
      });
    } catch (error) {
      console.error("Error fetching coach data:", error);
    }
  }, [sessionUser, reset]);

  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    if (loadedFor.current === sessionUser.id) return;
    loadedFor.current = sessionUser.id;
    loadCoach();
  }, [sessionLoading, sessionUser, loadCoach]);

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !coachData) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${coachData.user_id}/profile.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("coach-profiles")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("coach-profiles").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("coaches_public")
        .update({ profile_picture_url: publicUrl })
        .eq("id", coachData.id);
      if (updateError) throw updateError;

      setCoachData((prev) => (prev ? { ...prev, profile_picture_url: publicUrl } : prev));
      toast({ title: "Success", description: "Profile picture updated successfully" });
    } catch (error) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: CoachProfileForm) => {
    if (!coachData) return;
    setLoading(true);
    try {
      const fullWhatsApp = values.whatsapp_number
        ? `${values.whatsapp_country_code} ${values.whatsapp_number}`
        : "";
      const qualifications = values.qualifications.map((q) => q.value.trim()).filter(Boolean);
      const yearsExperience = values.years_experience === "" ? null : Number(values.years_experience);

      // Public profile — coaches_public (allowed self-service single-table write per CLAUDE.md).
      const { error } = await supabase
        .from("coaches_public")
        .update({
          first_name: values.first_name,
          location: values.location,
          bio: values.bio,
          short_bio: values.short_bio,
          qualifications,
          specializations: values.specializations,
          nickname: values.nickname,
          intro_video_url: values.intro_video_url.trim() || null,
          years_experience: yearsExperience,
        })
        .eq("id", coachData.id);
      if (error) throw error;

      // Private contact info — coaches_private (keyed on user_id; coach_public_id
      // drops in Phase 3). Surface a toast on failure instead of a silent console.
      const { error: contactError } = await supabase
        .from("coaches_private")
        .update({
          gender: values.gender || null,
          whatsapp_number: fullWhatsApp,
          date_of_birth: values.date_of_birth || null,
          instagram_url: values.instagram_url || null,
          tiktok_url: values.tiktok_url || null,
          snapchat_url: values.snapchat_url || null,
          youtube_url: values.youtube_url || null,
        })
        .eq("user_id", coachData.user_id);
      if (contactError) {
        console.error("Error updating contact info:", contactError);
        toast({
          title: "Contact details didn't save",
          description: sanitizeErrorForUser(contactError),
          variant: "destructive",
        });
      }

      setCoachData((prev) =>
        prev
          ? {
              ...prev,
              first_name: values.first_name,
              location: values.location,
              bio: values.bio,
              short_bio: values.short_bio,
              qualifications,
              specializations: values.specializations,
              nickname: values.nickname,
              intro_video_url: values.intro_video_url.trim() || null,
              years_experience: yearsExperience,
            }
          : prev,
      );

      if (!contactError) {
        toast({ title: "Success", description: "Profile updated successfully" });
      }
    } catch (error) {
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Self-gate: render nothing when there's no coaches_public row (pure specialist).
  if (!coachData) return null;

  const values = watch();
  const strength = computeProfileStrength({
    profile_picture_url: coachData.profile_picture_url,
    short_bio: values.short_bio,
    bio: values.bio,
    specializations: values.specializations,
    qualifications: (values.qualifications || []).map((q) => q.value).filter(Boolean),
    location: values.location,
    years_experience:
      values.years_experience && /^\d+$/.test(values.years_experience) ? Number(values.years_experience) : null,
    intro_video_url: values.intro_video_url,
    gym_count: gymCount,
    social_links: [values.instagram_url, values.tiktok_url, values.snapchat_url, values.youtube_url],
  });

  const savingLabel = loading ? "Saving..." : "Save";

  // Preview card — built from LIVE form state (not a fetch) so the coach sees
  // the client-facing card while editing (§5.4). rating/reviewCount omitted →
  // "New coach" state. Gyms omitted here: GymPicker owns its own selection and
  // doesn't lift it into form state — the real /coach/:slug page (T2) fetches
  // them. TODO(CPR2): lift gym selection into form state to show it in Preview.
  const previewSpecializations = (values.specializations || []).map((v) => getLabel(v));
  const previewCoach = {
    firstName: values.first_name || coachData.first_name,
    lastName: coachData.last_name,
    nickname: values.nickname || null,
    headline: deriveCoachHeadline({
      isHeadCoach: coachData.is_head_coach,
      headCoachSpecialisation: coachData.head_coach_specialisation,
      coachLevel: coachData.coach_level,
      primarySpecialty: previewSpecializations[0] ?? null,
    }),
    avatarUrl: coachData.profile_picture_url,
    location: values.location || null,
    bio: values.bio || null,
    shortBio: values.short_bio || null,
    specializations: previewSpecializations,
    qualifications: (values.qualifications || []).map((q) => q.value.trim()).filter(Boolean),
    socials: {
      instagram: values.instagram_url || null,
      tiktok: values.tiktok_url || null,
      youtube: values.youtube_url || null,
      snapchat: values.snapchat_url || null,
    },
    introVideoUrl: values.intro_video_url || null,
    yearsExperience:
      values.years_experience && /^\d+$/.test(values.years_experience) ? Number(values.years_experience) : null,
    clientCount: null,
  };

  return (
    <div className="space-y-6">
      <Card>
        {/* Sticky Preview/Save header + completeness meter (§5.1).
            No overflow-hidden on the Card — it would disable position:sticky. */}
        <div className="sticky top-0 z-20 rounded-t-lg bg-card/95 backdrop-blur border-b border-border px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Edit profile</CardTitle>
              <p className="text-sm text-muted-foreground">Your public coach profile</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
              <Button type="button" size="sm" onClick={handleSubmit(onSubmit)} disabled={loading}>
                {savingLabel}
              </Button>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>Profile strength</span>
              <b className="font-medium text-status-ontrack">{strength.pct}% complete</b>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-status-ontrack transition-all"
                style={{ width: `${strength.pct}%` }}
              />
            </div>
          </div>
        </div>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {/* Identity */}
            <SectionHead first>Identity</SectionHead>
            <div className="flex flex-col items-center space-y-3 py-2">
              <Avatar className="h-20 w-20">
                <AvatarImage src={coachData.profile_picture_url || undefined} />
                <AvatarFallback>
                  {coachData.first_name?.slice(0, 1).toUpperCase() || ""}
                  {coachData.last_name?.slice(0, 1).toUpperCase() || ""}
                </AvatarFallback>
              </Avatar>
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
                    {uploading ? "Uploading..." : "Change photo"}
                  </span>
                </Button>
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={contactData?.email || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" type="text" {...register("first_name")} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input id="nickname" type="text" placeholder="e.g. Coach Iron" {...register("nickname")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" type="text" placeholder="e.g. Kuwait City" {...register("location")} />
            </div>

            {/* Bio */}
            <SectionHead>Bio</SectionHead>
            <div className="space-y-2">
              <Label htmlFor="short_bio">Short bio (team-page card)</Label>
              <Textarea
                id="short_bio"
                {...register("short_bio")}
                placeholder="Brief description for your profile card"
                rows={2}
              />
              <Counter n={(values.short_bio || "").length} max={SHORT_BIO_CAP} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Full bio</Label>
              <Textarea
                id="bio"
                {...register("bio")}
                placeholder="Tell clients about your coaching in detail"
                rows={4}
              />
              <Counter n={(values.bio || "").length} max={BIO_CAP} />
            </div>

            {/* Specializations */}
            <SectionHead>Specializations</SectionHead>
            <p className="text-xs text-muted-foreground">Shown to clients &amp; used for matching.</p>
            <Controller
              control={control}
              name="specializations"
              render={({ field }) => (
                <SpecializationTagPicker
                  selectedTags={field.value}
                  onToggle={(tagValue) =>
                    field.onChange(
                      field.value.includes(tagValue)
                        ? field.value.filter((v) => v !== tagValue)
                        : [...field.value, tagValue],
                    )
                  }
                  maxTags={MAX_SPECIALIZATIONS}
                  showCounter={false}
                />
              )}
            />
            <Counter n={(values.specializations || []).length} max={MAX_SPECIALIZATIONS} suffix="selected" />

            {/* Trains at */}
            <SectionHead>Trains at</SectionHead>
            <p className="text-xs text-muted-foreground">
              Clients matched by gym for in-person / hybrid. Optional for online-only coaches.
            </p>
            <GymPicker coachUserId={coachData.user_id} />

            {/* Qualifications */}
            <SectionHead>Qualifications</SectionHead>
            <div className="space-y-2">
              {qualFields.length === 0 && (
                <p className="text-xs text-muted-foreground">No qualifications yet — add your certifications below.</p>
              )}
              {qualFields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <Input
                    type="text"
                    placeholder="e.g. ACE-CPT · Sports Nutrition Specialist"
                    {...register(`qualifications.${i}.value` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeQual(i)}
                    aria-label="Remove qualification"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => appendQual({ value: "" })}>
                <Plus className="h-4 w-4 mr-2" />
                Add qualification
              </Button>
            </div>

            {/* Experience */}
            <SectionHead>Experience</SectionHead>
            <div className="space-y-2">
              <Label htmlFor="years_experience">Years of experience</Label>
              <Input
                id="years_experience"
                type="number"
                min={0}
                max={70}
                inputMode="numeric"
                placeholder="e.g. 10"
                {...register("years_experience")}
              />
              <p className="text-xs text-muted-foreground">Shown on your public profile.</p>
              {errors.years_experience && (
                <p className="text-xs text-destructive">{errors.years_experience.message}</p>
              )}
            </div>

            {/* Intro video */}
            <SectionHead>Intro video</SectionHead>
            <div className="space-y-2">
              <Label htmlFor="intro_video_url">Intro video URL</Label>
              <Input
                id="intro_video_url"
                type="url"
                placeholder="https://youtube.com/watch?v=..."
                {...register("intro_video_url")}
              />
              <p className="text-xs text-muted-foreground">A 30-sec intro clients see on your profile.</p>
              {errors.intro_video_url && (
                <p className="text-xs text-destructive">{errors.intro_video_url.message}</p>
              )}
            </div>

            {/* Contact & social */}
            <SectionHead>Contact &amp; social</SectionHead>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp_country_code">WhatsApp code</Label>
                <Controller
                  control={control}
                  name="whatsapp_country_code"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="whatsapp">WhatsApp number</Label>
                <Input id="whatsapp" type="tel" placeholder="12345678" {...register("whatsapp_number")} />
                <p className="text-xs text-muted-foreground">Your clients will see this number.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of birth</Label>
                <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
                {values.date_of_birth && (
                  <p className="text-sm text-muted-foreground">Age: {calculateAge(values.date_of_birth)} years</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="gender">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram</Label>
              <Input
                id="instagram_url"
                type="url"
                placeholder="https://instagram.com/username"
                {...register("instagram_url")}
              />
              {errors.instagram_url && <p className="text-xs text-destructive">{errors.instagram_url.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok_url">TikTok</Label>
              <Input id="tiktok_url" type="url" placeholder="https://tiktok.com/@username" {...register("tiktok_url")} />
              {errors.tiktok_url && <p className="text-xs text-destructive">{errors.tiktok_url.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapchat_url">Snapchat</Label>
              <Input
                id="snapchat_url"
                type="url"
                placeholder="https://snapchat.com/add/username"
                {...register("snapchat_url")}
              />
              {errors.snapchat_url && <p className="text-xs text-destructive">{errors.snapchat_url.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube_url">YouTube</Label>
              <Input
                id="youtube_url"
                type="url"
                placeholder="https://youtube.com/@username"
                {...register("youtube_url")}
              />
              {errors.youtube_url && <p className="text-xs text-destructive">{errors.youtube_url.message}</p>}
            </div>

            <div className="pt-6 mt-6 border-t border-border">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <CoachServiceAvailability coachUserId={coachData.user_id} />

      {/* Live preview of the public card (§5.4) — desktop Dialog / mobile Drawer. */}
      <ResponsiveDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <ResponsiveDialogContent
          title="Profile preview"
          description="How clients see your profile. Rating appears once you have reviews."
          className="sm:max-w-md"
        >
          <div className="pb-2">
            <CoachPublicProfile coach={previewCoach} variant="preview" />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
