import { Component, type ErrorInfo, type ReactNode } from "react";

/** Catches render-time crashes so a single bad screen doesn't blank the whole
 *  PWA — the user gets a "reload" affordance instead of a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-600">
          <p className="mb-2 text-4xl">😵</p>
          <p className="font-semibold">Something went wrong.</p>
          <p className="mt-1 text-sm text-slate-500">{this.state.error.message}</p>
          <button
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 font-semibold text-white active:bg-emerald-700"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
