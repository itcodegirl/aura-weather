import { memo } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { RADAR_FRAME_KIND } from "../../domain/radar.js";

const CLOCK_OPTIONS = { hour: "numeric", minute: "2-digit" };

// Radar frame times are real UTC epochs, so the absolute clock must be
// projected into the *location's* zone (`weather.meta.timezone`) to agree
// with every other timestamp on the page — a viewer in Berlin reading a
// Chicago radar otherwise sees a Berlin wall clock beside Chicago times.
// (`getZonedNow` is for Open-Meteo's naive local strings; an epoch needs
// Intl's `timeZone` instead.) An absent or unknown zone falls back to the
// viewer's clock rather than inventing one.
function formatClock(unixSeconds, timeZone) {
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  if (typeof timeZone === "string" && timeZone.trim()) {
    try {
      return date.toLocaleTimeString("en-US", {
        ...CLOCK_OPTIONS,
        timeZone: timeZone.trim(),
      });
    } catch {
      // Unknown IANA name — fall through to the viewer's clock.
    }
  }
  return date.toLocaleTimeString("en-US", CLOCK_OPTIONS);
}

// Relative age/lead of a frame, in the user's own words. Observed frames
// read "10m ago"; forecast frames read "+20m". `nowMs` comes from the
// shared minute clock so these stay fresh without per-frame timers.
function formatRelative(frame, nowMs) {
  const deltaMin = Math.round((frame.time * 1000 - nowMs) / 60000);
  if (frame.kind === RADAR_FRAME_KIND.NOWCAST) {
    const ahead = Math.max(0, deltaMin);
    return ahead === 0 ? "now" : `+${ahead}m`;
  }
  const ago = Math.max(0, -deltaMin);
  return ago === 0 ? "now" : `${ago}m ago`;
}

function RadarTimeline({
  frames,
  activeIndex,
  isPlaying,
  hasForecast,
  boundaryIndex,
  nowMs,
  timeZone,
  onToggle,
  onPrev,
  onNext,
  onSeek,
}) {
  const frameCount = frames.length;
  const activeFrame = frames[activeIndex] ?? null;
  const isForecast = activeFrame?.kind === RADAR_FRAME_KIND.NOWCAST;
  const phaseLabel = isForecast ? "Forecast" : "Observed";
  const relative = activeFrame ? formatRelative(activeFrame, nowMs) : "—";
  const clock = activeFrame ? formatClock(activeFrame.time, timeZone) : "";
  const valueText = `${phaseLabel} ${relative}${clock ? `, ${clock}` : ""}`;

  // Position of the observed→forecast boundary along the track, as a
  // percentage, so the divider lines up with the slider thumb travel.
  const dividerPercent =
    hasForecast && frameCount > 1
      ? (boundaryIndex / (frameCount - 1)) * 100
      : null;

  const canAnimate = frameCount > 1;

  return (
    <div className="radar-timeline">
      <div className="radar-timeline-readout">
        <span
          className={`radar-phase radar-phase--${
            isForecast ? "forecast" : "observed"
          }`}
        >
          {phaseLabel}
        </span>
        <span className="radar-readout-time">
          <span className="radar-readout-relative">{relative}</span>
          {clock && <span className="radar-readout-clock">{clock}</span>}
        </span>
      </div>

      <div className="radar-timeline-controls">
        <button
          type="button"
          className="radar-control radar-control--play"
          onClick={onToggle}
          disabled={!canAnimate}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? "Pause radar animation" : "Play radar animation"}
        >
          {isPlaying ? (
            <Pause size={18} aria-hidden="true" />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className="radar-control"
          onClick={onPrev}
          disabled={!canAnimate}
          aria-label="Previous frame"
        >
          <SkipBack size={16} aria-hidden="true" />
        </button>

        <div className="radar-scrubber">
          <input
            type="range"
            className="radar-slider"
            min={0}
            max={Math.max(0, frameCount - 1)}
            step={1}
            value={activeIndex}
            onChange={(event) => onSeek(Number(event.target.value))}
            disabled={!canAnimate}
            aria-label="Radar frame"
            aria-valuetext={valueText}
          />
          {dividerPercent !== null && (
            <span
              className="radar-scrubber-divider"
              style={{ left: `${dividerPercent}%` }}
              aria-hidden="true"
            />
          )}
        </div>

        <button
          type="button"
          className="radar-control"
          onClick={onNext}
          disabled={!canAnimate}
          aria-label="Next frame"
        >
          <SkipForward size={16} aria-hidden="true" />
        </button>
      </div>

      {hasForecast ? (
        <div className="radar-scrubber-legend" aria-hidden="true">
          <span className="radar-scrubber-legend-observed">Observed</span>
          <span className="radar-scrubber-legend-forecast">Forecast</span>
        </div>
      ) : (
        <p className="radar-observed-note">
          Showing observed radar only — no forecast frames available.
        </p>
      )}
    </div>
  );
}

export default memo(RadarTimeline);
