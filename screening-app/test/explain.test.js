'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../data.js');
const E = require('../explain.js');

const fill = (n, v) => Array.from({ length: n }, () => v);
const traits = {
  context: { age: 3, adhdOnset: 2, asdOnset: 2, settings: [4], differential: [7], sex: 0 },
  asrs: fill(18, 1),
  aq: [0, 3, 3, 0, 0, 0, 3, 0, 0, 0],
  raads: [3, 3, 0, 3, 1, 3, 3, 3, 3, 3, 3, 0, 3, 3]
};
const r = S.interpret(traits);

test('fixture is the traits tier', () => {
  assert.equal(r.verdict, 'traits');
});

test('specific topics win over the general "normal" question', () => {
  const a = E.answer('I find social situations hard. Is that normal?', traits, r);
  assert.match(a.title, /social situations/i);
  assert.equal(a.items.length, 1);
  assert.ok(a.items[0].rows.some(row => /small talk/.test(row)));
  assert.ok(a.paragraphs.some(p => /not present in early childhood/.test(p)));
});

test('"everybody has these traits" explains thresholds with the real scores', () => {
  const a = E.answer('Surely everybody has some of these traits?', traits, r);
  assert.match(a.paragraphs.join(' '), /AQ-10 5 of 10/);
  assert.match(a.paragraphs.join(' '), /some traits/);
});

test('"which answers counted" lists only endorsed items', () => {
  const a = E.answer('Which of my answers counted?', traits, r);
  const heads = a.items.map(i => i.head);
  assert.ok(heads.some(h => /AQ-10: 5 of 10/.test(h)));
  assert.ok(heads.some(h => /RAADS-14/.test(h)));
  assert.ok(a.paragraphs.some(p => /No ADHD items/.test(p)));
});

test('endorsed() honours the reverse-scored RAADS item', () => {
  const e = E.endorsed(traits);
  // Item 6 answered "Never true" (index 3) is reverse scored to 3 points.
  const six = e.raads.find(x => x.n === 6);
  assert.equal(six.pts, 3);
});

test('unknown questions fall back to guidance', () => {
  const a = E.answer('banana', traits, r);
  assert.match(a.title, /I can answer/);
});

test('"what would change the result" reports distance to each cut-off', () => {
  const a = E.answer('What would change the result?', traits, r);
  const rows = a.items[0].rows.join(' ');
  assert.match(rows, /ADHD: 4 more/);
  assert.match(rows, /AQ-10: 1 more/);
  assert.match(rows, /RAADS-14: 3 more/);
});
