import { Component } from "react";
import { CloudOff } from "lucide-react";
import { discardFailedPanelImports } from "./lazyPanels";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    // resetKey lets a soft retry remount the subtree without losing
    // saved-city / sync / settings state in localStorage and without
    // the full page reload cost. The boundary will catch again if the
    // error re-throws, so a flaky transient (network blip, race) gets
    // a cheap second chance.
    this.state = { hasError: false, resetKey: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Keep crash details visible in development tools without breaking UX.
    console.error("Aura runtime error:", error, errorInfo);
  }

  handleSoftRetry = () => {
    // Same constraint as PanelErrorBoundary: React caches a lazy component's
    // rejected payload, so the remount below only re-attempts a failed chunk
    // fetch once the poisoned lazy objects are discarded.
    discardFailedPanelImports();
    this.setState((current) => ({
      hasError: false,
      resetKey: current.resetKey + 1,
    }));
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return (
        <AppBoundaryReset key={this.state.resetKey}>
          {this.props.children}
        </AppBoundaryReset>
      );
    }

    return (
      <div className="app app--error">
        <div className="error-card" role="alert" aria-live="assertive">
          <CloudOff size={42} className="error-card-icon" aria-hidden="true" />
          <h1>Something went wrong</h1>
          <p>We hit an unexpected issue while rendering the dashboard.</p>
          <div className="error-card-actions">
            <button
              type="button"
              className="error-retry"
              onClick={this.handleSoftRetry}
            >
              Try again
            </button>
            <button
              type="button"
              className="error-retry error-retry--subtle"
              onClick={this.handleReload}
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// Identity wrapper whose only job is to remount the subtree when its
// key changes. Matches the pattern in PanelErrorBoundary so that a
// soft retry actually re-runs the child render.
function AppBoundaryReset({ children }) {
  return children;
}

export default AppErrorBoundary;
