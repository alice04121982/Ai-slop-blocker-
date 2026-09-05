# Installing on iPhone (and Safari on your Mac)

You need the MacBook for this — the converter is part of Xcode and there is no
on-device equivalent. The good news is that one conversion produces **both** the
iPhone extension and a Safari extension for the Mac, so you only do it once.

Written for an iPhone 17 on iOS 26 with a MacBook Pro.

---

## Before you start

- **Xcode**, from the Mac App Store. It is free but large (~10 GB) and the first
  launch takes a while.
- **Node**, to run the build. `node --version` should print something; if not,
  install it from <https://nodejs.org>.
- Your iPhone, its **cable**, and an Apple ID.

Read the [7-day catch](#the-7-day-catch) before you begin — it is the thing most
likely to put you off, and it is better to know now.

---

## 1. Build the extension on the Mac

```bash
git clone https://github.com/alice04121982/Ai-slop-blocker-.git
cd Ai-slop-blocker-
node tools/build.mjs
```

## 2. Convert it to an Xcode project

```bash
xcrun safari-web-extension-converter dist/chrome \
  --app-name "AI Slop Blocker" \
  --bundle-identifier com.yourname.aislopblocker \
  --project-location ./safari
```

Replace `yourname` with anything — it just has to be unique to you and stay the
same across rebuilds.

The converter targets **both iOS and macOS** by default, which is what you want.
It will print a summary, ask you to confirm, then open Xcode. It may warn about
`scripting.registerContentScripts`; that API is used only by the opt-in
"every other site" mode, so ignore it unless you plan to use that.

## 3. Sign it

In Xcode:

1. Click the project name at the top of the left-hand sidebar.
2. Under **Targets**, select **AI Slop Blocker (iOS)**.
3. Open the **Signing & Capabilities** tab.
4. Tick **Automatically manage signing**.
5. In **Team**, pick your Apple ID. If it is not listed: **Xcode → Settings →
   Accounts → +** and sign in. A free Apple ID is fine.
6. Repeat 2–5 for the **AI Slop Blocker Extension (iOS)** target — both need a team.

If Xcode complains the bundle identifier is taken, change
`com.yourname.aislopblocker` to something more unique and try again.

## 4. Install it on the iPhone

1. Plug the phone into the Mac. Unlock it and tap **Trust** if asked.
2. In Xcode's toolbar, set the run destination (next to the ▶ button) to your iPhone.
3. Press **▶**. First build takes a few minutes.
4. The app will install but refuse to open, because a free Apple ID is not trusted
   by default. On the phone: **Settings → General → VPN & Device Management →**
   tap your Apple ID **→ Trust**.
5. Press **▶** in Xcode again.

## 5. Turn it on in Safari

On the iPhone:

1. **Settings → Apps → Safari → Extensions → AI Slop Blocker** → turn it **on**.
2. Tap it, then choose **Allow on Every Website**.

You can grant per-site instead, but Safari will then ask you again constantly, and
the extension needs Google and YouTube at minimum.

Open Safari, search for images, and slop should start disappearing. Tap the **puzzle
piece** or **Aa** icon in the address bar to reach the popup with the on/off switch,
sensitivity and the "Show everything here" button.

## 6. While you are there — the Mac

The same Xcode project has macOS targets. Select the macOS scheme and press ▶ to get
the extension in Safari on the MacBook too, then enable it in **Safari → Settings →
Extensions**.

For everyday desktop use, though, Chrome is less faff — no Xcode, no expiry:
`chrome://extensions` → Developer mode → **Load unpacked** → pick the repo folder.

---

## The 7-day catch

**With a free Apple ID the app stops working after 7 days.** The extension vanishes
from Safari's settings until you plug the phone in and press ▶ again. Since you do
most of your searching on the phone, you will hit this every week.

Two ways out:

- **Apple Developer Program**, $99/year. Builds last a year instead of 7 days. This
  is the honest answer if you want to set it up and forget about it.
- **Re-run it weekly.** Free, takes about a minute once the project exists: plug in,
  open the project, press ▶.

There is no third option. Apple's sideloading limits are not something the extension
can work around.

---

## What still will not be filtered

- **The YouTube app.** A browser extension cannot see inside a native app. If you
  watch YouTube on the phone through the app rather than `youtube.com` in Safari,
  none of this touches it. There is no fix for that short of Google adding a filter.
- **Other apps** with built-in browsers — the in-app browsers in Instagram, X,
  Reddit and so on do not run Safari extensions.
- **Chrome on iOS**, which cannot run extensions at all.

Safari, and things that open in Safari, are the whole surface.

---

## If something goes wrong

| Symptom | Cause |
| --- | --- |
| Extension missing from Safari settings | The 7-day build expired, or the app was never trusted (step 4.4). |
| It appears but filters nothing | Site permission not granted — re-check **Allow on Every Website**. |
| "Untrusted Developer" on the phone | Step 4.4 — trust the certificate in Device Management. |
| Signing errors in Xcode | A team is not set on *both* iOS targets, or the bundle identifier collides. |
| Filtering stopped on one site only | Google or YouTube changed their markup. `src/content/adapters.js` is the file to look at. |
