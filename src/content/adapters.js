'use strict';
/*
 * Site adapters.
 *
 * Each adapter turns a chunk of a search-results page into candidate objects
 * the engine can score. Google and YouTube rewrite their markup constantly and
 * ship obfuscated class names, so every adapter is written the same defensive
 * way: try the stable, semantic selectors first, and fall back to "find the
 * image, then climb to the thing that looks like its card". That fallback is
 * what keeps the extension alive between redesigns.
 */
(function (root) {
  const NS = (root.AISlop = root.AISlop || {});

  /* ---------------------------------------------------------------- helpers */

  function text(el, selectors) {
    for (const sel of selectors) {
      const node = el.querySelector(sel);
      if (node) {
        const value = (node.getAttribute('title') || node.textContent || '').trim();
        if (value) return value;
      }
    }
    return '';
  }

  function attr(el, selector, name) {
    const node = el.matches?.(selector) ? el : el.querySelector(selector);
    return node ? node.getAttribute(name) || '' : '';
  }

  /* Everything a human would read on the card, plus alt/title/aria text that
   * they would not. Capped so a stray container never pulls in half the page. */
  function cardText(card) {
    const parts = [card.textContent || ''];
    for (const node of card.querySelectorAll('img, [aria-label], [title]')) {
      parts.push(node.getAttribute('alt') || '', node.getAttribute('aria-label') || '', node.getAttribute('title') || '');
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
  }

  /*
   * Climb from an image to the element that represents its result card: the
   * last ancestor that is still roughly the size of the image itself. Stops
   * growing as soon as an ancestor is much larger, which is what separates a
   * single tile from the grid that holds it.
   */
  function nearestCard(img, maxHops = 8) {
    const base = img.getBoundingClientRect();
    const baseArea = Math.max(base.width * base.height, 1);
    let node = img;
    let best = img;
    for (let i = 0; i < maxHops && node.parentElement; i++) {
      node = node.parentElement;
      if (node === document.body || node === document.documentElement) break;
      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > baseArea * 6) break;
      best = node;
    }
    return best;
  }

  /* Google wraps results in /imgres?imgurl=…&imgrefurl=… — both are useful:
   * imgurl is the original file (metadata intact), imgrefurl the source page. */
  function parseImgres(href) {
    if (!href || !href.includes('imgurl=')) return null;
    try {
      const url = new URL(href, location.origin);
      return {
        mediaUrl: url.searchParams.get('imgurl') || '',
        pageUrl: url.searchParams.get('imgrefurl') || ''
      };
    } catch {
      return null;
    }
  }

  function bestImageUrl(card) {
    const img = card.querySelector('img');
    if (!img) return '';
    /* Prefer a real URL over the base64 placeholder Google paints first. */
    const candidates = [
      img.getAttribute('data-src'),
      img.getAttribute('data-iurl'),
      img.currentSrc,
      img.src
    ];
    for (const c of candidates) {
      if (c && !c.startsWith('data:')) return c;
    }
    return img.src || '';
  }

  function hostLabel(url) {
    try {
      return new URL(url, location.origin).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /* ------------------------------------------------------------- adapters */

  const googleImages = {
    id: 'googleImages',
    settingKey: 'googleImages',
    matches() {
      if (!/(^|\.)google\./.test(location.hostname)) return false;
      return /[?&](?:tbm=isch|udm=2)/.test(location.search) || location.pathname.startsWith('/imghp');
    },
    cards() {
      const found = new Set();
      for (const sel of ['div[data-ri]', 'div[data-lpage]', 'div[jsname="dTDiAc"]', 'div[data-attrid] div[role="listitem"]']) {
        for (const el of document.querySelectorAll(sel)) found.add(el);
      }
      if (!found.size) {
        /* Layout changed under us — fall back to images big enough to be tiles. */
        for (const img of document.querySelectorAll('img')) {
          const r = img.getBoundingClientRect();
          if (r.width >= 60 && r.height >= 60) found.add(nearestCard(img));
        }
      }
      return [...found];
    },
    extract(card) {
      const anchor = card.querySelector('a[href*="imgres"], a[href]');
      const parsed = parseImgres(anchor?.getAttribute('href'));
      const pageUrl = parsed?.pageUrl || anchor?.href || '';
      return {
        kind: 'image',
        text: cardText(card),
        mediaUrl: parsed?.mediaUrl || bestImageUrl(card),
        pageUrl,
        channel: hostLabel(pageUrl),
        platformDisclosure: /\bai[- ]?generated\b/i.test(card.textContent || '')
      };
    }
  };

  const googleSearch = {
    id: 'googleSearch',
    settingKey: 'googleSearch',
    matches() {
      return /(^|\.)google\./.test(location.hostname) && !googleImages.matches();
    },
    cards() {
      const found = new Set();
      for (const el of document.querySelectorAll('div[data-hveid] div.g, div.g, div[data-news-cluster-id], g-inner-card, div[jscontroller][data-ved] video, video')) {
        found.add(el.tagName === 'VIDEO' ? nearestCard(el) : el);
      }
      for (const img of document.querySelectorAll('img')) {
        const r = img.getBoundingClientRect();
        if (r.width >= 80 && r.height >= 80) found.add(nearestCard(img, 5));
      }
      return [...found];
    },
    extract(card) {
      const anchor = card.querySelector('a[href]');
      const pageUrl = anchor?.href || '';
      return {
        kind: card.querySelector('video') ? 'video' : 'image',
        text: cardText(card),
        mediaUrl: bestImageUrl(card),
        pageUrl,
        channel: hostLabel(pageUrl),
        platformDisclosure: false
      };
    }
  };

  const youtube = {
    id: 'youtube',
    settingKey: 'youtube',
    matches() {
      return /(^|\.)youtube\.com$/.test(location.hostname) || /(^|\.)youtube\./.test(location.hostname);
    },
    cards() {
      const sel = [
        'ytd-video-renderer',
        'ytd-rich-item-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-reel-item-renderer',
        'ytd-playlist-video-renderer',
        'yt-lockup-view-model',
        'ytm-video-with-context-renderer',
        'ytm-compact-video-renderer',
        'ytm-shorts-lockup-view-model',
        'ytm-item-section-renderer > lazy-list > ytm-video-with-context-renderer'
      ].join(',');
      return [...document.querySelectorAll(sel)];
    },
    extract(card) {
      const titleEl = card.querySelector('#video-title, a#video-title-link, h3 a, .yt-lockup-metadata-view-model__title, .media-item-headline');
      const title = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
      const channel = text(card, [
        'ytd-channel-name a',
        'ytd-channel-name #text',
        '#channel-name #text',
        '.yt-content-metadata-view-model__metadata-text',
        '.ytm-badge-and-byline-renderer',
        '#byline'
      ]);
      const link = card.querySelector('a#thumbnail[href], a[href*="/watch"], a[href*="/shorts/"]');
      const body = card.textContent || '';
      return {
        kind: 'video',
        text: [title, cardText(card)].join(' '),
        mediaUrl: card.querySelector('img')?.src || '',
        pageUrl: link?.href || '',
        channel,
        /* YouTube's own creator disclosure, rendered as a plain-text label. */
        platformDisclosure: /altered or synthetic content/i.test(body)
      };
    }
  };

  const bing = {
    id: 'bing',
    settingKey: 'bing',
    matches() {
      return /(^|\.)bing\.com$/.test(location.hostname);
    },
    cards() {
      const found = new Set();
      for (const el of document.querySelectorAll('.iuscp, .imgpt, li.b_algo, .mc_vtvc, .dg_u > *')) found.add(el);
      return [...found];
    },
    extract(card) {
      /* Bing stashes the real image URL and title in a JSON blob on .iusc. */
      let meta = {};
      const iusc = card.querySelector('.iusc') || (card.matches?.('.iusc') ? card : null);
      if (iusc) {
        try { meta = JSON.parse(iusc.getAttribute('m') || '{}'); } catch { /* not JSON */ }
      }
      const pageUrl = meta.purl || card.querySelector('a[href^="http"]')?.href || '';
      return {
        kind: card.querySelector('video, .mc_vtvc') ? 'video' : 'image',
        text: [meta.t, cardText(card)].filter(Boolean).join(' '),
        mediaUrl: meta.murl || bestImageUrl(card),
        pageUrl,
        channel: hostLabel(pageUrl),
        platformDisclosure: false
      };
    }
  };

  const duckduckgo = {
    id: 'duckduckgo',
    settingKey: 'duckduckgo',
    matches() {
      return /(^|\.)duckduckgo\.com$/.test(location.hostname);
    },
    cards() {
      return [...document.querySelectorAll('.tile--img, .tile--vid, article[data-testid="result"], .tile--grid')];
    },
    extract(card) {
      const anchor = card.querySelector('a.tile--img__sub, a[href^="http"]');
      const pageUrl = anchor?.href || '';
      return {
        kind: card.classList.contains('tile--vid') ? 'video' : 'image',
        text: cardText(card),
        mediaUrl: bestImageUrl(card),
        pageUrl,
        channel: hostLabel(pageUrl),
        platformDisclosure: false
      };
    }
  };

  const reddit = {
    id: 'reddit',
    settingKey: 'reddit',
    matches() {
      return /(^|\.)reddit\.com$/.test(location.hostname);
    },
    cards() {
      return [...document.querySelectorAll('shreddit-post, article, .thing, [data-testid="post-container"]')];
    },
    extract(card) {
      const sub = card.getAttribute?.('subreddit-prefixed-name') || '';
      const title = card.getAttribute?.('post-title') || text(card, ['h3', 'a[data-click-id="body"]']);
      return {
        kind: card.querySelector('video, shreddit-player') ? 'video' : 'image',
        text: [title, sub, cardText(card)].filter(Boolean).join(' '),
        mediaUrl: bestImageUrl(card),
        pageUrl: card.querySelector('a[href]')?.href || location.href,
        channel: sub,
        platformDisclosure: false
      };
    }
  };

  /* Opt-in catch-all for every other site. Coarse by necessity: it has no idea
   * what a "card" is, so it treats each sizeable image or video as its own. */
  const generic = {
    id: 'generic',
    settingKey: 'generic',
    matches() { return true; },
    cards() {
      const found = new Set();
      for (const media of document.querySelectorAll('img, video')) {
        const r = media.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 120) found.add(nearestCard(media, 4));
      }
      return [...found];
    },
    extract(card) {
      const media = card.querySelector('img, video') || card;
      const anchor = card.closest('a[href]') || card.querySelector('a[href]');
      const pageUrl = anchor?.href || location.href;
      return {
        kind: media.tagName === 'VIDEO' ? 'video' : 'image',
        text: cardText(card),
        mediaUrl: media.getAttribute?.('src') || media.getAttribute?.('poster') || '',
        pageUrl,
        channel: hostLabel(pageUrl),
        platformDisclosure: false
      };
    }
  };

  const ALL = [googleImages, googleSearch, youtube, bing, duckduckgo, reddit, generic];

  /** The adapters that apply to this page and are enabled in settings. */
  function activeAdapters(settings) {
    const enabled = ALL.filter((a) => a.matches() && settings.sites[a.settingKey] !== false);
    /* Only fall back to the catch-all when no site-specific adapter claimed
     * the page, otherwise it double-scans every YouTube thumbnail. */
    const specific = enabled.filter((a) => a.id !== 'generic');
    return specific.length ? specific : enabled;
  }

  NS.adapters = { ALL, activeAdapters, nearestCard, cardText, parseImgres, hostLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
