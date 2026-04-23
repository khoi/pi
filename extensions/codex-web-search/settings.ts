import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEEP_SEARCH_QUERY_BUDGET,
  DEEP_SEARCH_TIMEOUT_MS,
  DEFAULT_DEEP_MAX_SOURCES,
  DEFAULT_FAST_MAX_SOURCES,
  DEFUDDLE_TIMEOUT_MS,
  FAST_SEARCH_QUERY_BUDGET,
  FAST_SEARCH_TIMEOUT_MS,
  MAX_ALLOWED_SOURCES,
  MAX_QUERY_BUDGET,
  MAX_TIMEOUT_MS,
  MIN_QUERY_BUDGET,
  MIN_TIMEOUT_MS,
} from "./constants.ts";
import type { DefuddleMode, SearchFreshness, SearchMode, WebSearchSettings } from "./types.ts";

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  defaultMode: "fast",
  fastFreshness: "cached",
  deepFreshness: "live",
  fastMaxSources: DEFAULT_FAST_MAX_SOURCES,
  deepMaxSources: DEFAULT_DEEP_MAX_SOURCES,
  defuddleMode: "direct",
  fastTimeoutMs: FAST_SEARCH_TIMEOUT_MS,
  deepTimeoutMs: DEEP_SEARCH_TIMEOUT_MS,
  defuddleTimeoutMs: DEFUDDLE_TIMEOUT_MS,
  fastQueryBudget: FAST_SEARCH_QUERY_BUDGET,
  deepQueryBudget: DEEP_SEARCH_QUERY_BUDGET,
};

export const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
export const SETTINGS_KEY = "codex-web-search";

type RootSettings = Record<string, unknown>;

export async function loadSettings(path = SETTINGS_PATH): Promise<WebSearchSettings> {
  const settings = await loadRootSettings(path);
  return normalizeSettings(settings[SETTINGS_KEY]);
}

export async function saveSettings(
  settings: Partial<WebSearchSettings>,
  path = SETTINGS_PATH
): Promise<WebSearchSettings> {
  const rootSettings = await loadRootSettings(path);
  const normalized = normalizeSettings(settings);
  await saveRootSettings(
    {
      ...rootSettings,
      [SETTINGS_KEY]: normalized,
    },
    path
  );
  return normalized;
}

export function formatSettings(settings: WebSearchSettings): string {
  return [
    `Stored in ${SETTINGS_PATH} under \"${SETTINGS_KEY}\".`,
    "",
    "Search defaults:",
    `  Default mode: ${settings.defaultMode}`,
    `  Fast freshness: ${settings.fastFreshness}`,
    `  Deep freshness: ${settings.deepFreshness}`,
    `  Fast max sources: ${settings.fastMaxSources}`,
    `  Deep max sources: ${settings.deepMaxSources}`,
    "",
    "Defuddle behavior:",
    `  Mode: ${settings.defuddleMode}`,
    "",
    "Timeouts:",
    `  Fast: ${formatDuration(settings.fastTimeoutMs)}`,
    `  Deep: ${formatDuration(settings.deepTimeoutMs)}`,
    `  Defuddle: ${formatDuration(settings.defuddleTimeoutMs)}`,
    "",
    "Query budgets:",
    `  Fast: ${settings.fastQueryBudget}`,
    `  Deep: ${settings.deepQueryBudget}`,
  ].join("\n");
}

async function loadRootSettings(path: string): Promise<RootSettings> {
  try {
    const raw = await readFile(path, "utf-8");
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as RootSettings)
        : {};
    } catch {
      return {};
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveRootSettings(settings: RootSettings, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export function normalizeSettings(value: unknown): WebSearchSettings {
  const candidate = value && typeof value === "object" ? value : {};
  const typedCandidate = candidate as {
    defaultMode?: unknown;
    fastFreshness?: unknown;
    deepFreshness?: unknown;
    fastMaxSources?: unknown;
    deepMaxSources?: unknown;
    defaultMaxSources?: unknown;
    defuddleMode?: unknown;
    fastTimeoutMs?: unknown;
    deepTimeoutMs?: unknown;
    defuddleTimeoutMs?: unknown;
    fastQueryBudget?: unknown;
    deepQueryBudget?: unknown;
  };
  const legacyMaxSources = asOptionalIntegerInRange(
    typedCandidate.defaultMaxSources,
    1,
    MAX_ALLOWED_SOURCES
  );

  return {
    defaultMode: asMode(typedCandidate.defaultMode, DEFAULT_WEB_SEARCH_SETTINGS.defaultMode),
    fastFreshness: asFreshness(
      typedCandidate.fastFreshness,
      DEFAULT_WEB_SEARCH_SETTINGS.fastFreshness
    ),
    deepFreshness: asFreshness(
      typedCandidate.deepFreshness,
      DEFAULT_WEB_SEARCH_SETTINGS.deepFreshness
    ),
    fastMaxSources: asIntegerInRange(
      typedCandidate.fastMaxSources,
      1,
      MAX_ALLOWED_SOURCES,
      legacyMaxSources ?? DEFAULT_WEB_SEARCH_SETTINGS.fastMaxSources
    ),
    deepMaxSources: asIntegerInRange(
      typedCandidate.deepMaxSources,
      1,
      MAX_ALLOWED_SOURCES,
      legacyMaxSources ?? DEFAULT_WEB_SEARCH_SETTINGS.deepMaxSources
    ),
    defuddleMode: asDefuddleMode(
      typedCandidate.defuddleMode,
      DEFAULT_WEB_SEARCH_SETTINGS.defuddleMode
    ),
    fastTimeoutMs: asIntegerInRange(
      typedCandidate.fastTimeoutMs,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      DEFAULT_WEB_SEARCH_SETTINGS.fastTimeoutMs
    ),
    deepTimeoutMs: asIntegerInRange(
      typedCandidate.deepTimeoutMs,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      DEFAULT_WEB_SEARCH_SETTINGS.deepTimeoutMs
    ),
    defuddleTimeoutMs: asIntegerInRange(
      typedCandidate.defuddleTimeoutMs,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      DEFAULT_WEB_SEARCH_SETTINGS.defuddleTimeoutMs
    ),
    fastQueryBudget: asIntegerInRange(
      typedCandidate.fastQueryBudget,
      MIN_QUERY_BUDGET,
      MAX_QUERY_BUDGET,
      DEFAULT_WEB_SEARCH_SETTINGS.fastQueryBudget
    ),
    deepQueryBudget: asIntegerInRange(
      typedCandidate.deepQueryBudget,
      MIN_QUERY_BUDGET,
      MAX_QUERY_BUDGET,
      DEFAULT_WEB_SEARCH_SETTINGS.deepQueryBudget
    ),
  };
}

function formatDuration(value: number): string {
  if (value % 1_000 === 0) {
    return `${value / 1_000}s (${value} ms)`;
  }
  return `${value} ms`;
}

function asMode(value: unknown, fallback: SearchMode): SearchMode {
  return value === "fast" || value === "deep" ? value : fallback;
}

function asFreshness(value: unknown, fallback: SearchFreshness): SearchFreshness {
  return value === "cached" || value === "live" ? value : fallback;
}

function asDefuddleMode(value: unknown, fallback: DefuddleMode): DefuddleMode {
  return value === "off" || value === "direct" || value === "fallback" || value === "both"
    ? value
    : fallback;
}

function asOptionalIntegerInRange(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const rounded = Math.trunc(value);
  if (rounded < min || rounded > max) {
    return undefined;
  }

  return rounded;
}

function asIntegerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return asOptionalIntegerInRange(value, min, max) ?? fallback;
}
