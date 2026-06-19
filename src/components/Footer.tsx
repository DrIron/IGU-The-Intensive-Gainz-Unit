import { Suspense, useRef, useState } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useSocialLinks, getSocialIcon, getSocialLabel } from "@/hooks/useSocialLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getUTMParams } from "@/lib/utm";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/errorLogging";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

const CoachApplicationForm = lazyWithReload(() =>
  import("@/components/CoachApplicationForm").then(m => ({ default: m.CoachApplicationForm }))
);

export function Footer() {
  const [showCoachApplication, setShowCoachApplication] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const { toast } = useToast();
  const { t } = useTranslation('nav');
  const { data: socialLinks } = useSocialLinks();

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;

    setNewsletterLoading(true);
    try {
      const utmParams = getUTMParams();
      // B10-N1: route through the submit-lead edge fn for server-side Turnstile
      // verification. Returns an identical success shape for new + duplicate
      // emails (no info leakage), so we always show the success toast.
      const { data, error } = await supabase.functions.invoke("submit-lead", {
        body: {
          email: newsletterEmail.trim().toLowerCase(),
          source: "newsletter",
          turnstile_token: turnstileToken,
          ...utmParams,
        },
      });

      if (error || (data && data.error)) {
        throw error || new Error(data.error);
      }

      toast({
        title: t('common:subscribed'),
        description: t('common:subscribedDesc'),
      });
      setNewsletterEmail("");
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } catch (error: unknown) {
      captureException(error, { source: "Footer.handleNewsletterSubmit" });
      toast({
        title: t('common:error'),
        description: t('common:failedToSubscribe'),
        variant: "destructive",
      });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
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
                    href="mailto:info@theigu.com"
                    className="hover:text-foreground transition-colors"
                  >
                    info@theigu.com
                  </a>
                </p>

                {socialLinks && socialLinks.length > 0 && (
                  <div className="flex gap-4 pt-2">
                    {socialLinks.map((link) => {
                      const Icon = getSocialIcon(link.key);
                      return (
                        <a
                          key={link.key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary transition-colors"
                          aria-label={getSocialLabel(link.key)}
                        >
                          <Icon className="h-6 w-6" />
                        </a>
                      );
                    })}
                  </div>
                )}
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
                <form onSubmit={handleNewsletterSubmit} className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder={t('common:yourEmail')}
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      className="flex-1"
                      required
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={newsletterLoading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
                    >
                      {newsletterLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('common:subscribe')
                      )}
                    </Button>
                  </div>
                  {TURNSTILE_SITE_KEY && (
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken(null)}
                      options={{ theme: "dark", size: "flexible" }}
                    />
                  )}
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

      {showCoachApplication && (
        <Suspense fallback={null}>
          <CoachApplicationForm
            open={showCoachApplication}
            onOpenChange={setShowCoachApplication}
          />
        </Suspense>
      )}
    </>
  );
}
