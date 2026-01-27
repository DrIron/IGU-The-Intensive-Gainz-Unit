import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DiagnosticsErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[DiagnosticsErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{this.props.fallbackTitle || "Rendering Error"}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              {this.state.error?.message || "An unexpected error occurred while rendering this section."}
            </p>
            {process.env.NODE_ENV === "development" && this.state.error?.stack && (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs font-mono">
                {this.state.error.stack}
              </pre>
            )}
            <Button variant="outline" size="sm" onClick={this.handleReset} className="mt-2">
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
