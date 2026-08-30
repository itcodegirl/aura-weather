import { Component } from "react";
import { discardFailedPanelImports } from "./lazyPanels";

/**
 * Per-panel error boundary used to keep a single lazy-loaded card
 * (HourlyChart, StormWatch, etc.) from taking down the whole
 * dashboard when its chunk fails to load or its render throws. The
 * fallback is a non-fatal placeholder with a retry button so a flaky
 * chunk fetch does not strand the user — neighbouring panels keep
 * working in the meantime.
 */
class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    // resetKey lets us re-mount the children after a retry. Bumping it
    // remounts the subtree so React re-evaluates the lazy import and the
    // panel takes another swing at loading.
    this.state = { hasError: false, resetKey: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      `Aura panel error in "${this.props.label || "unknown panel"}":`,
      error,
      errorInfo
    );
  }

  handleRetry = () => {
    // Remounting alone cannot recover a failed chunk fetch: React caches the
    // rejected payload on the lazy object, so the fresh subtree would re-throw
    // it synchronously. Drop those lazies first and the remount below issues a
    // real new import().
    discardFailedPanelImports();
    this.setState((current) => ({
      hasError: false,
      resetKey: current.resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (fallback) {
        return fallback;
      }

      const className = `${this.props.className || ""} loading-card glass panel-boundary-fallback`.trim();
      const labelText = this.props.label
        ? `${this.props.label} is unavailable`
        : "Panel unavailable";
      return (
        <section
          className={className}
          style={this.props.style}
          role="alert"
        >
          <p className="loading-card-title">{labelText}</p>
          <button
            type="button"
            className="panel-boundary-retry"
            onClick={this.handleRetry}
          >
            Try again
          </button>
        </section>
      );
    }

    return (
      <PanelBoundaryReset key={this.state.resetKey}>
        {this.props.children}
      </PanelBoundaryReset>
    );
  }
}

// Identity wrapper whose only job is to remount the subtree when its
// key changes. Without this the children would keep their previous
// state across retries and a Suspense module-load error would never
// re-fire.
function PanelBoundaryReset({ children }) {
  return children;
}

export default PanelErrorBoundary;
