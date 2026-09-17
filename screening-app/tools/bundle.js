#!/usr/bin/env node
/*
 * Builds a single self-contained HTML file for hosts that cannot serve
 * separate files (for example the claude.ai artifact viewer). The regular
 * multi-file build in this folder is what gets deployed to Vercel.
 *
 *   node tools/bundle.js [out.html]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
let css = read('styles.css');
const scripts = ['data.js', 'explain.js', 'app.js'].map(read);
if (scripts.some(s => s.includes('</script>'))) throw new Error('script contains a closing script tag');

let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/\s*<script src="[^"]+"><\/script>/g, '');
body = body.replace(/\s*<noscript>[\s\S]*?<\/noscript>/, '');
css = css.replace('.top { position: sticky; top: 0;', '.top { position: sticky; top: env(safe-area-inset-top, 0px);');

const out = '<title>Neurodivergence Screen</title>\n<style>\n' + css + '\n</style>\n' + body.trim() + '\n' +
  scripts.map(s => '<script>\n' + s + '\n</script>').join('\n') + '\n';
const dest = process.argv[2] || path.join(root, 'dist', 'neurodivergence-screen.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(dest + ' (' + out.length + ' bytes)');
