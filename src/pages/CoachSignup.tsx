import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SpecializationTagPicker } from "@/components/ui/SpecializationTagPicker";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

const coachProfileSchema = z.object({
  bio: z.string()
    .min(50, "Bio must be at least 50 characters")
    .max(1000, "Bio must be less than 1000 characters")
    .trim(),
  qualifications: z.string()
    .min(20, "Please provide detailed qualifications")
    .max(2000, "Qualifications must be less than 2000 characters")
    .trim(),
  specializations: z.array(z.string())
    .min(1, "Please select at least one specialization")
    .max(15, "Maximum 15 specializations"),
});

export default function CoachSignup() {
  const [searchParams] = useSearchParams();
  const coachId = searchParams.get("coach_id");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [formData, setFormData] = useState({
    bio: "",
    qualifications: "",
    specializations: [] as string[],
  });

  const checkCoachAccess = useCallback(async (userId: string) => {
    if (!coachId) {
      toast({
        title: "Invalid access",
        description: "Missing coach ID parameter",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    // Verify coach profile exists and belongs to this user
    const { data: coach, error } = await supabase
      .from("coaches")
      .select("*")
      .eq("id", coachId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !coach) {
      toast({
        title: "Access denied",
        description: "You don't have permission to access this coach profile",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    // If coach profile is already active, redirect to dashboard
    if (coach.status === 'active') {
      toast({
        title: "Profile already completed",
        description: "Your coach profile is already active",
      });
      navigate("/dashboard");
    }
  }, [coachId, navigate, toast]);

  useEffect(() => {
    const initAuth = async () => {
      if (!coachId) {
        toast({
          title: "Invalid access",
          description: "Missing coach ID parameter",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      // Check if user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
      }

      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please set your password first via the email link",
          variant: "destructive",
        });
        navigate(`/auth`);
        return;
      }

      // User is authenticated, verify coach access
      await checkCoachAccess(session.user.id);
      setInitializing(false);
    };

    initAuth();
  }, [coachId, checkCoachAccess, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs
      const validation = coachProfileSchema.safeParse(formData);
      
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast({
          title: "Validation Error",
          description: firstError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const qualifications = formData.qualifications
        .split("\n")
        .filter(q => q.trim())
        .map(q => q.trim())
        .slice(0, 20); // Max 20 qualifications

      // Validate qualifications array is not empty after processing
      if (qualifications.length === 0) {
        throw new Error("Please provide at least one qualification");
      }

      // SECURITY: Do NOT update status - only admin can activate coaches
      // This prevents privilege escalation where coaches approve themselves
      const { error } = await supabase
        .from("coaches")
        .update({
          bio: formData.bio.trim(),
          qualifications,
          specializations: formData.specializations,
          // status field intentionally excluded - admin-only
        })
        .eq("id", coachId)
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Profile submitted!",
        description: "Your profile is pending admin approval. You'll be notified once approved.",
      });

      navigate("/dashboard");
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

  if (initializing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Complete Your Coach Profile</CardTitle>
          <CardDescription>
            Add your professional details to complete your profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself and your coaching philosophy..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={4}
                maxLength={1000}
                required
              />
              <p className="text-sm text-muted-foreground">
                {formData.bio.length}/1000 characters (minimum 50)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qualifications">Qualifications & Certifications</Label>
              <Textarea
                id="qualifications"
                placeholder="Enter each qualification on a new line&#10;Example:&#10;Certified Personal Trainer (NASM)&#10;Sports Nutrition Specialist&#10;BS in Exercise Science"
                value={formData.qualifications}
                onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                rows={6}
                maxLength={2000}
                required
              />
              <p className="text-sm text-muted-foreground">
                {formData.qualifications.length}/2000 characters - One qualification per line (max 20)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Specializations</Label>
              <SpecializationTagPicker
                selectedTags={formData.specializations}
                onToggle={(tagName) => {
                  const updated = formData.specializations.includes(tagName)
                    ? formData.specializations.filter(t => t !== tagName)
                    : [...formData.specializations, tagName];
                  setFormData({ ...formData, specializations: updated });
                }}
                maxTags={15}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete Profile
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
