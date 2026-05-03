import { Component } from "react";

/**
 * Per-panel error boundary used to keep a single lazy-loaded card
 * (HourlyChart, StormWatch, etc.) from taking down the whole
 * dashboard when its chunk fails to load or its render throws. The
 * fallback is a non-fatal placeholder so neighbouring panels keep
 * working.
 */
class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
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

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (fallback) {
        return fallback;
      }

      const className = `${this.props.className || ""} loading-card glass`.trim();
      return (
        <section
          className={className}
          style={this.props.style}
          role="status"
          aria-live="polite"
        >
          <p className="loading-card-title">
            {this.props.label
              ? `${this.props.label} is unavailable`
              : "Panel unavailable"}
          </p>
        </section>
      );
    }

    return this.props.children;
  }
}

export default PanelErrorBoundary;
