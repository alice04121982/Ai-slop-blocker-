'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../data.js');

const fill = (n, v) => Array.from({ length: n }, () => v);

test('ASRS: all "never" scores zero and is negative', () => {
  const r = S.scoreASRS(fill(18, 0));
  assert.equal(r.partA, 0);
  assert.equal(r.partAPositive, false);
  assert.equal(r.presentation, null);
  assert.equal(r.level, 0);
});

test('ASRS: item thresholds follow the v1.1 scoring key', () => {
  // Items 1-3 shade at "sometimes" (2); items 4-6 shade at "often" (3).
  const a = fill(18, 0);
  a[0] = 2; a[1] = 2; a[2] = 2; a[3] = 2; a[4] = 2; a[5] = 2;
  assert.equal(S.scoreASRS(a).partA, 3);
  a[3] = 3;
  assert.equal(S.scoreASRS(a).partA, 4);
  assert.equal(S.scoreASRS(a).partAPositive, true);
});

test('ASRS: Part B thresholds (9, 12, 16, 18 shade at sometimes)', () => {
  const a = fill(18, 2);
  const r = S.scoreASRS(a);
  // Part A: items 1-3 shaded -> 3. Part B at "sometimes": items 9, 12, 16, 18 -> 4.
  assert.equal(r.partA, 3);
  assert.equal(r.total, 7);
});

test('ASRS: presentation is derived from domain counts', () => {
  const ia = fill(18, 0);
  [0, 1, 2, 3, 6, 7, 8, 9, 10].forEach(i => { ia[i] = 4; });
  let r = S.scoreASRS(ia);
  assert.equal(r.inattention, 9);
  assert.equal(r.hyperactivity, 0);
  assert.equal(r.presentation, 'inattentive');

  const hi = fill(18, 0);
  [4, 5, 11, 12, 13, 14, 15, 16, 17].forEach(i => { hi[i] = 4; });
  r = S.scoreASRS(hi);
  assert.equal(r.hyperactivity, 9);
  assert.equal(r.presentation, 'hyperactive-impulsive');
  assert.equal(r.partAPositive, false); // only 2 of the 6 Part A items are HI

  r = S.scoreASRS(fill(18, 4));
  assert.equal(r.presentation, 'combined');
  assert.equal(r.level, 3);
});

test('AQ-10: direction of scoring per item', () => {
  // Answering "definitely agree" (0) on everything scores only the agree-keyed items: 1, 7, 8, 10.
  assert.equal(S.scoreAQ(fill(10, 0)).score, 4);
  // "Definitely disagree" (3) on everything scores the six disagree-keyed items.
  assert.equal(S.scoreAQ(fill(10, 3)).score, 6);
  assert.equal(S.scoreAQ(fill(10, 3)).positive, true);
  // "Slightly" answers count the same way as "definitely".
  assert.equal(S.scoreAQ(fill(10, 1)).score, 4);
  assert.equal(S.scoreAQ(fill(10, 2)).score, 6);
});

test('AQ-10: cutoff is 6 or more', () => {
  const a = fill(10, 0); // 4 points from agree items
  assert.equal(S.scoreAQ(a).positive, false);
  a[1] = 3; // +1
  assert.equal(S.scoreAQ(a).positive, false);
  a[2] = 3; // +1 -> 6
  assert.equal(S.scoreAQ(a).positive, true);
});

test('RAADS-14: values, reverse item and sensory subscale', () => {
  // Option 0 = "true now and when young" = 3 points, except item 6 which is reversed.
  let r = S.scoreRAADS(fill(14, 0));
  assert.equal(r.score, 13 * 3 + 0);
  assert.equal(r.sensory, 9);
  assert.equal(r.positive, true);
  // Option 3 = "never true" = 0, except item 6 -> 3.
  r = S.scoreRAADS(fill(14, 3));
  assert.equal(r.score, 3);
  assert.equal(r.sensory, 0);
  assert.equal(r.positive, false);
});

test('RAADS-14: cutoff is 14 or more', () => {
  const a = fill(14, 3);
  a[0] = 0; a[1] = 0; a[2] = 0; a[3] = 0; // 12 + 3 (reverse item) = 15
  assert.equal(S.scoreRAADS(a).score, 15);
  assert.equal(S.scoreRAADS(a).positive, true);
  a[3] = 3; // 9 + 3 = 12
  assert.equal(S.scoreRAADS(a).positive, false);
});

test('ppv follows Bayes', () => {
  const v = S.ppv(0.687, 0.995, 0.03);
  assert.ok(Math.abs(v - 0.8095) < 0.001);
  const w = S.ppv(0.88, 0.91, 0.015);
  assert.ok(w > 0.12 && w < 0.14);
});

test('context: "none of these" is excluded from counts', () => {
  const f = S.contextFlags({ age: 2, settings: [4], differential: [7], sex: 2 });
  assert.equal(f.impairedAreas, 0);
  assert.equal(f.pervasive, false);
  assert.deepEqual(f.differentials, []);
  assert.equal(f.minor, false);
  const g = S.contextFlags({ age: 0, settings: [0, 2], differential: [0, 2] });
  assert.equal(g.pervasive, true);
  assert.equal(g.minor, true);
  assert.deepEqual(g.differentials, ['Significant anxiety', 'Poor sleep or sleep disorder']);
});

test('interpret: verdict tiers and confidence', () => {
  const base = { context: { age: 2, adhdOnset: 0, asdOnset: 0, settings: [0, 1], differential: [7], sex: 1 } };

  let r = S.interpret({ ...base, asrs: fill(18, 0), aq: fill(10, 0), raads: fill(14, 3) });
  // AQ all-agree gives 4 -> traits tier.
  assert.equal(r.verdict, 'traits');
  assert.equal(r.adhdConfidence, null);

  r = S.interpret({ ...base, asrs: fill(18, 0), aq: [3, 0, 0, 0, 0, 0, 3, 3, 0, 3], raads: fill(14, 3) });
  assert.equal(r.verdict, 'none');

  r = S.interpret({ ...base, asrs: fill(18, 4), aq: [3, 0, 0, 0, 0, 0, 3, 3, 0, 3], raads: fill(14, 3) });
  assert.equal(r.verdict, 'adhd');
  assert.equal(r.adhdConfidence.level, 'high');
  assert.equal(r.autismConfidence, null);

  r = S.interpret({ ...base, asrs: fill(18, 0), aq: fill(10, 3), raads: fill(14, 0) });
  assert.equal(r.verdict, 'autism');
  assert.equal(r.autism.level, 3);
  assert.equal(r.autismConfidence.level, 'high');

  r = S.interpret({ ...base, asrs: fill(18, 4), aq: fill(10, 3), raads: fill(14, 0) });
  assert.equal(r.verdict, 'both');

  // No childhood onset drops confidence to low; differentials cap it at moderate.
  r = S.interpret({ context: { ...base.context, adhdOnset: 2 }, asrs: fill(18, 4), aq: fill(10, 0), raads: fill(14, 3) });
  assert.equal(r.adhdConfidence.level, 'low');
  r = S.interpret({ context: { ...base.context, differential: [0] }, asrs: fill(18, 4), aq: fill(10, 0), raads: fill(14, 3) });
  assert.equal(r.adhdConfidence.level, 'moderate');
});

test('interpret: tolerates missing context', () => {
  const r = S.interpret({ context: {}, asrs: fill(18, 4), aq: fill(10, 0), raads: fill(14, 3) });
  assert.equal(r.verdict, 'adhd');
  assert.equal(r.adhdConfidence.level, 'moderate');
});
