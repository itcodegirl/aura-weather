import { useEffect, useState } from "react";

function readStorageValue(key, defaultValue) {
  try {
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
    const parsed = deserialize(stored);
    return parsed === null ? defaultValue : parsed;
  });

  useEffect(() => {
    writeStorageValue(key, serialize(value));
  }, [key, value, serialize]);

  return [value, setValue];
}

