import React from "react";
import { Button } from "@/components/ui/button";

interface AdminErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface AdminErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class AdminErrorBoundary extends React.Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<AdminErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Admin tools crash:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error occurred while loading the admin tools.
          </p>
          
          {/* Show real error details for debugging */}
          <div className="w-full max-w-2xl text-left rounded bg-muted/50 p-4 overflow-auto max-h-64">
            <p className="font-mono text-sm text-destructive font-semibold mb-2">
              {error?.message || "Unknown error"}
            </p>
            {error?.stack && (
              <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {error.stack}
              </pre>
            )}
            {errorInfo?.componentStack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Component Stack</summary>
                <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words mt-1">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          <Button variant="outline" onClick={this.handleReset}>
            Back to Plans & Services
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
