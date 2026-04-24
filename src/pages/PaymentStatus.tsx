import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";
import { PaymentStatusDashboard } from "@/components/PaymentStatusDashboard";
import { Navigation } from "@/components/Navigation";
import { Loader2 } from "lucide-react";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function PaymentStatus() {
  const navigate = useNavigate();
  const { user, isLoading: sessionLoading } = useAuthSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const loading = sessionLoading || (!userId && !error);

  // Reactive to `useAuthSession` so a late-arriving session (post-setSession
  // recovery in client.ts) still resolves userId -- a mount-time auth.getUser
  // could cache null forever.
  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    setUserId(user.id);
  }, [user, sessionLoading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-24 max-w-4xl">
          <ErrorFallback onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-4 py-24 max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Payment Status</h1>
          <p className="text-muted-foreground">
            Complete your payment to activate your subscription
          </p>
        </div>
        
        {userId && <PaymentStatusDashboard userId={userId} />}
      </div>
    </div>
  );
}
