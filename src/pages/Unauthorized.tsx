import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, Home, ArrowLeft } from "lucide-react";
import { useRoleGate } from "@/hooks/useRoleGate";

export default function Unauthorized() {
  const navigate = useNavigate();
  const { primaryRole, redirectToDashboard, loading } = useRoleGate({ 
    redirectOnFail: false,
    logViolations: false 
  });

  const handleGoHome = () => {
    redirectToDashboard();
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
      <Card className="max-w-md w-full border-destructive/20 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 p-4 rounded-full bg-destructive/10">
            <ShieldX className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription className="text-base">
            You don't have permission to view this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="mb-2">This could happen if:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>You're trying to access an admin-only area</li>
              <li>Your session has expired</li>
              <li>The page requires a different account type</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <Button 
              onClick={handleGoHome} 
              className="w-full"
              disabled={loading}
            >
              <Home className="h-4 w-4 mr-2" />
              Go to My Dashboard
            </Button>
            <Button 
              variant="outline" 
              onClick={handleGoBack}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            If you believe this is an error, please contact support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
