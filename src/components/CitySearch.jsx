// src/components/CitySearch.jsx

import {
  useId,
  forwardRef,
  useImperativeHandle,
  useCallback,
  memo,
} from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { useCitySearch } from "../hooks/useCitySearch";
import "./CitySearch.css";

function getCityKey(city, index) {
  const lat = Number(city?.latitude);
  const lon = Number(city?.longitude);
  const rawId = city?.id ?? city?.name ?? "unknown";
  const cityId =
    typeof rawId === "string"
      ? rawId.trim() || "unknown"
      : String(rawId);
  const safeLat = Number.isFinite(lat) ? lat : "na";
  const safeLon = Number.isFinite(lon) ? lon : "na";
  return `${safeLat}:${safeLon}:${cityId}:${index}`;
}

function CitySearch({ onSelect }, ref) {
  const id = useId();
  const resultsId = `${id}-results`;
  const optionIdPrefix = `${id}-option`;
  const {
    query,
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
    handleClear,
  } = useCitySearch({ onSelect });

  const activeDescendant =
    showDropdown && activeIndexSafe >= 0
      ? `${optionIdPrefix}-${activeIndexSafe}`
      : undefined;

  const handleInputFocus = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const handleRowMouseEnter = useCallback(
    (event) => {
      const nextIndex = Number(event.currentTarget?.dataset?.index);
      if (!Number.isFinite(nextIndex) || nextIndex < 0) {
        return;
      }
      setActiveIndex(nextIndex);
    },
    [setActiveIndex]
  );

  const handleRowSelect = useCallback(
    (event) => {
      const selectedIndex = Number(event.currentTarget?.dataset?.index);
      if (!Number.isFinite(selectedIndex) || selectedIndex < 0) {
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
          onKeyDown={handleKeyDown}
          placeholder="Search city or region..."
          className="city-search-input"
          aria-label="Search for a city"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? resultsId : undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          role="combobox"
          aria-activedescendant={activeDescendant}
          autoComplete="off"
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
        <ul
          id={resultsId}
          className="city-search-dropdown glass"
          role="listbox"
          aria-label="City suggestions"
          aria-busy={loading}
          onMouseDown={handleResultListMouseDown}
        >
          {loading && (
            <li
              className="city-search-state"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <Loader2 size={14} className="city-search-spinner" />
              <span>Searching locations...</span>
            </li>
          )}

          {!loading && error && (
            <li
              className="city-search-state city-search-state--error"
              role="status"
              aria-live="polite"
            >
              {error}
            </li>
          )}

          {!loading &&
            !error &&
            results.length === 0 &&
            canShowNoResults && (
            <li className="city-search-state" role="status" aria-live="polite">
              No matching cities
            </li>
          )}

          {!loading &&
            results.map((city, index) => {
              const name = typeof city?.name === "string" ? city.name : "Unnamed location";
              const admin1 = typeof city?.admin1 === "string" ? city.admin1 : "";
              const country = typeof city?.country === "string" ? city.country : "";
              const meta = [admin1, country].filter(Boolean).join(" \u00B7 ");
              const optionLabel = `${name}${meta ? `, ${meta}` : ""}`;

              return (
                <li
                  key={getCityKey(city, index)}
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
              );
            })}
        </ul>
      )}
    </div>
  );
}

export default memo(forwardRef(CitySearch));

