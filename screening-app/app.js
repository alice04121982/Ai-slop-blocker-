/*
 * UI controller. Renders one question at a time, keeps answers in memory
 * (mirrored to sessionStorage for the life of the tab) and renders the
 * summary. All text is inserted with textContent; no HTML strings are
 * ever built from data.
 */
(function () {
  'use strict';

  var S = window.SCREEN;
  var STORE_KEY = 'nd-screen-v1';
  var main = document.getElementById('main');
  var progressEl = document.getElementById('progress');
  var progressBar = document.getElementById('progressBar');
  var clearBtn = document.getElementById('clearBtn');

  // Flatten sections into a linear list of steps.
  var STEPS = [];
  S.SECTIONS.forEach(function (sec) {
    sec.items.forEach(function (item, i) {
      STEPS.push({ sec: sec, item: item, i: i });
    });
  });

  var state = load() || freshState();

  function freshState() {
    return { consented: false, step: 0, done: false, answers: { context: {}, asrs: [], aq: [], raads: [] } };
  }

  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || !obj.answers) return null;
      return sanitise(obj);
    } catch (e) { return null; }
  }

  // Never trust stored data blindly: coerce to the expected shapes.
  function sanitise(obj) {
    var st = freshState();
    st.consented = obj.consented === true;
    st.done = obj.done === true;
    st.step = clampInt(obj.step, 0, STEPS.length - 1);
    ['asrs', 'aq', 'raads'].forEach(function (k) {
      var src = Array.isArray(obj.answers[k]) ? obj.answers[k] : [];
      var sec = sectionById(k);
      st.answers[k] = sec.items.map(function (_, i) {
        return isInt(src[i]) ? clampInt(src[i], 0, sec.opts.length - 1) : undefined;
      });
    });
    var ctxSrc = obj.answers.context && typeof obj.answers.context === 'object' ? obj.answers.context : {};
    S.CONTEXT.forEach(function (q) {
      var v = ctxSrc[q.id];
      if (q.multi) {
        if (Array.isArray(v)) st.answers.context[q.id] = v.filter(isInt).map(function (n) { return clampInt(n, 0, q.opts.length - 1); });
      } else if (isInt(v)) {
        st.answers.context[q.id] = clampInt(v, 0, q.opts.length - 1);
      }
    });
    return st;
  }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function clampInt(n, lo, hi) { n = isInt(n) ? n : lo; return Math.min(hi, Math.max(lo, n)); }
  function sectionById(id) { for (var i = 0; i < S.SECTIONS.length; i++) if (S.SECTIONS[i].id === id) return S.SECTIONS[i]; }

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: keep in memory */ }
  }

  function clearAll() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    state = freshState();
    render();
  }

  // ---------- tiny DOM helpers ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function p(text, cls) { return el('p', { text: text, class: cls || '' }); }
  function li(text) { return el('li', { text: text }); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---------- rendering ----------
  function render() {
    clear(main);
    clearBtn.hidden = !state.consented;
    if (!state.consented) renderWelcome();
    else if (state.done) renderResults();
    else renderStep();
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function setProgress(pct) {
    progressBar.style.width = pct + '%';
    progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function renderWelcome() {
    setProgress(0);
    var consent = el('input', { type: 'checkbox', id: 'consent' });
    var start = el('button', { type: 'button', class: 'btn', text: 'Start the screening', disabled: '' , onclick: function () {
      state.consented = true; state.step = 0; save(); render();
    } });
    consent.addEventListener('change', function () { if (consent.checked) start.removeAttribute('disabled'); else start.setAttribute('disabled', ''); });

    main.appendChild(el('h1', { text: 'ADHD and autism screening' }));
    main.appendChild(p('Three validated questionnaires used in clinical practice, plus a few context questions, in about 10 minutes. At the end you get a plain-language summary of what your answers do and do not show.'));
    main.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'What this is' }),
      el('ul', {}, [
        li('ASRS v1.1: the World Health Organization adult ADHD screener (18 questions).'),
        li('AQ-10: the 10-question Autism Spectrum Quotient recommended by NICE.'),
        li('RAADS-14: a 14-question autism screen that also covers sensory sensitivity.'),
        li('Six context questions about onset, impact and other conditions, because a questionnaire score alone is never enough.')
      ])
    ]));
    main.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'What this is not' }),
      p('It is not a diagnosis. Screening questionnaires estimate how likely it is that a full assessment would find ADHD or autism. They cannot replace that assessment, which involves a clinician, a developmental history and ruling out other explanations.'),
      p('If you are under 18, these adult questionnaires are less reliable for you. You can still complete them, and the summary will say how to weigh the result.')
    ]));
    main.appendChild(el('div', { class: 'card tone-info' }, [
      el('h2', { text: 'Privacy' }),
      p('Everything runs in this browser tab. No answers are sent anywhere, no analytics run, and nothing is stored after you close the tab unless you download the summary yourself.'),
      el('label', { class: 'check', 'for': 'consent' }, [consent, el('span', { text: 'I understand this is a screening aid and not a medical diagnosis.' })])
    ]));
    main.appendChild(el('div', { class: 'row' }, [start]));
  }

  function getAnswer(step) {
    if (step.sec.id === 'context') return state.answers.context[step.item.id];
    return state.answers[step.sec.id][step.i];
  }
  function setAnswer(step, value) {
    if (step.sec.id === 'context') state.answers.context[step.item.id] = value;
    else state.answers[step.sec.id][step.i] = value;
    save();
  }

  function renderStep() {
    var step = STEPS[state.step];
    var total = STEPS.length;
    setProgress((state.step / total) * 100);

    var sec = step.sec;
    var opts = sec.opts || step.item.opts;
    var multi = !!step.item.multi;
    var current = getAnswer(step);
    var isFirstOfSection = step.i === 0;

    var card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'eyebrow', text: sec.title + ' · Question ' + (state.step + 1) + ' of ' + total }));
    if (isFirstOfSection) card.appendChild(p(sec.intro, 'muted small'));
    card.appendChild(el('p', { class: 'q', id: 'qtext', text: step.item.t }));

    var group = el('div', { class: 'opts', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': 'qtext' });
    var buttons = [];
    var selected = multi ? (Array.isArray(current) ? current.slice() : []) : current;
    var noneIdx = opts.length - 1;

    opts.forEach(function (label, idx) {
      var checked = multi ? selected.indexOf(idx) !== -1 : selected === idx;
      var b = el('button', { type: 'button', class: 'opt', role: multi ? 'checkbox' : 'radio', 'aria-checked': checked ? 'true' : 'false' }, [
        el('span', { class: 'key', 'aria-hidden': 'true', text: String(idx + 1) }),
        el('span', { text: label })
      ]);
      b.addEventListener('click', function () { choose(idx); });
      buttons.push(b);
      group.appendChild(b);
    });
    card.appendChild(group);

    var nextBtn = el('button', { type: 'button', class: 'btn grow', text: multi ? 'Continue' : 'Next', onclick: advance });
    var backBtn = el('button', { type: 'button', class: 'btn secondary', text: 'Back', onclick: function () {
      if (state.step > 0) { state.step--; save(); render(); }
    } });
    if (state.step === 0) backBtn.setAttribute('disabled', '');
    updateNext();
    card.appendChild(el('div', { class: 'row' }, [backBtn, nextBtn]));
    main.appendChild(card);
    main.appendChild(p('Tip: press 1 to ' + opts.length + ' on your keyboard to answer.', 'muted small'));

    function updateNext() {
      var answered = multi ? selected.length > 0 : isInt(selected);
      if (answered) nextBtn.removeAttribute('disabled'); else nextBtn.setAttribute('disabled', '');
    }

    function choose(idx) {
      if (multi) {
        // "None of these" is exclusive with every other option.
        var isNone = idx === noneIdx;
        var pos = selected.indexOf(idx);
        if (pos !== -1) selected.splice(pos, 1);
        else if (isNone) selected = [idx];
        else { selected = selected.filter(function (v) { return v !== noneIdx; }); selected.push(idx); }
        selected.sort(function (a, b) { return a - b; });
        buttons.forEach(function (b, i) { b.setAttribute('aria-checked', selected.indexOf(i) !== -1 ? 'true' : 'false'); });
        setAnswer(step, selected);
        updateNext();
      } else {
        selected = idx;
        buttons.forEach(function (b, i) { b.setAttribute('aria-checked', i === idx ? 'true' : 'false'); });
        setAnswer(step, idx);
        updateNext();
        window.setTimeout(advance, 180);
      }
    }

    function advance() {
      if (STEPS[state.step] !== step) return; // already moved on
      var answered = multi ? selected.length > 0 : isInt(selected);
      if (!answered) return;
      if (state.step >= total - 1) { state.done = true; save(); render(); return; }
      state.step++; save(); render();
    }

    keyHandler = function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= opts.length) { e.preventDefault(); choose(n - 1); }
      else if (e.key === 'Enter' && multi) { e.preventDefault(); advance(); }
    };
  }

  var keyHandler = null;
  document.addEventListener('keydown', function (e) {
    if (keyHandler && !state.done && state.consented) keyHandler(e);
  });

  // ---------- results ----------
  function pct(n) { return Math.round(n * 100); }

  function meter(value, max, cutoff) {
    var m = el('div', { class: 'meter', role: 'img', 'aria-label': value + ' out of ' + max + ', threshold ' + cutoff });
    var fill = el('span');
    fill.style.width = Math.min(100, (value / max) * 100) + '%';
    var mark = el('i');
    mark.style.left = ((cutoff / max) * 100) + '%';
    m.appendChild(fill);
    m.appendChild(mark);
    return m;
  }

  function pill(text, tone) { return el('span', { class: 'pill ' + (tone || ''), text: text }); }

  function scoreCard(title, subtitle, value, max, cutoff, positive, extra) {
    var c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'score-row' }, [el('h3', { text: title }), el('strong', { text: value + ' / ' + max })]));
    c.appendChild(p(subtitle, 'muted small'));
    c.appendChild(meter(value, max, cutoff));
    c.appendChild(p('Threshold: ' + cutoff + '. ', 'small'));
    c.lastChild.appendChild(pill(positive ? 'Above threshold' : 'Below threshold', positive ? 'alert' : 'ok'));
    (extra || []).forEach(function (n) { c.appendChild(n); });
    return c;
  }

  function renderResults() {
    setProgress(100);
    var r = S.interpret(state.answers);
    var head = el('h1', { text: 'Your summary' });
    main.appendChild(head);

    // Headline
    var tone, title, body;
    var presName = { combined: 'a combined presentation (both inattentive and hyperactive-impulsive features)', inattentive: 'a predominantly inattentive presentation', 'hyperactive-impulsive': 'a predominantly hyperactive-impulsive presentation' };
    switch (r.verdict) {
      case 'both':
        tone = 'tone-alert'; title = 'Your answers are consistent with both ADHD and autism';
        body = 'You scored above the screening threshold on the ADHD screener and on the autism screeners. This pattern is common: studies find that roughly half to two thirds of autistic adults also meet criteria for ADHD, and the two are often assessed together.';
        break;
      case 'adhd':
        tone = 'tone-alert'; title = 'Your answers are consistent with ADHD';
        body = 'You scored above the screening threshold on the ASRS, the screener used by clinicians to decide whether to refer for an ADHD assessment.' + (r.asrs.presentation ? ' The pattern of answers suggests ' + presName[r.asrs.presentation] + '.' : '') + ' Your autism scores were below threshold.';
        break;
      case 'autism':
        tone = 'tone-alert'; title = 'Your answers are consistent with autism';
        body = 'You scored above threshold on ' + (r.autism.level === 3 ? 'both autism screeners' : 'one of the two autism screeners') + '. Your ADHD screen was below threshold.';
        break;
      case 'traits':
        tone = 'tone-warn'; title = 'Some neurodivergent traits, below screening thresholds';
        body = 'Your answers show some features associated with ADHD or autism, but not enough to pass the screening cut-offs. Many people have some of these traits without meeting criteria for a diagnosis. If they cause you real difficulty, that is still worth discussing with a clinician, because screeners miss some people, especially women and people who have learned to mask.';
        break;
      default:
        tone = 'tone-ok'; title = 'No indication of ADHD or autism on these screeners';
        body = 'Your answers do not show the pattern usually seen in ADHD or autism. A negative screen does not rule anything out, but it means a full assessment would be less likely to find either condition.';
    }
    main.appendChild(el('div', { class: 'card ' + tone }, [el('h2', { text: title }), p(body)]));

    // Minor caveat
    if (r.ctx.minor) {
      main.appendChild(el('div', { class: 'card tone-warn' }, [
        el('h3', { text: 'You are under 18' }),
        p('The three questionnaires here were validated in adults. Your scores are indicative only. Screening for young people usually uses different tools (for example the SNAP-IV or Conners scales for ADHD, and the AQ-Adolescent or SCQ for autism) and includes a parent or teacher report. A GP, school nurse or paediatrician can arrange this.')
      ]));
    }

    // Confidence blocks
    if (r.adhdConfidence) main.appendChild(confidenceCard('How solid is the ADHD result?', r.adhdConfidence));
    if (r.autismConfidence) main.appendChild(confidenceCard('How solid is the autism result?', r.autismConfidence));

    // Score cards
    main.appendChild(el('h2', { text: 'Scores' }));
    main.appendChild(scoreCard('ASRS Part A (ADHD screener)', 'Six questions with the strongest link to an ADHD diagnosis. Four or more above threshold is a positive screen.', r.asrs.partA, 6, 4, r.asrs.partAPositive, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'All 18 items' }), el('th', { text: 'Count', class: 'num' })])]),
        el('tbody', {}, [
          el('tr', {}, [el('td', { text: 'Inattention items above threshold' }), el('td', { text: r.asrs.inattention + ' of 9', class: 'num' })]),
          el('tr', {}, [el('td', { text: 'Hyperactivity and impulsivity items above threshold' }), el('td', { text: r.asrs.hyperactivity + ' of 9', class: 'num' })]),
          el('tr', {}, [el('td', { text: 'Likely presentation' }), el('td', { text: r.asrs.presentation ? r.asrs.presentation.replace('-', ' and ') : 'none reaches five symptoms', class: 'num' })])
        ])
      ]),
      p('Diagnostic criteria for adults require five or more symptoms in a domain, present since before age 12, in two or more settings. Item thresholds here follow the ASRS scoring key rather than the formal criteria, so treat the presentation as a hint.', 'muted small')
    ]));
    main.appendChild(scoreCard('AQ-10 (autism)', 'Six or more is the NICE referral threshold.', r.aq.score, 10, 6, r.aq.positive));
    main.appendChild(scoreCard('RAADS-14 (autism)', 'Fourteen or more is a positive screen. This scale weights traits that were present both now and in childhood.', r.raads.score, 42, 14, r.raads.positive, [
      p('Sensory reactivity items: ' + r.raads.sensory + ' of 9.' + (r.raads.sensory >= 5 ? ' Sensory differences are a core feature of autism in current diagnostic criteria and are not captured by the AQ-10.' : ''), 'small')
    ]));

    // Evidence
    main.appendChild(el('h2', { text: 'What the science says about these results' }));
    var ev = el('div', { class: 'card' });
    ev.appendChild(p('A screener’s value depends on how common the condition is among the people taking it. The figures below use published sensitivity and specificity for each tool and two starting assumptions: the general adult population, and people who seek out a screener because they already suspect something (where studies of assessment clinics suggest roughly one in four are diagnosed).'));
    ev.appendChild(el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Tool' }), el('th', { text: 'Sens. / spec.', class: 'num' }), el('th', { text: 'Positive is true, general pop.', class: 'num' }), el('th', { text: 'Positive is true, self-selected', class: 'num' })])]),
      el('tbody', {}, [
        statRow('ASRS Part A', S.STATS.asrs, r.ppv.asrsGeneral, r.ppv.asrsSeeking),
        statRow('AQ-10', S.STATS.aq, r.ppv.aqGeneral, r.ppv.aqSeeking),
        statRow('RAADS-14', S.STATS.raads, r.ppv.raadsGeneral, r.ppv.raadsSeeking)
      ])
    ]));
    var notes = el('ul', {});
    notes.appendChild(li('The ASRS has very high specificity, so a positive result is rarely a false alarm, but it misses about a third of adults who do have ADHD. A negative ASRS is weaker evidence than a positive one.'));
    notes.appendChild(li('The AQ-10 is balanced, but in the general population most positives are still false positives because autism is uncommon. Its value rises sharply when someone already has reasons to suspect autism.'));
    notes.appendChild(li('The RAADS-14 catches almost everyone who is autistic but also flags many people with anxiety, depression or ADHD. On its own it mainly rules autism out when negative.'));
    notes.appendChild(li('Agreement between the two autism screeners is stronger evidence than either alone. ' + (r.autism.level === 3 ? 'Both were positive here.' : r.autism.level === 2 ? 'Only one was positive here, so the result is mixed.' : 'Neither was positive here.')));
    if (r.ctx.female) notes.appendChild(li('The AQ-10 and RAADS were developed mostly on male samples. Autistic women and girls more often score below threshold while still meeting criteria, partly because of masking. Weigh a borderline result accordingly.'));
    ev.appendChild(notes);
    main.appendChild(ev);

    // Differentials
    if (r.ctx.differentials.length) {
      main.appendChild(el('div', { class: 'card tone-warn' }, [
        el('h3', { text: 'Other explanations to rule out' }),
        p('You reported the following, each of which can cause attention, social or sensory difficulties on its own or make existing ones worse:'),
        el('ul', {}, r.ctx.differentials.map(li)),
        p('A clinician would want to understand whether the difficulties began before these, and whether they persist when these are treated or resolved.')
      ]));
    }

    // Next steps
    var next = el('div', { class: 'card tone-info' }, [el('h3', { text: 'Suggested next steps' })]);
    var steps = el('ul', {});
    if (r.verdict === 'none') {
      steps.appendChild(li('If you came here because something is causing real difficulty, that difficulty still matters. A GP can help identify what is going on, whether or not it has a name.'));
    } else {
      steps.appendChild(li('Download or print this summary and take it to a GP or your usual doctor. Screening scores plus concrete examples of impact are exactly what they need to make a referral.'));
      if (r.verdict === 'adhd' || r.verdict === 'both') steps.appendChild(li('Ask specifically about an adult ADHD assessment. Bring, if you can, a parent, older sibling or school reports that can speak to how you were before age 12.'));
      if (r.verdict === 'autism' || r.verdict === 'both') steps.appendChild(li('Ask specifically about an autism assessment. Common assessment tools are the ADOS-2 and ADI-R, and a developmental history from someone who knew you as a young child helps a great deal.'));
      if (r.verdict === 'traits') steps.appendChild(li('Consider keeping a two-week log of situations where these traits cause problems. Patterns across settings carry more weight than any score.'));
      steps.appendChild(li('Waiting lists can be long. Many workplaces and universities offer adjustments on the basis of difficulties, without needing a diagnosis first.'));
    }
    steps.appendChild(li('If you are struggling right now with low mood or thoughts of harming yourself, contact your local emergency number or a crisis line today. That comes before any assessment.'));
    next.appendChild(steps);
    main.appendChild(next);

    // Actions
    main.appendChild(el('div', { class: 'row' }, [
      el('button', { type: 'button', class: 'btn', text: 'Download summary (.txt)', onclick: function () { download(summaryText(r)); } }),
      el('button', { type: 'button', class: 'btn secondary', text: 'Print', onclick: function () { window.print(); } }),
      el('button', { type: 'button', class: 'btn secondary', text: 'Review my answers', onclick: function () { state.done = false; state.step = 0; save(); render(); } })
    ]));
    main.appendChild(p('Sources: Kessler et al. 2005 (ASRS); Allison, Auyeung and Baron-Cohen 2012 and NICE CG142 (AQ-10); Eriksson, Andersen and Bejerot 2013 (RAADS-14); DSM-5-TR criteria; Rong et al. 2021 meta-analysis on ADHD and autism co-occurrence.', 'muted small'));
  }

  function statRow(name, st, gen, seek) {
    return el('tr', {}, [
      el('td', { text: name }),
      el('td', { text: pct(st.sens) + '% / ' + pct(st.spec) + '%', class: 'num' }),
      el('td', { text: pct(gen) + '%', class: 'num' }),
      el('td', { text: pct(seek) + '%', class: 'num' })
    ]);
  }

  function confidenceCard(title, conf) {
    var tone = conf.level === 'high' ? 'ok' : conf.level === 'moderate' ? 'warn' : 'alert';
    var c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'score-row' }, [el('h3', { text: title }), pill(conf.level.charAt(0).toUpperCase() + conf.level.slice(1) + ' confidence', tone)]));
    c.appendChild(el('ul', {}, conf.reasons.map(function (t) { return li(t.charAt(0).toUpperCase() + t.slice(1) + '.'); })));
    return c;
  }

  // ---------- export ----------
  function summaryText(r) {
    var lines = [];
    lines.push('NEURODIVERGENCE SCREENING SUMMARY');
    lines.push('Generated locally on ' + new Date().toISOString().slice(0, 10));
    lines.push('This is a screening result, not a diagnosis.');
    lines.push('');
    lines.push('Overall: ' + ({ both: 'consistent with both ADHD and autism', adhd: 'consistent with ADHD', autism: 'consistent with autism', traits: 'some traits, below screening thresholds', none: 'no indication on these screeners' })[r.verdict]);
    lines.push('');
    lines.push('ASRS v1.1 Part A: ' + r.asrs.partA + '/6 (positive at 4)');
    lines.push('  Inattention items above threshold: ' + r.asrs.inattention + '/9');
    lines.push('  Hyperactivity/impulsivity items above threshold: ' + r.asrs.hyperactivity + '/9');
    lines.push('  Suggested presentation: ' + (r.asrs.presentation || 'none'));
    lines.push('AQ-10: ' + r.aq.score + '/10 (positive at 6)');
    lines.push('RAADS-14: ' + r.raads.score + '/42 (positive at 14); sensory items ' + r.raads.sensory + '/9');
    lines.push('');
    var ctx = state.answers.context;
    S.CONTEXT.forEach(function (q) {
      var v = ctx[q.id];
      var txt = q.multi ? (Array.isArray(v) ? v.map(function (i) { return q.opts[i]; }).join('; ') : '') : (isInt(v) ? q.opts[v] : '');
      lines.push(q.id + ': ' + txt);
    });
    if (r.adhdConfidence) lines.push('', 'ADHD result confidence: ' + r.adhdConfidence.level, '  ' + r.adhdConfidence.reasons.join('\n  '));
    if (r.autismConfidence) lines.push('', 'Autism result confidence: ' + r.autismConfidence.level, '  ' + r.autismConfidence.reasons.join('\n  '));
    lines.push('');
    lines.push('Item responses (0 = first option):');
    ['asrs', 'aq', 'raads'].forEach(function (k) { lines.push('  ' + k.toUpperCase() + ': ' + state.answers[k].join(',')); });
    return lines.join('\n') + '\n';
  }

  function download(text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'screening-summary.txt' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  clearBtn.addEventListener('click', function () {
    if (window.confirm('Delete all your answers from this tab?')) clearAll();
  });

  render();
})();
