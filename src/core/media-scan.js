'use strict';
/*
 * Byte-level provenance detection.
 *
 * Big generators increasingly ship a declaration inside the file itself:
 *   - C2PA / "Content Credentials" manifests (JUMBF boxes labelled c2pa)
 *   - IPTC DigitalSourceType = trainedAlgorithmicMedia, in XMP
 *   - EXIF Software / xmp:CreatorTool naming the tool
 *   - PNG tEXt chunks: Stable Diffusion WebUI writes the whole prompt into a
 *     "parameters" chunk, ComfyUI writes "prompt"/"workflow" JSON
 *
 * This is the only signal here that is close to authoritative, but it is also
 * the easiest to lose: re-encoding, screenshotting or a CDN thumbnail pipeline
 * strips all of it. Absence of metadata proves nothing.
 *
 * We deliberately avoid a full C2PA library. We only need "is there a claim in
 * here", not "is the claim cryptographically valid", so a bounded scan over the
 * file header is enough and costs no dependencies.
 */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports
      ? require('./patterns.js')
      : root.AISlop.patterns
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.AISlop = root.AISlop || {}).mediaScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  /* Only the header is worth reading; metadata lives near the front in every
   * format we care about, and this keeps the range request small. */
  const MAX_BYTES = 256 * 1024;

  function toLatin1(bytes) {
    let out = '';
    const chunk = 8192;
    const len = Math.min(bytes.length, MAX_BYTES);
    for (let i = 0; i < len; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)));
    }
    return out;
  }

  /**
   * @param {Uint8Array} bytes  start of an image or video file
   * @returns {{synthetic:boolean, generator:string, evidence:string[]}}
   */
  function scanBytes(bytes) {
    const evidence = [];
    let synthetic = false;
    let generator = '';

    if (!bytes || !bytes.length) return { synthetic, generator, evidence };

    const raw = toLatin1(bytes);
    const lower = raw.toLowerCase();

    /* --- C2PA manifest --------------------------------------------------- */
    /* A JUMBF superbox labelled "c2pa", or the claim generator namespace. */
    if (lower.includes('jumbc2pa') || lower.includes('c2pa.assertions') ||
        lower.includes('c2pa.claim') || lower.includes('urn:c2pa') ||
        lower.includes('contentcredentials')) {
      evidence.push('C2PA content credentials manifest');
    }

    /* --- IPTC digital source type ---------------------------------------- */
    for (const value of P.IPTC_SYNTHETIC_VALUES) {
      if (lower.includes(value)) {
        synthetic = true;
        evidence.push('IPTC DigitalSourceType: ' + value);
        break;
      }
    }

    /* --- Stable Diffusion / ComfyUI PNG text chunks ----------------------- */
    /* A1111 writes "parameters" then the prompt then "Steps: .. Sampler: ..". */
    if (/parameters\x00?[\s\S]{0,4000}?steps:\s*\d+[\s\S]{0,200}?sampler:/i.test(raw)) {
      synthetic = true;
      generator = generator || 'Stable Diffusion (WebUI)';
      evidence.push('PNG "parameters" chunk with sampler/steps');
    }
    if (/"class_type"\s*:\s*"(?:KSampler|CheckpointLoaderSimple|CLIPTextEncode)"/.test(raw)) {
      synthetic = true;
      generator = generator || 'ComfyUI';
      evidence.push('ComfyUI workflow graph embedded in file');
    }
    if (/sd-metadata|invokeai_metadata|"sui_image_params"/i.test(raw)) {
      synthetic = true;
      generator = generator || 'InvokeAI / SwarmUI';
      evidence.push('diffusion metadata block');
    }

    /* --- Google SynthID marker ------------------------------------------- */
    if (lower.includes('synthid')) {
      synthetic = true;
      generator = generator || 'Google (SynthID)';
      evidence.push('SynthID watermark declaration');
    }

    /* --- Named generator in EXIF Software / xmp:CreatorTool --------------- */
    const toolMatch = raw.match(/(?:CreatorTool|Software|creator_tool|xmp:CreatorTool)[">=:\x00\s]{0,8}([\x20-\x7e]{2,80})/i);
    if (toolMatch) {
      const tool = toolMatch[1].trim();
      for (const re of P.METADATA_GENERATORS) {
        if (re.test(tool)) {
          generator = generator || tool;
          evidence.push('creator tool: ' + tool);
          break;
        }
      }
    }

    /* A C2PA manifest on its own is not proof of AI — Leica ships it on real
     * photographs — so only escalate to "synthetic" when a generator name
     * shows up alongside it. */
    if (!synthetic && generator && evidence.some((e) => e.startsWith('C2PA'))) {
      synthetic = true;
    }

    return { synthetic, generator, evidence };
  }

  return { scanBytes, MAX_BYTES };
});
