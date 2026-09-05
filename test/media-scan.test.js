'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { scanBytes, MAX_BYTES } = require('../src/core/media-scan.js');

const bytes = (str) => Uint8Array.from([...str].map((c) => c.charCodeAt(0) & 0xff));

test('IPTC DigitalSourceType marks the file synthetic', () => {
  const result = scanBytes(bytes(
    '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'
  ));
  assert.equal(result.synthetic, true);
  assert.match(result.evidence[0], /DigitalSourceType/);
});

test('a Stable Diffusion WebUI PNG parameters chunk is recognised', () => {
  const result = scanBytes(bytes(
    '\x89PNG\r\n\x1a\n....tEXtparameters\x00a castle at dusk, highly detailed\n' +
    'Negative prompt: blurry\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 12345'
  ));
  assert.equal(result.synthetic, true);
  assert.equal(result.generator, 'Stable Diffusion (WebUI)');
});

test('a ComfyUI workflow graph is recognised', () => {
  const result = scanBytes(bytes('{"3":{"class_type":"KSampler","inputs":{}}}'));
  assert.equal(result.synthetic, true);
  assert.equal(result.generator, 'ComfyUI');
});

test('a SynthID declaration is recognised', () => {
  const result = scanBytes(bytes('<xmp:Description>Made with Google AI, SynthID</xmp:Description>'));
  assert.equal(result.synthetic, true);
  assert.match(result.generator, /SynthID/);
});

test('a generator named in CreatorTool is reported', () => {
  const result = scanBytes(bytes('<xmp:CreatorTool>Adobe Firefly</xmp:CreatorTool>'));
  assert.match(result.generator, /Firefly/i);
});

test('an ordinary camera JPEG is left alone', () => {
  const result = scanBytes(bytes(
    '\xff\xd8\xff\xe1..Exif..Make: NIKON CORPORATION  Model: NIKON D750  Software: Adobe Lightroom Classic 13.1'
  ));
  assert.equal(result.synthetic, false);
  assert.equal(result.generator, '');
  assert.deepEqual(result.evidence, []);
});

test('a bare C2PA manifest is not assumed to be AI', () => {
  // Leica and Sony ship Content Credentials on real photographs, so the
  // manifest alone must not be treated as proof of generation.
  const result = scanBytes(bytes('....jumbc2pa....c2pa.claim....Make: Leica'));
  assert.equal(result.synthetic, false);
  assert.match(result.evidence[0], /C2PA/);
});

test('a C2PA manifest plus a generator name does count', () => {
  const result = scanBytes(bytes('..jumbc2pa..c2pa.claim..<xmp:CreatorTool>DALL-E 3</xmp:CreatorTool>'));
  assert.equal(result.synthetic, true);
});

test('empty and oversized inputs are handled', () => {
  assert.equal(scanBytes(new Uint8Array(0)).synthetic, false);
  assert.equal(scanBytes(null).synthetic, false);
  const huge = new Uint8Array(MAX_BYTES + 5000);
  assert.doesNotThrow(() => scanBytes(huge));
});
