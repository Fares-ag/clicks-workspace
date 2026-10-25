function hasArabicScript(value) {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

function normalizeLatin(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLatin(value) {
  return normalizeLatin(value).replace(/\s+/g, "");
}

function normalizeArabic(value) {
  return String(value || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function compactArabic(value) {
  return normalizeArabic(value).replace(/\s+/g, "");
}

function levenshtein(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const m = left.length;
  const n = right.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a, b) {
  const left = compactLatin(a);
  const right = compactLatin(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const dist = levenshtein(left, right);
  return 1 - dist / Math.max(left.length, right.length);
}

function fuzzyThreshold(text) {
  const len = compactLatin(text).length;
  if (len <= 4) return 0.84;
  if (len <= 7) return 0.72;
  return 0.65;
}

module.exports = {
  hasArabicScript,
  normalizeLatin,
  compactLatin,
  normalizeArabic,
  compactArabic,
  levenshtein,
  similarity,
  fuzzyThreshold,
};
