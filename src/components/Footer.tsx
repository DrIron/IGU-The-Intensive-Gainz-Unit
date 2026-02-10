import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Instagram, Youtube, Music2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CoachApplicationForm } from "@/components/CoachApplicationForm";
import { supabase } from "@/integrations/supabase/client";
import { getUTMParams } from "@/lib/utm";
import { useToast } from "@/hooks/use-toast";

export function Footer() {
  const [showCoachApplication, setShowCoachApplication] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation('nav');

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;

    setNewsletterLoading(true);
    try {
      const utmParams = getUTMParams();
      const { error } = await supabase.from("leads").insert({
        email: newsletterEmail.trim().toLowerCase(),
        source: "newsletter",
        ...utmParams,
      });

      if (error) {
        if (error.code === "23505") {
          // Duplicate email
          toast({
            title: t('common:alreadySubscribed'),
            description: t('common:alreadySubscribedDesc'),
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: t('common:subscribed'),
          description: t('common:subscribedDesc'),
        });
        setNewsletterEmail("");
      }
    } catch (error: any) {
      toast({
        title: t('common:error'),
        description: t('common:failedToSubscribe'),
        variant: "destructive",
      });
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <>
      <footer className="bg-card border-t mt-20 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* About Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t('aboutIGU')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('aboutIGUDescription')}
              </p>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t('quickLinks')}</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/services" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('ourPrograms')}
                  </Link>
                </li>
                <li>
                  <Link to="/meet-our-team" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('meetOurTeam')}
                  </Link>
                </li>
                <li>
                  <Link to="/calorie-calculator" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('calorieCalculator')}
                  </Link>
                </li>
                <li>
                  <Link to="/testimonial" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('clientSuccessStories')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact & Social */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t('connectWithUs')}</h3>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <strong>{t('common:email')}:</strong>{" "}
                  <a
                    href="mailto:Dr.Ironofficial@gmail.com"
                    className="hover:text-foreground transition-colors"
                  >
                    Dr.Ironofficial@gmail.com
                  </a>
                </p>

                <div className="flex gap-4 pt-2">
                  <a
                    href="https://www.instagram.com/dr.irontraining/?hl=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-6 w-6" />
                  </a>
                  <a
                    href="https://www.tiktok.com/@dr.irontraining?lang=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                    aria-label="TikTok"
                  >
                    <Music2 className="h-6 w-6" />
                  </a>
                  <a
                    href="https://www.youtube.com/@dr.irontraining"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                    aria-label="YouTube"
                  >
                    <Youtube className="h-6 w-6" />
                  </a>
                </div>
              </div>
            </div>

            {/* Join Our Team */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t('joinOurTeam')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('joinOurTeamDescription')}
              </p>
              <Button
                onClick={() => setShowCoachApplication(true)}
                className="w-full"
              >
                {t('applyAsCoach')}
              </Button>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('trainingTipsUpdates')}
                </p>
                <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={t('common:yourEmail')}
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    className="flex-1"
                    required
                  />
                  <Button type="submit" size="sm" disabled={newsletterLoading}>
                    {newsletterLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('common:subscribe')
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>
              {t('copyright', { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>

      <CoachApplicationForm
        open={showCoachApplication}
        onOpenChange={setShowCoachApplication}
      />
    </>
  );
}
