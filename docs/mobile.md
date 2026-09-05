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

## iOS / iPadOS — Safari

Safari supports Web Extensions, but Apple requires every extension to ship inside a native app,
so there is a conversion step and it needs a Mac:

```bash
node tools/build.mjs
xcrun safari-web-extension-converter dist/chrome \
  --project-location ./safari --app-name "AI Slop Blocker" --bundle-identifier com.example.aislopblocker
```

Then in Xcode: select the iOS target, set your signing team, and run it on the connected device.
Afterwards, on the phone: **Settings → Apps → Safari → Extensions → AI Slop Blocker**, turn it
on, and grant it permission for the sites you want (allowing on all sites is the least annoying
option).

What you need to know before starting:

- **A Mac with Xcode.** There is no way around this; the conversion tool is part of Xcode.
- **A free Apple ID works**, but the app expires after **7 days** and has to be re-installed.
  A paid Apple Developer account ($99/year) extends that to a year, or lets you ship to the
  App Store.
- Safari's content-script model is slightly stricter than Chrome's. The extension is written
  against plain MV3 with no Chrome-only APIs, so it should convert cleanly, but the
  `scripting.registerContentScripts` call used by catch-all mode is the part most likely to
  need attention.

---

## iOS / iPadOS — Orion

[Orion](https://kagi.com/orion/) is a WebKit browser for iOS that installs Chrome and Firefox
extensions directly, with no Mac and no Xcode. If you have gone through the Firefox signing
steps above, you can install the same signed `.xpi` in Orion on an iPhone.

Its extension support is a compatibility layer rather than a native implementation, so treat it
as best-effort — but for this extension, which uses only `storage`, `scripting` and content
scripts, it is a reasonable bet and by far the least painful iOS route.

---

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
