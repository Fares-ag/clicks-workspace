/** Keep in sync with clicks-shared/utils/systemSources.js */
const HIDDEN_SOURCE_NAMES = new Set(["historical import"]);

export function isHiddenSourceName(name) {
  return HIDDEN_SOURCE_NAMES.has(String(name || "").trim().toLowerCase());
}

export function filterVisibleSources(sources) {
  return (Array.isArray(sources) ? sources : []).filter(
    (source) => !isHiddenSourceName(source?.mainSourceName)
  );
}
