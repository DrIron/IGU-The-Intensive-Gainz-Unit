import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CoachDetailDialog } from "@/components/CoachDetailDialog";
import { deriveCoachHeadline } from "@/components/coach/CoachPublicProfile";
import { MapPin, Award } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { useSiteContent } from "@/hooks/useSiteContent";

// Public coach profile - no sensitive contact info
interface Coach {
  id: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  short_bio: string | null;
  location: string | null;
  profile_picture_url: string | null;
  qualifications: string[] | null;
  specializations: string[] | null;
  nickname: string | null;
  is_head_coach: boolean | null;
  head_coach_specialisation: string | null;
  slug: string | null;
}

export default function MeetOurTeam() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getLabel } = useSpecializationTags();
  const { t } = useTranslation("common");

  // SEOHead rendered in JSX below

  // CMS content
  const { data: cmsContent } = useSiteContent("meet-our-team");

  useEffect(() => {
    fetchCoaches();
  }, []);

  const fetchCoaches = async () => {
    try {
      // Use coaches_directory view - public-safe fields only (no email, phone, DOB, capacity data)
      // Filters by active status and is accessible to authenticated users
      const { data, error } = await supabase
        .from("coaches_directory")
        .select("user_id, first_name, last_name, bio, short_bio, location, profile_picture_url, qualifications, specializations, nickname, is_head_coach, head_coach_specialisation, slug")
        .order("first_name");
      
      if (error) throw error;
      // Map user_id to id for component compatibility
      const mapped = (data || []).map(c => ({ ...c, id: c.user_id })) as Coach[];
      setCoaches(mapped);

      // Count-only review signal per coach (locked decision: no avg on cards to
      // avoid ranking coaches at a glance). Best-effort, parallel, anon-safe.
      const ids = mapped.map((c) => c.id).filter(Boolean) as string[];
      const aggregates = await Promise.all(
        ids.map((id) => supabase.rpc("get_coach_rating_aggregate", { p_coach_user_id: id })),
      );
      const counts: Record<string, number> = {};
      ids.forEach((id, i) => {
        const agg = aggregates[i]?.data as unknown as { count: number } | null;
        if (agg?.count) counts[id] = agg.count;
      });
      setReviewCounts(counts);
    } catch (error) {
      console.error("Error fetching coaches:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading our team...</p>
      </div>
    );
  }

  const handleCoachClick = (coach: Coach) => {
    setSelectedCoach(coach);
    setDialogOpen(true);
  };

  // Check if first coach is Dr. Hasan Dashti (the lead)
  const isLeadCoach = (coach: Coach) => {
    return coach.first_name.toLowerCase() === "hasan" && coach.last_name.toLowerCase() === "dashti";
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        page="meet-our-team"
        title="Coaching Team | Intensive Gainz Unit"
        description="Meet the IGU coaching team, their qualifications, and specializations."
      />
      <div className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
            {cmsContent?.hero?.title || "Meet Our Team"}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {cmsContent?.hero?.subtitle || "Expert coaches dedicated to your success"}
          </p>
        </div>

        {coaches.length === 0 ? (
          <div className="text-center py-16 max-w-md mx-auto">
            <p className="text-lg text-muted-foreground">
              Our coaching team is being assembled. Check back soon!
            </p>
          </div>
        ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {coaches.map((coach) => (
            <ClickableCard
              key={coach.id}
              ariaLabel={`View ${coach.first_name} ${coach.last_name}'s profile`}
              onClick={() => handleCoachClick(coach)}
              className={`transition-colors hover:border-primary/50 ${
                isLeadCoach(coach) ? "border-primary" : ""
              }`}
            >
              <CardHeader>
                <div className="flex items-start gap-4 mb-2">
                  <Avatar className={`h-16 w-16 border-2 ${isLeadCoach(coach) ? "border-primary" : "border-border"}`}>
                    <AvatarImage src={coach.profile_picture_url || undefined} loading="lazy" />
                    <AvatarFallback className={isLeadCoach(coach) ? "bg-primary/20 text-primary" : ""}>
                      {coach.first_name.slice(0, 1).toUpperCase()}{coach.last_name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{coach.first_name} {coach.last_name}</CardTitle>
                      {isLeadCoach(coach) && (
                        <Badge variant="default" className="text-xs">Lead</Badge>
                      )}
                    </div>
                    {coach.location && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3 mr-1" />
                        {coach.location}
                      </div>
                    )}
                    {coach.is_head_coach && coach.head_coach_specialisation && (
                      <p className="text-sm font-medium text-primary">
                        Head Coach -- {coach.head_coach_specialisation}
                      </p>
                    )}
                    {reviewCounts[coach.id] > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {reviewCounts[coach.id] === 1
                          ? t("coachReviewsCountOne", { defaultValue: "1 review" })
                          : t("coachReviewsCount", {
                              count: reviewCounts[coach.id],
                              defaultValue: "{{count}} reviews",
                            })}
                      </p>
                    )}
                  </div>
                </div>
                {coach.short_bio && (
                  <CardDescription className="text-sm line-clamp-3">{coach.short_bio}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {coach.qualifications && coach.qualifications.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Award className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-sm font-semibold">Certifications</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {coach.qualifications.slice(0, 2).map((qual, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-xs max-w-[180px] truncate"
                          title={qual}
                        >
                          {qual}
                        </Badge>
                      ))}
                      {coach.qualifications.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{coach.qualifications.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {coach.specializations && coach.specializations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Specializations</h4>
                    <div className="flex flex-wrap gap-2">
                      {coach.specializations.slice(0, 3).map((spec, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {getLabel(spec)}
                        </Badge>
                      ))}
                      {coach.specializations.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{coach.specializations.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-xs text-primary font-medium">Click to view full profile</p>
              </CardContent>
            </ClickableCard>
          ))}
        </div>
        )}

        <CoachDetailDialog
          coach={
            selectedCoach
              ? {
                  firstName: selectedCoach.first_name,
                  lastName: selectedCoach.last_name,
                  nickname: selectedCoach.nickname,
                  headline: deriveCoachHeadline({
                    isHeadCoach: selectedCoach.is_head_coach,
                    headCoachSpecialisation: selectedCoach.head_coach_specialisation,
                    coachLevel: null,
                    primarySpecialty: selectedCoach.specializations?.map(getLabel)[0] ?? null,
                  }),
                  avatarUrl: selectedCoach.profile_picture_url,
                  location: selectedCoach.location,
                  bio: selectedCoach.bio,
                  shortBio: selectedCoach.short_bio,
                  specializations: selectedCoach.specializations?.map(getLabel) ?? [],
                  qualifications: selectedCoach.qualifications ?? [],
                }
              : null
          }
          profileHref={selectedCoach?.slug ? `/coaches/${selectedCoach.slug}` : undefined}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </div>
    </div>
  );
}
