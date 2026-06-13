const COUNTRY_DISPLAY_ALIASES = new Map([
  ["united states of america (the)", "United States"],
  ["united states of america", "United States"],
  ["united states", "United States"],
  ["usa", "United States"],
  ["u.s.a.", "United States"],
  ["us", "United States"],
  ["u.s.", "United States"],
  [
    "united kingdom of great britain and northern ireland (the)",
    "United Kingdom",
  ],
  [
    "united kingdom of great britain and northern ireland",
    "United Kingdom",
  ],
  ["united kingdom", "United Kingdom"],
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookupKey(value) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

export function formatDisplayCountry(value) {
  const country = trimString(value);
  if (!country) {
    return "";
  }

  const alias = COUNTRY_DISPLAY_ALIASES.get(normalizeLookupKey(country));
  if (alias) {
    return alias;
  }

  return country.replace(/\s+\(the\)$/i, "").trim();
}

export function formatLocationDisplayLabel(name, country) {
  const displayName = trimString(name);
  const displayCountry = formatDisplayCountry(country);

  if (!displayName) {
    return displayCountry;
  }

  return displayCountry ? `${displayName}, ${displayCountry}` : displayName;
}
