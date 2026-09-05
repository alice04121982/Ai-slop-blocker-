'use strict';
/*
 * The scoring engine. Pure functions only — no DOM, no chrome.* — so it can be
 * unit tested in Node and reused by the popup, the options page and every site
 * adapter.
 *
 * Signals are combined with a noisy-OR:
 *
 *     score = 1 - Π (1 - weight_i)
 *
 * which keeps the result in [0,1], lets several weak hints add up to something
 * meaningful, and never lets one weak hint alone cross a strict threshold.
 */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports
      ? require('./patterns.js')
      : root.AISlop.patterns
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.AISlop = root.AISlop || {}).engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  const THRESHOLDS = { relaxed: 0.8, balanced: 0.6, strict: 0.4 };

  /* Weight per signal. Tuned so that one strong signal alone is enough at
   * "balanced", while two weak ones are needed to reach it together. */
  const WEIGHTS = {
    userKeyword: 0.99,
    userDomain: 0.99,
    userChannel: 0.99,
    metadataSynthetic: 0.98,
    platformDisclosure: 0.97,
    metadataGenerator: 0.9,
    disclosurePhrase: 0.88,
    aiDomain: 0.85,
    strongGenerator: 0.8,
    aiTag: 0.7,
    urlHint: 0.6,
    weakGenerator: 0.5,
    genericAiMention: 0.45
  };

  const LABELS = {
    userKeyword: 'matches one of your blocked keywords',
    userDomain: 'from a domain on your block list',
    userChannel: 'from a channel on your block list',
    metadataSynthetic: 'provenance metadata declares synthetic media',
    platformDisclosure: 'the platform labelled this as synthetic',
    metadataGenerator: 'file metadata names an image generator',
    disclosurePhrase: 'the text says it is AI generated',
    aiDomain: 'hosted on an AI generation site',
    strongGenerator: 'names an AI generator',
    aiTag: 'tagged or posted in an AI art community',
    urlHint: 'the file name looks generator-made',
    weakGenerator: 'mentions a model name in an AI context',
    genericAiMention: 'generic AI wording nearby'
  };

  function normaliseText(value) {
    if (!value) return '';
    return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function hostOf(url) {
    if (!url) return '';
    try {
      return new URL(url, 'https://invalid.example').hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  /* True when host equals domain or is a subdomain of it. */
  function hostMatches(host, domain) {
    if (!host || !domain) return false;
    return host === domain || host.endsWith('.' + domain);
  }

  function anyMatch(regexes, text) {
    for (const re of regexes) {
      const hit = text.match(re);
      if (hit) return hit[0];
    }
    return null;
  }

  /**
   * Score one candidate.
   *
   * @param {object} candidate
   *   @property {'image'|'video'} kind
   *   @property {string}  text        alt/title/caption/nearby text, concatenated
   *   @property {string}  mediaUrl    the <img>/<video> src or poster
   *   @property {string}  pageUrl     the page the media links to (search results)
   *   @property {string}  channel     uploader / channel / site label
   *   @property {boolean} platformDisclosure  platform's own synthetic-content label
   *   @property {object}  metadata    result of mediaScan.scanBytes, or null
   * @param {object} rules
   *   @property {string[]} blockKeywords
   *   @property {string[]} blockDomains
   *   @property {string[]} blockChannels
   *   @property {string[]} allowDomains
   *   @property {string[]} allowChannels
   * @returns {{score:number, signals:Array, allowed:boolean}}
   */
  function score(candidate, rules) {
    const c = candidate || {};
    const r = rules || {};
    const text = normaliseText([c.text, c.channel].filter(Boolean).join(' '));
    const mediaUrl = String(c.mediaUrl || '');
    const pageUrl = String(c.pageUrl || '');
    const hosts = [hostOf(mediaUrl), hostOf(pageUrl)].filter(Boolean);
    const channel = normaliseText(c.channel);
    const signals = [];

    const add = (id, detail) => {
      if (signals.some((s) => s.id === id)) return;
      signals.push({ id, weight: WEIGHTS[id], label: LABELS[id], detail: detail || '' });
    };

    /* Allow list wins outright — it is the user's escape hatch for false
     * positives, so nothing downstream may override it. */
    const allowDomains = r.allowDomains || [];
    const allowChannels = (r.allowChannels || []).map(normaliseText);
    if (hosts.some((h) => allowDomains.some((d) => hostMatches(h, normaliseText(d))))) {
      return { score: 0, signals: [], allowed: true };
    }
    if (channel && allowChannels.some((a) => a && channel.includes(a))) {
      return { score: 0, signals: [], allowed: true };
    }

    /* --- user rules ------------------------------------------------------ */
    for (const kw of r.blockKeywords || []) {
      const needle = normaliseText(kw);
      if (needle && text.includes(needle)) {
        add('userKeyword', kw);
        break;
      }
    }
    for (const dom of r.blockDomains || []) {
      const d = normaliseText(dom);
      if (d && hosts.some((h) => hostMatches(h, d))) {
        add('userDomain', dom);
        break;
      }
    }
    for (const ch of r.blockChannels || []) {
      const needle = normaliseText(ch);
      if (needle && channel && channel.includes(needle)) {
        add('userChannel', ch);
        break;
      }
    }

    /* --- provenance metadata --------------------------------------------- */
    if (c.metadata) {
      if (c.metadata.synthetic) add('metadataSynthetic', c.metadata.evidence?.[0] || '');
      else if (c.metadata.generator) add('metadataGenerator', c.metadata.generator);
    }

    /* --- platform's own disclosure --------------------------------------- */
    if (c.platformDisclosure) add('platformDisclosure');

    /* --- text signals ----------------------------------------------------- */
    if (text) {
      const disclosure = anyMatch(P.DISCLOSURE_PHRASES, text);
      if (disclosure) add('disclosurePhrase', disclosure);

      const strong = anyMatch(P.STRONG_GENERATORS, text);
      if (strong) add('strongGenerator', strong);

      const tag = anyMatch(P.AI_TAGS, text);
      if (tag) add('aiTag', tag);

      const hasAiContext = P.AI_CONTEXT.test(text);
      if (!strong && hasAiContext) {
        const weak = anyMatch(P.WEAK_GENERATORS, text);
        if (weak) add('weakGenerator', weak);
      }

      /* "AI" sitting right next to a media word, e.g. "ai portrait". Weak on
       * its own by design: plenty of legitimate news coverage mentions AI. */
      if (!disclosure && /\b(?:ai|a\.i\.)\b[\s-]{0,3}(?:art|image|photo|picture|render|portrait|video|animation|slop)\b/.test(text)) {
        add('genericAiMention');
      }
    }

    /* --- host and URL signals -------------------------------------------- */
    const aiDomain = P.AI_DOMAINS.find((d) => hosts.some((h) => hostMatches(h, d)));
    if (aiDomain) add('aiDomain', aiDomain);

    const urlHint = anyMatch(P.AI_URL_HINTS, (mediaUrl + ' ' + pageUrl).toLowerCase());
    if (urlHint) add('urlHint', urlHint);

    /* --- combine ---------------------------------------------------------- */
    let inverse = 1;
    for (const s of signals) inverse *= 1 - s.weight;
    const total = signals.length ? 1 - inverse : 0;

    signals.sort((a, b) => b.weight - a.weight);
    return { score: Math.round(total * 1000) / 1000, signals, allowed: false };
  }

  /**
   * Turn a score into a decision.
   * @returns {{block:boolean, score:number, reason:string, signals:Array}}
   */
  function judge(candidate, rules, settings) {
    const s = settings || {};
    const threshold = THRESHOLDS[s.sensitivity] ?? THRESHOLDS.balanced;
    const result = score(candidate, rules);
    const block = !result.allowed && result.score >= threshold;
    return {
      block,
      score: result.score,
      threshold,
      allowed: result.allowed,
      signals: result.signals,
      reason: result.signals.length ? result.signals[0].label : 'no AI signals found'
    };
  }

  /**
   * Should we spend a network request checking this item's file metadata?
   * Only worth it when the text signals were inconclusive: confidently clean
   * and confidently dirty items both gain nothing from the round trip.
   */
  function wantsMetadataCheck(result, settings) {
    const s = settings || {};
    if (!s.checkMetadata) return false;
    if (result.allowed) return false;
    return result.score < (THRESHOLDS[s.sensitivity] ?? THRESHOLDS.balanced);
  }

  return { score, judge, wantsMetadataCheck, THRESHOLDS, WEIGHTS, LABELS, hostMatches, hostOf };
});
