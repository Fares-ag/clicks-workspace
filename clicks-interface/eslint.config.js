/**
 * Flat ESLint config (ESLint 8.57 picks this file up automatically).
 *
 * Replaces the CRA-era `eslintConfig: { extends: ["react-app"] }` block in
 * package.json: `eslint-config-react-app` is not installed, so every lint run
 * aborted with "couldn't find the config react-app to extend from" before
 * checking a single file.
 *
 * Deliberately depends on nothing beyond eslint itself (and @eslint/js, which
 * ships as an eslint dependency), so `npm run lint` works with the existing
 * lockfile — no new install step.
 */
const js = require("@eslint/js");

/** Globals the browser bundle relies on (no `globals` package needed). */
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  console: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  File: "readonly",
  FileReader: "readonly",
  Blob: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Audio: "readonly",
  Image: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  AbortController: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
  WebSocket: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  location: "readonly",
  history: "readonly",
  alert: "readonly",
  confirm: "readonly",
  prompt: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  queueMicrotask: "readonly",
  structuredClone: "readonly",
  performance: "readonly",
  atob: "readonly",
  btoa: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  IntersectionObserver: "readonly",
  ResizeObserver: "readonly",
  MutationObserver: "readonly",
  getComputedStyle: "readonly",
  matchMedia: "readonly",
  crypto: "readonly",
  process: "readonly",
};

/** Globals for the Node-side files (config + CommonJS tests). */
const nodeGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  global: "readonly",
};

module.exports = [
  {
    ignores: ["dist/**", "build/**", "coverage/**", "node_modules/**", "public/**"],
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      // JSX counts as a use of the imported symbol, but without the React
      // plugin ESLint cannot see that. Keep unused vars as a warning and let
      // component/React imports through.
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^(React|[A-Z])",
        },
      ],
      "no-undef": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // node:test files — some are CommonJS, some ESM.
    files: ["**/*.test.js", "**/*.test.jsx"],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
  {
    // Tooling config files run in Node as CommonJS.
    files: ["eslint.config.js", "*.config.js", "*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
  },
];
