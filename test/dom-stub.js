'use strict';
/*
 * A very small DOM stand-in — just enough for the adapters' extract() paths.
 *
 * Supports the selector syntax the adapters actually use: tag names, .class,
 * #id, [attr], [attr="value"], compound selectors, descendant combinators and
 * comma-separated lists. Anything fancier is deliberately unsupported so that
 * a test failing here means the adapter changed, not that the stub is behind.
 */

class El {
  constructor(tag, attrs = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = children;
    this.ownText = text;
    this.isConnected = true;
    this.classList = {
      contains: (c) => (attrs.class || '').split(/\s+/).includes(c)
    };
    for (const child of children) child.parentElement = this;
    this.parentElement = null;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : null;
  }

  get src() { return this.getAttribute('src') || ''; }
  get href() { return this.getAttribute('href') || ''; }

  get textContent() {
    return [this.ownText, ...this.children.map((c) => c.textContent)].filter(Boolean).join(' ');
  }

  getBoundingClientRect() {
    return { width: Number(this.attrs['data-w'] || 100), height: Number(this.attrs['data-h'] || 100) };
  }

  descendants() {
    const out = [];
    for (const child of this.children) out.push(child, ...child.descendants());
    return out;
  }

  matches(selector) {
    return selector.split(',').some((part) => matchesCompound(this, part.trim().split(/\s+/).pop()));
  }

  querySelectorAll(selector) {
    const pool = this.descendants();
    const out = [];
    for (const group of selector.split(',')) {
      const chain = group.trim().replace(/^:scope\s*>\s*/, '').split(/\s+/).filter(Boolean);
      for (const node of pool) {
        if (matchesChain(node, chain, this) && !out.includes(node)) out.push(node);
      }
    }
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function matchesCompound(node, compound) {
  if (!compound || compound === '*') return true;
  const tokens = compound.match(/(^[a-zA-Z][\w-]*)|(\.[\w-]+)|(#[\w-]+)|(\[[^\]]+\])/g) || [];
  for (const token of tokens) {
    if (token.startsWith('.')) {
      if (!node.classList.contains(token.slice(1))) return false;
    } else if (token.startsWith('#')) {
      if (node.getAttribute('id') !== token.slice(1)) return false;
    } else if (token.startsWith('[')) {
      const m = token.slice(1, -1).match(/^([\w:-]+)(?:([~*^$]?=)"?([^"\]]*)"?)?$/);
      if (!m) return false;
      const value = node.getAttribute(m[1]);
      if (value === null) return false;
      if (m[2] === '=' && value !== m[3]) return false;
      if (m[2] === '*=' && !value.includes(m[3])) return false;
      if (m[2] === '^=' && !value.startsWith(m[3])) return false;
    } else if (node.tagName !== token.toUpperCase()) {
      return false;
    }
  }
  return true;
}

/* Walks the chain right-to-left, following parents for descendant combinators. */
function matchesChain(node, chain, root) {
  if (!matchesCompound(node, chain[chain.length - 1])) return false;
  let current = node.parentElement;
  for (let i = chain.length - 2; i >= 0; i--) {
    let found = false;
    while (current && current !== root.parentElement) {
      if (matchesCompound(current, chain[i])) { found = true; current = current.parentElement; break; }
      current = current.parentElement;
    }
    if (!found) return false;
  }
  return true;
}

const el = (tag, attrs, children, text) => new El(tag, attrs, children, text);

module.exports = { El, el };
