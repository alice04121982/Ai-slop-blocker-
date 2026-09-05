'use strict';
/*
 * Pattern data used by the scoring engine.
 *
 * Everything here is a *heuristic*. There is no universal "this was made by a
 * machine" flag on the web, so we lean on the signals that do exist:
 *   - disclosures the platform itself renders ("Altered or synthetic content")
 *   - generator names people put in titles, alt text and hashtags
 *   - hosts that exist only to serve generated media
 *   - provenance metadata (C2PA / IPTC) when we are allowed to fetch bytes
 *
 * Terms are split into two tiers because a lot of model names are also
 * ordinary words. "veo" is Spanish for "I see", "imagen" is Spanish for
 * "image", "sora" is a common given name, "firefly" is an insect. Those live
 * in WEAK_GENERATORS and only count when something else on the card already
 * smells of AI.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.AISlop = root.AISlop || {}).patterns = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const rx = (source) => new RegExp(source, 'i');

  /* Phrases a platform or uploader uses to declare synthetic media outright. */
  const DISCLOSURE_PHRASES = [
    'altered or synthetic content',
    'sound\\s*/\\s*visuals? (?:were )?significantly edited',
    'this (?:video|image|content) (?:was|is) (?:made|created|generated) (?:with|using|by) ai',
    'ai[- ]?generated',
    'generated (?:with|using|by) ai',
    'made (?:with|using|by) ai',
    'created (?:with|using|by) ai',
    'ai[- ]?(?:generated|created|assisted|synthesi[sz]ed) (?:image|images|video|videos|art|artwork|content|media|photo|photos)',
    'synthetic (?:media|imagery|image|video)',
    'digitally (?:generated|synthesi[sz]ed) imagery',
    'content credentials',
    'generative ai',
    'gen[- ]?ai (?:image|video|art)',
    'deep\\s?fake',
    'ai upscal(?:ed|ing)',
    'text[- ]to[- ]image',
    'text[- ]to[- ]video'
  ].map(rx);

  /* Generator names that are effectively unambiguous on their own. */
  const STRONG_GENERATORS = [
    'midjourney',
    'stable\\s?diffusion',
    'sdxl',
    'automatic1111',
    'comfyui',
    'dall[\\s.·_-]?e\\s?\\d?',
    'nightcafe',
    'novel\\s?ai',
    'civitai',
    'seaart',
    'tensor\\.?art',
    'pixai',
    'leonardo\\.ai',
    'starryai',
    'artbreeder',
    'craiyon',
    'deepai',
    'getimg\\.ai',
    'dreamstudio',
    'invokeai',
    'fooocus',
    'lexica\\.art',
    'prompthero',
    'openart\\.ai',
    'playground\\s?ai',
    'bing image creator',
    'image creator from designer',
    'adobe firefly',
    'photoshop generative fill',
    'generative expand',
    'runwayml',
    'runway gen[- ]?\\d',
    'pika labs',
    'luma dream machine',
    'hailuo\\s?ai',
    'kling\\s?ai',
    'vidu\\s?ai',
    'haiper\\s?ai',
    'heygen',
    'synthesia',
    'd[- ]?id\\.com',
    'wan\\s?2\\.\\d',
    'seedream',
    'seedance',
    'grok imagine',
    'nano banana',
    'gemini[- ]generated[- ]image',
    'chatgpt image',
    'sora\\s?(?:2|ai)',
    'openai sora',
    'google veo',
    'veo\\s?[23]',
    'google imagen',
    'imagen\\s?[234]',
    'flux\\.1',
    'flux[- ](?:dev|schnell|pro)',
    'ideogram\\s?(?:ai|\\d)',
    'recraft\\s?ai',
    'krea\\s?ai',
    'freepik ai',
    'canva magic media',
    'meta ai imagine'
  ].map(rx);

  /* Ambiguous names: only counted when generic AI context is also present. */
  const WEAK_GENERATORS = [
    '\\bsora\\b',
    '\\bveo\\b',
    '\\bimagen\\b',
    '\\bfirefly\\b',
    '\\bflux\\b',
    '\\bkling\\b',
    '\\brunway\\b',
    '\\bideogram\\b',
    '\\bpika\\b',
    '\\bluma\\b',
    '\\bvidu\\b',
    '\\brecraft\\b',
    '\\bkrea\\b',
    '\\bhailuo\\b'
  ].map(rx);

  /* Generic "there is AI in here somewhere" context used to promote weak hits. */
  const AI_CONTEXT = rx('\\b(?:a\\.?i\\.?|artificial intelligence|prompt|prompted|render(?:ed|ing)?|generat(?:e|ed|ion|or)|model|diffusion|neural)\\b');

  /*
   * Community handles people file their own generated output under. Matches a
   * "#" or "/" prefix so it covers both hashtags (#aiart) and subreddit or
   * channel names (r/aiArt).
   */
  const AI_TAGS = [
    '[#/]ai\\s?art',
    '[#/]aiartwork',
    '[#/]aiartcommunity',
    '[#/]aigenerated',
    '[#/]aiimage',
    '[#/]aiimages',
    '[#/]aivideo',
    '[#/]aiphotography',
    '[#/]aiillustration',
    '[#/]midjourney',
    '[#/]stablediffusion',
    '[#/]dalle\\d?',
    '[#/]promptart',
    '[#/]digitalartai',
    '[#/]generativeart',
    '[#/]texttoimage',
    '[#/]aianimation',
    '[#/]aimusic',
    '[#/]aimodel',
    '[#/]aicreated'
  ].map(rx);

  /*
   * Hosts that exist primarily to publish generated media. Matched against the
   * host and its parent domains, so "cdn.civitai.com" matches "civitai.com".
   */
  const AI_DOMAINS = [
    'civitai.com',
    'lexica.art',
    'openart.ai',
    'prompthero.com',
    'midjourney.com',
    'mj-gallery.com',
    'leonardo.ai',
    'nightcafe.studio',
    'creator.nightcafe.studio',
    'deepai.org',
    'craiyon.com',
    'artbreeder.com',
    'stablediffusionweb.com',
    'mage.space',
    'pixai.art',
    'seaart.ai',
    'tensor.art',
    'starryai.com',
    'neural.love',
    'getimg.ai',
    'playgroundai.com',
    'dezgo.com',
    'novelai.net',
    'ideogram.ai',
    'recraft.ai',
    'krea.ai',
    'kling.ai',
    'klingai.com',
    'hailuoai.video',
    'pollinations.ai',
    'perchance.org',
    'aiimagegenerator.io',
    'imagine.art',
    'aiease.ai',
    'picsart.io',
    'dream.ai',
    'wombo.art',
    'thispersondoesnotexist.com',
    'generated.photos',
    'unrealperson.com',
    'aigcbest.com',
    'shakker.ai',
    'liblib.art',
    'yodayo.com',
    'sora.chatgpt.com',
    'sora.com'
  ];

  /* Substrings in a media URL or filename that betray the generator. */
  const AI_URL_HINTS = [
    'ai[-_]generated',
    'ai[-_]image',
    'ai[-_]art',
    'aigenerated',
    'generated[-_]by[-_]ai',
    'midjourney',
    'stable[-_]?diffusion',
    'sdxl',
    'dall[-_]?e',
    'chatgpt[-_]image',
    'gemini[-_]generated[-_]image',
    'grok[-_]image',
    'firefly[-_]generated',
    'comfyui',
    '/txt2img/',
    '/img2img/',
    'flux[-_](?:dev|schnell|pro)'
  ].map(rx);

  /*
   * IPTC DigitalSourceType values, as used by the CIPA/IPTC provenance
   * vocabulary and emitted by most large generators.
   */
  const IPTC_SYNTHETIC_VALUES = [
    'trainedalgorithmicmedia',
    'compositewithtrainedalgorithmicmedia',
    'algorithmicmedia',
    'digitalcapture-with-trainedalgorithmicmedia'
  ];

  /* EXIF/XMP creator-tool values that identify a generator. */
  const METADATA_GENERATORS = [
    'midjourney',
    'dall[\\s.·_-]?e',
    'openai',
    'stable diffusion',
    'automatic1111',
    'comfyui',
    'invokeai',
    'adobe firefly',
    'firefly',
    'google ai',
    'imagen',
    'gemini',
    'synthid',
    'leonardo',
    'ideogram',
    'recraft',
    'flux',
    'bing image creator',
    'designer.microsoft.com',
    'picsart ai',
    'canva'
  ].map(rx);

  return {
    DISCLOSURE_PHRASES,
    STRONG_GENERATORS,
    WEAK_GENERATORS,
    AI_CONTEXT,
    AI_TAGS,
    AI_DOMAINS,
    AI_URL_HINTS,
    IPTC_SYNTHETIC_VALUES,
    METADATA_GENERATORS
  };
});
