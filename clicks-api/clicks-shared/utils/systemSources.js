/** System-owned sources hidden from admin Source Configuration and pickers. */
const HIDDEN_SOURCE_NAMES = new Set(["historical import"]);

function isHiddenSourceName(name) {
  return HIDDEN_SOURCE_NAMES.has(String(name || "").trim().toLowerCase());
}

function filterVisibleSources(sources) {
  return (Array.isArray(sources) ? sources : []).filter(
    (source) => !isHiddenSourceName(source?.mainSourceName)
  );
}

module.exports = {
  HIDDEN_SOURCE_NAMES,
  isHiddenSourceName,
  filterVisibleSources,
};
