// src/components/CitySearch.jsx

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { geocodeCity } from "../services/weatherApi";
import "./CitySearch.css";

export default function CitySearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
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

  const runSearch = async (term) => {
    const currentRequest = ++requestIdRef.current;
    setLoading(true);

    try {
      const cities = await geocodeCity(term);
      if (currentRequest !== requestIdRef.current) return;
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

  const handleChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      requestIdRef.current++;
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
    inputRef.current?.blur();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === "Enter" && results.length > 0) {
      event.preventDefault();
      handleSelect(results[0]);
    }
  };

  const handleClear = () => {
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
