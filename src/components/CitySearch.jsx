// src/components/CitySearch.jsx

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { geocodeCity } from "../services/weatherApi";

export default function CitySearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);       // holds the setTimeout id
  const requestIdRef = useRef(0);         // tracks latest request to discard stale responses

  // Cleanup any pending timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Core search — called from the debounced input handler.
  // `requestIdRef` tags each request so late responses are ignored.
  const runSearch = async (term) => {
    const currentRequest = ++requestIdRef.current;
    setLoading(true);

    try {
      const cities = await geocodeCity(term);
      if (currentRequest !== requestIdRef.current) return; // stale — ignore
      setResults(cities);
      setError(null);
    } catch {
      if (currentRequest !== requestIdRef.current) return;
      setError("Search failed");
      setResults([]);
    } finally {
      if (currentRequest === requestIdRef.current) setLoading(false);
    }
  };

  // Handles every keystroke — sets state immediately, then debounces the fetch
  const handleChange = (e) => {
    const nextQuery = e.target.value;
    setQuery(nextQuery);
    setOpen(true);

    // Cancel any pending search
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      // Invalidate in-flight requests and reset
      requestIdRef.current++;
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    // Debounce — fire search 300ms after the user stops typing
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
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleSelect(results[0]);
    }
  };

  const handleClear = () => {
    // Cancel any pending debounce + invalidate in-flight requests
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current++;

    setQuery("");
    setResults([]);
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  };

  const showDropdown = open && (loading || results.length > 0 || error);

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
          placeholder="Search city…"
          className="city-search-input"
          aria-label="Search for a city"
          aria-expanded={showDropdown}
          aria-controls="city-search-results"
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
        <div
          id="city-search-results"
          className="city-search-dropdown"
          role="listbox"
        >
          {loading && (
            <div className="city-search-state">
              <Loader2 size={14} className="city-search-spinner" />
              <span>Searching…</span>
            </div>
          )}

          {!loading && error && (
            <div className="city-search-state city-search-state--error">
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && query.length >= 2 && (
            <div className="city-search-state">No cities found</div>
          )}

          {!loading &&
            results.map((city) => (
              <button
                key={`${city.latitude}-${city.longitude}-${city.id || city.name}`}
                onClick={() => handleSelect(city)}
                className="city-search-result"
                role="option"
              >
                <MapPin size={14} className="city-search-result-icon" />
                <div className="city-search-result-text">
                  <div className="city-search-result-name">{city.name}</div>
                  <div className="city-search-result-meta">
                    {city.admin1 && <span>{city.admin1}</span>}
                    {city.admin1 && city.country && <span> · </span>}
                    {city.country && <span>{city.country}</span>}
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}