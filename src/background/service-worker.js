'use strict';
/*
 * Background worker.
 *
 *  - performs the (optional) provenance fetch, because content scripts are
 *    bound by the page's CORS rules and the background is not
 *  - owns the block counter and the toolbar badge
 *  - applies "always block this source" clicks coming from the overlay
 *
 * Loaded as an MV3 service worker in Chrome and as an event page in Firefox;
 * the guard below covers both, since Firefox has already loaded the core
 * files via background.scripts by the time this runs.
 */

if (typeof importScripts === 'function' && !globalThis.AISlop?.engine) {
  importScripts(
    '../core/patterns.js',
    '../core/engine.js',
    '../core/media-scan.js',
    '../core/settings.js'
  );
}

(function (root) {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const { mediaScan, settings: settingsApi } = root.AISlop;

  /* URL -> scan result. Bounded so a long browsing session cannot grow it
   * without limit; search pages repeat the same thumbnails constantly, so even
   * a small cache has a high hit rate. */
  const CACHE = new Map();
  const CACHE_LIMIT = 500;
  const MAX_CONCURRENT = 4;
  let inFlight = 0;
  const queue = [];

  function cacheSet(url, value) {
    if (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(url, value);
  }

  async function hasHostAccess() {
    try {
      return await api.permissions.contains({ origins: ['<all_urls>'] });
    } catch {
      return false;
    }
  }

  /* Read at most MAX_BYTES even if the server ignores our Range header. */
  async function readHead(response) {
    const limit = mediaScan.MAX_BYTES;
    if (!response.body) {
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer.slice(0, limit));
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel().catch(() => {});
    const out = new Uint8Array(Math.min(total, limit));
    let offset = 0;
    for (const chunk of chunks) {
      if (offset >= out.length) break;
      out.set(chunk.subarray(0, out.length - offset), offset);
      offset += chunk.length;
    }
    return out;
  }

  async function scanUrl(url) {
    if (CACHE.has(url)) return CACHE.get(url);
    if (!/^https?:/i.test(url)) return null;
    if (!(await hasHostAccess())) return null;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Range: `bytes=0-${mediaScan.MAX_BYTES - 1}` },
        credentials: 'omit',
        cache: 'force-cache',
        redirect: 'follow'
      });
      if (!response.ok && response.status !== 206) {
        cacheSet(url, null);
        return null;
      }
      const bytes = await readHead(response);
      const result = mediaScan.scanBytes(bytes);
      cacheSet(url, result);
      return result;
    } catch {
      cacheSet(url, null);
      return null;
    }
  }

  /* Small semaphore: a results page can ask about dozens of images at once and
   * we do not want to look like a scraper to the host. */
  function enqueue(url) {
    return new Promise((resolve) => {
      queue.push({ url, resolve });
      pump();
    });
  }

  function pump() {
    while (inFlight < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      inFlight++;
      scanUrl(job.url)
        .then(job.resolve)
        .catch(() => job.resolve(null))
        .finally(() => {
          inFlight--;
          pump();
        });
    }
  }


  /* ------------------------------------------- catch-all site registration */

  /*
   * The manifest only declares the search engines we have adapters for. The
   * opt-in "every other site" mode therefore has to register its content
   * script at runtime, once the user has actually granted <all_urls>.
   */
  const GENERIC_SCRIPT_ID = 'aislop-generic';

  const GENERIC_FILES = {
    js: [
      'src/core/patterns.js',
      'src/core/engine.js',
      'src/core/settings.js',
      'src/content/adapters.js',
      'src/content/runtime.js'
    ],
    css: ['src/content/overlay.css']
  };

  /* MV2 has no scripting.registerContentScripts; Gecko's equivalent is
   * contentScripts.register, which hands back a handle to unregister with. */
  let mv2Handle = null;

  async function syncGenericScriptMv2(wanted) {
    if (wanted && !mv2Handle) {
      try {
        mv2Handle = await api.contentScripts.register({
          matches: ['<all_urls>'],
          js: GENERIC_FILES.js.map((file) => ({ file })),
          css: GENERIC_FILES.css.map((file) => ({ file })),
          runAt: 'document_idle'
        });
      } catch { /* permission revoked between the check and the call */ }
    } else if (!wanted && mv2Handle) {
      try { await mv2Handle.unregister(); } catch { /* already gone */ }
      mv2Handle = null;
    }
  }

  async function syncGenericScript() {
    const hasMv3 = !!api.scripting?.registerContentScripts;
    const hasMv2 = !!api.contentScripts?.register;
    if (!hasMv3 && !hasMv2) return;

    const current = await settingsApi.load();
    const wanted = !!current.sites?.generic && (await hasHostAccess());

    if (!hasMv3) return syncGenericScriptMv2(wanted);

    let registered = [];
    try {
      registered = await api.scripting.getRegisteredContentScripts({ ids: [GENERIC_SCRIPT_ID] });
    } catch { /* nothing registered yet */ }

    if (wanted && !registered.length) {
      try {
        await api.scripting.registerContentScripts([{
          id: GENERIC_SCRIPT_ID,
          matches: ['<all_urls>'],
          js: GENERIC_FILES.js,
          css: GENERIC_FILES.css,
          runAt: 'document_idle',
          persistAcrossSessions: true
        }]);
      } catch { /* Chrome refuses duplicates after a worker restart; harmless */ }
    } else if (!wanted && registered.length) {
      try {
        await api.scripting.unregisterContentScripts({ ids: [GENERIC_SCRIPT_ID] });
      } catch { /* already gone */ }
    }
  }

  api.storage?.onChanged?.addListener(() => { syncGenericScript(); });
  api.permissions?.onAdded?.addListener(() => { syncGenericScript(); });
  api.permissions?.onRemoved?.addListener(() => { syncGenericScript(); });
  syncGenericScript();

  /* ------------------------------------------------------------- counters */

  const perTab = new Map();

  function updateBadge(tabId, count) {
    if (tabId == null) return;
    const action = api.action || api.browserAction;
    if (!action) return;
    /* These return a promise in MV3 and undefined on older builds, so neither
     * a bare .catch nor an unhandled rejection is safe. */
    try {
      Promise.resolve(action.setBadgeText({ tabId, text: count ? String(count) : '' })).catch(() => {});
      Promise.resolve(action.setBadgeBackgroundColor?.({ tabId, color: '#7c3aed' })).catch(() => {});
    } catch { /* tab closed between the count and the badge update */ }
  }

  /*
   * storage.sync allows roughly two writes a second before it starts refusing
   * them, and scrolling an image results page can block dozens of items in
   * that time. So the total is accumulated in memory and flushed on a timer.
   */
  let unflushed = 0;
  let flushTimer = null;
  const FLUSH_MS = 15000;

  async function flushStats() {
    flushTimer = null;
    const count = unflushed;
    if (!count) return;
    unflushed = 0;
    const current = await settingsApi.load();
    await settingsApi.save({
      stats: {
        blocked: (current.stats.blocked || 0) + count,
        since: current.stats.since || new Date().toISOString()
      }
    });
  }

  function recordBlocked(tabId, count) {
    if (!count) return;
    const next = (perTab.get(tabId) || 0) + count;
    perTab.set(tabId, next);
    updateBadge(tabId, next);

    unflushed += count;
    if (!flushTimer) flushTimer = setTimeout(flushStats, FLUSH_MS);
  }

  /* The worker can be shut down at any point, so do not let a pending flush
   * die with it. */
  api.runtime.onSuspend?.addListener(() => { flushStats(); });

  api.tabs?.onRemoved.addListener((tabId) => perTab.delete(tabId));
  api.tabs?.onUpdated.addListener((tabId, changes) => {
    if (changes.status === 'loading') {
      perTab.set(tabId, 0);
      updateBadge(tabId, 0);
    }
  });

  /* -------------------------------------------------------------- messages */

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'aislop:scan') {
      enqueue(String(message.url || '')).then(sendResponse);
      return true; // async
    }

    if (message.type === 'aislop:blocked') {
      recordBlocked(sender.tab?.id, Number(message.count) || 0);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'aislop:block-source') {
      const source = String(message.source || '').trim();
      if (!source) {
        sendResponse({ ok: false });
        return true;
      }
      settingsApi.load().then((current) => {
        /* A source is either a hostname (search results) or a channel name
         * (YouTube); the dot is a good enough discriminator in practice. */
        const key = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(source) ? 'blockDomains' : 'blockChannels';
        const list = current[key];
        if (!list.some((entry) => entry.toLowerCase() === source.toLowerCase())) {
          list.push(source);
        }
        return settingsApi.save({ [key]: list });
      }).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.type === 'aislop:tab-count') {
      sendResponse({ count: perTab.get(message.tabId) || 0 });
      return true;
    }

    return false;
  });

  api.runtime.onInstalled?.addListener(async (details) => {
    if (details.reason === 'install') {
      await settingsApi.save(settingsApi.DEFAULTS);
      api.runtime.openOptionsPage?.();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
