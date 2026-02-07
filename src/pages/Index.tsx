import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ServiceCard } from "@/components/ServiceCard";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { useAuthNavigation } from "@/hooks/useAuthNavigation";
import { Dumbbell, Star, ChevronLeft, ChevronRight, Target, MessageSquare, Apple, TrendingUp, FlaskConical, Calendar } from "lucide-react";
import gymHeroBg from "@/assets/gym-hero-bg.jpg";
import { useIsMobile } from "@/hooks/use-mobile";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSiteContent, parseJsonField } from "@/hooks/useSiteContent";
import { useFadeUp } from "@/hooks/useFadeUp";
import { FAQSection } from "@/components/marketing/FAQSection";
import { HowItWorksSection } from "@/components/marketing/HowItWorksSection";

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

  // CMS content
  const { data: cmsContent, isLoading: cmsLoading } = useSiteContent("homepage");

  // Fade-up animations for sections
  const heroFade = useFadeUp();
  const featuresFade = useFadeUp();
  const programsFade = useFadeUp();
  const testimonialsFade = useFadeUp();
  const ctaFade = useFadeUp();

  // Feature icon mapping
  const featureIcons: Record<string, React.ElementType> = {
    Target,
    MessageSquare,
    Apple,
    TrendingUp,
    FlaskConical,
    Calendar,
  };

  const checkUserAndRedirect = useCallback(async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser) {
        // Authenticated users should go to their dashboard
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id);

        const roleList = roles?.map(r => r.role) || [];

        if (roleList.includes("admin")) {
          navigate("/admin", { replace: true });
          return;
        } else if (roleList.includes("coach")) {
          navigate("/coach", { replace: true });
          return;
        } else {
          // Regular client - go to dashboard (onboarding guard will redirect if needed)
          navigate("/dashboard", { replace: true });
          return;
        }
      }
    } catch (error) {
      console.error("Error checking user:", error);
    }

    // Not authenticated or error - show public home page
    setUser(null);
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    // Timeout to prevent hanging
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    checkUserAndRedirect();
    loadTeamPlanSettings();
    loadTestimonials();
    loadServices(); // Load services for all users (pricing is public)

    return () => clearTimeout(timeout);
  }, [checkUserAndRedirect]);

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
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${gymHeroBg})` }}
        />
        {/* Dark overlay with gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 grid-pattern opacity-30" />
        {/* Red radial glow */}
        <div className="absolute inset-0 red-glow" />

        <div
          ref={heroFade.ref}
          className={`relative z-10 text-center px-4 max-w-4xl mx-auto fade-up ${heroFade.isVisible ? 'visible' : ''}`}
        >
          {/* Badge */}
          {cmsContent?.hero?.badge && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <span className="text-sm font-medium text-primary">{cmsContent.hero.badge}</span>
            </div>
          )}

          {/* Title */}
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl tracking-tight mb-6 text-foreground">
            <span className="block">{cmsContent?.hero?.title_line1 || "THE INTENSIVE"}</span>
            <span className="block text-primary">{cmsContent?.hero?.title_line2 || "GAINZ UNIT"}</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto mb-10">
            {cmsContent?.hero?.subtitle || "Professional bodybuilding coaching tailored to your goals. Choose from team training or personalized 1:1 programs."}
          </p>

          <div className="flex flex-col items-center gap-4 px-4">
            {renderHeroCta()}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 bg-background relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-10" />
        <div
          ref={featuresFade.ref}
          className={`container mx-auto max-w-7xl relative z-10 fade-up ${featuresFade.isVisible ? 'visible' : ''}`}
        >
          <div className="text-center mb-16">
            <h2 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
              {cmsContent?.features?.title || "Why Choose IGU?"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {cmsContent?.features?.subtitle || "Everything you need for serious progress"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => {
              const title = cmsContent?.features?.[`feature_${i}_title`];
              const description = cmsContent?.features?.[`feature_${i}_description`];
              const iconName = cmsContent?.features?.[`feature_${i}_icon`] || "Target";
              const IconComponent = featureIcons[iconName] || Target;

              if (!title) return null;

              return (
                <div
                  key={i}
                  className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <IconComponent className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{title}</h3>
                  <p className="text-muted-foreground text-sm">{description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorksSection />

      {/* Services Section */}
      <section id="services" className="py-24 px-4 bg-muted/30">
        <div
          ref={programsFade.ref}
          className={`container mx-auto max-w-7xl fade-up ${programsFade.isVisible ? 'visible' : ''}`}
        >
          <div className="text-center mb-16">
            <h2 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
              {cmsContent?.programs?.title || "Choose Your Program"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {cmsContent?.programs?.subtitle || "Select the coaching plan that fits your goals and lifestyle"}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-pulse text-lg text-muted-foreground">Loading programs...</div>
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
      <section className="py-24 px-4 bg-background">
        <div
          ref={testimonialsFade.ref}
          className={`container mx-auto max-w-6xl fade-up ${testimonialsFade.isVisible ? 'visible' : ''}`}
        >
          <div className="text-center mb-16">
            <h2 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
              {cmsContent?.testimonials?.title || "What Our Clients Say"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {cmsContent?.testimonials?.subtitle || "Real results from real people"}
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

      {/* FAQ Section */}
      <FAQSection />

      {/* CTA Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-background to-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 red-glow opacity-50" />
        <div
          ref={ctaFade.ref}
          className={`container mx-auto max-w-4xl text-center relative z-10 fade-up ${ctaFade.isVisible ? 'visible' : ''}`}
        >
          <h2 className="font-display text-5xl md:text-7xl tracking-tight mb-6">
            {cmsContent?.cta?.title || "Ready to Transform?"}
          </h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            {cmsContent?.cta?.subtitle || "Join hundreds of athletes who have elevated their training with IGU coaching."}
          </p>
          <Button
            size="lg"
            className="text-lg px-8 py-6 font-semibold"
            onClick={() => {
              const servicesSection = document.getElementById("services");
              servicesSection?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {cmsContent?.cta?.button_text || "Start Your Journey"}
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
