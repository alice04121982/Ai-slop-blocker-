'use strict';
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/core/engine.js');
const settingsApi = require('../src/core/settings.js');

const NO_RULES = {
  blockKeywords: [], blockDomains: [], blockChannels: [], allowDomains: [], allowChannels: []
};
const BALANCED = { sensitivity: 'balanced' };
const judge = (candidate, rules = NO_RULES, settings = BALANCED) =>
  engine.judge(candidate, rules, settings);

test('an explicit "made with AI" caption is blocked', () => {
  const v = judge({ kind: 'image', text: 'Sunset over Dartmoor, made with AI' });
  assert.equal(v.block, true);
  assert.equal(v.signals[0].id, 'disclosurePhrase');
});

test('YouTube\'s own synthetic-content label is blocked', () => {
  const v = judge({ kind: 'video', text: 'History of the Roman Empire', platformDisclosure: true });
  assert.equal(v.block, true);
  assert.equal(v.signals[0].id, 'platformDisclosure');
});

test('an ordinary photo caption is left alone', () => {
  const v = judge({
    kind: 'image',
    text: 'Press photo of the harbour at Brixham, taken by Reuters',
    mediaUrl: 'https://reuters.com/img/harbour.jpg'
  });
  assert.equal(v.block, false);
  assert.equal(v.score, 0);
});

test('news coverage about AI is not itself treated as AI', () => {
  // The whole point of the weak/strong split: this must survive.
  const v = judge({
    kind: 'video',
    text: 'Government announces new artificial intelligence regulation',
    channel: 'BBC News'
  });
  assert.equal(v.block, false);
});

test('ambiguous model names need AI context before they count', () => {
  const spanish = judge({ kind: 'image', text: 'Veo el mar desde la ventana' });
  assert.equal(spanish.block, false);
  assert.equal(spanish.score, 0);

  const real = judge({ kind: 'video', text: 'Made this clip in Veo, prompt in the description' });
  assert.equal(real.signals.some((s) => s.id === 'weakGenerator'), true);
});

test('a strong generator name alone is enough', () => {
  const v = judge({ kind: 'image', text: 'cyberpunk city, midjourney v6' });
  assert.equal(v.block, true);
  assert.equal(v.signals[0].id, 'strongGenerator');
});

test('weak signals accumulate towards the threshold', () => {
  const one = judge({ kind: 'image', text: 'ai art' });
  const two = judge({
    kind: 'image',
    text: 'ai art #aiart',
    mediaUrl: 'https://cdn.example.com/ai-generated/1234.png'
  });
  assert.ok(two.score > one.score, 'more signals must score higher');
  assert.equal(two.block, true);
});

test('noisy-OR never exceeds 1', () => {
  const v = judge({
    kind: 'image',
    text: 'ai generated midjourney #aiart made with ai',
    mediaUrl: 'https://civitai.com/ai-generated/x.png',
    metadata: { synthetic: true, evidence: ['C2PA'] },
    platformDisclosure: true
  });
  assert.ok(v.score <= 1);
  assert.ok(v.score > 0.99);
});

test('the allow list overrides every other signal', () => {
  const rules = { ...NO_RULES, allowDomains: ['bbc.co.uk'] };
  const v = judge(
    { kind: 'video', text: 'AI generated deepfake explainer', pageUrl: 'https://www.bbc.co.uk/news/1' },
    rules
  );
  assert.equal(v.block, false);
  assert.equal(v.allowed, true);
});

test('allowed channels survive a platform disclosure', () => {
  const rules = { ...NO_RULES, allowChannels: ['my art channel'] };
  const v = judge({ kind: 'video', text: 'x', channel: 'My Art Channel', platformDisclosure: true }, rules);
  assert.equal(v.block, false);
});

test('user keyword, domain and channel rules each block on their own', () => {
  assert.equal(judge({ text: 'top 10 slop compilation' }, { ...NO_RULES, blockKeywords: ['slop compilation'] }).block, true);
  assert.equal(judge({ pageUrl: 'https://farm.example/a' }, { ...NO_RULES, blockDomains: ['farm.example'] }).block, true);
  assert.equal(judge({ channel: 'Slop Factory' }, { ...NO_RULES, blockChannels: ['slop factory'] }).block, true);
});

test('domain rules match subdomains but not lookalikes', () => {
  assert.equal(engine.hostMatches('cdn.civitai.com', 'civitai.com'), true);
  assert.equal(engine.hostMatches('civitai.com', 'civitai.com'), true);
  assert.equal(engine.hostMatches('notcivitai.com', 'civitai.com'), false);
  assert.equal(engine.hostMatches('civitai.com.evil.net', 'civitai.com'), false);
});

test('provenance metadata is decisive on its own', () => {
  const v = judge({
    kind: 'image',
    text: 'untitled',
    metadata: { synthetic: true, generator: '', evidence: ['IPTC DigitalSourceType'] }
  });
  assert.equal(v.block, true);
  assert.equal(v.signals[0].id, 'metadataSynthetic');
});

test('sensitivity changes the outcome for borderline items', () => {
  const candidate = { kind: 'image', text: 'an ai render of a castle' };
  assert.equal(engine.judge(candidate, NO_RULES, { sensitivity: 'relaxed' }).block, false);
  assert.equal(engine.judge(candidate, NO_RULES, { sensitivity: 'strict' }).block, true);
});

test('metadata checks are only requested for undecided items', () => {
  const on = { sensitivity: 'balanced', checkMetadata: true };
  assert.equal(engine.wantsMetadataCheck({ score: 0.2, allowed: false }, on), true);
  assert.equal(engine.wantsMetadataCheck({ score: 0.9, allowed: false }, on), false, 'already blocked');
  assert.equal(engine.wantsMetadataCheck({ score: 0.2, allowed: true }, on), false, 'allow-listed');
  assert.equal(engine.wantsMetadataCheck({ score: 0.2, allowed: false }, { ...on, checkMetadata: false }), false);
});

test('malformed candidates do not throw', () => {
  for (const bad of [undefined, {}, { text: null, mediaUrl: 'not a url' }, { pageUrl: '::::' }]) {
    assert.doesNotThrow(() => judge(bad));
  }
});

test('settings merge fills defaults and drops junk', () => {
  const merged = settingsApi.merge({ sensitivity: 'strict', sites: { youtube: false }, blockDomains: ['a.com', '', null] });
  assert.equal(merged.sensitivity, 'strict');
  assert.equal(merged.sites.youtube, false);
  assert.equal(merged.sites.googleImages, true, 'untouched sites keep their default');
  assert.deepEqual(merged.blockDomains, ['a.com']);
  assert.equal(merged.action, 'blur');
});

test('settings merge is not shared between calls', () => {
  const a = settingsApi.merge({});
  a.blockDomains.push('leak.example');
  assert.deepEqual(settingsApi.merge({}).blockDomains, []);
});
