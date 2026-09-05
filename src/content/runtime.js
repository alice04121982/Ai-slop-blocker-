'use strict';
/*
 * Content-script runtime: walk the page, score every card, and apply the
 * chosen action. Re-runs on DOM mutations (all these sites are infinite
 * scrollers) and on history changes (YouTube never reloads).
 */
(function (root) {
  const NS = (root.AISlop = root.AISlop || {});
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const { engine, settings: settingsApi, adapters } = NS;

  const MARK = 'data-aislop';
  const STATE = {
    settings: null,
    rules: null,
    blocked: new Map(),   // card element -> verdict
    revealAll: false,
    pending: new Set(),   // media URLs awaiting a metadata check
    scanned: new Map()    // media URL -> metadata result
  };

  /* ------------------------------------------------------------------ util */

  const debounce = (fn, ms) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  function bumpStats(n) {
    if (!n) return;
    try {
      /* sendMessage rejects rather than throws when the worker is asleep or
       * the extension was reloaded under us, so both paths need swallowing. */
      Promise.resolve(api.runtime.sendMessage({ type: 'aislop:blocked', count: n })).catch(() => {});
    } catch { /* extension context torn down on navigation; harmless */ }
  }

  /* ---------------------------------------------------------------- overlay */

  /* Some cards are the media element itself (the catch-all adapter can return
   * a bare <img>), and those cannot hold children. */
  const CANNOT_HOST_OVERLAY = new Set(['IMG', 'VIDEO', 'CANVAS', 'INPUT', 'IFRAME', 'EMBED']);

  function buildOverlay(card, verdict, mode) {
    const overlay = document.createElement('div');
    overlay.className = mode === 'label' ? 'aislop-overlay aislop-overlay-chip' : 'aislop-overlay';
    overlay.setAttribute('role', 'group');

    const badge = document.createElement('div');
    badge.className = 'aislop-badge';
    /* In label mode nothing is actually hidden, so do not claim otherwise. */
    badge.textContent = mode === 'label' ? 'Likely AI' : 'AI slop hidden';
    overlay.appendChild(badge);

    if (STATE.settings.showReason) {
      const reason = document.createElement('div');
      reason.className = 'aislop-reason';
      reason.textContent = verdict.reason;
      reason.title = verdict.signals
        .map((s) => `${s.label}${s.detail ? ' — ' + s.detail : ''}`)
        .join('\n') + `\n\nconfidence ${Math.round(verdict.score * 100)}%`;
      overlay.appendChild(reason);
    }

    const actions = document.createElement('div');
    actions.className = 'aislop-actions';

    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'aislop-btn';
    show.textContent = 'Show anyway';
    show.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      reveal(card);
    }, true);
    actions.appendChild(show);

    /* Teaching the filter is the whole point — one click to never see this
     * source again beats editing a list in the options page. */
    const source = verdict.candidate?.channel;
    if (source) {
      const never = document.createElement('button');
      never.type = 'button';
      never.className = 'aislop-btn aislop-btn-quiet';
      never.textContent = 'Always block ' + source;
      never.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(api.runtime.sendMessage({ type: 'aislop:block-source', source })).catch(() => {});
        never.textContent = 'Blocked';
        never.disabled = true;
      }, true);
      actions.appendChild(never);
    }

    overlay.appendChild(actions);
    return overlay;
  }

  function reveal(card) {
    card.removeAttribute(MARK);
    card.classList.remove('aislop-blurred', 'aislop-hidden', 'aislop-bare');
    card.removeAttribute('title');
    card.querySelector(':scope > .aislop-overlay')?.remove();
    STATE.blocked.delete(card);
  }

  function applyVerdict(card, verdict) {
    if (card.getAttribute(MARK) === 'blocked') return false;
    card.setAttribute(MARK, 'blocked');
    STATE.blocked.set(card, verdict);

    const action = STATE.revealAll ? 'label' : STATE.settings.action;

    if (action === 'hide') {
      card.classList.add('aislop-hidden');
      return true;
    }

    /* "label" leaves the media readable on purpose — blurring it as well would
     * make the mode pointless. */
    if (action === 'blur') card.classList.add('aislop-blurred');

    if (CANNOT_HOST_OVERLAY.has(card.tagName)) {
      /* No room for the overlay UI, so the element carries the explanation
       * itself and one click clears it. */
      card.classList.add('aislop-bare');
      card.title = `AI Slop Blocker: ${verdict.reason} (click to show)`;
      card.addEventListener('click', function onceOnly(event) {
        event.preventDefault();
        event.stopPropagation();
        card.removeEventListener('click', onceOnly, true);
        reveal(card);
      }, true);
      return true;
    }

    /* An absolutely positioned overlay needs a positioned ancestor, and these
     * cards are usually static. Only touch it when we have to. */
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.appendChild(buildOverlay(card, verdict, action));
    return true;
  }

  /* ------------------------------------------------------------- metadata */

  async function requestMetadata(mediaUrl) {
    if (!mediaUrl || STATE.scanned.has(mediaUrl) || STATE.pending.has(mediaUrl)) return null;
    STATE.pending.add(mediaUrl);
    try {
      const result = await api.runtime.sendMessage({ type: 'aislop:scan', url: mediaUrl });
      STATE.scanned.set(mediaUrl, result || null);
      return result || null;
    } catch {
      STATE.scanned.set(mediaUrl, null);
      return null;
    } finally {
      STATE.pending.delete(mediaUrl);
    }
  }

  /* ------------------------------------------------------------------ scan */

  function scanOnce() {
    if (!STATE.settings?.enabled) return;
    let newlyBlocked = 0;
    const metadataQueue = [];

    for (const adapter of adapters.activeAdapters(STATE.settings)) {
      let cards;
      try {
        cards = adapter.cards();
      } catch {
        continue; // a selector broke; other adapters still get their turn
      }

      for (const card of cards) {
        if (!card || !card.isConnected) continue;
        if (card.getAttribute(MARK)) continue;      // already judged
        if (card.querySelector(':scope > .aislop-overlay')) continue;

        let candidate;
        try {
          candidate = adapter.extract(card);
        } catch {
          continue;
        }
        if (!candidate) continue;

        const cached = STATE.scanned.get(candidate.mediaUrl);
        if (cached) candidate.metadata = cached;

        const verdict = engine.judge(candidate, STATE.rules, STATE.settings);
        verdict.candidate = candidate;

        if (verdict.block) {
          if (applyVerdict(card, verdict)) newlyBlocked++;
          continue;
        }

        /* Inconclusive on text alone — worth spending a range request on,
         * if the user turned metadata checking on. */
        if (candidate.kind === 'image' && engine.wantsMetadataCheck(verdict, STATE.settings)) {
          /* Marked straight away: without this the card stays unmarked and
           * every subsequent scan re-extracts and re-queues it. */
          card.setAttribute(MARK, 'pending');
          metadataQueue.push({ card, candidate });
        } else {
          card.setAttribute(MARK, 'clean');
        }
      }
    }

    bumpStats(newlyBlocked);

    /* Bounded so a 500-thumbnail scroll does not turn into 500 fetches. */
    for (const item of metadataQueue.slice(0, 25)) {
      requestMetadata(item.candidate.mediaUrl).then((metadata) => {
        if (!item.card.isConnected) return;
        item.card.setAttribute(MARK, 'clean');
        if (!metadata || (!metadata.synthetic && !metadata.generator)) return;
        const candidate = { ...item.candidate, metadata };
        const verdict = engine.judge(candidate, STATE.rules, STATE.settings);
        verdict.candidate = candidate;
        /* applyVerdict bails on an already-blocked card, so clear the mark
         * we just set before letting it decide. */
        item.card.removeAttribute(MARK);
        if (verdict.block && applyVerdict(item.card, verdict)) bumpStats(1);
        else item.card.setAttribute(MARK, 'clean');
      });
    }
  }

  const scan = debounce(scanOnce, 150);

  function resetMarks() {
    for (const card of document.querySelectorAll(`[${MARK}]`)) reveal(card);
    STATE.blocked.clear();
  }

  /* ------------------------------------------------------------------ boot */

  function watchNavigation() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      STATE.blocked.clear();
      scan();
    };
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        setTimeout(check, 50);
        return result;
      };
    }
    addEventListener('popstate', () => setTimeout(check, 50));
    addEventListener('yt-navigate-finish', () => setTimeout(scan, 50));
  }

  async function start() {
    STATE.settings = await settingsApi.load();
    STATE.rules = settingsApi.rulesFrom(STATE.settings);

    scanOnce();
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    addEventListener('scroll', scan, { passive: true });
    watchNavigation();

    api.storage?.onChanged?.addListener(async () => {
      STATE.settings = await settingsApi.load();
      STATE.rules = settingsApi.rulesFrom(STATE.settings);
      resetMarks();
      scanOnce();
    });

    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'aislop:page-stats') {
        sendResponse({ blocked: STATE.blocked.size, revealAll: STATE.revealAll });
      } else if (message?.type === 'aislop:reveal-all') {
        STATE.revealAll = true;
        resetMarks();
        scanOnce();
        sendResponse({ ok: true });
      } else if (message?.type === 'aislop:rescan') {
        STATE.revealAll = false;
        resetMarks();
        scanOnce();
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
