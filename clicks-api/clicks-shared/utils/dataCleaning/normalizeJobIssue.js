const {
  JOB_ISSUE_CATALOG,
  UNMAPPED_ISSUE,
  getIssueById,
} = require("../../constants/jobIssueCatalog");
const {
  hasArabicScript,
  normalizeLatin,
  compactLatin,
  compactArabic,
  similarity,
  fuzzyThreshold,
} = require("./text");

function unmatched(rawIssue) {
  return {
    canonicalIssueId: UNMAPPED_ISSUE.id,
    canonicalIssueLabel: UNMAPPED_ISSUE.label,
    suggestedJobType: "",
    confidence: 0,
    method: "unmatched",
    rawIssue,
  };
}

function toResult(row, confidence, method, rawIssue) {
  return {
    canonicalIssueId: row.id,
    canonicalIssueLabel: row.label,
    suggestedJobType: row.jobType,
    confidence,
    method,
    rawIssue,
  };
}

function buildAliasIndex(extraAliases = []) {
  const latin = new Map();
  const arabic = new Map();

  for (const row of JOB_ISSUE_CATALOG) {
    for (const alias of row.aliasesEn || []) {
      latin.set(compactLatin(alias), row);
    }
    latin.set(compactLatin(row.label), row);
    for (const alias of row.aliasesAr || []) {
      arabic.set(compactArabic(alias), row);
    }
  }

  for (const extra of extraAliases) {
    const row = getIssueById(extra.canonicalIssueId);
    if (!row || !extra.alias) continue;
    if (hasArabicScript(extra.alias)) {
      arabic.set(compactArabic(extra.alias), row);
    } else {
      latin.set(compactLatin(extra.alias), row);
    }
  }

  return { latin, arabic };
}

function findContains(rawCompact, index) {
  let best = null;
  let bestLen = 0;
  for (const [alias, row] of index) {
    if (alias.length < 3) continue;
    if (rawCompact.includes(alias) || alias.includes(rawCompact)) {
      if (alias.length > bestLen) {
        best = row;
        bestLen = alias.length;
      }
    }
  }
  return best;
}

function normalizeJobIssue(issue, jobType, extraAliases = []) {
  const rawIssue = String(issue || "").trim();
  if (!rawIssue) return unmatched(rawIssue);

  const { latin, arabic } = buildAliasIndex(extraAliases);
  const latinCompact = compactLatin(rawIssue);
  const arabicCompact = compactArabic(rawIssue);

  if (latinCompact && latin.has(latinCompact)) {
    return toResult(latin.get(latinCompact), 1, "exact", rawIssue);
  }
  if (arabicCompact && arabic.has(arabicCompact)) {
    return toResult(arabic.get(arabicCompact), 0.98, "arabic", rawIssue);
  }

  if (hasArabicScript(rawIssue) && arabicCompact) {
    const arHit = findContains(arabicCompact, arabic);
    if (arHit) return toResult(arHit, 0.9, "arabic", rawIssue);
  }

  if (latinCompact) {
    const containHit = findContains(latinCompact, latin);
    if (containHit) return toResult(containHit, 0.88, "alias", rawIssue);

    const scored = JOB_ISSUE_CATALOG.map((row) => {
      const labels = [row.label, ...(row.aliasesEn || [])];
      const score = Math.max(...labels.map((alias) => similarity(rawIssue, alias)));
      return { row, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];
    const minScore = fuzzyThreshold(rawIssue);
    if (
      best &&
      best.score >= minScore &&
      (!second || best.score - second.score >= 0.05)
    ) {
      return toResult(best.row, Number(best.score.toFixed(2)), "fuzzy", rawIssue);
    }
  }

  const typeHint = String(jobType || "").trim();
  if (typeHint) {
    const byType = JOB_ISSUE_CATALOG.find((row) => row.jobType === typeHint);
    if (byType) {
      return toResult(byType, 0.45, "jobTypeHint", rawIssue);
    }
  }

  return unmatched(rawIssue);
}

module.exports = {
  normalizeJobIssue,
};
