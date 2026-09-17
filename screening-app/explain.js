/*
 * Offline question answering for the summary page.
 *
 * Pure functions, no DOM, no network. Given the user's question, their raw
 * answers and the scored result, it returns a plain-language answer that
 * points at the specific items behind the summary. It is deliberately
 * rule-based so that it works with no data leaving the device and so that
 * every statement it makes can be checked against the scoring key.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    root.EXPLAIN = factory(root.SCREEN);
  }
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  var SUGGESTIONS = [
    'Surely everybody has some of these traits?',
    'Which of my answers counted towards the result?',
    'How is neurodivergent defined here?',
    'I find social situations hard. Is that normal?',
    'How accurate is this?',
    'What would change the result?'
  ];

  function has(q, words) {
    for (var i = 0; i < words.length; i++) if (q.indexOf(words[i]) !== -1) return true;
    return false;
  }

  function endorsed(answers) {
    var a = answers.asrs || [], b = answers.aq || [], c = answers.raads || [];
    var asrs = [], aq = [], raads = [];
    S.ASRS.forEach(function (q, i) { if (a[i] >= q.th) asrs.push({ n: i + 1, t: q.t, d: q.d, v: S.SECTIONS[1].opts[a[i]] }); });
    S.AQ10.forEach(function (q, i) {
      var v = b[i];
      if (q.k === 'agree' ? v <= 1 : v >= 2) aq.push({ n: i + 1, t: q.t, v: S.SECTIONS[2].opts[v] });
    });
    S.RAADS.forEach(function (q, i) {
      var idx = c[i];
      var val = [3, 2, 1, 0][idx];
      if (q.rev) val = 3 - val;
      if (val >= 2) raads.push({ n: i + 1, t: q.t, s: !!q.s, v: S.SECTIONS[3].opts[idx], pts: val });
    });
    return { asrs: asrs, aq: aq, raads: raads };
  }

  var VERDICT_LABEL = {
    none: 'no indication of ADHD or autism',
    traits: 'some traits, below the screening thresholds',
    adhd: 'a positive ADHD screen',
    autism: 'a positive autism screen',
    both: 'positive screens for both ADHD and autism'
  };

  function pct(x) { return Math.round(x * 100) + '%'; }

  function answer(question, answers, r) {
    var q = String(question || '').toLowerCase();
    var e = endorsed(answers);
    var out = { title: '', paragraphs: [], items: [] };
    var social = e.raads.filter(function (x) { return [1, 3, 4, 5, 6, 8, 9, 11, 13].indexOf(x.n) !== -1; })
      .concat(e.aq.filter(function (x) { return [5, 6, 7, 9, 10].indexOf(x.n) !== -1; }));
    var sensory = e.raads.filter(function (x) { return x.s; }).concat(e.aq.filter(function (x) { return x.n === 1; }));

    if (has(q, ['social', 'shy', 'people', 'conversation', 'friends', 'small talk', 'party', 'parties', 'groups', 'awkward'])) {
      out.title = 'Finding social situations hard is common, and on its own it is not a sign of autism.';
      out.paragraphs.push('Roughly one adult in eight has significant social anxiety at some point, and far more find groups, small talk or reading people tiring without it being a disorder at all. The autism screeners look for something narrower: difficulty working out what people mean, intend or feel, present since early childhood, alongside sensory differences and a strong need for sameness.');
      if (social.length) {
        out.items.push({ head: 'Social items you endorsed (' + social.length + ')', rows: social.map(function (x) { return x.t + ' You answered "' + x.v + '".'; }) });
      } else {
        out.paragraphs.push('You did not endorse any of the social communication items above threshold, so social difficulty is not what your summary is picking up.');
      }
      var onset = r.ctx.asdOnset;
      out.paragraphs.push(onset === 0 ? 'You said these were present in early childhood, which is the one thing that separates an autistic pattern from social anxiety picked up later.' :
        onset === 2 ? 'You said these were not present in early childhood. Social difficulty that started later in life, or that comes and goes with stress, points away from autism and towards ordinary variation or anxiety.' :
        'Whether these were present in early childhood is the key question a clinician would ask, because social anxiety that developed later is not autism.');
      if (r.autism.level < 2) out.paragraphs.push('Your autism scores were below both cut-offs, which fits what you describe: some social difficulty within the normal range.');
      return out;
    }

    if (has(q, ['everybody', 'everyone', 'normal', 'common', 'doesn’t everyone', 'doesnt everyone', 'most people', 'ordinary', 'typical'])) {
      out.title = 'Yes, and the scoring is built around that.';
      out.paragraphs.push('Every item on these questionnaires describes something many people experience. The questions do not ask whether you ever have the trait, they ask how often or how strongly, and the scoring only counts an answer once it passes a bar that most people do not reach.');
      out.paragraphs.push('The thresholds come from studies that gave the same questions to people with and without a diagnosis. The AQ-10 cut-off of 6 was set so that about 9 in 10 non-autistic adults fall below it. The RAADS-14 cut-off of 14 sits well above the low single-digit scores that non-autistic adults without a psychiatric diagnosis typically get, though many people with anxiety or ADHD also clear it. The ASRS Part A cut-off is passed by fewer than 1 in 100 adults who do not have ADHD.');
      out.paragraphs.push('Your scores: ASRS Part A ' + r.asrs.partA + ' of 6 (cut-off 4), AQ-10 ' + r.aq.score + ' of 10 (cut-off 6), RAADS-14 ' + r.raads.score + ' of 42 (cut-off 14). ' +
        (r.verdict === 'traits' ? 'That is what "some traits" means: more items than the average adult endorses, but not enough to pass any cut-off. It is an honest description of the numbers, not a suggestion that you are neurodivergent.' :
         r.verdict === 'none' ? 'All three are in the range most adults score in.' :
         'At least one of these is above its cut-off, which is a stronger signal than ordinary variation but still not a diagnosis.'));
      return out;
    }

    if (has(q, ['defin', 'what does neurodivergent mean', 'what is neurodivergent', 'how is neurodivergent', 'count as', 'threshold', 'cut-off', 'cutoff', 'criteria', 'what does traits mean', 'what do traits mean', 'trait mean'])) {
      out.title = 'Neurodivergent is not a score. It is a clinical judgement.';
      out.paragraphs.push('This app never decides whether anyone is neurodivergent. It reports three things: how your questionnaire scores compare with published cut-offs, whether your answers fit the pattern the diagnostic criteria describe, and how much weight that deserves.');
      out.paragraphs.push('A clinical diagnosis of ADHD or autism requires all of the following, not just a score: enough symptoms (for adult ADHD, five or more in a domain), symptoms that started in childhood, presence across more than one setting, real impairment in daily life, and no better explanation such as anxiety, depression, poor sleep or a medical condition.');
      out.paragraphs.push('The "some traits" tier is triggered when a score is raised but under its cut-off: ASRS Part A of 2 or 3, or four items in one ADHD domain, or AQ-10 of 4 or 5, or RAADS-14 of 10 to 13. Your result was ' + VERDICT_LABEL[r.verdict] + '.');
      return out;
    }

    if (has(q, ['which', 'what answers', 'what did i', 'counted', 'reflected', 'contributed', 'why did it say', 'why does it say', 'based on', 'which questions'])) {
      out.title = 'The answers that counted';
      out.paragraphs.push('Only answers that passed each item’s threshold are listed. Everything else scored zero.');
      if (e.asrs.length) { out.items.push({ head: 'ADHD screener (ASRS): ' + e.asrs.length + ' of 18 items above threshold', rows: e.asrs.map(function (x) { return 'Q' + x.n + ' (' + (x.d === 'IA' ? 'attention' : 'activity/impulsivity') + '): ' + x.t + ' You answered "' + x.v + '".'; }) }); }
      else out.paragraphs.push('No ADHD items passed their threshold.');
      if (e.aq.length) { out.items.push({ head: 'AQ-10: ' + e.aq.length + ' of 10 items scored', rows: e.aq.map(function (x) { return 'Q' + x.n + ': ' + x.t + ' You answered "' + x.v + '".'; }) }); }
      else out.paragraphs.push('No AQ-10 items scored.');
      if (e.raads.length) { out.items.push({ head: 'RAADS-14: items you marked as true now', rows: e.raads.map(function (x) { return 'Q' + x.n + (x.s ? ' (sensory)' : '') + ': ' + x.t + ' You answered "' + x.v + '" (' + x.pts + ' of 3 points).'; }) }); }
      else out.paragraphs.push('No RAADS-14 items were marked as true now.');
      out.paragraphs.push('Overall: ' + VERDICT_LABEL[r.verdict] + '.');
      return out;
    }

    if (has(q, ['sensory', 'noise', 'sound', 'texture', 'light', 'smell', 'overwhelm'])) {
      out.title = 'Sensory items';
      out.paragraphs.push('Sensory differences are part of the current diagnostic criteria for autism and are the part the AQ-10 barely covers. The RAADS-14 has three sensory items worth 9 points in total. You scored ' + r.raads.sensory + ' of 9 on them.');
      if (sensory.length) out.items.push({ head: 'Sensory items you endorsed', rows: sensory.map(function (x) { return x.t + ' You answered "' + x.v + '".'; }) });
      else out.paragraphs.push('You did not endorse any sensory items.');
      out.paragraphs.push('Sensitivity to noise or textures on its own is common and is also raised by anxiety, migraine and poor sleep. It carries weight mainly when it sits alongside the social and routine items.');
      return out;
    }

    if (has(q, ['adhd', 'attention', 'focus', 'concentrat', 'organis', 'organiz', 'restless', 'impulsiv', 'hyperactiv', 'procrastinat'])) {
      out.title = 'The ADHD screener';
      out.paragraphs.push('The ASRS asks about the past six months. Its first six questions carry most of the weight: four or more above threshold is a positive screen. You had ' + r.asrs.partA + ' of 6. Across all 18 items you had ' + r.asrs.inattention + ' of 9 attention items and ' + r.asrs.hyperactivity + ' of 9 activity or impulsivity items above threshold.');
      if (e.asrs.length) out.items.push({ head: 'Items above threshold', rows: e.asrs.map(function (x) { return 'Q' + x.n + ': ' + x.t + ' You answered "' + x.v + '".'; }) });
      out.paragraphs.push(r.asrs.partAPositive ? 'A positive ASRS is a strong signal because false positives are rare, but ADHD also requires childhood onset and impairment in more than one setting.' :
        'Below the cut-off. Note that the ASRS misses about a third of adults who do have ADHD, so a negative screen is weaker evidence than a positive one, but nothing in your answers points that way.');
      return out;
    }

    if (has(q, ['accura', 'reliab', 'trust', 'wrong', 'false', 'valid', 'evidence', 'science', 'how good'])) {
      out.title = 'How much a result is worth';
      out.paragraphs.push('Each screener has a published hit rate. Sensitivity is how many true cases it catches, specificity is how many non-cases it correctly clears. ASRS Part A: ' + pct(S.STATS.asrs.sens) + ' and ' + pct(S.STATS.asrs.spec) + '. AQ-10: ' + pct(S.STATS.aq.sens) + ' and ' + pct(S.STATS.aq.spec) + '. RAADS-14: ' + pct(S.STATS.raads.sens) + ' and ' + pct(S.STATS.raads.spec) + '.');
      out.paragraphs.push('What matters to you is the other direction: if the screen is positive, how likely is the condition? That depends on how common it is among people taking the test. For someone from the general population, a positive AQ-10 is confirmed on full assessment about ' + pct(r.ppv.aqGeneral) + ' of the time. For someone who sought out a screener because they already suspected something, roughly ' + pct(r.ppv.aqSeeking) + '. A positive ASRS is confirmed about ' + pct(r.ppv.asrsGeneral) + ' of the time even in the general population.');
      out.paragraphs.push('A negative result is more reliable for autism than for ADHD, because the RAADS-14 catches nearly everyone who is autistic while the ASRS misses about a third of adults with ADHD.');
      return out;
    }

    if (has(q, ['childhood', 'onset', 'when i was young', 'as a child', 'before 12', 'early'])) {
      out.title = 'Why childhood matters';
      out.paragraphs.push('Both ADHD and autism are neurodevelopmental, meaning present from early life. Adult ADHD criteria require several symptoms before age 12, and autism requires features in the early developmental period even if they only became a problem later. Traits that appeared for the first time in adulthood point to something else: stress, anxiety, depression, sleep, a medical cause or simply life circumstances.');
      var a = r.ctx.adhdOnset, b = r.ctx.asdOnset;
      var lab = ['clearly present', 'probably or partly present', 'not present', 'unknown'];
      out.paragraphs.push('You said attention and activity difficulties were ' + (lab[a] || 'not answered') + ' before age 12, and social, sensory or routine differences were ' + (lab[b] || 'not answered') + ' in early childhood. A clinician would want to hear from a parent, older sibling or school reports where possible.');
      return out;
    }

    if (has(q, ['anxiety', 'anxious', 'depress', 'sleep', 'stress', 'tired', 'burnout', 'menopause', 'thyroid'])) {
      out.title = 'Other explanations';
      out.paragraphs.push('Anxiety, low mood, poor sleep, chronic stress and hormonal changes all produce poor concentration, restlessness, social withdrawal and sensory overload. They are far more common than ADHD or autism, and they can push questionnaire scores up without any neurodevelopmental condition being present.');
      out.paragraphs.push(r.ctx.differentials.length ? 'You reported: ' + r.ctx.differentials.join(', ').toLowerCase() + '. The summary lowered its confidence because of this. The question a clinician would ask is whether the traits were there before these problems, and whether they persist when these are treated.' :
        'You did not report any of these, which makes the questionnaire scores a little easier to interpret.');
      return out;
    }

    if (has(q, ['women', 'woman', 'female', 'girls', 'mask'])) {
      out.title = 'Women and masking';
      out.paragraphs.push('The AQ-10 and RAADS were developed mainly on male samples. Autistic women, and anyone who has learned to copy social behaviour consciously, more often score below the cut-offs while still meeting criteria on a full assessment. This is why the summary says a borderline result deserves more weight if that applies to you.');
      out.paragraphs.push('It cuts both ways. It does not mean a low score in a woman is secretly positive. It means the screen is less able to rule autism out, so how much the traits cost you day to day matters more than the number.');
      return out;
    }

    if (has(q, ['am i', 'do i have', 'have i got', 'diagnos', 'neurodivergent?', 'autistic?', 'adhd?'])) {
      out.title = 'This tool cannot tell you that, and neither can any questionnaire.';
      out.paragraphs.push('Your result was ' + VERDICT_LABEL[r.verdict] + '. ' + (r.verdict === 'none' || r.verdict === 'traits' ?
        'Nothing in your answers reaches a screening cut-off. If your day-to-day life is not being limited by these traits, there is no reason to think you are neurodivergent on this evidence.' :
        'That is a reason to ask for an assessment, not a diagnosis. Between a quarter and four fifths of people with a positive screen are confirmed, depending on the tool and on why they took it.'));
      out.paragraphs.push('The only route to a yes or no is a clinical assessment, which combines a structured interview, a developmental history and a check for other explanations.');
      return out;
    }

    if (has(q, ['change the result', 'change my result', 'what would', 'different result', 'positive', 'higher score'])) {
      out.title = 'What would move the result';
      var need = [];
      if (r.asrs.partA < 4) need.push('ADHD: ' + (4 - r.asrs.partA) + ' more of the first six ASRS items above threshold (you have ' + r.asrs.partA + ').');
      if (r.aq.score < 6) need.push('AQ-10: ' + (6 - r.aq.score) + ' more scored items (you have ' + r.aq.score + ').');
      if (r.raads.score < 14) need.push('RAADS-14: ' + (14 - r.raads.score) + ' more points (you have ' + r.raads.score + ').');
      if (need.length) out.items.push({ head: 'Distance from each cut-off', rows: need });
      else out.paragraphs.push('You are already above every cut-off.');
      out.paragraphs.push('Distance from a cut-off is not the point, though. The confidence grading weighs childhood onset, impairment in two or more settings and other conditions. Those matter more to a clinician than a point either side of a line.');
      return out;
    }

    if (has(q, ['next', 'doctor', 'gp', 'what should i do', 'refer', 'assessment', 'help'])) {
      out.title = 'Next steps';
      out.paragraphs.push(r.verdict === 'none' || r.verdict === 'traits' ?
        'On this result there is no screening reason to seek an assessment. If something is causing you real difficulty, that difficulty is still worth raising with a GP whatever its name turns out to be.' :
        'Take the printed or downloaded summary to a GP and ask about a referral for ' + (r.verdict === 'both' ? 'ADHD and autism assessment' : r.verdict === 'adhd' ? 'an adult ADHD assessment' : 'an autism assessment') + '. Concrete examples of impact and any childhood evidence help most.');
      return out;
    }

    out.title = 'I can answer questions about your summary';
    out.paragraphs.push('I work from your answers and the published scoring keys, so I can explain which items counted, what the thresholds mean, how the population compares, and what would change the result. Try one of the suggested questions, or ask about a specific area such as attention, social situations, sensory sensitivity or childhood.');
    return out;
  }

  // Compact, item-level context for a live assistant, if the host offers one.
  function contextText(answers, r, summaryText) {
    var e = endorsed(answers);
    var lines = [summaryText, '', 'Items above threshold:'];
    e.asrs.forEach(function (x) { lines.push('ASRS Q' + x.n + ' [' + x.d + '] "' + x.t + '" = ' + x.v); });
    e.aq.forEach(function (x) { lines.push('AQ10 Q' + x.n + ' "' + x.t + '" = ' + x.v); });
    e.raads.forEach(function (x) { lines.push('RAADS Q' + x.n + (x.s ? ' [sensory]' : '') + ' "' + x.t + '" = ' + x.v); });
    return lines.join('\n');
  }

  return { SUGGESTIONS: SUGGESTIONS, answer: answer, endorsed: endorsed, contextText: contextText, VERDICT_LABEL: VERDICT_LABEL };
});
