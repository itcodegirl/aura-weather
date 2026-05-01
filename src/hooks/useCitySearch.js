import { useState, useEffect, useRef, useCallback } from "react";
import { geocodeCity } from "../api";
import { parseCoordinates } from "../utils/weatherUnits";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_QUERY_LENGTH = 2;

export function useCitySearch({ onSelect } = {}) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resolvedQuery, setResolvedQuery] = useState("");

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const geocodeRequestRef = useRef(null);
  const isMountedRef = useRef(false);

  const abortGeocodeRequest = useCallback(() => {
    if (!geocodeRequestRef.current) return;
    geocodeRequestRef.current.abort();
    geocodeRequestRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      abortGeocodeRequest();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [abortGeocodeRequest]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    if (!open) {
      return undefined;
    }

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

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
  const canShowNoResults =
    normalizedQuery.length >= MIN_SEARCH_QUERY_LENGTH &&
    resolvedQuery === normalizedQuery &&
    !loading &&
    !error &&
    results.length === 0;

  const runSearch = useCallback(
    async (term) => {
      if (!isMountedRef.current) return;
      abortGeocodeRequest();

      const currentRequest = ++requestIdRef.current;
      if (!isMountedRef.current) return;
      setLoading(true);
      const controller = new AbortController();
      geocodeRequestRef.current = controller;

      try {
        const cities = await geocodeCity(term, { signal: controller.signal });
        if (isMountedRef.current && currentRequest === requestIdRef.current) {
          setResults(
            Array.isArray(cities)
              ? cities.filter((city) => city && typeof city === "object")
              : []
          );
          setError(null);
          setResolvedQuery(term);
        }
      } catch (searchError) {
        if (
          isMountedRef.current &&
          currentRequest === requestIdRef.current &&
          searchError?.name !== "AbortError"
        ) {
          setError("Couldn't fetch locations. Try again.");
          setResults([]);
          setResolvedQuery(term);
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
    },
    [abortGeocodeRequest]
  );

  const setQuery = useCallback(
    (nextValue) => {
      const nextQuery =
        typeof nextValue === "string" ? nextValue : "";

      setQueryState(nextQuery);
      setOpen(true);
      setActiveIndex(-1);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmedQuery = nextQuery.trim();
      if (trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
        requestIdRef.current += 1;
        abortGeocodeRequest();
        setResults([]);
        setError(null);
        setLoading(false);
        setResolvedQuery("");
        return;
      }

      setResults([]);
      setError(null);
      setLoading(true);
      setResolvedQuery("");
      debounceRef.current = setTimeout(() => {
        runSearch(trimmedQuery);
      }, SEARCH_DEBOUNCE_MS);
    },
    [abortGeocodeRequest, runSearch]
  );

  const handleChange = useCallback(
    (event) => {
      setQuery(event.target.value);
    },
    [setQuery]
  );

  const handleSelect = useCallback(
    (city) => {
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
      setQueryState("");
      setResults([]);
      setOpen(false);
      setActiveIndex(-1);
      setResolvedQuery("");
      inputRef.current?.blur();
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (event) => {
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
    },
    [results, showDropdown, activeIndexSafe, handleSelect]
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortGeocodeRequest();
    requestIdRef.current += 1;

    setQueryState("");
    setResults([]);
    setError(null);
    setLoading(false);
    setActiveIndex(-1);
    setResolvedQuery("");
    inputRef.current?.focus();
  }, [abortGeocodeRequest]);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    clear,
    open,
    activeIndex,
    normalizedQuery,
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
    handleClear: clear,
  };
}
