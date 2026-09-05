'use strict';
/*
 * Integration: a realistic result card goes in one end, a block decision comes
 * out the other. This is what catches wiring mistakes between an adapter's
 * extract() and the engine's expectations — the unit tests cannot.
 */
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const { el } = require('./dom-stub.js');
const engine = require('../src/core/engine.js');
const settingsApi = require('../src/core/settings.js');

function adaptersFor(hostname, search = '') {
  const sandbox = {
    AISlop: {},
    location: { origin: `https://${hostname}`, hostname, search, href: `https://${hostname}/${search}` },
    document: { body: el('body'), documentElement: el('html'), querySelectorAll: () => [] },
    URL,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../src/content/adapters.js'), 'utf8'), sandbox);
  return Object.fromEntries(sandbox.AISlop.adapters.ALL.map((a) => [a.id, a]));
}

const SETTINGS = settingsApi.merge({});
const RULES = settingsApi.rulesFrom(SETTINGS);
const decide = (candidate, settings = SETTINGS) => engine.judge(candidate, RULES, settings);

/* --------------------------------------------------------------- YouTube */

function youtubeCard({ title, channel, disclosed = false }) {
  return el('ytd-video-renderer', {}, [
    el('a', { id: 'thumbnail', href: 'https://www.youtube.com/watch?v=abc123' }, [
      el('img', { src: 'https://i.ytimg.com/vi/abc123/hq.jpg' })
    ]),
    el('a', { id: 'video-title', title }, [], title),
    el('ytd-channel-name', {}, [el('a', {}, [], channel)]),
    ...(disclosed ? [el('div', { class: 'badge' }, [], 'Altered or synthetic content')] : [])
  ]);
}

test('a YouTube card discloses its channel, title and link', () => {
  const yt = adaptersFor('www.youtube.com').youtube;
  const candidate = yt.extract(youtubeCard({ title: 'Roman history explained', channel: 'History Hit' }));
  assert.equal(candidate.kind, 'video');
  assert.equal(candidate.channel, 'History Hit');
  assert.match(candidate.text, /Roman history explained/);
  assert.equal(candidate.pageUrl, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(decide(candidate).block, false, 'an ordinary history video must survive');
});

test("YouTube's synthetic-content disclosure flows through to a block", () => {
  const yt = adaptersFor('www.youtube.com').youtube;
  const candidate = yt.extract(youtubeCard({ title: 'Roman history explained', channel: 'Slop Hit', disclosed: true }));
  assert.equal(candidate.platformDisclosure, true);
  assert.equal(decide(candidate).block, true);
});

test('a Midjourney video title is blocked end to end', () => {
  const yt = adaptersFor('www.youtube.com').youtube;
  const candidate = yt.extract(youtubeCard({ title: 'Midjourney v6 cinematic showreel', channel: 'Prompt Lab' }));
  const verdict = decide(candidate);
  assert.equal(verdict.block, true);
  assert.equal(verdict.signals[0].id, 'strongGenerator');
});

test('blocking a channel from the overlay stops that channel afterwards', () => {
  const yt = adaptersFor('www.youtube.com').youtube;
  const candidate = yt.extract(youtubeCard({ title: 'Ancient Rome facts', channel: 'AI History Shorts' }));
  assert.equal(decide(candidate).block, false, 'not blocked before the rule exists');

  const rules = settingsApi.rulesFrom(settingsApi.merge({ blockChannels: ['AI History Shorts'] }));
  assert.equal(engine.judge(candidate, rules, SETTINGS).block, true);
});

/* ---------------------------------------------------------- Google Images */

test('a Google Images tile yields the original image URL, not the thumbnail', () => {
  const gi = adaptersFor('www.google.com', '?udm=2').googleImages;
  const card = el('div', { 'data-ri': '0' }, [
    el('a', {
      href: '/imgres?imgurl=https%3A%2F%2Fcdn.slopfarm.example%2Fai-generated%2F42.png' +
            '&imgrefurl=https%3A%2F%2Fslopfarm.example%2Fpost%2F42'
    }, [
      el('img', { src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:xyz', alt: 'sunset over mountains' })
    ])
  ]);
  const candidate = gi.extract(card);
  assert.equal(candidate.mediaUrl, 'https://cdn.slopfarm.example/ai-generated/42.png',
    'the imgres original is what carries usable metadata');
  assert.equal(candidate.pageUrl, 'https://slopfarm.example/post/42');
  assert.equal(candidate.channel, 'slopfarm.example');
  assert.equal(decide(candidate).block, true, 'the ai-generated path should be enough');
});

test('a Google Images tile for a real photo is left alone', () => {
  const gi = adaptersFor('www.google.com', '?udm=2').googleImages;
  const card = el('div', { 'data-ri': '1' }, [
    el('a', {
      href: '/imgres?imgurl=https%3A%2F%2Fcdn.reuters.example%2F2026%2Fharbour.jpg' +
            '&imgrefurl=https%3A%2F%2Freuters.example%2Fnews%2Fharbour'
    }, [el('img', { src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:abc', alt: 'fishing boats at Brixham' })])
  ]);
  assert.equal(decide(gi.extract(card)).block, false);
});

/* ------------------------------------------------------------------ Bing */

test('Bing image results are read out of the .iusc JSON blob', () => {
  const bing = adaptersFor('www.bing.com').bing;
  const meta = {
    murl: 'https://cdn.example.com/render.png',
    purl: 'https://civitai.com/images/99',
    t: 'fantasy castle, stable diffusion xl'
  };
  const card = el('div', { class: 'iuscp' }, [
    el('a', { class: 'iusc', m: JSON.stringify(meta) }, [el('img', { src: 'https://tse1.mm.bing.net/th?id=x' })])
  ]);
  const candidate = bing.extract(card);
  assert.equal(candidate.mediaUrl, 'https://cdn.example.com/render.png');
  assert.equal(candidate.pageUrl, 'https://civitai.com/images/99');
  const verdict = decide(candidate);
  assert.equal(verdict.block, true);
  assert.ok(verdict.signals.some((s) => s.id === 'aiDomain'), 'civitai.com should register as an AI host');
});

test('a malformed Bing blob does not break extraction', () => {
  const bing = adaptersFor('www.bing.com').bing;
  const card = el('div', { class: 'iuscp' }, [
    el('a', { class: 'iusc', m: '{not json' }, [el('img', { src: 'https://tse1.mm.bing.net/th?id=x' })])
  ]);
  assert.doesNotThrow(() => bing.extract(card));
});

/* --------------------------------------------------------------- Reddit */

test('a Reddit post carries its subreddit through as the channel', () => {
  const reddit = adaptersFor('www.reddit.com').reddit;
  const card = el('shreddit-post', {
    'post-title': 'I made this with Flux, thoughts?',
    'subreddit-prefixed-name': 'r/aiArt'
  }, [el('img', { src: 'https://i.redd.it/abc.png' }), el('a', { href: 'https://reddit.com/r/aiArt/x' })]);
  const candidate = reddit.extract(card);
  assert.equal(candidate.channel, 'r/aiArt');
  assert.equal(decide(candidate).block, true);
});

/* ----------------------------------------------- metadata feeding back in */

test('a metadata verdict can block an item the text could not decide on', () => {
  const gi = adaptersFor('www.google.com', '?udm=2').googleImages;
  const card = el('div', { 'data-ri': '2' }, [
    el('a', { href: '/imgres?imgurl=https%3A%2F%2Fcdn.example.com%2Fx.png&imgrefurl=https%3A%2F%2Fexample.com%2Fp' },
      [el('img', { src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:q', alt: 'a castle' })])
  ]);
  const candidate = gi.extract(card);
  const before = decide(candidate);
  assert.equal(before.block, false);
  assert.equal(engine.wantsMetadataCheck(before, { sensitivity: 'balanced', checkMetadata: true }), true);

  const scanned = require('../src/core/media-scan.js').scanBytes(
    Uint8Array.from([...'<Iptc4xmpExt:DigitalSourceType>trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>']
      .map((c) => c.charCodeAt(0)))
  );
  assert.equal(decide({ ...candidate, metadata: scanned }).block, true);
});
