import React from "react";
import { Button } from "@/components/ui/button";
import i18n from "@/i18n";

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        role="alert"
        className="flex min-h-[60vh] items-center justify-center bg-background px-4"
      >
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">
            {i18n.t("errors.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error?.message ?? i18n.t("errors.unknown")}
          </p>
          <Button onClick={this.reset} className="mt-6">
            {i18n.t("errors.retry")}
          </Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
