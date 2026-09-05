/*
 * One manifest definition, two targets.
 *
 * Chrome and Firefox agree on most of MV3 but not on the background entry
 * point (service worker vs. event page) or on browser_specific_settings, so
 * the differences live here rather than in two hand-maintained files that
 * drift apart.
 */

export const VERSION = '0.1.0';

/* Google has no wildcard TLD in match patterns, so the ccTLDs have to be
 * spelled out. This covers the ones worth shipping; anything missing can be
 * reached by turning on the catch-all site mode. */
const GOOGLE_DOMAINS = [
  'google.com', 'google.co.uk', 'google.ie', 'google.ca', 'google.com.au',
  'google.co.nz', 'google.co.in', 'google.de', 'google.fr', 'google.es',
  'google.it', 'google.nl', 'google.be', 'google.pt', 'google.pl',
  'google.se', 'google.no', 'google.dk', 'google.fi', 'google.ch',
  'google.at', 'google.com.br', 'google.co.za', 'google.co.jp', 'google.com.mx',
  'google.com.sg', 'google.com.ph', 'google.com.tr', 'google.gr', 'google.cz'
];

const MATCHES = [
  ...GOOGLE_DOMAINS.map((d) => `*://*.${d}/*`),
  '*://*.youtube.com/*',
  '*://*.bing.com/*',
  '*://*.duckduckgo.com/*',
  '*://*.reddit.com/*'
];

const CONTENT_JS = [
  'src/core/patterns.js',
  'src/core/engine.js',
  'src/core/settings.js',
  'src/content/adapters.js',
  'src/content/runtime.js'
];

const BACKGROUND_SCRIPTS = [
  'src/core/patterns.js',
  'src/core/engine.js',
  'src/core/media-scan.js',
  'src/core/settings.js',
  'src/background/service-worker.js'
];

export function buildManifest(target) {
  const manifest = {
    manifest_version: 3,
    name: 'AI Slop Blocker',
    version: VERSION,
    description:
      'Hides AI-generated images and videos in Google, YouTube, Bing, DuckDuckGo and Reddit results.',
    permissions: ['storage', 'scripting'],
    optional_host_permissions: ['<all_urls>'],
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    },
    action: {
      default_title: 'AI Slop Blocker',
      default_popup: 'src/ui/popup.html',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png'
      }
    },
    options_ui: {
      page: 'src/ui/options.html',
      open_in_tab: true
    },
    content_scripts: [
      {
        matches: MATCHES,
        js: CONTENT_JS,
        css: ['src/content/overlay.css'],
        run_at: 'document_idle',
        all_frames: false
      }
    ]
  };

  if (target === 'firefox') {
    /* Firefox MV3 runs the background as an event page, and needs a stable
     * add-on id for AMO and for Firefox for Android. */
    manifest.background = { scripts: BACKGROUND_SCRIPTS };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'ai-slop-blocker@alice.local',
        strict_min_version: '115.0'
      },
      gecko_android: {
        strict_min_version: '120.0'
      }
    };
  } else {
    manifest.background = { service_worker: 'src/background/service-worker.js' };
    manifest.minimum_chrome_version = '102';
  }

  return manifest;
}

export const FILES = {
  contentJs: CONTENT_JS,
  backgroundScripts: BACKGROUND_SCRIPTS,
  matches: MATCHES
};
