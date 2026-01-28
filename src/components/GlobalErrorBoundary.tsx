import React from "react";
import { AlertCircle, RefreshCw, Home, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logErrorBoundary, captureException } from "@/lib/errorLogging";

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional name for this boundary (for logging) */
  name?: string;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId?: string;
}

export class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    // Generate a unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const boundaryName = this.props.name || "Global";
    
    // Log to console
    console.error(`[${boundaryName}ErrorBoundary] Caught error:`, error, errorInfo);
    
    // Log to error tracking service
    logErrorBoundary(error, { componentStack: errorInfo.componentStack || "" }, boundaryName);
    
    // Also capture as exception for additional context
    captureException(error, {
      source: `ErrorBoundary:${boundaryName}`,
      severity: "fatal",
      metadata: {
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
          <Card className="max-w-md w-full border-destructive/30 bg-card shadow-xl">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-4 rounded-full bg-destructive/10 w-fit">
                <AlertCircle className="h-10 w-10 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Something went wrong</CardTitle>
              <CardDescription className="text-base text-foreground/70 mt-2">
                An unexpected error occurred. Please refresh the page.
                If the problem persists, contact support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={this.handleReload} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </Button>
                <Button onClick={this.handleGoHome} variant="outline" className="gap-2">
                  <Home className="h-4 w-4" />
                  Go to Homepage
                </Button>
              </div>
              <div className="text-center pt-4 border-t border-border space-y-2">
                <p className="text-sm text-muted-foreground">
                  Need help?{" "}
                  <a 
                    href="mailto:support@theigu.com" 
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Mail className="h-3 w-3" />
                    Contact support
                  </a>
                </p>
                {this.state.errorId && (
                  <p className="text-xs text-muted-foreground">
                    Error ID: <code className="bg-muted px-1 rounded">{this.state.errorId}</code>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Layout-specific error boundary for client dashboard.
 */
export class ClientErrorBoundary extends GlobalErrorBoundary {
  constructor(props: GlobalErrorBoundaryProps) {
    super({ ...props, name: "Client" });
  }
}

/**
 * Layout-specific error boundary for coach dashboard.
 */
export class CoachErrorBoundary extends GlobalErrorBoundary {
  constructor(props: GlobalErrorBoundaryProps) {
    super({ ...props, name: "Coach" });
  }
}

/**
 * Layout-specific error boundary for admin dashboard.
 */
export class AdminErrorBoundary extends GlobalErrorBoundary {
  constructor(props: GlobalErrorBoundaryProps) {
    super({ ...props, name: "Admin" });
  }
}
