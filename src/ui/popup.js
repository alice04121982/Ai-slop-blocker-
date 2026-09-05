'use strict';
/* Popup: the three controls worth reaching for mid-browse, plus a count. */
(function () {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const $ = (id) => document.getElementById(id);

  /* The popup cannot use core/settings.js directly without loading the whole
   * chain, and it only needs two calls, so it talks to storage itself. */
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
  }

  async function activeTab() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function refreshCounts() {
    const tab = await activeTab();
    if (!tab) return;
    try {
      const stats = await api.tabs.sendMessage(tab.id, { type: 'aislop:page-stats' });
      $('pageCount').textContent = stats?.blocked ?? 0;
    } catch {
      /* No content script here — the extension does not run on this site. */
      $('pageCount').textContent = '—';
    }
    const settings = await load();
    const total = settings?.stats?.blocked || 0;
    $('totalCount').textContent = total ? `${total.toLocaleString()} filtered in total` : '';
  }

  async function init() {
    const settings = await load();
    $('enabled').checked = settings.enabled !== false;
    $('sensitivity').value = settings.sensitivity || 'balanced';
    $('action').value = settings.action || 'blur';

    $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
    $('sensitivity').addEventListener('change', (e) => save({ sensitivity: e.target.value }));
    $('action').addEventListener('change', (e) => save({ action: e.target.value }));

    $('revealAll').addEventListener('click', async () => {
      const tab = await activeTab();
      if (!tab) return;
      try {
        await api.tabs.sendMessage(tab.id, { type: 'aislop:reveal-all' });
        $('revealAll').textContent = 'Everything shown';
        $('revealAll').disabled = true;
      } catch { /* no content script on this tab */ }
    });

    $('openOptions').addEventListener('click', () => {
      if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
      else api.tabs.create({ url: api.runtime.getURL('src/ui/options.html') });
      window.close();
    });

    refreshCounts();
  }

  init();
})();
