'use strict';
/*
 * Settings shape, defaults, and storage access.
 *
 * Uses storage.sync so rules follow the user between desktop and Firefox for
 * Android, and falls back to storage.local when sync is unavailable or full.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.AISlop = root.AISlop || {}).settings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULTS = {
    enabled: true,
    /* relaxed | balanced | strict — see engine.THRESHOLDS */
    sensitivity: 'balanced',
    /* blur | hide | label */
    action: 'blur',
    /* Show a small badge explaining why something was filtered. */
    showReason: true,
    /* Fetch the first 256 KB of images to read provenance metadata.
     * Off by default: it costs extra requests and needs broad host access. */
    checkMetadata: false,
    sites: {
      googleImages: true,
      googleSearch: true,
      youtube: true,
      bing: true,
      duckduckgo: true,
      reddit: true,
      generic: false
    },
    blockKeywords: [],
    blockDomains: [],
    blockChannels: [],
    allowDomains: [],
    allowChannels: [],
    stats: { blocked: 0, since: null }
  };

  const AREA = () => {
    /* Referencing an undeclared `chrome` throws, so both names are guarded —
     * this module is also loaded directly by the unit tests. */
    const api = typeof browser !== 'undefined' ? browser
      : (typeof chrome !== 'undefined' ? chrome : null);
    return api && api.storage ? api.storage : null;
  };

  function merge(stored) {
    const out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!stored) return out;
    for (const key of Object.keys(DEFAULTS)) {
      if (!(key in stored)) continue;
      const value = stored[key];
      if (key === 'sites' && value && typeof value === 'object') {
        Object.assign(out.sites, value);
      } else if (key === 'stats' && value && typeof value === 'object') {
        Object.assign(out.stats, value);
      } else if (Array.isArray(DEFAULTS[key])) {
        out[key] = Array.isArray(value) ? value.filter(Boolean).map(String) : [];
      } else if (value !== undefined && value !== null) {
        out[key] = value;
      }
    }
    return out;
  }

  async function load() {
    const storage = AREA();
    if (!storage) return merge(null);
    try {
      const synced = await storage.sync.get(null);
      if (synced && Object.keys(synced).length) return merge(synced);
    } catch { /* sync unavailable — fall through to local */ }
    try {
      const local = await storage.local.get(null);
      return merge(local);
    } catch {
      return merge(null);
    }
  }

  async function save(partial) {
    const storage = AREA();
    if (!storage) return;
    try {
      await storage.sync.set(partial);
    } catch {
      await storage.local.set(partial);
    }
  }

  /* The subset the engine needs, so callers do not pass the whole blob around. */
  function rulesFrom(settings) {
    return {
      blockKeywords: settings.blockKeywords,
      blockDomains: settings.blockDomains,
      blockChannels: settings.blockChannels,
      allowDomains: settings.allowDomains,
      allowChannels: settings.allowChannels
    };
  }

  return { DEFAULTS, load, save, merge, rulesFrom };
});
