import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function Nutrition() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState(false);

  const checkAccessAndRedirect = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Not logged in -> public calculator
      if (!user) {
        navigate('/calorie-calculator');
        return;
      }

      // Load roles to allow coaches/admins to use team calculator
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const isCoach = roles?.some(r => r.role === 'coach');
      const isAdmin = roles?.some(r => r.role === 'admin');

      if (isCoach || isAdmin) {
        // Coaches/admins can use team calculator for themselves
        navigate('/nutrition-team');
        return;
      }

      // For clients: check profile status and subscription
      // Use profiles_public (RLS-protected, client can view own profile)
      const [{ data: profile }, { data: subscription }] = await Promise.all([
        supabase
          .from('profiles_public')
          .select('status')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('subscriptions')
          .select('id, status, service_id, services!inner(type)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      // Block if no profile or subscription
      if (!profile || !subscription) {
        toast({
          title: "Nutrition Locked",
          description: "Nutrition unlocks after activation.",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      // Check if client is fully active
      const isActiveClient =
        profile.status === "active" && subscription.status === "active";

      if (!isActiveClient) {
        toast({
          title: "Access Restricted",
          description: "Your account must be active to access nutrition.",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      // At this point, client is active with active subscription
      const serviceType = (subscription as any)?.services?.type;

      if (serviceType === 'team') {
        navigate('/nutrition-team');
        return;
      }

      if (serviceType === 'one_to_one') {
        navigate('/nutrition-client');
        return;
      }

      // Fallback/error state
      toast({
        title: "Configuration Error",
        description: "Unable to determine your service type. Please contact support.",
        variant: "destructive",
      });
      navigate('/dashboard');
    } catch (err) {
      console.error('Error checking access:', err);
      setError(true);
    }
  }, [navigate, toast]);

  useEffect(() => {
    checkAccessAndRedirect();
  }, [checkAccessAndRedirect]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <ErrorFallback onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
