// src/components/CitySearch.jsx

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { geocodeCity } from "../services/weatherApi";
import "./CitySearch.css";

function CitySearch({ onSelect }, ref) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const geocodeRequestRef = useRef(null);

  const abortGeocodeRequest = () => {
    if (!geocodeRequestRef.current) return;
    geocodeRequestRef.current.abort();
    geocodeRequestRef.current = null;
  };

  useEffect(() => {
    return () => {
      abortGeocodeRequest();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = open && (loading || results.length > 0 || error);

  useEffect(() => {
    if (!showDropdown || results.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => (prev < 0 ? 0 : Math.min(prev, results.length - 1)));
  }, [showDropdown, results]);

  const runSearch = async (term) => {
    abortGeocodeRequest();

    const currentRequest = ++requestIdRef.current;
    setLoading(true);
    const controller = new AbortController();
    geocodeRequestRef.current = controller;

    try {
      const cities = await geocodeCity(term, { signal: controller.signal });
      if (currentRequest !== requestIdRef.current) return;
      setResults(cities);
      setError(null);
    } catch (error) {
      if (currentRequest !== requestIdRef.current) return;
      if (error?.name === "AbortError") return;
      setError("Search failed");
      setResults([]);
    } finally {
      if (currentRequest !== requestIdRef.current) return;
      if (geocodeRequestRef.current === controller) {
        geocodeRequestRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      requestIdRef.current++;
      abortGeocodeRequest();
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, 300);
  };

  const handleSelect = (city) => {
    onSelect({
      lat: city.latitude,
      lon: city.longitude,
      name: city.name,
      country: city.country || "",
    });
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (event.key === "ArrowDown") {
      if (results.length === 0) return;
      event.preventDefault();
      if (!showDropdown) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((prev) =>
        prev < 0 ? 0 : Math.min(prev + 1, results.length - 1)
      );
      return;
    }

    if (event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      if (!showDropdown) {
        setOpen(true);
        setActiveIndex(results.length - 1);
        return;
      }
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && results.length > 0) {
      event.preventDefault();
      const targetIndex = activeIndex >= 0 ? activeIndex : 0;
      const city = results[targetIndex];
      if (city) {
        handleSelect(city);
      }
    }
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortGeocodeRequest();
    requestIdRef.current++;

    setQuery("");
    setResults([]);
    setError(null);
    setLoading(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const activeDescendant =
    showDropdown && activeIndex >= 0 ? `city-search-option-${activeIndex}` : "";
  const resultsId = "city-search-results";

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
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search city..."
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
          className="city-search-dropdown"
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
              <span>Searching...</span>
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

          {!loading && !error && results.length === 0 && query.length >= 2 && (
            <li className="city-search-state" role="status" aria-live="polite">
              No cities found
            </li>
          )}

          {!loading &&
            results.map((city, index) => (
              <li
                key={`${city.latitude}-${city.longitude}-${city.id || city.name}`}
                id={`city-search-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                className={`city-search-result${index === activeIndex ? " is-active" : ""}`}
                onMouseMove={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(city);
                }}
              >
                <MapPin size={14} className="city-search-result-icon" />
                <div className="city-search-result-text">
                  <div className="city-search-result-name">{city.name}</div>
                  <div className="city-search-result-meta">
                    {city.admin1 && <span>{city.admin1}</span>}
                    {city.admin1 && city.country && <span>{" \u00B7 "}</span>}
                    {city.country && <span>{city.country}</span>}
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export default forwardRef(CitySearch);
