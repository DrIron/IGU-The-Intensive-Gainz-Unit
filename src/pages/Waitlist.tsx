import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Instagram, Youtube, Music2, CheckCircle2, Loader2 } from "lucide-react";
import { getUTMParams } from "@/lib/utm";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { SEOHead } from "@/components/SEOHead";

// Hero image served from public/ for preloading (stable URL, no Vite hash)
const gymHeroBg = "/gym-hero-bg.jpg";

export default function Waitlist() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [heading, setHeading] = useState("Coming Soon");
  const [subheading, setSubheading] = useState(
    "We're building something great. Join the waitlist to be first in line."
  );
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const loadSettings = async () => {
      const { data } = await supabase
        .from("waitlist_settings")
        .select("heading, subheading")
        .limit(1)
        .maybeSingle();

      if (data) {
        if (data.heading) setHeading(data.heading);
        if (data.subheading) setSubheading(data.subheading);
      }
    };
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const utmParams = getUTMParams();
      const { error } = await supabase.from("leads").insert({
        email: email.trim().toLowerCase(),
        name: name.trim() || null,
        source: "waitlist",
        ...utmParams,
      });

      if (error) {
        if (error.code === "23505") {
          // Duplicate email -- show success anyway (no info leakage)
          setSubmitted(true);
        } else {
          throw error;
        }
      } else {
        setSubmitted(true);

        // Fire-and-forget confirmation email
        supabase.functions
          .invoke("send-waitlist-confirmation", {
            body: {
              email: email.trim().toLowerCase(),
              name: name.trim() || "there",
            },
          })
          .catch((err: unknown) => {
            console.error("Waitlist confirmation email failed:", err);
          });
      }
    } catch (error: unknown) {
      toast({
        title: "Something went wrong",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEOHead
        title="Join the Waitlist | IGU"
        description="Be the first to know when IGU opens. Join our waitlist for early access to professional fitness coaching."
      />

      <section className="relative min-h-[calc(100vh-56px)] flex items-center justify-center overflow-hidden">
        {/* Background image */}
        <img
          src={gymHeroBg}
          alt=""
          role="presentation"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />
        {/* Grid pattern */}
        <div className="absolute inset-0 grid-pattern opacity-30" />
        {/* Red glow */}
        <div className="absolute inset-0 red-glow" />

        <div className="relative z-10 w-full max-w-lg mx-auto px-4 py-12 text-center">
          {/* Branding */}
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl tracking-tight mb-4 text-foreground">
            <span className="block">THE INTENSIVE</span>
            <span className="block text-primary">GAINZ UNIT</span>
          </h1>

          {/* Customizable heading */}
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
            {heading}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            {subheading}
          </p>

          {/* Form Card */}
          <Card className="border-border/50 shadow-2xl bg-card/90 backdrop-blur-sm">
            <CardContent className="pt-6">
              {submitted ? (
                <div className="py-8 space-y-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-lg font-semibold text-foreground">
                    You're on the list!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    We'll email you when spots open up.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                  <div className="space-y-2">
                    <Label htmlFor="waitlist-name">Name</Label>
                    <Input
                      id="waitlist-name"
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waitlist-email">Email</Label>
                    <Input
                      id="waitlist-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="gradient"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      "Join the Waitlist"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Sign in link */}
          <p className="mt-6 text-sm text-muted-foreground">
            Already a member?{" "}
            <Link
              to="/auth"
              className="text-primary hover:underline font-medium"
            >
              Sign In
            </Link>
          </p>

          {/* Social links */}
          <div className="mt-8 flex justify-center gap-6">
            <a
              href="https://www.instagram.com/theigu.kw/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="https://www.tiktok.com/@theigu.kw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="TikTok"
            >
              <Music2 className="h-5 w-5" />
            </a>
            <a
              href="https://www.youtube.com/@theigu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="YouTube"
            >
              <Youtube className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
