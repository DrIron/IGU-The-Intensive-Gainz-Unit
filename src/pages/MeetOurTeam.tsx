import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CoachDetailDialog } from "@/components/CoachDetailDialog";
import { MapPin } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
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
}

export default function MeetOurTeam() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getLabel } = useSpecializationTags();

  useDocumentTitle({
    title: "Coaching Team | Intensive Gainz Unit",
    description: "Meet the IGU coaching team, their qualifications, and specializations.",
  });

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
        .select("user_id, first_name, last_name, bio, short_bio, location, profile_picture_url, qualifications, specializations, nickname")
        .order("first_name");
      
      if (error) throw error;
      // Map user_id to id for component compatibility
      setCoaches((data || []).map(c => ({ ...c, id: c.user_id })) as Coach[]);
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
      <div className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
            {cmsContent?.hero?.title || "Meet Our Team"}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {cmsContent?.hero?.subtitle || "Expert coaches dedicated to your success"}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {coaches.map((coach) => (
            <Card
              key={coach.id}
              className={`hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02] ${
                isLeadCoach(coach) ? "border-primary/50 ring-1 ring-primary/20" : ""
              }`}
              onClick={() => handleCoachClick(coach)}
            >
              <CardHeader>
                <div className="flex items-start gap-4 mb-2">
                  <Avatar className={`h-16 w-16 border-2 ${isLeadCoach(coach) ? "border-primary" : "border-border"}`}>
                    <AvatarImage src={coach.profile_picture_url || undefined} />
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
                  </div>
                </div>
                {coach.short_bio && (
                  <CardDescription className="text-sm line-clamp-3">{coach.short_bio}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
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
            </Card>
          ))}
        </div>
        
        <CoachDetailDialog 
          coach={selectedCoach}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </div>
    </div>
  );
}
