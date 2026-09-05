'use strict';
/* Options page. Saves on every change — no save button to forget about. */
(function () {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const $ = (id) => document.getElementById(id);

  const SITE_KEYS = ['googleImages', 'googleSearch', 'youtube', 'bing', 'duckduckgo', 'reddit', 'generic'];
  const LIST_KEYS = ['blockKeywords', 'blockDomains', 'blockChannels', 'allowDomains', 'allowChannels'];
  const FLAGS = ['enabled', 'showReason'];

  let saveTimer = null;

  async function load() {
    try {
      const synced = await api.storage.sync.get(null);
      if (synced && Object.keys(synced).length) return synced;
    } catch { /* fall through */ }
    try {
      return await api.storage.local.get(null);
    } catch {
      return {};
    }
  }

  async function save(partial) {
    try {
      await api.storage.sync.set(partial);
    } catch {
      await api.storage.local.set(partial);
    }
    const saved = $('saved');
    saved.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saved.classList.remove('show'), 1200);
  }

  const toList = (value) => value.split('\n').map((s) => s.trim()).filter(Boolean);

  function render(settings) {
    $('enabled').checked = settings.enabled !== false;
    $('showReason').checked = settings.showReason !== false;
    $('sensitivity').value = settings.sensitivity || 'balanced';
    $('action').value = settings.action || 'blur';
    $('checkMetadata').checked = !!settings.checkMetadata;

    const sites = settings.sites || {};
    for (const key of SITE_KEYS) {
      $('site-' + key).checked = key === 'generic' ? !!sites[key] : sites[key] !== false;
    }
    for (const key of LIST_KEYS) {
      $(key).value = (settings[key] || []).join('\n');
    }

    const total = settings.stats?.blocked || 0;
    $('totalBlocked').textContent = total.toLocaleString();
    $('since').textContent = settings.stats?.since
      ? 'since ' + new Date(settings.stats.since).toLocaleDateString()
      : 'nothing filtered yet';
  }

  /* Broad host access is only requested at the moment it is actually needed,
   * so the install prompt stays narrow. */
  async function ensureHostPermission() {
    try {
      if (await api.permissions.contains({ origins: ['<all_urls>'] })) return true;
      return await api.permissions.request({ origins: ['<all_urls>'] });
    } catch {
      return false;
    }
  }

  async function init() {
    const settings = await load();
    render(settings);

    for (const key of FLAGS) {
      $(key).addEventListener('change', (e) => save({ [key]: e.target.checked }));
    }
    for (const key of ['sensitivity', 'action']) {
      $(key).addEventListener('change', (e) => save({ [key]: e.target.value }));
    }

    for (const key of SITE_KEYS) {
      $('site-' + key).addEventListener('change', async (e) => {
        if (key === 'generic' && e.target.checked && !(await ensureHostPermission())) {
          e.target.checked = false;
          $('permWarning').hidden = false;
          return;
        }
        const current = await load();
        const sites = Object.assign({}, current.sites, { [key]: e.target.checked });
        save({ sites });
      });
    }

    $('checkMetadata').addEventListener('change', async (e) => {
      if (e.target.checked && !(await ensureHostPermission())) {
        e.target.checked = false;
        $('permWarning').hidden = false;
        return;
      }
      $('permWarning').hidden = true;
      save({ checkMetadata: e.target.checked });
    });

    for (const key of LIST_KEYS) {
      $(key).addEventListener('change', (e) => save({ [key]: toList(e.target.value) }));
    }

    $('resetStats').addEventListener('click', async () => {
      await save({ stats: { blocked: 0, since: new Date().toISOString() } });
      render(await load());
    });

    $('export').addEventListener('click', async () => {
      const blob = new Blob([JSON.stringify(await load(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-slop-blocker-settings.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    $('import').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
        await save(parsed);
        render(await load());
      } catch {
        $('permWarning').hidden = false;
        $('permWarning').textContent = 'That file could not be read as settings.';
      }
      e.target.value = '';
    });
  }

  init();
})();
