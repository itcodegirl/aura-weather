// src/components/CitySearch.jsx

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { geocodeCity } from "../services/weatherApi";
import { parseCoordinates } from "../utils/weatherUnits";
import "./CitySearch.css";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_QUERY_LENGTH = 2;

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
  const isMountedRef = useRef(false);

  const abortGeocodeRequest = () => {
    if (!geocodeRequestRef.current) return;
    geocodeRequestRef.current.abort();
    geocodeRequestRef.current = null;
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
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

  const normalizedQuery = query.trim();
  const showDropdown =
    open &&
    (loading ||
      results.length > 0 ||
      error ||
      normalizedQuery.length >= MIN_SEARCH_QUERY_LENGTH);

  const activeIndexSafe =
    showDropdown && activeIndex >= 0 && results.length > 0
      ? Math.min(activeIndex, results.length - 1)
      : -1;

  const runSearch = async (term) => {
    if (!isMountedRef.current) return;
    abortGeocodeRequest();

    const currentRequest = ++requestIdRef.current;
    if (!isMountedRef.current) return;
    setLoading(true);
    const controller = new AbortController();
    geocodeRequestRef.current = controller;

      try {
        const cities = await geocodeCity(term, { signal: controller.signal });
        if (
          isMountedRef.current &&
          currentRequest === requestIdRef.current
        ) {
          setResults(
            Array.isArray(cities)
              ? cities.filter((city) => city && typeof city === "object")
              : []
          );
          setError(null);
        }
    } catch (error) {
      if (
        isMountedRef.current &&
        currentRequest === requestIdRef.current &&
        error?.name !== "AbortError"
      ) {
        setError("Couldn't fetch locations. Try again.");
        setResults([]);
      }
    } finally {
      if (
        isMountedRef.current &&
        currentRequest === requestIdRef.current
      ) {
        if (geocodeRequestRef.current === controller) {
          geocodeRequestRef.current = null;
        }
        setLoading(false);
      }
    }
  };

  const handleChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmedQuery = nextQuery.trim();
    if (trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      requestIdRef.current++;
      abortGeocodeRequest();
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSelect = (city) => {
    if (typeof onSelect !== "function") {
      return;
    }

    const coordinates = parseCoordinates(city?.latitude, city?.longitude);
    if (!coordinates) {
      setError("This location is missing valid coordinates.");
      return;
    }

    onSelect({
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      name: typeof city?.name === "string" ? city.name.trim() : "",
      country: typeof city?.country === "string" ? city.country.trim() : "",
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
      const targetIndex = activeIndexSafe >= 0 ? activeIndexSafe : 0;
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
    showDropdown && activeIndexSafe >= 0
      ? `city-search-option-${activeIndexSafe}`
      : undefined;
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
            normalizedQuery.length >= MIN_SEARCH_QUERY_LENGTH && (
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

              return (
                <li
                  key={getCityKey(city, index)}
                  id={`city-search-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndexSafe}
                  tabIndex={-1}
                  className={`city-search-result${index === activeIndexSafe ? " is-active" : ""}`}
                  onMouseMove={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(city);
                  }}
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

export default forwardRef(CitySearch);
