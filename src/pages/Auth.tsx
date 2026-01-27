import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, X } from "lucide-react";
import { z } from "zod";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AUTH_REDIRECT_URLS } from "@/lib/config";

const signUpSchema = z.object({
  email: z.string().email("Invalid email address").trim().toLowerCase(),
  emailConfirm: z.string().email("Invalid email address").trim().toLowerCase(),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  passwordConfirm: z.string(),
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
}).refine((data) => data.email === data.emailConfirm, {
  message: "Emails do not match",
  path: ["emailConfirm"],
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Passwords do not match",
  path: ["passwordConfirm"],
});

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

interface Service {
  id: string;
  name: string;
  type: string;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<string>("");
  const [activeTab, setActiveTab] = useState("signin");
  const [isCoachAuth, setIsCoachAuth] = useState(false);
  
  // Guard to ensure bootstrap-admin-role runs only once per session
  const bootstrapCalledRef = useRef(false);

  useDocumentTitle({
    title: "Sign In | Intensive Gainz Unit",
    description: "Log in or create your IGU coaching account.",
  });

  useEffect(() => {
    // Load services
    loadServices();
    
    // Check if coach authentication mode
    const coachParam = searchParams.get("coach");
    if (coachParam === "true") {
      setIsCoachAuth(true);
    }
    
    // Check for pre-selected service from URL
    const serviceId = searchParams.get("service");
    if (serviceId) {
      setSelectedService(serviceId);
    }
    
    // Check for active tab from URL
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }

    // Check if already logged in
    const redirectParam = searchParams.get("redirect");
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        if (redirectParam) {
          navigate(redirectParam);
          return;
        }
        // Check user roles and profile status
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        const roleList = roles?.map(r => r.role) || [];
        
        // Admins go to /admin, coaches go to dashboard
        if (roleList.includes('admin')) {
          navigate('/admin');
        } else if (roleList.includes('coach') || isCoachAuth) {
          navigate('/dashboard');
          // For regular users, check profile status and onboarding completion
          // Use profiles_public (non-PII fields only)
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("status, onboarding_completed_at")
            .eq("id", session.user.id)
            .single();
          
          // Only send to onboarding if status is 'pending' AND onboarding not completed
          const onboardingCompleted = !!profile?.onboarding_completed_at;
          if (!onboardingCompleted && profile?.status === 'pending') {
            navigate('/onboarding');
            return;
          }
          
          // All other cases go to dashboard
          navigate('/dashboard');
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const redirectParam = searchParams.get("redirect");
        
        if (redirectParam) {
          window.location.href = redirectParam;
          return;
        }
        
        // Defer Supabase query to prevent deadlock
        setTimeout(async () => {
          let roleList: string[] = [];
          
          // Bootstrap admin role for eligible users (runs only once per session)
          const userEmail = session.user.email?.toLowerCase() || "";
          if (userEmail && !bootstrapCalledRef.current) {
            bootstrapCalledRef.current = true;
            try {
              const { data, error } = await supabase.functions.invoke("bootstrap-admin-role");
              if (!error && data?.roles) {
                // Use roles returned by bootstrap function directly
                roleList = data.roles;
                console.log("[Auth] Bootstrap completed, roles:", roleList);
              } else {
                console.warn("[Auth] Bootstrap admin role response:", error || "no roles returned");
              }
            } catch (err) {
              console.warn("[Auth] Bootstrap admin role failed:", err);
            }
          }
          
          // If bootstrap didn't return roles, fetch from database
          if (roleList.length === 0) {
            const { data: roles } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id);
            roleList = roles?.map(r => r.role) || [];
          }
          
          // Admins go to /admin, coaches go to /dashboard
          if (roleList.includes('admin')) {
            window.location.href = "/admin";
          } else if (roleList.includes('coach') || isCoachAuth) {
            window.location.href = "/dashboard";
          } else {
            // For regular users, check profile status and onboarding completion
            // Use profiles_public (non-PII fields only)
            const { data: profile } = await supabase
              .from("profiles_public")
              .select("status, onboarding_completed_at")
              .eq("id", session.user.id)
              .single();
            
            // Only send to onboarding if status is 'pending' AND onboarding not completed
            const onboardingCompleted = !!profile?.onboarding_completed_at;
            if (!onboardingCompleted && profile?.status === 'pending') {
              window.location.href = "/onboarding";
              return;
            }
            
            // All other cases go to dashboard
            window.location.href = "/dashboard";
          }
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, type")
        .eq("is_active", true)
        .order("type")
        .order("price_kwd");

      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      console.error("Error loading services:", error);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    const validation = signUpSchema.safeParse({
      email,
      emailConfirm,
      password,
      passwordConfirm,
      firstName,
      lastName,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        title: "Validation Error",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          // Always use production URL to prevent preview/dev URLs in emails
          emailRedirectTo: AUTH_REDIRECT_URLS.onboarding,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (error) {
        // Handle specific error cases
        if (error.message.includes("already registered")) {
          throw new Error("This email is already registered. Please sign in instead.");
        }
        throw error;
      }

      // Send confirmation email
      if (authData.user) {
        try {
          await supabase.functions.invoke('send-signup-confirmation', {
            body: {
              email: authData.user.email,
              name: `${firstName.trim()} ${lastName.trim()}`,
            },
          });
        } catch (emailError) {
          console.error("Error sending confirmation email:", emailError);
          // Don't block signup if email fails
        }
      }

      toast({
        title: "Account created!",
        description: "Redirecting to onboarding...",
      });
    } catch (error: any) {
      toast({
        title: "Sign Up Failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    const validation = signInSchema.safeParse({ email, password });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        title: "Validation Error",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        // Handle specific error cases
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("Invalid email or password. Please try again.");
        }
        throw error;
      }

      toast({
        title: "Welcome back!",
        description: "Successfully signed in.",
      });
    } catch (error: any) {
      toast({
        title: "Sign In Failed",
        description: error.message || "Failed to sign in. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Always use production URL to prevent preview/dev URLs in emails
        redirectTo: AUTH_REDIRECT_URLS.resetPassword,
      });

      if (error) throw error;

      toast({
        title: "Check your email",
        description: "We've sent you a password reset link.",
      });
      setResetMode(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md border-border/50 shadow-2xl relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          onClick={() => navigate("/")}
        >
          <X className="h-4 w-4" />
        </Button>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
              <Dumbbell className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome</CardTitle>
          <CardDescription>
            {isCoachAuth ? "Coach/Admin Sign In" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              {resetMode ? (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
                    {loading ? "Sending..." : "Send Reset Link"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full" 
                    onClick={() => setResetMode(false)}
                  >
                    Back to Sign In
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full text-sm" 
                    onClick={() => setResetMode(true)}
                  >
                    Forgot Password?
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-firstName">First Name</Label>
                    <Input
                      id="signup-firstName"
                      type="text"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-lastName">Last Name</Label>
                    <Input
                      id="signup-lastName"
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-emailConfirm">Confirm Email</Label>
                  <Input
                    id="signup-emailConfirm"
                    type="email"
                    placeholder="Confirm your email"
                    value={emailConfirm}
                    onChange={(e) => setEmailConfirm(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Minimum 8 characters, 1 uppercase, 1 lowercase, 1 special character
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-passwordConfirm">Confirm Password</Label>
                  <Input
                    id="signup-passwordConfirm"
                    type="password"
                    placeholder="Confirm your password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
