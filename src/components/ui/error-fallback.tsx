import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showHomeButton?: boolean;
}

export function ErrorFallback({
  title = "Something went wrong",
  message = "We're having trouble loading this page. Please try refreshing or contact support if the issue persists.",
  onRetry,
  showHomeButton = true,
}: ErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/30 bg-destructive/5">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 p-3 rounded-full bg-destructive/10 w-fit">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-foreground/70">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}
          {showHomeButton && (
            <Button 
              onClick={() => window.location.href = '/dashboard'} 
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Button>
          )}
        </CardContent>
        <div className="px-6 pb-6 text-center">
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            <a 
              href="mailto:support@theigu.com" 
              className="text-primary hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}
