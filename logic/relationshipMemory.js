/**
 * Relationship memory — evolving narrative themes across Logic sessions.
 * @module logic/relationshipMemory
 */

import { logicDebug } from "./shared.js";
import { extractPromptTopics } from "./engines/topicContext.js";

const STORAGE_KEY = "brieftick_logic_relationship_v1";
const MAX_THEMES = 24;
const MAX_PROMPTS = 40;

/**
 * @typedef {Object} ThemeRecord
 * @property {string} id
 * @property {string} label
 * @property {number} count
 * @property {number} lastAt
 */

/**
 * @returns {{ themes: ThemeRecord[], prompts: { text: string, kind: string, at: number }[] }}
 */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { themes: [], prompts: [] };
    const parsed = JSON.parse(raw);
    return {
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
    };
  } catch (_) {
    return { themes: [], prompts: [] };
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {}
}

const THEME_PATTERNS = [
  { id: "iran_geopolitics", label: "Iran / Middle East geopolitics", re: /iran|middle east|hormuz|sanctions/i },
  { id: "oil_sensitivity", label: "Oil sensitivity", re: /oil|crude|opec|energy price/i },
  { id: "inflation", label: "Inflation narrative", re: /inflation|cpi|pce|prices/i },
  { id: "rates", label: "Rate / Fed expectations", re: /fed|fomc|rates|yields/i },
  { id: "ai_leadership", label: "AI leadership", re: /\bai\b|semiconductor|nvidia|hyperscaler/i },
  { id: "volatility", label: "Volatility regime", re: /vix|volatility|vol /i },
  { id: "shipping", label: "Shipping / supply chain", re: /shipping|freight|supply chain|logistics/i },
  { id: "recession", label: "Recession risk", re: /recession|hard landing|slowdown/i },
];

/**
 * @param {string} prompt
 * @param {string} [questionKind]
 */
export function recordRelationshipMemory(prompt, questionKind) {
  const store = loadStore();
  const now = Date.now();
  const topics = extractPromptTopics(prompt);

  for (const pat of THEME_PATTERNS) {
    if (pat.re.test(prompt || "")) {
      const existing = store.themes.find((t) => t.id === pat.id);
      if (existing) {
        existing.count += 1;
        existing.lastAt = now;
      } else {
        store.themes.push({ id: pat.id, label: pat.label, count: 1, lastAt: now });
      }
    }
  }
  for (const topic of topics) {
    const id = `topic_${topic}`;
    const existing = store.themes.find((t) => t.id === id);
    if (existing) {
      existing.count += 1;
      existing.lastAt = now;
    } else {
      store.themes.push({ id, label: topic.replace("_", " "), count: 1, lastAt: now });
    }
  }

  store.prompts.unshift({
    text: (prompt || "").slice(0, 200),
    kind: questionKind || "general",
    at: now,
  });
  store.prompts = store.prompts.slice(0, MAX_PROMPTS);
  store.themes = store.themes
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, MAX_THEMES);

  saveStore(store);
  logicDebug("relationshipMemory recorded", { themes: store.themes.length });
}

/**
 * @param {string} prompt
 * @returns {{ relatedThemes: string[], memoryHint: string, priorPrompts: string[] }}
 */
export function buildRelationshipContext(prompt) {
  const store = loadStore();
  const related = store.themes
    .filter((t) => t.count >= 1 && Date.now() - t.lastAt < 7 * 24 * 3600 * 1000)
    .slice(0, 5)
    .map((t) => t.label);

  const prior = store.prompts
    .filter((p) => p.text && p.text !== prompt)
    .slice(0, 3)
    .map((p) => p.text);

  let memoryHint = "";
  if (related.length) {
    memoryHint = `Prior Logic themes in this session: ${related.join(", ")}.`;
  }
  if (prior.length && /iran|oil|inflation|rates|ai/i.test(prompt || "")) {
    const echo = prior.find((p) =>
      /iran|oil|inflation|rates|ai|shipping/i.test(p)
    );
    if (echo) memoryHint += ` Earlier you explored: "${echo.slice(0, 80)}…"`;
  }

  return { relatedThemes: related, memoryHint: memoryHint.trim(), priorPrompts: prior };
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {string} prompt
 */
export function applyRelationshipMemoryToResponse(res, prompt) {
  const { memoryHint, relatedThemes } = buildRelationshipContext(prompt);
  if (!memoryHint) return res;
  const hint = memoryHint.slice(0, 220);
  return {
    ...res,
    memoryHint: res.memoryHint ? `${res.memoryHint} ${hint}` : hint,
    relatedThemes,
    optionalCards: {
      ...(res.optionalCards || {}),
      narrativeLink: hint,
    },
  };
}
