import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ServiceCard } from "@/components/ServiceCard";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { useAuthNavigation } from "@/hooks/useAuthNavigation";
import { Dumbbell, Star, ChevronLeft, ChevronRight } from "lucide-react";
import gymHeroBg from "@/assets/gym-hero-bg.jpg";
import { useIsMobile } from "@/hooks/use-mobile";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

interface Service {
  id: string;
  name: string;
  type: string;
  price_kwd: number;
  description: string;
  features: string[];
}

interface Testimonial {
  id: string;
  rating: number;
  feedback: string;
  user_id: string;
  coach_id: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
  };
  coaches?: {
    first_name: string;
    last_name: string;
  };
}

interface Profile {
  id: string;
  status: string | null;
}

interface Subscription {
  id: string;
  status: string | null;
}

// Helper to derive CTA variant based on user status
type HeroCtaVariant = 'logged_out' | 'active' | 'inactive_cancelled' | 'other';

function getHeroCtaVariant(
  user: any,
  profile: Profile | null,
  subscription: Subscription | null
): HeroCtaVariant {
  if (!user) return 'logged_out';
  
  const profileStatus = profile?.status;
  const subStatus = subscription?.status;
  
  const hasActiveSubscription = profileStatus === 'active' && subStatus === 'active';
  const isInactiveOrCancelled = 
    ['inactive', 'cancelled', 'expired'].includes(profileStatus || '') ||
    ['inactive', 'cancelled', 'expired'].includes(subStatus || '');
  
  if (hasActiveSubscription) return 'active';
  if (isInactiveOrCancelled) return 'inactive_cancelled';
  return 'other'; // pending_payment, pending_coach_approval, needs_medical_review, etc.
}

export default function Index() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { goToAuthOrDashboard } = useAuthNavigation();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [teamPlansOpen, setTeamPlansOpen] = useState(true);
  const [teamPlanAnnouncement, setTeamPlanAnnouncement] = useState<{
    startDate: string | null;
    text: string | null;
  }>({ startDate: null, text: null });
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const isMobile = useIsMobile();

  useDocumentTitle({
    title: "Intensive Gainz Unit | Coaching for Serious Lifters",
    description: "Evidence-based online coaching, team programs, and performance tracking for serious lifters. Built by Dr. Iron.",
  });

  useEffect(() => {
    checkUserAndLoadServices();
    loadTeamPlanSettings();
    loadTestimonials();
  }, []);

  const checkUserAndLoadServices = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);
    
    if (currentUser) {
      // Fetch profile status - use profiles_public (client's own data, RLS protected)
      const { data: profileData } = await supabase
        .from("profiles_public")
        .select("id, status")
        .eq("id", currentUser.id)
        .single();
      
      setProfile(profileData);
      
      // Fetch latest subscription status
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("id, status")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setSubscription(subData);
      
      // User is authenticated, load services
      await loadServices();
    } else {
      // No authenticated user - services won't load due to RLS
      setLoading(false);
    }
  };

  const loadTeamPlanSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('team_plan_settings')
        .select('is_registration_open, next_program_start_date, announcement_text')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setTeamPlansOpen(data.is_registration_open ?? true);
        setTeamPlanAnnouncement({
          startDate: data.next_program_start_date,
          text: data.announcement_text,
        });
      } else {
        // No settings row configured yet; use sensible defaults
        setTeamPlansOpen(true);
        setTeamPlanAnnouncement({ startDate: null, text: null });
      }
    } catch (error: any) {
      console.error('Error loading team plan settings:', error);
    }
  };

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("type", { ascending: true })
        .order("price_kwd", { ascending: true });

      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading services",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTestimonials = async () => {
    try {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .eq("is_approved", true)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) throw error;

      // Fetch related data separately
      const testimonialsWithDetails = await Promise.all(
        (data || []).map(async (testimonial) => {
          // Use profiles_private for full_name (testimonials are public display, admin can access)
          const { data: profile } = await supabase
            .from("profiles_private")
            .select("full_name")
            .eq("profile_id", testimonial.user_id)
            .maybeSingle();

          let coach = null;
          if (testimonial.coach_id) {
            // Use coaches_directory (public-safe view) for testimonial display
            const { data: coachData } = await supabase
              .from("coaches_directory")
              .select("first_name, last_name")
              .eq("user_id", testimonial.coach_id)
              .maybeSingle();
            coach = coachData;
          }

          return {
            ...testimonial,
            profiles: profile,
            coaches: coach,
          };
        })
      );

      setTestimonials(testimonialsWithDetails);
    } catch (error: any) {
      console.error("Error loading testimonials:", error);
    }
  };

  const handleServiceSelect = async (serviceId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // User is logged in, go to onboarding
      navigate(`/onboarding?service=${serviceId}`);
    } else {
      // User needs to sign up first
      navigate(`/auth?service=${serviceId}&tab=signup`);
    }
  };

  // Derive CTA variant for hero
  const ctaVariant = getHeroCtaVariant(user, profile, subscription);

  // Render hero CTA based on variant
  const renderHeroCta = () => {
    switch (ctaVariant) {
      case 'logged_out':
        return (
          <>
            <Button 
              variant="hero" 
              size="xl" 
              className="w-full sm:w-auto"
              onClick={() => {
                const servicesSection = document.getElementById('services');
                servicesSection?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Choose Your Plan
            </Button>
            <p className="text-white/80 text-sm md:text-base mt-3" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)' }}>
              Already a client?{" "}
              <button
                onClick={() => goToAuthOrDashboard(user)}
                className="text-white font-medium underline underline-offset-2 hover:text-primary transition-colors"
              >
                Log in to your dashboard
              </button>
            </p>
          </>
        );
      
      case 'active':
        return (
          <>
            <Button 
              variant="hero" 
              size="xl" 
              className="w-full sm:w-auto"
              onClick={() => navigate("/dashboard")}
            >
              Go to Your Dashboard
            </Button>
            <p className="text-white/80 text-sm md:text-base mt-3" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)' }}>
              <Link
                to="/services"
                className="text-white font-medium underline underline-offset-2 hover:text-primary transition-colors"
              >
                View Services
              </Link>
            </p>
          </>
        );
      
      case 'inactive_cancelled':
        return (
          <>
            <Button 
              variant="hero" 
              size="xl" 
              className="w-full sm:w-auto"
              onClick={() => navigate("/services")}
            >
              Browse Plans & Restart
            </Button>
            <p className="text-white/80 text-sm md:text-base mt-3" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)' }}>
              <a
                href="mailto:support@theigu.com"
                className="text-white font-medium underline underline-offset-2 hover:text-primary transition-colors"
              >
                Contact Support
              </a>
            </p>
          </>
        );
      
      case 'other':
      default:
        // Pending states - send to dashboard which handles detailed messaging
        return (
          <>
            <Button 
              variant="hero" 
              size="xl" 
              className="w-full sm:w-auto"
              onClick={() => navigate("/dashboard")}
            >
              Go to Your Dashboard
            </Button>
            <p className="text-white/80 text-sm md:text-base mt-3" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)' }}>
              <a
                href="mailto:support@theigu.com"
                className="text-white font-medium underline underline-offset-2 hover:text-primary transition-colors"
              >
                Contact Support
              </a>
            </p>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />

      {/* Hero Section with CTA */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: `url(${gymHeroBg})`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-gradient-to-r from-primary to-accent shadow-lg">
              <Dumbbell className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-white" style={{ textShadow: '0 4px 20px rgba(0, 0, 0, 0.8), 0 2px 8px rgba(0, 0, 0, 0.6)' }}>
            The Intensive Gains Unit
          </h1>
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-6 mb-8 inline-block">
            <p className="text-xl md:text-2xl text-white font-medium max-w-2xl" style={{ textShadow: '0 2px 10px rgba(0, 0, 0, 0.8)' }}>
              Professional bodybuilding coaching tailored to your goals. Choose from team training or personalized 1:1 programs.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 px-4">
            {renderHeroCta()}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-20 px-4 bg-gradient-to-b from-background to-primary/5">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Choose Your Program</h2>
            <p className="text-xl text-muted-foreground">
              Select the coaching plan that fits your goals and lifestyle
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-pulse text-lg text-muted-foreground">Loading programs...</div>
            </div>
          ) : !user ? (
            /* Unauthenticated users see a CTA to sign in */
            <div className="text-center py-12 max-w-xl mx-auto">
              <div className="bg-card border rounded-2xl p-8 shadow-lg">
                <Dumbbell className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-2xl font-bold mb-3">View Our Programs</h3>
                <p className="text-muted-foreground mb-6">
                  Sign in or create an account to see our coaching programs and pricing.
                </p>
                <Button 
                  size="lg" 
                  onClick={() => navigate("/auth?redirect=/services")}
                  className="w-full sm:w-auto"
                >
                  Sign In to View Pricing
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Team Plans */}
              {teamPlansOpen && (
                <div className="mb-16">
                  <h3 className="text-4xl md:text-5xl font-bold mb-4 text-center">Team Training</h3>
                  {(teamPlanAnnouncement.text || teamPlanAnnouncement.startDate) && (
                    <div className="max-w-2xl mx-auto mb-8 p-4 bg-primary/10 border border-primary/20 rounded-lg text-center">
                      <p className="text-lg font-medium text-primary">
                        {teamPlanAnnouncement.text || 'Next team program starting soon!'}
                      </p>
                      {teamPlanAnnouncement.startDate && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Program starts: {new Date(teamPlanAnnouncement.startDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  {isMobile ? (
                    <Carousel className="w-full max-w-sm mx-auto">
                      <CarouselContent>
                        {services
                          .filter((service) => service.type === "team")
                          .map((service) => (
                            <CarouselItem key={service.id}>
                              <ServiceCard
                                name={service.name}
                                type={service.type}
                                price={service.price_kwd}
                                description={service.description}
                                features={service.features}
                                onSelect={() => handleServiceSelect(service.id)}
                              />
                            </CarouselItem>
                          ))}
                      </CarouselContent>
                      <CarouselPrevious />
                      <CarouselNext />
                    </Carousel>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                      {services
                        .filter((service) => service.type === "team")
                        .map((service) => (
                          <ServiceCard
                            key={service.id}
                            name={service.name}
                            type={service.type}
                            price={service.price_kwd}
                            description={service.description}
                            features={service.features}
                            onSelect={() => handleServiceSelect(service.id)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* 1:1 Plans */}
              <div>
                <h3 className="text-4xl md:text-5xl font-bold mb-8 text-center">1:1 Coaching</h3>
                {isMobile ? (
                  <Carousel className="w-full max-w-sm mx-auto">
                    <CarouselContent>
                      {services
                        .filter((service) => service.type === "one_to_one")
                        .map((service) => (
                          <CarouselItem key={service.id}>
                            <ServiceCard
                              name={service.name}
                              type={service.type}
                              price={service.price_kwd}
                              description={service.description}
                              features={service.features}
                              onSelect={() => handleServiceSelect(service.id)}
                            />
                          </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                ) : (
                  <div className="grid md:grid-cols-3 gap-6">
                    {services
                      .filter((service) => service.type === "one_to_one")
                      .map((service) => (
                        <ServiceCard
                          key={service.id}
                          name={service.name}
                          type={service.type}
                          price={service.price_kwd}
                          description={service.description}
                          features={service.features}
                          onSelect={() => handleServiceSelect(service.id)}
                        />
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 bg-background">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">What Our Clients Say</h2>
            <p className="text-xl text-muted-foreground">
              Real results from real people
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.length > 0 ? (
              testimonials.map((testimonial) => (
                <div key={testimonial.id} className="bg-card border border-border rounded-lg p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, index) => (
                      <Star
                        key={index}
                        className={`h-5 w-5 ${
                          index < testimonial.rating
                            ? "fill-primary text-primary"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4 italic">
                    &quot;{testimonial.feedback}&quot;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-lg font-bold text-primary">
                        {testimonial.profiles?.full_name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold">
                        {testimonial.profiles?.full_name || "Anonymous"}
                      </p>
                      {testimonial.coaches && (
                        <p className="text-sm text-muted-foreground">
                          Coach: {testimonial.coaches.first_name} {testimonial.coaches.last_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              [...Array(3)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, index) => (
                      <Star key={index} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4 italic">
                    &quot;Coming soon - your testimonial could be here! Join our coaching program and transform your fitness journey.&quot;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20" />
                    <div>
                      <p className="font-semibold">Client Name</p>
                      <p className="text-sm text-muted-foreground">Program Type</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
