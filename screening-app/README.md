# Neurodivergence Screen

A responsive, offline, single-page screening tool for ADHD and autism in adults.
It walks the user through validated questionnaires one question at a time and
ends with a plain-language summary: scores, thresholds, a likely presentation,
how much weight the result deserves, and what to do next.

It is a screening aid. It does not diagnose, and it says so on every screen.

## Instruments

| Tool | What it screens | Threshold | Published accuracy |
| --- | --- | --- | --- |
| ASRS v1.1 (WHO, Kessler 2005), 18 items | ADHD | Part A: 4 of 6 | Sensitivity 68.7%, specificity 99.5% |
| AQ-10 (Allison 2012, NICE CG142) | Autism | 6 of 10 | Sensitivity 88%, specificity 91% |
| RAADS-14 (Eriksson 2013) | Autism, incl. sensory | 14 of 42 | Sensitivity 97%, specificity 46% (psychiatric controls) |

Plus six context questions covering age, childhood onset, number of life areas
affected, common differential diagnoses, and sex assigned at birth. These mirror
what DSM-5 requires beyond symptom counts and are used to grade confidence, not
to score.

## How the summary is reached

1. Each instrument is scored exactly per its published key (`data.js`).
2. ADHD screen is positive if ASRS Part A has 4 or more shaded items. All 18
   items are also counted by domain to suggest inattentive, hyperactive-impulsive
   or combined presentation (5 or more per domain, following DSM-5 adult counts).
3. Autism screen is positive if AQ-10 or RAADS-14 is above threshold; both
   positive is graded stronger.
4. The verdict is one of: none, traits, adhd, autism, both.
5. Confidence (low, moderate, high) is adjusted by childhood onset, impairment
   in two or more settings, and reported confounders such as anxiety, depression,
   sleep problems or substance use.
6. Positive predictive values are computed with Bayes from the published
   sensitivity and specificity, for a general-population prior and a
   self-selected prior, so the user sees how much a positive result is worth.

## Privacy and security design

- **No network.** No fetches, no fonts, no analytics, no CDN scripts. A strict
  Content Security Policy is set in the page (`default-src 'none'`,
  `connect-src 'none'`), so even an injected script could not exfiltrate.
- **No persistence by default.** Answers live in memory and are mirrored to
  `sessionStorage`, which is scoped to the tab and wiped when it closes.
  A "Clear my answers" control wipes it on demand. Stored data is re-validated
  and clamped on load, never trusted.
- **No HTML injection surface.** The UI is built only with `createElement` and
  `textContent`. There is no `innerHTML`, no template strings rendered as HTML,
  and no user-supplied free text at all.
- **No third-party code.** Zero dependencies at runtime and at test time.
- **Export is local.** The summary download is a Blob generated in the browser.
- `referrer` is `no-referrer` and the page is `noindex`.

If you host it, add these response headers as well, since they cannot be set
from a meta tag: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` (or `frame-ancestors 'none'` in a header CSP),
`Referrer-Policy: no-referrer`, `Permissions-Policy: interest-cohort=()`,
and serve over HTTPS with HSTS. Do not add analytics.

## Run

Open `screening-app/index.html` in a browser, or serve the folder statically:

```bash
cd screening-app && python3 -m http.server 8080
```

Tests (scoring logic only, no browser needed):

```bash
node --test screening-app/test/*.test.js
```

## Accessibility

Single-column layout, 48px minimum touch targets, keyboard shortcuts 1 to 5
for answers, visible focus rings, radio and checkbox semantics on options,
progress bar with ARIA values, light and dark themes, reduced-motion support,
and a print stylesheet for taking the summary to an appointment.
