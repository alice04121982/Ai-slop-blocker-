# AI Slop Blocker

A browser extension that hides AI-generated images and videos in search results.

Works on **Google Search, Google Images, YouTube, Bing, DuckDuckGo and Reddit**, with an
opt-in catch-all mode for everywhere else. Runs on desktop Chrome/Edge/Firefox and on
**Firefox for Android**.

---

## What it can and cannot do

Read this bit first, because it decides whether the extension is worth installing for you.

**There is no reliable way to look at an image and tell whether a machine made it.** Detector
models that claim to do this are wrong often enough — in both directions — that shipping one
would just be replacing one kind of slop with another. So this extension does not try. It works
from evidence that actually exists:

| Signal | How good it is |
| --- | --- |
| Provenance metadata in the file (C2PA Content Credentials, IPTC `DigitalSourceType`, Stable Diffusion prompt chunks, SynthID declarations) | **Near-certain when present.** Trivially destroyed by a screenshot, a re-upload or a CDN thumbnail. |
| The platform's own disclosure (YouTube's "Altered or synthetic content") | **Near-certain**, but only as honest as the uploader. |
| Generator names in the title, alt text, caption or hashtags — "Midjourney", "#aiart", "made with AI" | **Good.** Catches the enormous amount of AI content whose creators are proud of it. |
| The host — `civitai.com`, `lexica.art`, and about forty others | **Good** for the sites that exist only for this. |
| File names and URL paths — `ai-generated`, `chatgpt-image-…`, `gemini_generated_image…` | **Decent.** |

What follows from that:

- **It will miss things.** Unlabelled AI content posted by someone actively trying to pass it
  off as real is exactly the case none of these signals catch. That is also the case you most
  want caught. I'd rather say so than pretend otherwise.
- **It will occasionally catch a real photo**, usually in a news article *about* AI. The allow
  list is there for this, and "Show anyway" is one click.
- **It gets better as you use it.** Every blocked item offers "Always block *source*", which
  adds that domain or channel to your rules permanently. The hand-tuned lists are a starting
  point; your own list is what makes it good.

Signals are combined with a noisy-OR, so several weak hints can add up to a block while no
single weak hint ever does on its own. Model names that are also ordinary words — `veo`,
`imagen`, `sora`, `firefly`, `flux` — only count when something else nearby is already
AI-flavoured, which is why "Veo el mar" and "the Firefly rocket launch" survive.

---

## Install

### Desktop — Chrome, Edge, Brave, Opera

```bash
git clone https://github.com/alice04121982/Ai-slop-blocker-.git
cd Ai-slop-blocker-
node tools/build.mjs
```

Then `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick the repo
folder (or `dist/chrome`).

### Desktop — Firefox

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick
`dist/firefox/manifest.json`.

Temporary add-ons are dropped when Firefox restarts. For a permanent install, sign the
package — see below.

### Phone

This is the part people get wrong, so plainly:

| Browser | Extensions? |
| --- | --- |
| **Firefox for Android** | **Yes.** This is the recommended route. |
| Chrome for Android | **No.** Google has never supported extensions there and it is not a thing this repo can fix. |
| Safari on iOS/iPadOS | Yes, but the extension has to be wrapped in an app with Xcode, so you need a Mac. |
| Orion (iOS) | Maybe. It installs add-ons from the public store pages, not from a file, so this means publishing to addons.mozilla.org — and its iOS extension support is preliminary. |

Full steps for each are in **[docs/mobile.md](docs/mobile.md)**.

The short version for Android: submit `dist/ai-slop-blocker-firefox-*.zip` to
[addons.mozilla.org](https://addons.mozilla.org/developers/) as an **unlisted** add-on (free,
self-hosted, nobody else sees it), get the signed `.xpi` back, and open that file in Firefox for
Android. Your settings then sync between phone and desktop through Firefox Sync.

There is no equivalent short version for iPhone. Apple does not allow a browser to install an
extension from a file, so it is Safari via Xcode (needs a Mac) or publishing to the add-on store
for Orion. **iPhone walkthrough: [docs/safari-ios.md](docs/safari-ios.md)**; the other routes are
in [docs/mobile.md](docs/mobile.md).

Note that no browser extension — this one or any other — can filter the **YouTube app**, only
`youtube.com` in a browser.

---

## Using it

Click the toolbar icon for the three controls you actually change mid-browse:

- **Sensitivity** — Relaxed (near-certain matches only), Balanced, or Strict (catches generic
  "AI image" wording too, at the cost of more false positives).
- **When matched** — blur it, remove it entirely, or leave it visible with a label. Blur is the
  default because it is reversible and shows you what the filter is doing.
- **Show everything here** — a panic button for when it has clearly got a page wrong.

The settings page adds per-site toggles, your block and allow lists, and the deep-check option.

### Deep check

Off by default. When on, images the text signals could not decide about get their first 256 KB
downloaded so the provenance metadata inside can be read. This is the single most reliable
signal available — and it costs extra requests and needs permission to read images from any
site, which is why it asks first rather than being on out of the box.

---

## Development

```bash
npm test               # 47 tests, no dependencies
node tools/build.mjs   # regenerate manifest.json, dist/ folders and store zips
python3 tools/make-icons.py
```

`tools/build.mjs` emits three targets from one manifest definition:

| Target | For |
| --- | --- |
| `dist/chrome` | Chrome, Edge, Brave, Opera — and the input to the Safari converter |
| `dist/firefox` | Firefox desktop and Firefox for Android (MV3) |
| `dist/mv2` | Manifest V2, for Orion on iOS and older Firefox for Android builds |

Each also produces a `.zip` ready for store submission, written by a small ZIP encoder in
`tools/zip.mjs` so packaging needs no `zip` binary and works the same on Windows.

No build step and no dependencies on purpose: the extension is plain scripts, so what you read
in `src/` is exactly what runs in the browser.

```
src/core/       patterns, scoring engine, provenance scanner, settings   (pure, unit tested)
src/content/    site adapters + the runtime that walks the page
src/background/ metadata fetching, block counter, dynamic script registration
src/ui/         popup and settings page
tools/          manifest generator, packager, icon generator
```

Adding a signal is a one-line change in `src/core/patterns.js`. Adding a site means one adapter
object in `src/content/adapters.js` with `matches`, `cards` and `extract`.

Google and YouTube rewrite their markup constantly and ship obfuscated class names, so every
adapter tries the stable selectors first and falls back to "find the image, then climb to the
element that is still roughly its size". That fallback is what keeps this working between
redesigns — but if a site does go dark, that is the first place to look.

## Licence

MIT.
