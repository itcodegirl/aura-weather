import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { geocodeCity } from "../api";
import { parseCoordinates } from "../utils/weatherUnits";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_QUERY_LENGTH = 2;

export function useCitySearch({ onSelect, idleResults = [] } = {}) {
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
  const safeIdleResults = useMemo(
    () =>
      Array.isArray(idleResults)
        ? idleResults.filter((city) => city && typeof city === "object")
        : [],
    [idleResults]
  );
  const visibleResults =
    normalizedQuery.length === 0 ? safeIdleResults : results;
  const showDropdown =
    open &&
    (loading ||
      visibleResults.length > 0 ||
      error ||
      normalizedQuery.length >= MIN_SEARCH_QUERY_LENGTH);

  const activeIndexSafe =
    showDropdown && activeIndex >= 0 && visibleResults.length > 0
      ? Math.min(activeIndex, visibleResults.length - 1)
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

  /*
   * Close the dropdown when focus leaves the combobox subtree entirely
   * (e.g. the user pressed Tab to move on). The pointerdown click-
   * outside handler covers mouse / touch dismissal, but a keyboard
   * Tab doesn't fire pointerdown — without this onBlur the dropdown
   * was orphaned visually and in the AT tree after Tab. Use
   * event.relatedTarget to keep the dropdown open when focus moves
   * to a result option inside the container (e.g. SR users navigating
   * the listbox with virtual cursor).
   */
  const handleBlur = useCallback(
    (event) => {
      const container = containerRef.current;
      const nextFocus = event.relatedTarget;
      if (
        container &&
        nextFocus instanceof Element &&
        container.contains(nextFocus)
      ) {
        return;
      }
      setOpen(false);
      setActiveIndex(-1);
    },
    []
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
      /*
       * Committing a result closes the popup but must keep focus in the
       * textbox (ARIA APG combobox), the same rule the Escape handler
       * follows. Blurring here dropped focus onto <body>, so the next Tab
       * restarted from the top of the document instead of continuing past
       * the search field.
       */
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setActiveIndex(-1);
        // Escape closes the popup but must keep focus in the textbox (ARIA
        // APG combobox). Blurring dropped focus onto <body>, so the next Tab
        // restarted from the top of the document — back through the skip
        // link and the whole header. The sibling clear() handler already
        // refocuses the input; this now matches it.
        return;
      }

      if (event.key === "ArrowDown") {
        if (visibleResults.length === 0) return;
        event.preventDefault();
        if (!showDropdown) {
          setOpen(true);
          setActiveIndex(0);
          return;
        }
        setActiveIndex((prev) =>
          prev < 0 ? 0 : Math.min(prev + 1, visibleResults.length - 1)
        );
        return;
      }

      if (event.key === "ArrowUp") {
        if (visibleResults.length === 0) return;
        event.preventDefault();
        if (!showDropdown) {
          setOpen(true);
          setActiveIndex(visibleResults.length - 1);
          return;
        }
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        /*
         * Enter may only commit an option the user actually highlighted.
         * Nothing here auto-highlights the first result, so the old
         * `activeIndexSafe >= 0 ? activeIndexSafe : 0` fallback committed
         * results[0] blind — and with an empty query the listbox holds
         * recent/saved suggestions, so Enter in an empty search box
         * navigated to a city the user never chose.
         */
        if (activeIndexSafe < 0) {
          return;
        }
        event.preventDefault();
        const city = visibleResults[activeIndexSafe];
        if (city) {
          handleSelect(city);
        }
      }
    },
    [visibleResults, showDropdown, activeIndexSafe, handleSelect]
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
    results: visibleResults,
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
    handleBlur,
    handleClear: clear,
  };
}
