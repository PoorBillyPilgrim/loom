#!/usr/bin/env node
/**
 * check-mantine-a11y.mjs
 *
 * PostToolUse hook: runs after every Edit/Write.
 * Detects @mantine/core component imports in the modified file and ensures
 * each one that has a11y implications is present in the
 * settings["jsx-a11y"].components map in eslint.config.js.
 *
 * Usage (via hook): jq -r '.tool_input.file_path' | xargs node <this-file>
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ESLINT_CONFIG_PATH = resolve(__dirname, "../../eslint.config.js");

/**
 * All Mantine components with a11y implications and their native HTML
 * element equivalents. When a component is found in a file's imports and
 * is missing from eslint.config.js, it will be added here.
 */
const MANTINE_ELEMENT_MAP = {
  // Media
  Image: "img",
  Avatar: "img",

  // Links
  Anchor: "a",
  NavLink: "a",
  Link: "a",

  // Buttons / interactive
  Button: "button",
  ActionIcon: "button",
  UnstyledButton: "button",

  // Headings
  Title: "h1",

  // Form inputs
  TextInput: "input",
  PasswordInput: "input",
  NumberInput: "input",
  PinInput: "input",
  Checkbox: "input",
  Radio: "input",
  Switch: "input",
  FileInput: "input",
  Select: "input",
  MultiSelect: "input",
  Textarea: "textarea",
  NativeSelect: "select",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract Mantine component names imported in a source file, resolving
 * aliases so the returned name matches what appears in JSX.
 *
 * e.g. `import { NavLink as MantineNavLink } from "@mantine/core"`
 *      → returns "MantineNavLink"
 */
function extractMantineImports(source) {
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']@mantine\/core["']/g;
  const jsxNames = [];
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const specifiers = match[1].split(",");
    for (const specifier of specifiers) {
      const trimmed = specifier.trim();
      if (!trimmed) continue;
      // "NavLink as MantineNavLink" → jsxName = "MantineNavLink"
      // "Image"                     → jsxName = "Image"
      const asMatch = trimmed.match(/^\S+\s+as\s+(\S+)$/);
      const originalMatch = trimmed.match(/^(\S+)$/);
      const jsxName = asMatch
        ? asMatch[1]
        : originalMatch
          ? originalMatch[1]
          : null;
      if (jsxName) jsxNames.push(jsxName);
    }
  }
  return jsxNames;
}

/**
 * Parse the existing component names out of the
 * settings["jsx-a11y"].components block in eslint.config.js.
 */
function parseExistingComponents(configSource) {
  const blockMatch = configSource.match(
    /["']jsx-a11y["']\s*:\s*\{[^}]*components\s*:\s*\{([^}]*)\}/s,
  );
  if (!blockMatch) return new Set();

  const entries = [...blockMatch[1].matchAll(/(\w+)\s*:/g)];
  return new Set(entries.map(e => e[1]));
}

/**
 * Insert new component entries before the closing `}` of the
 * settings["jsx-a11y"].components block.
 */
function insertComponents(configSource, toAdd) {
  // Find the components block closing brace
  const blockStart = configSource.search(
    /["']jsx-a11y["']\s*:\s*\{[^}]*components\s*:\s*\{/s,
  );
  if (blockStart === -1) return configSource;

  // Find the `components: {` substring offset
  const componentsMatch = configSource
    .slice(blockStart)
    .match(/components\s*:\s*\{/);
  if (!componentsMatch) return configSource;

  const openBrace =
    blockStart + componentsMatch.index + componentsMatch[0].length - 1;

  // Walk forward to find the matching closing brace
  let depth = 0;
  let closingIndex = -1;
  for (let i = openBrace; i < configSource.length; i++) {
    if (configSource[i] === "{") depth++;
    else if (configSource[i] === "}") {
      depth--;
      if (depth === 0) {
        closingIndex = i;
        break;
      }
    }
  }
  if (closingIndex === -1) return configSource;

  const newEntries = toAdd
    .map(({ jsxName, element }) => `          ${jsxName}: "${element}",`)
    .join("\n");

  return (
    configSource.slice(0, closingIndex) +
    "\n" +
    newEntries +
    "\n        " +
    configSource.slice(closingIndex)
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

const filePath = process.argv[2];

if (!filePath) process.exit(0);

const ext = extname(filePath);
if (ext !== ".ts" && ext !== ".tsx") process.exit(0);

let source;
try {
  source = readFileSync(filePath, "utf8");
} catch {
  process.exit(0);
}

const jsxNames = extractMantineImports(source);
if (jsxNames.length === 0) process.exit(0);

let configSource;
try {
  configSource = readFileSync(ESLINT_CONFIG_PATH, "utf8");
} catch {
  console.error(`[a11y-hook] Could not read ${ESLINT_CONFIG_PATH}`);
  process.exit(0);
}

const existing = parseExistingComponents(configSource);

const toAdd = [];
for (const jsxName of jsxNames) {
  if (existing.has(jsxName)) continue;

  // If it's an alias, check if the original name is in the map
  const element = MANTINE_ELEMENT_MAP[jsxName];
  if (!element) continue; // not a component we track

  toAdd.push({ jsxName, element });
}

if (toAdd.length === 0) process.exit(0);

const updated = insertComponents(configSource, toAdd);
writeFileSync(ESLINT_CONFIG_PATH, updated, "utf8");

const summary = toAdd
  .map(({ jsxName, element }) => `${jsxName} → ${element}`)
  .join(", ");
console.log(`[a11y-hook] Added to jsx-a11y components map: ${summary}`);
