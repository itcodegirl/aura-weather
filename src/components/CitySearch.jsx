// src/components/CitySearch.jsx

import {
  Fragment,
  useId,
  forwardRef,
  useImperativeHandle,
  useCallback,
  memo,
  useMemo,
} from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { useCitySearch } from "../hooks/useCitySearch";
import { toFiniteNumber } from "../utils/numbers";
import "./CitySearch.css";

function getCityKey(city, index) {
  // Strict coercion: a null lat/lon must NOT coerce to 0 — that would
  // collide every coord-less result onto the "0:0:..." Null Island key
  // (and also collide with a real city actually at 0, 0).
  const lat = toFiniteNumber(city?.latitude);
  const lon = toFiniteNumber(city?.longitude);
  const rawId = city?.id ?? city?.name ?? "unknown";
  const cityId =
    typeof rawId === "string"
      ? rawId.trim() || "unknown"
      : String(rawId);
  const safeLat = lat === null ? "na" : lat;
  const safeLon = lon === null ? "na" : lon;
  return `${safeLat}:${safeLon}:${cityId}:${index}`;
}

function toSuggestionCity(city, index, options = {}) {
  const lat = toFiniteNumber(city?.lat);
  const lon = toFiniteNumber(city?.lon);
  if (lat === null || lon === null) {
    return null;
  }

  const fallbackName =
    typeof options.fallbackName === "string" && options.fallbackName.trim()
      ? options.fallbackName.trim()
      : "Saved place";
  const name =
    typeof city?.name === "string" && city.name.trim()
      ? city.name.trim()
      : fallbackName;
  const country =
    typeof city?.country === "string" ? city.country.trim() : "";

  return {
    id: `${options.idPrefix ?? "saved"}-${lat}:${lon}:${index}`,
    name,
    country,
    latitude: lat,
    longitude: lon,
    sourceGroup: options.sourceGroup ?? "",
    sourceLabel: options.sourceLabel ?? "",
  };
}

function getSuggestionCoordsKey(city) {
  const lat = toFiniteNumber(city?.lat ?? city?.latitude);
  const lon = toFiniteNumber(city?.lon ?? city?.longitude);
  if (lat === null || lon === null) {
    return null;
  }

  return `${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

function CitySearch({ onSelect, savedCities, recentCities }, ref) {
  const id = useId();
  const dropdownId = `${id}-dropdown`;
  const resultsId = `${id}-results`;
  const statusId = `${id}-status`;
  const optionIdPrefix = `${id}-option`;
  const idleSuggestions = useMemo(
    () => {
      const nextSuggestions = [];
      const seen = new Set();

      function appendSuggestions(cities, options) {
        (Array.isArray(cities) ? cities : []).forEach((city, index) => {
          const suggestion = toSuggestionCity(city, index, options);
          if (!suggestion) {
            return;
          }

          const coordsKey = getSuggestionCoordsKey(suggestion);
          if (!coordsKey || seen.has(coordsKey)) {
            return;
          }

          seen.add(coordsKey);
          nextSuggestions.push(suggestion);
        });
      }

      appendSuggestions(recentCities, {
        idPrefix: "recent",
        sourceGroup: "Recent",
        sourceLabel: "Recent search",
        fallbackName: "Recent place",
      });
      appendSuggestions(savedCities, {
        idPrefix: "saved",
        sourceGroup: "Saved",
        sourceLabel: "Saved city",
        fallbackName: "Saved place",
      });

      return nextSuggestions;
    },
    [recentCities, savedCities]
  );
  const {
    query,
    normalizedQuery,
    results,
    loading,
    error,
    canShowNoResults,
    showDropdown,
    activeIndexSafe,
    containerRef,
    inputRef,
    setOpen,
    setActiveIndex,
    handleChange,
    handleSelect,
    handleKeyDown,
    handleBlur,
    handleClear,
  } = useCitySearch({ onSelect, idleResults: idleSuggestions });

  const activeDescendant =
    showDropdown && activeIndexSafe >= 0
      ? `${optionIdPrefix}-${activeIndexSafe}`
      : undefined;
  const hasResultOptions = results.length > 0;
  const shouldShowStatus = loading || Boolean(error) || canShowNoResults;
  const shouldShowIdleGroups = normalizedQuery.length === 0;
  const shouldShowIdleEmptyState =
    showDropdown &&
    !loading &&
    !error &&
    normalizedQuery.length === 0 &&
    !hasResultOptions;

  const handleInputFocus = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const handleRowMouseEnter = useCallback(
    (event) => {
      const nextIndex = toFiniteNumber(event.currentTarget?.dataset?.index);
      if (nextIndex === null || nextIndex < 0) {
        return;
      }
      setActiveIndex(nextIndex);
    },
    [setActiveIndex]
  );

  const handleRowSelect = useCallback(
    (event) => {
      const selectedIndex = toFiniteNumber(
        event.currentTarget?.dataset?.index
      );
      if (selectedIndex === null || selectedIndex < 0) {
        return;
      }

      const city = results[selectedIndex];
      if (!city) return;

      handleSelect(city);
    },
    [handleSelect, results]
  );

  const handleRowMouseDown = useCallback((event) => {
    // Keep focus on the input so combobox keyboard navigation remains active.
    event.preventDefault();
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }), [inputRef]);

  const handleResultListMouseDown = useCallback(
    (event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }

      const optionElement = event.target.closest('[role="option"]');
      if (!optionElement) {
        return;
      }

      // Prevent focus from leaving the combobox input on pointer selection.
      event.preventDefault();
    },
    []
  );

  return (
    <div className="city-search" ref={containerRef}>
      <div className="city-search-input-wrap">
        <Search size={14} className="city-search-icon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleInputFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search city or region..."
          className="city-search-input"
          aria-label="Search for a city"
          aria-expanded={showDropdown}
          aria-controls={
            showDropdown
              ? hasResultOptions
                ? resultsId
                : dropdownId
              : undefined
          }
          aria-describedby={shouldShowStatus ? statusId : undefined}
          aria-busy={loading || undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          role="combobox"
          aria-activedescendant={activeDescendant}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck="false"
          inputMode="search"
          enterKeyHint="search"
        />
        {!query && (
          <span className="city-search-shortcut-badge" aria-hidden="true">
            / search
          </span>
        )}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="city-search-clear"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          id={dropdownId}
          className="city-search-dropdown glass"
        >
          {shouldShowStatus && (
            <div
              id={statusId}
              className="city-search-state"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="city-search-spinner" />
                  <span>Searching locations...</span>
                </>
              ) : error ? (
                <span className="city-search-state-message city-search-state-message--error">
                  {error}
                </span>
              ) : (
                <span>No matching cities</span>
              )}
            </div>
          )}

          {hasResultOptions && (
            <ul
              id={resultsId}
              className="city-search-options"
              role="listbox"
              aria-label="City suggestions"
              onMouseDown={handleResultListMouseDown}
            >
              {results.map((city, index) => {
                const name =
                  typeof city?.name === "string" ? city.name : "Unnamed location";
                const admin1 =
                  typeof city?.admin1 === "string" ? city.admin1 : "";
                const country =
                  typeof city?.country === "string" ? city.country : "";
                const sourceLabel =
                  typeof city?.sourceLabel === "string" ? city.sourceLabel : "";
                const sourceGroup =
                  typeof city?.sourceGroup === "string" ? city.sourceGroup : "";
                const showGroupLabel =
                  shouldShowIdleGroups &&
                  Boolean(sourceGroup) &&
                  sourceGroup !==
                    (typeof results[index - 1]?.sourceGroup === "string"
                      ? results[index - 1].sourceGroup
                      : "");
                const meta = [
                  shouldShowIdleGroups ? "" : sourceLabel,
                  admin1,
                  country,
                ]
                  .filter(Boolean)
                  .join(" \u00B7 ");
                const accessibleMeta = [sourceLabel || sourceGroup, admin1, country]
                  .filter(Boolean)
                  .join(" \u00B7 ");
                const optionLabel = `${name}${accessibleMeta ? `, ${accessibleMeta}` : ""}`;

                return (
                  <Fragment key={getCityKey(city, index)}>
                    {showGroupLabel && (
                      <li className="city-search-group" role="presentation">
                        <span className="city-search-group-label">{sourceGroup}</span>
                      </li>
                    )}
                    <li
                      id={`${optionIdPrefix}-${index}`}
                      className={`city-search-result${index === activeIndexSafe ? " is-active" : ""}`}
                      data-index={index}
                      aria-label={optionLabel}
                      aria-selected={index === activeIndexSafe}
                      role="option"
                      onMouseEnter={handleRowMouseEnter}
                      onMouseDown={handleRowMouseDown}
                      onClick={handleRowSelect}
                    >
                      <MapPin size={14} className="city-search-result-icon" />
                      <div className="city-search-result-text">
                        <div className="city-search-result-name">{name}</div>
                        <div className="city-search-result-meta">
                          {meta && <span>{meta}</span>}
                        </div>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}

          {shouldShowIdleEmptyState && (
            <div
              className="city-search-empty-hint"
              role="status"
              aria-live="polite"
            >
              Recent and saved places will show up here after you switch cities.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(forwardRef(CitySearch));

