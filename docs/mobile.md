# Getting it onto a phone

The blunt summary: **use Firefox for Android**. Everything else is either impossible or
involves a Mac.

---

## Android — Firefox (recommended)

Firefox for Android runs normal WebExtensions, and since late 2023 it can install any add-on
from addons.mozilla.org. It cannot install a raw folder or an unsigned `.xpi`, so the package
has to be signed first. Signing is free and an **unlisted** add-on is not published anywhere —
it is just a signed file that only you have the link to.

1. Build the package:

   ```bash
   node tools/build.mjs
   cd dist/firefox && zip -r ../ai-slop-blocker-firefox.zip . && cd ../..
   ```

2. Sign in at <https://addons.mozilla.org/developers/> with a Firefox account.

3. **Submit a New Add-on** → choose **"On your own"** (this is the unlisted option) → upload
   `dist/ai-slop-blocker-firefox.zip`.

4. Automated review takes a few minutes. When it passes, download the signed `.xpi` from the
   version's page.

5. On the phone, open the download link in Firefox for Android and tap the `.xpi`. Firefox will
   ask to confirm the permissions and install it.

6. Sign into Firefox Sync on both phone and desktop and your block lists follow you around —
   the extension stores settings in `storage.sync` for exactly this reason.

**Re-signing on every change** is the annoying part of this route. `web-ext sign` automates it
if you are iterating:

```bash
npx web-ext sign --source-dir dist/firefox --channel unlisted \
  --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

API credentials come from <https://addons.mozilla.org/developers/addon/api/key/>.

### Testing on Android before you sign

Firefox for Android **Nightly** can load an unsigned add-on over USB debugging:

```bash
npx web-ext run --target=firefox-android \
  --android-device <adb-device-id> --source-dir dist/firefox
```

Requires `adb`, USB debugging on, and "Remote debugging via USB" enabled in Firefox Nightly's
settings. This is the fast loop for adjusting selectors against the real mobile YouTube DOM,
which differs from desktop (`ytm-*` elements rather than `ytd-*` — both are already handled in
`src/content/adapters.js`).

---

## Android — Chrome

Not possible. Chrome for Android has never supported extensions and Google has given no
indication that will change. Kiwi Browser, which used to be the workaround, was discontinued in
2024. Edge Canary for Android has an experimental extension mode that has been experimental for
years and only allows a short allow-list of add-ons.

If you are on Android and want this, you are switching to Firefox. That is the whole answer.

---

## iOS / iPadOS

Apple does not let a browser run an extension you simply downloaded. Every route
below is a way around that, and none of them is as easy as Android. Pick by whether
you have access to a Mac.

### Route 1 — Safari, via Xcode (reliable, needs a Mac)

The only route that definitely works, and one conversion gets you the extension on
both the iPhone and Safari on the Mac.

**Full step-by-step: [safari-ios.md](safari-ios.md).** In short: build, run
`xcrun safari-web-extension-converter dist/chrome`, set a signing team on both iOS
targets in Xcode, run it onto the plugged-in phone, then enable it under
Settings → Apps → Safari → Extensions and choose *Allow on Every Website*.

The catch worth knowing up front: with a free Apple ID the build expires after
**7 days** and has to be re-run from Xcode. The Apple Developer Program ($99/year)
extends that to a year.

### Route 2 — Orion, via addons.mozilla.org (no Mac, but no guarantees)

[Orion](https://kagi.com/orion/) is a WebKit browser for iOS that can install Chrome
and Firefox extensions. Crucially, on iOS it installs them **from the Chrome Web
Store or addons.mozilla.org inside the browser** — the "install from disk" option
that Orion has on macOS is not available on iOS. So this route means actually
publishing the extension, not just signing it privately:

1. Build the MV2 package — `dist/ai-slop-blocker-mv2-*.zip`. Use MV2 rather than MV3
   here: Orion's iOS extension support is explicitly preliminary, and MV2 coverage is
   considerably better than MV3.
2. Submit it to <https://addons.mozilla.org/developers/> as a **listed** add-on. It
   has to be listed, not unlisted, because Orion installs from the public add-on
   page. Listed means human review and a public listing.
3. On the iPhone: install Orion, **Settings → Extensions → Advanced**, enable Firefox
   add-ons, then open the add-on's AMO page in Orion and install it.

Be realistic about this one. Kagi describe iOS extension support as preliminary and
note that Apple's restrictions mean a smaller set of APIs is available than on macOS,
so fewer extensions fully work. The core of this extension — content scripts plus
`storage` — is the part most likely to be supported, and it degrades rather than
crashes when an API is missing: every optional API call is feature-detected, so a
missing badge or a missing `permissions` API costs you the counter or the catch-all
mode, not the filtering. But "should degrade gracefully" is not "tested on Orion",
and I have not tested it there.

### What does not work on iOS

- Installing a `.xpi` or `.zip` you built yourself, directly, in any iOS browser.
- Chrome, Edge, Firefox or Brave for iOS. All of them are Safari/WebKit underneath
  with no extension support of their own.
- TestFlight as a shortcut — it still needs the Xcode project and a paid developer
  account.

## Which sites work on mobile

Mobile pages use different markup from desktop, and the adapters handle both:

| Site | Mobile markup | Handled |
| --- | --- | --- |
| YouTube (`m.youtube.com`) | `ytm-video-with-context-renderer`, `ytm-shorts-lockup-view-model` | yes |
| Google Images | same `data-ri` / `data-lpage` tiles as desktop | yes |
| Google Search | same result containers | yes |
| Bing, DuckDuckGo, Reddit | same selectors as desktop | yes |

The overlay buttons are sized to a 28 px minimum touch target, and the "why was this filtered"
line is dropped on narrow cards so the "Show anyway" button never gets pushed out of view.
