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
    (index) => {
      setActiveIndex(index);
    },
    [setActiveIndex]
  );

  const handleRowMouseDown = useCallback(
    (city) => (event) => {
      event.preventDefault();
      handleSelect(city);
    },
    [handleSelect]
  );

  const handleRowKeyDown = useCallback(
    (city) => (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleSelect(city);
      }
    },
    [handleSelect]
  );

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }));

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
                  role="presentation"
                >
                  <button
                    type="button"
                    id={`${optionIdPrefix}-${index}`}
                    className={`city-search-result${index === activeIndexSafe ? " is-active" : ""}`}
                    aria-label={optionLabel}
                    aria-selected={index === activeIndexSafe}
                    role="option"
                    tabIndex={index === activeIndexSafe ? 0 : -1}
                    onMouseEnter={() => handleRowMouseEnter(index)}
                    onMouseDown={handleRowMouseDown(city)}
                    onClick={() => handleSelect(city)}
                    onKeyDown={handleRowKeyDown(city)}
                  >
                    <MapPin size={14} className="city-search-result-icon" />
                    <div className="city-search-result-text">
                      <div className="city-search-result-name">{name}</div>
                      <div className="city-search-result-meta">
                        {meta && <span>{meta}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

export default memo(forwardRef(CitySearch));
