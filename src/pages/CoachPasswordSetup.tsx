import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, sessionReady } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, MailWarning, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

// 'checking'   -> still determining whether the invite link produced a session
// 'ready'      -> a valid (recovery) session exists; show the password form
// 'no_session' -> link expired / already used / pre-consumed; offer a resend
type SetupState = "checking" | "ready" | "no_session";

export default function CoachPasswordSetup() {
  const [searchParams] = useSearchParams();
  const coachId = searchParams.get("coach_id");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Guards against state updates after unmount and avoids flipping to
  // 'no_session' once we've already confirmed a session via an auth event.
  const resolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const markReady = () => {
      resolvedRef.current = true;
      if (!cancelled) setSetupState("ready");
    };

    // The recovery session is established by detectSessionInUrl during client
    // init, which fires PASSWORD_RECOVERY / SIGNED_IN. Subscribe first so we
    // don't miss it if it arrives while we poll below.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        markReady();
        toast({
          title: "Ready to set password",
          description: "Please enter your new password below",
        });
      } else if (event === "SIGNED_IN" && session) {
        // Fired both when the recovery link lands AND after we set the password.
        markReady();
      } else if (event === "INITIAL_SESSION" && session) {
        markReady();
      }
    });

    // Decide whether we actually have a session. Wait for the client to finish
    // its URL/localStorage initialization, then poll briefly to cover the race
    // where detectSessionInUrl is still parsing the hash fragment.
    (async () => {
      await sessionReady;
      for (let i = 0; i < 4; i++) {
        if (cancelled || resolvedRef.current) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          markReady();
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!cancelled && !resolvedRef.current) setSetupState("no_session");
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [toast]);

  const handleResend = async () => {
    if (!coachId) {
      toast({
        title: "Can't resend",
        description: "This link is missing its coach reference. Please contact IGU support.",
        variant: "destructive",
      });
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.functions.invoke("resend-coach-setup-link", {
        body: { coachId },
      });
      if (error) throw error;
      setResent(true);
      toast({
        title: "New link sent",
        description: "Check your email for a fresh password-setup link.",
      });
    } catch (error: any) {
      toast({
        title: "Couldn't send a new link",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password strength
    const passwordValidation = passwordSchema.safeParse(password);
    if (!passwordValidation.success) {
      const firstError = passwordValidation.error.errors[0];
      toast({
        title: "Weak password",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    // Re-confirm we still have a session before attempting the update, so the
    // coach gets the actionable "link expired" screen instead of a cryptic
    // "Auth session missing" error.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setSetupState("no_session");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast({
        title: "Password set successfully!",
        description: "Redirecting to complete your profile...",
      });

      // Wait for session to be established
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (coachId) {
        navigate(`/coach-signup?coach_id=${coachId}`);
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {setupState === "checking" && (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Verifying your invitation link...</p>
          </CardContent>
        )}

        {setupState === "no_session" && (
          <>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MailWarning className="h-5 w-5 text-destructive" />
                <CardTitle>This link has expired</CardTitle>
              </div>
              <CardDescription>
                Password-setup links can only be used once and expire for security. Yours has
                expired or was already opened -- request a fresh one below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {resent ? (
                <div className="flex items-start gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  <span>
                    A new link is on its way to your inbox. Open it promptly on this device --
                    don't forward it, as some email scanners can use up the link.
                  </span>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Email me a new link
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Still stuck? Contact IGU support and we'll get you set up.
              </p>
            </CardContent>
          </>
        )}

        {setupState === "ready" && (
          <>
            <CardHeader>
              <CardTitle>Set Your Password</CardTitle>
              <CardDescription>
                Create a secure password for your coach account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Must be at least 8 characters with uppercase, lowercase, number, and special character
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Set Password & Continue
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
