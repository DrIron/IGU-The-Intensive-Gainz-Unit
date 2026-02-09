import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ServiceCard } from "@/components/ServiceCard";
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface Service {
  id: string;
  name: string;
  type: string;
  price_kwd: number;
  description: string;
  features: string[];
}

export default function Services() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamPlansOpen, setTeamPlansOpen] = useState(true);
  const isMobile = useIsMobile();

  useDocumentTitle({
    title: "Coaching Services | Intensive Gainz Unit",
    description: "Browse 1:1 coaching and team programs, including online coaching and Fe Squad.",
  });

  // CMS content
  const { data: cmsContent } = useSiteContent("services");

  const loadTeamPlanSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('team_plan_settings')
        .select('is_registration_open')
        .single();

      if (error) throw error;
      setTeamPlansOpen(data?.is_registration_open ?? true);
    } catch (error: any) {
      console.error('Error loading team plan settings:', error);
    }
  }, []);

  const loadServices = useCallback(async () => {
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
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const checkUserAndLoadData = useCallback(async () => {
    // Always load services (pricing is public for all users)
    await loadServices();
  }, [loadServices]);

  useEffect(() => {
    checkUserAndLoadData();
    loadTeamPlanSettings();
  }, [checkUserAndLoadData, loadTeamPlanSettings]);

  const handleServiceSelect = async (serviceId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Check user roles - admins and coaches cannot sign up for services
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (roles && roles.length > 0) {
        const userRoles = roles.map(r => r.role);
        if (userRoles.includes('admin') || userRoles.includes('coach')) {
          toast({
            title: "Access Denied",
            description: "Admins and coaches cannot sign up for services.",
            variant: "destructive",
          });
          return;
        }
      }

      // Check for active subscriptions
      const { data: activeSubscriptions } = await supabase
        .from('subscriptions')
        .select('id, status, services(name)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (activeSubscriptions && activeSubscriptions.length > 0) {
        toast({
          title: "Active Subscription Found",
          description: `You already have an active subscription (${activeSubscriptions[0].services?.name}). Please cancel your current subscription from your Account page before signing up for another service.`,
          variant: "destructive",
        });
        navigate("/account");
        return;
      }

      // User is logged in and eligible, go to onboarding
      navigate(`/onboarding?service=${serviceId}`);
    } else {
      // User needs to sign up first
      navigate(`/auth?service=${serviceId}&tab=signup`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-7xl">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
            {cmsContent?.hero?.title || "Our Coaching Programs"}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {cmsContent?.hero?.subtitle || "Find the perfect program for your fitness journey"}
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
                <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-4 text-center">
                  {cmsContent?.team?.title || "Team Training"}
                </h2>
                <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                  {cmsContent?.team?.subtitle || "Train with a community of dedicated athletes"}
                </p>
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
              <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-4 text-center">
                {cmsContent?.individual?.title || "1:1 Coaching"}
              </h2>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                {cmsContent?.individual?.subtitle || "Personalized attention for maximum results"}
              </p>
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

            {/* Comparison Table */}
            <div className="mt-20">
              <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-4 text-center">
                Compare Plans
              </h2>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                See what's included in each program
              </p>
              <div className="bg-card border border-border rounded-2xl p-6">
                <ComparisonTable />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
