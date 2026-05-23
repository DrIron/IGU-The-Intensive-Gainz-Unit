import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, CheckCircle2 } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useToast } from "@/hooks/use-toast";

/**
 * Post-signup email confirmation waiting page.
 *
 * Shown immediately after account creation so the user isn't stranded on the
 * auth form. Polls onAuthStateChange and auto-redirects to /onboarding the
 * moment Supabase fires SIGNED_IN (i.e. user clicked their confirmation link).
 *
 * This page is PUBLIC — no AuthGuard — because the session doesn't exist yet.
 */
export default function EmailPending() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const email = searchParams.get("email") ?? "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const redirectingRef = useRef(false);

  useDocumentTitle({
    title: "Check Your Email | Intensive Gainz Unit",
    description: "Verify your email address to continue.",
  });

  useEffect(() => {
    // If the user is already signed in (e.g. they refreshed after confirming),
    // skip straight through rather than blocking them on this page.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !redirectingRef.current) {
        redirectingRef.current = true;
        navigate("/onboarding", { replace: true });
      }
    });

    // Watch for the SIGNED_IN event that fires when the confirmation link is clicked.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && !redirectingRef.current) {
        redirectingRef.current = true;
        navigate("/onboarding", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    try {
      await supabase.functions.invoke("send-signup-confirmation", {
        body: { email },
      });
      setResent(true);
      toast({
        title: "Email resent",
        description: "Check your inbox (and spam folder) for the confirmation link.",
      });
    } catch {
      toast({
        title: "Couldn't resend",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md border-border/50 shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary/10">
              <Mail className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription className="text-base mt-1">
            We sent a confirmation link to{" "}
            {email ? (
              <span className="font-medium text-foreground">{email}</span>
            ) : (
              "your email address"
            )}
            . Click it to verify your account and continue.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Didn't receive it?</p>
            <p>Check your spam or junk folder. Confirmation emails can take a minute or two.</p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={resending || resent}
          >
            {resending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : resent ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                Email resent
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend confirmation email
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-sm text-muted-foreground"
            onClick={() => navigate("/auth")}
          >
            Back to sign in
          </Button>

          <p className="text-center text-xs text-muted-foreground pt-2">
            This page will automatically continue once you confirm your email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
