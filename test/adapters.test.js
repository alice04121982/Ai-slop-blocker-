'use strict';
/*
 * The adapters are DOM code, so these tests build the smallest fake DOM that
 * exercises the parts most likely to break: URL extraction and the card-
 * climbing fallback that keeps the extension working after a site redesign.
 */
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');

function loadAdapters(dom) {
  const sandbox = {
    AISlop: {},
    location: dom.location,
    document: dom.document,
    URL,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../src/content/adapters.js'), 'utf8'), sandbox);
  return sandbox.AISlop.adapters;
}

/* A node just rich enough for nearestCard: a size, a parent, a tag. */
function node(tag, width, height, parent) {
  const el = {
    tagName: tag.toUpperCase(),
    parentElement: parent || null,
    getBoundingClientRect: () => ({ width, height })
  };
  return el;
}

const DOM = {
  location: { origin: 'https://www.google.com', hostname: 'www.google.com', search: '?udm=2', href: 'https://www.google.com/search?udm=2' },
  document: { body: node('body', 1000, 800), documentElement: node('html', 1000, 800), querySelectorAll: () => [] }
};

test('parseImgres pulls the original image and source page out of a Google link', () => {
  const { parseImgres } = loadAdapters(DOM);
  const href = '/imgres?imgurl=https%3A%2F%2Fcdn.example.com%2Fpic.jpg&imgrefurl=https%3A%2F%2Fnews.example%2Farticle&h=800';
  assert.deepEqual(parseImgres(href), {
    mediaUrl: 'https://cdn.example.com/pic.jpg',
    pageUrl: 'https://news.example/article'
  });
});

test('parseImgres ignores links that are not image results', () => {
  const { parseImgres } = loadAdapters(DOM);
  assert.equal(parseImgres('https://example.com/page'), null);
  assert.equal(parseImgres(''), null);
  assert.equal(parseImgres(null), null);
});

test('parseImgres survives a malformed href', () => {
  const { parseImgres } = loadAdapters(DOM);
  assert.doesNotThrow(() => parseImgres('imgurl=%%%not-encoded'));
});

test('hostLabel strips www and tolerates rubbish', () => {
  const { hostLabel } = loadAdapters(DOM);
  assert.equal(hostLabel('https://www.bbc.co.uk/news'), 'bbc.co.uk');
  assert.equal(hostLabel('https://cdn.civitai.com/x.png'), 'cdn.civitai.com');
  assert.equal(hostLabel('not a url'), 'google.com', 'relative URLs resolve against the page');
});

test('nearestCard climbs to the tile but stops before the grid', () => {
  const { nearestCard } = loadAdapters(DOM);
  const grid = node('div', 1000, 800, DOM.document.body);
  const tile = node('div', 210, 210, grid);        // ~1.4x the image area
  const wrapper = node('a', 200, 200, tile);
  const img = node('img', 200, 200, wrapper);

  const card = nearestCard(img);
  assert.equal(card, tile, 'should stop at the tile, not the grid');
});

test('nearestCard returns the image itself when every ancestor is huge', () => {
  const { nearestCard } = loadAdapters(DOM);
  const img = node('img', 50, 50, node('div', 1000, 800, DOM.document.body));
  assert.equal(nearestCard(img), img);
});

test('every adapter exposes the interface the runtime expects', () => {
  const { ALL } = loadAdapters(DOM);
  assert.ok(ALL.length >= 6);
  for (const adapter of ALL) {
    assert.equal(typeof adapter.id, 'string');
    assert.equal(typeof adapter.settingKey, 'string');
    assert.equal(typeof adapter.matches, 'function');
    assert.equal(typeof adapter.cards, 'function');
    assert.equal(typeof adapter.extract, 'function');
  }
});

test('the catch-all only runs when no site adapter claims the page', () => {
  const { activeAdapters } = loadAdapters(DOM);
  const allOn = { sites: { googleImages: true, googleSearch: true, youtube: true, bing: true, duckduckgo: true, reddit: true, generic: true } };
  const ids = activeAdapters(allOn).map((a) => a.id);
  assert.ok(ids.includes('googleImages'), 'Google Images should claim this page');
  assert.ok(!ids.includes('generic'), 'catch-all must not double-scan a claimed page');
});

test('disabling a site in settings disables its adapter', () => {
  const { activeAdapters } = loadAdapters(DOM);
  const off = { sites: { googleImages: false, googleSearch: false, generic: false } };
  assert.deepEqual(activeAdapters(off).map((a) => a.id), []);
});

test('YouTube pages are claimed by the YouTube adapter only', () => {
  const yt = {
    location: { origin: 'https://www.youtube.com', hostname: 'www.youtube.com', search: '?search_query=cats', href: 'https://www.youtube.com/results' },
    document: DOM.document
  };
  const { activeAdapters } = loadAdapters(yt);
  const ids = activeAdapters({ sites: {} }).map((a) => a.id);
  assert.deepEqual(ids, ['youtube']);
});
