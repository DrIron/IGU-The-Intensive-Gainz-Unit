import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, LogIn, LayoutDashboard, ArrowLeft } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const NotFound = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useDocumentTitle({
    title: "Page Not Found | Intensive Gainz Unit",
    description: "The page you're looking for doesn't exist or has been moved.",
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="max-w-md w-full border-border/50 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 text-6xl font-bold text-primary">404</div>
          <CardTitle className="text-2xl">Page not found</CardTitle>
          <CardDescription className="text-base text-foreground/70 mt-2">
            This page doesn't exist or may have moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isAuthenticated === null ? (
              // Loading state - show both options disabled
              <>
                <Button disabled className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Loading...
                </Button>
                <Button variant="outline" disabled className="gap-2">
                  <Home className="h-4 w-4" />
                  Loading...
                </Button>
              </>
            ) : isAuthenticated ? (
              // Authenticated user
              <>
                <Button asChild className="gap-2">
                  <Link to="/dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    Go to Dashboard
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/">
                    <Home className="h-4 w-4" />
                    Back to Homepage
                  </Link>
                </Button>
              </>
            ) : (
              // Non-authenticated user
              <>
                <Button asChild className="gap-2">
                  <Link to="/auth">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/">
                    <Home className="h-4 w-4" />
                    Back to Homepage
                  </Link>
                </Button>
              </>
            )}
          </div>
          <div className="text-center pt-4 border-t border-border">
            <button 
              onClick={() => window.history.back()}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Go back to previous page
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
