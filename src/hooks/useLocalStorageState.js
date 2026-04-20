import { useEffect, useState } from "react";

function readStorageValue(key, defaultValue) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return defaultValue;
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored;
  } catch {
    return defaultValue;
  }
}

function writeStorageValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

export function useLocalStorageState(
  key,
  defaultValue,
  options = {}
) {
  const {
    deserialize = (value) => value,
    serialize = (value) => String(value),
  } = options;

  const [value, setValue] = useState(() => {
    const stored = readStorageValue(key, null);
    if (stored === null) return defaultValue;

    try {
      const parsed = deserialize(stored);
      return parsed == null ? defaultValue : parsed;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      writeStorageValue(key, serialize(value));
    } catch {
      // localStorage may be unavailable or serialization may fail.
    }
  }, [key, value, serialize]);

  return [value, setValue];
}
