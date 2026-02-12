import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { captureException } from "@/lib/errorLogging";

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  name?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
}

/**
 * Lightweight error boundary for dashboard sections.
 * Shows a small inline alert instead of taking down the full page.
 */
export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureException(error, {
      source: `SectionErrorBoundary:${this.props.name || "unknown"}`,
      severity: "error",
      metadata: { componentStack: errorInfo.componentStack },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="my-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {this.props.name ? `${this.props.name} failed to load` : "Something went wrong"}
          </AlertTitle>
          <AlertDescription className="flex items-center gap-3 mt-2">
            <span className="text-sm">This section encountered an error.</span>
            <Button variant="outline" size="sm" onClick={this.handleRetry} className="gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
