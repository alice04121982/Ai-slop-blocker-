/*
 * Screening instruments and scoring logic.
 *
 * Everything in this file is pure data and pure functions. It has no access
 * to the DOM, storage or the network, so it can be unit tested in Node and
 * audited in isolation.
 *
 * Instruments used (all freely available validated screeners):
 *
 *  ASRS v1.1  Adult ADHD Self-Report Scale, WHO / Kessler et al. 2005.
 *             Part A (6 items) is the screener. 4+ shaded items = positive.
 *             Sensitivity 68.7%, specificity 99.5% (Kessler 2005, general pop).
 *
 *  AQ-10      Autism Spectrum Quotient, 10-item. Allison, Auyeung & Baron-Cohen 2012.
 *             Recommended by NICE CG142. Score 6+ = refer for assessment.
 *             Sensitivity 0.88, specificity 0.91 (Allison 2012, clinic sample).
 *
 *  RAADS-14   Ritvo Autism Asperger Diagnostic Scale, 14-item screen.
 *             Eriksson, Andersen & Bejerot 2013. Score 14+ = positive.
 *             Sensitivity 0.97, specificity 0.46 vs psychiatric controls,
 *             0.95 vs non-psychiatric controls.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SCREEN = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FREQ = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very often'];
  var AGREE = ['Definitely agree', 'Slightly agree', 'Slightly disagree', 'Definitely disagree'];
  var RAADS_OPTS = [
    'True now and when I was young',
    'True only now',
    'True only when I was younger than 16',
    'Never true'
  ];
  // Value for each RAADS option index above.
  var RAADS_VAL = [3, 2, 1, 0];

  // ASRS: threshold is the minimum option index that counts as a "shaded" box.
  // Domain: IA = inattention, HI = hyperactivity / impulsivity.
  var ASRS = [
    { t: 'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?', th: 2, d: 'IA' },
    { t: 'How often do you have difficulty getting things in order when you have to do a task that requires organisation?', th: 2, d: 'IA' },
    { t: 'How often do you have problems remembering appointments or obligations?', th: 2, d: 'IA' },
    { t: 'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?', th: 3, d: 'IA' },
    { t: 'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?', th: 3, d: 'HI' },
    { t: 'How often do you feel overly active and compelled to do things, like you were driven by a motor?', th: 3, d: 'HI' },
    { t: 'How often do you make careless mistakes when you have to work on a boring or difficult project?', th: 3, d: 'IA' },
    { t: 'How often do you have difficulty keeping your attention when you are doing boring or repetitive work?', th: 3, d: 'IA' },
    { t: 'How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?', th: 2, d: 'IA' },
    { t: 'How often do you misplace or have difficulty finding things at home or at work?', th: 3, d: 'IA' },
    { t: 'How often are you distracted by activity or noise around you?', th: 3, d: 'IA' },
    { t: 'How often do you leave your seat in meetings or other situations in which you are expected to remain seated?', th: 2, d: 'HI' },
    { t: 'How often do you feel restless or fidgety?', th: 3, d: 'HI' },
    { t: 'How often do you have difficulty unwinding and relaxing when you have time to yourself?', th: 3, d: 'HI' },
    { t: 'How often do you find yourself talking too much when you are in social situations?', th: 3, d: 'HI' },
    { t: 'When you are in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish them themselves?', th: 2, d: 'HI' },
    { t: 'How often do you have difficulty waiting your turn in situations when turn taking is required?', th: 3, d: 'HI' },
    { t: 'How often do you interrupt others when they are busy?', th: 2, d: 'HI' }
  ];

  // AQ-10: "agree" items score when option index <= 1, "disagree" items when index >= 2.
  var AQ10 = [
    { t: 'I often notice small sounds when others do not.', k: 'agree' },
    { t: 'I usually concentrate more on the whole picture, rather than the small details.', k: 'disagree' },
    { t: 'I find it easy to do more than one thing at once.', k: 'disagree' },
    { t: 'If there is an interruption, I can switch back to what I was doing very quickly.', k: 'disagree' },
    { t: 'I find it easy to read between the lines when someone is talking to me.', k: 'disagree' },
    { t: 'I know how to tell if someone listening to me is getting bored.', k: 'disagree' },
    { t: 'When I am reading a story I find it difficult to work out the characters’ intentions.', k: 'agree' },
    { t: 'I like to collect information about categories of things (for example types of car, bird, train or plant).', k: 'agree' },
    { t: 'I find it easy to work out what someone is thinking or feeling just by looking at their face.', k: 'disagree' },
    { t: 'I find it difficult to work out people’s intentions.', k: 'agree' }
  ];

  // RAADS-14. Item 6 is reverse scored. Items 2, 7, 10 form the sensory reactivity subscale.
  var RAADS = [
    { t: 'It is difficult for me to understand how other people are feeling when we are talking.' },
    { t: 'Some ordinary textures that do not bother others feel very offensive when they touch my skin.', s: true },
    { t: 'It is very difficult for me to work and function in groups.' },
    { t: 'It is difficult to figure out what other people expect of me.' },
    { t: 'I often do not know how to act in social situations.' },
    { t: 'I can chat and make small talk with people.', rev: true },
    { t: 'When I feel overwhelmed by my senses, I have to isolate myself to shut them down.', s: true },
    { t: 'How to make friends and socialise is a mystery to me.' },
    { t: 'When talking to someone, I have a hard time telling when it is my turn to talk or to listen.' },
    { t: 'Sometimes I have to cover my ears to block out painful noises (like vacuum cleaners or people talking too much or too loudly).', s: true },
    { t: 'It can be very hard to read someone’s face, hand and body movements when we are talking.' },
    { t: 'I focus on details rather than the overall idea.' },
    { t: 'I take things too literally, so I often miss what people are trying to say.' },
    { t: 'I get extremely upset when the way I like to do things is suddenly changed.' }
  ];

  // Context questions. These are not a validated instrument. They mirror the
  // DSM-5 requirements (onset, pervasiveness, impairment) and common
  // differential diagnoses that a clinician would check.
  var CONTEXT = [
    {
      id: 'age',
      t: 'How old are you?',
      opts: ['Under 16', '16 to 17', '18 to 29', '30 to 49', '50 or over']
    },
    {
      id: 'adhdOnset',
      t: 'Thinking about attention, restlessness or impulsivity: were several of these difficulties already present before you were 12?',
      opts: ['Yes, clearly', 'Probably or partly', 'No', 'I do not know']
    },
    {
      id: 'asdOnset',
      t: 'Thinking about social communication, sensory sensitivity or need for routine: were these present in early childhood (before school age or in primary school)?',
      opts: ['Yes, clearly', 'Probably or partly', 'No', 'I do not know']
    },
    {
      id: 'settings',
      t: 'In which areas of life do these difficulties cause real problems? Select all that apply.',
      multi: true,
      opts: ['Work or study', 'Home and daily tasks', 'Relationships and friendships', 'Money or admin', 'None of these']
    },
    {
      id: 'differential',
      t: 'Do any of the following currently apply to you? Select all that apply. These can produce similar symptoms and a clinician would want to rule them out.',
      multi: true,
      opts: [
        'Significant anxiety',
        'Depression or low mood',
        'Poor sleep or sleep disorder',
        'Regular heavy alcohol or drug use',
        'Thyroid or other untreated medical condition',
        'Recent bereavement, trauma or major life stress',
        'Medication that affects concentration',
        'None of these'
      ]
    },
    {
      id: 'sex',
      t: 'Sex assigned at birth (optional). Autism and ADHD are under-recognised in women and girls, and some screeners are less sensitive for them.',
      opts: ['Female', 'Male', 'Prefer not to say']
    }
  ];

  var SECTIONS = [
    { id: 'context', title: 'About you', intro: 'A few questions a clinician would ask before interpreting any questionnaire.', items: CONTEXT },
    { id: 'asrs', title: 'Attention and activity', intro: 'Adult ADHD Self-Report Scale (ASRS v1.1). Answer for how you have felt and behaved over the past six months.', items: ASRS, opts: FREQ },
    { id: 'aq', title: 'Thinking style and social understanding', intro: 'Autism Spectrum Quotient, 10-item version (AQ-10).', items: AQ10, opts: AGREE },
    { id: 'raads', title: 'Social, sensory and routine', intro: 'RAADS-14 screen. Choose the option that best describes when each statement has been true for you.', items: RAADS, opts: RAADS_OPTS }
  ];

  function count(arr) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i]) n++;
    return n;
  }

  function scoreASRS(a) {
    var shaded = ASRS.map(function (q, i) { return a[i] >= q.th; });
    var partA = count(shaded.slice(0, 6));
    var ia = 0, hi = 0;
    ASRS.forEach(function (q, i) {
      if (!shaded[i]) return;
      if (q.d === 'IA') ia++; else hi++;
    });
    var presentation = null;
    if (ia >= 5 && hi >= 5) presentation = 'combined';
    else if (ia >= 5) presentation = 'inattentive';
    else if (hi >= 5) presentation = 'hyperactive-impulsive';
    return {
      partA: partA,
      partAPositive: partA >= 4,
      total: count(shaded),
      inattention: ia,
      hyperactivity: hi,
      presentation: presentation,
      // Rough symptom level: 0 none, 1 some traits, 2 positive screen, 3 strong.
      level: partA >= 4 ? (ia >= 5 || hi >= 5 ? 3 : 2) : (partA >= 2 || ia >= 4 || hi >= 4 ? 1 : 0)
    };
  }

  function scoreAQ(a) {
    var s = 0;
    AQ10.forEach(function (q, i) {
      var v = a[i];
      if (q.k === 'agree' ? v <= 1 : v >= 2) s++;
    });
    return { score: s, positive: s >= 6 };
  }

  function scoreRAADS(a) {
    var total = 0, sensory = 0;
    RAADS.forEach(function (q, i) {
      var v = RAADS_VAL[a[i]];
      if (q.rev) v = 3 - v;
      total += v;
      if (q.s) sensory += v;
    });
    return { score: total, sensory: sensory, positive: total >= 14 };
  }

  function scoreAutism(aq, raads) {
    var level;
    if (aq.positive && raads.positive) level = 3;
    else if (aq.positive || raads.positive) level = 2;
    else if (aq.score >= 4 || raads.score >= 10) level = 1;
    else level = 0;
    return { level: level };
  }

  // Positive predictive value from Bayes: how likely a positive screen is a
  // true positive, given sensitivity, specificity and a prior prevalence.
  function ppv(sens, spec, prev) {
    var tp = sens * prev;
    var fp = (1 - spec) * (1 - prev);
    return tp / (tp + fp);
  }

  var STATS = {
    asrs: { sens: 0.687, spec: 0.995, generalPrev: 0.03, seekingPrev: 0.25 },
    aq: { sens: 0.88, spec: 0.91, generalPrev: 0.015, seekingPrev: 0.25 },
    raads: { sens: 0.97, spec: 0.46, generalPrev: 0.015, seekingPrev: 0.25 }
  };

  function contextFlags(ctx) {
    ctx = ctx || {};
    var settings = ctx.settings || [];
    var diff = ctx.differential || [];
    var noneIdx = CONTEXT[3].opts.length - 1;
    var noneDiff = CONTEXT[4].opts.length - 1;
    var impairedAreas = settings.filter(function (i) { return i !== noneIdx; }).length;
    var differentials = diff.filter(function (i) { return i !== noneDiff; }).map(function (i) { return CONTEXT[4].opts[i]; });
    return {
      minor: ctx.age === 0 || ctx.age === 1,
      adhdOnset: ctx.adhdOnset,      // 0 yes, 1 partly, 2 no, 3 unknown
      asdOnset: ctx.asdOnset,
      impairedAreas: impairedAreas,
      pervasive: impairedAreas >= 2,
      differentials: differentials,
      female: ctx.sex === 0
    };
  }

  /*
   * Overall interpretation. Returns a plain object; the UI renders it.
   * verdict: one of
   *   'none'      no evidence of neurodivergence on these screeners
   *   'traits'    some traits, below screening thresholds
   *   'adhd'      positive ADHD screen only
   *   'autism'    positive autism screen only
   *   'both'      positive on both
   */
  function interpret(answers) {
    var asrs = scoreASRS(answers.asrs);
    var aq = scoreAQ(answers.aq);
    var raads = scoreRAADS(answers.raads);
    var aut = scoreAutism(aq, raads);
    var ctx = contextFlags(answers.context);

    var adhdPos = asrs.partAPositive;
    var autPos = aut.level >= 2;
    var verdict = adhdPos && autPos ? 'both' : adhdPos ? 'adhd' : autPos ? 'autism' : (asrs.level >= 1 || aut.level >= 1) ? 'traits' : 'none';

    // Confidence modifiers. Start from screener result, then adjust for
    // developmental history, pervasiveness and confounders.
    function confidence(positive, onset) {
      if (!positive) return null;
      var c = 'moderate';
      var reasons = [];
      if (onset === 0) { reasons.push('difficulties were present in childhood, which the diagnostic criteria require'); }
      if (onset === 2) { c = 'low'; reasons.push('you reported no childhood onset, which does not fit the diagnostic criteria and points to another explanation'); }
      if (onset === 3) { reasons.push('childhood onset is unknown, so a clinician would want a developmental history from someone who knew you as a child'); }
      if (ctx.pervasive) { reasons.push('problems in two or more areas of life, which the criteria also require'); }
      else { if (c !== 'low') c = 'moderate'; reasons.push('problems were reported in fewer than two areas of life, so impairment may not meet the diagnostic threshold'); }
      if (ctx.differentials.length) { if (c === 'high') c = 'moderate'; reasons.push('you reported ' + ctx.differentials.length + ' condition(s) that can mimic these symptoms: ' + ctx.differentials.join(', ').toLowerCase()); }
      if (onset === 0 && ctx.pervasive && !ctx.differentials.length) c = 'high';
      return { level: c, reasons: reasons };
    }

    return {
      verdict: verdict,
      asrs: asrs,
      aq: aq,
      raads: raads,
      autism: aut,
      ctx: ctx,
      adhdConfidence: confidence(adhdPos, ctx.adhdOnset),
      autismConfidence: confidence(autPos, ctx.asdOnset),
      ppv: {
        asrsGeneral: ppv(STATS.asrs.sens, STATS.asrs.spec, STATS.asrs.generalPrev),
        asrsSeeking: ppv(STATS.asrs.sens, STATS.asrs.spec, STATS.asrs.seekingPrev),
        aqGeneral: ppv(STATS.aq.sens, STATS.aq.spec, STATS.aq.generalPrev),
        aqSeeking: ppv(STATS.aq.sens, STATS.aq.spec, STATS.aq.seekingPrev),
        raadsGeneral: ppv(STATS.raads.sens, STATS.raads.spec, STATS.raads.generalPrev),
        raadsSeeking: ppv(STATS.raads.sens, STATS.raads.spec, STATS.raads.seekingPrev)
      }
    };
  }

  return {
    SECTIONS: SECTIONS,
    ASRS: ASRS,
    AQ10: AQ10,
    RAADS: RAADS,
    CONTEXT: CONTEXT,
    STATS: STATS,
    scoreASRS: scoreASRS,
    scoreAQ: scoreAQ,
    scoreRAADS: scoreRAADS,
    scoreAutism: scoreAutism,
    contextFlags: contextFlags,
    ppv: ppv,
    interpret: interpret
  };
});
