import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

export default function EmailConfirmed() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useDocumentTitle({
    title: "Email Confirmed | Intensive Gainz Unit",
    description: "Your email has been confirmed.",
  });

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Check if there's a hash fragment with tokens (Supabase auth callback)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        // If we have tokens from email confirmation
        if (accessToken && type === "signup") {
          // Set the session with the tokens
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
          });

          if (error) {
            throw error;
          }

          setStatus("success");
          return;
        }

        // Check if user is already logged in (clicked link while logged in)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setStatus("success");
          return;
        }

        // No tokens and no session - show success anyway (email was confirmed)
        // The user can proceed to sign in
        setStatus("success");
      } catch (error: any) {
        console.error("Email confirmation error:", error);
        setErrorMessage(sanitizeErrorForUser(error));
        setStatus("error");
      }
    };

    handleEmailConfirmation();
  }, []);

  const handleContinue = async () => {
    // Check if user has a session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // User is logged in, check their role and redirect appropriately
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      
      const roleList = roles?.map(r => r.role) || [];
      
      if (roleList.includes("admin")) {
        navigate("/admin");
      } else if (roleList.includes("coach")) {
        navigate("/coach");
      } else {
        // Regular user - check onboarding status
        const { data: profile } = await supabase
          .from("profiles_public")
          .select("status, onboarding_completed_at")
          .eq("id", session.user.id)
          .single();
        
        if (!profile?.onboarding_completed_at && profile?.status === "pending") {
          navigate("/onboarding");
        } else {
          navigate("/dashboard");
        }
      }
    } else {
      // No session, send to sign in
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md border-border/50 shadow-2xl">
        <CardHeader className="text-center">
          {status === "loading" && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
              </div>
              <CardTitle className="text-2xl font-bold">Confirming Email...</CardTitle>
              <CardDescription>Please wait while we verify your email address.</CardDescription>
            </>
          )}
          
          {status === "success" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                  <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-green-600 dark:text-green-400">
                Email Confirmed!
              </CardTitle>
              <CardDescription>
                Your email has been verified successfully. You can now continue to your account.
              </CardDescription>
            </>
          )}
          
          {status === "error" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full bg-red-100 dark:bg-red-900">
                  <CheckCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-red-600 dark:text-red-400">
                Verification Issue
              </CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </>
          )}
        </CardHeader>
        
        <CardContent className="flex flex-col gap-3">
          {status !== "loading" && (
            <>
              <Button onClick={handleContinue} variant="gradient" className="w-full">
                {status === "success" ? "Continue to Account" : "Go to Sign In"}
              </Button>
              
              {status === "error" && (
                <Button variant="outline" onClick={() => navigate("/")} className="w-full">
                  Go to Home
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
