// Token Radar dashboard: one dataset in (window.RADAR from data.js), one board out.
// Sortable, filterable, with a detail view per protocol. No network: every value on the
// page comes from the dataset this entry's own program wrote.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('lede').textContent = 'The board did not load: data.js is missing.';
    return;
  }

  var watchlist = new Set(R.watchlist || []);
  var rows = R.rows;
  var state = { q: '', chain: '', category: '', watchlistOnly: false, sort: 'rank', dir: 1 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function age(n) {
    if (n == null) return '—';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return n + 'd';
  }

  // Header: what the board is, when the snapshot was taken, how big it is.
  document.getElementById('lede').innerHTML =
    '<strong>' + rows.length + ' pre-token protocols</strong> ranked by implied value, ' +
    'from a sealed DefiLlama snapshot of ' + esc(R.as_of) + ' (' + R.watchlist_size +
    ' on the watchlist, ' + (rows.length - R.watchlist_size) + ' found below its floor). ' +
    'Implied values are this entry\u2019s own claims, from the snapshot\u2019s figures alone.';

  // Filter options, from the rows themselves.
  function fillSelect(id, values) {
    var el = document.getElementById(id);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  }
  var chains = Array.from(new Set(rows.flatMap(function (r) { return r.chains; }))).sort();
  var categories = Array.from(new Set(rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
  fillSelect('chain', chains);
  fillSelect('category', categories);

  var tbody = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var detailEl = document.getElementById('detail');

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watchlistOnly && !watchlist.has(r.slug)) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.category && (r.category || 'Uncategorised') !== state.category) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function compare(a, b, key) {
    var va = a[key], vb = b[key];
    if (key === 'chains') { va = a.chains.join(', '); vb = b.chains.join(', '); }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return va.localeCompare(vb);
    return va - vb;
  }

  function render() {
    var list = filtered();
    list.sort(function (a, b) { return compare(a, b, state.sort) * state.dir || a.rank - b.rank; });
    var html = '';
    list.forEach(function (r) {
      var wl = watchlist.has(r.slug) ? '<span class="badge">Watchlist</span>' : '';
      html += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + wl + '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td></tr>';
    });
    tbody.innerHTML = html || '<tr><td class="empty" colspan="8">No protocol matches these filters.</td></tr>';
    countEl.textContent = list.length + ' of ' + rows.length + ' protocols';
    document.querySelectorAll('#board-table thead button').forEach(function (btn) {
      btn.removeAttribute('aria-sort');
      if (btn.getAttribute('data-sort') === state.sort) {
        btn.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      }
    });
  }

  // Sorting: click a column heading; rank sorts ascending, everything else descending first.
  document.querySelectorAll('#board-table thead button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sort === key) {
        state.dir = -state.dir;
      } else {
        state.sort = key;
        state.dir = key === 'rank' || key === 'name' || key === 'category' || key === 'chains' ? 1 : -1;
      }
      render();
    });
  });

  // Filters.
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
  document.getElementById('watchlist').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; render(); });

  // Detail view: the protocol's facts, the model's own arithmetic, and its farm plan.
  function openDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var m = r.model;
    var base = Math.round(r.tvl_usd * m.category_multiple);
    var multNote = m.comparables >= 5
      ? 'TVL &times; ' + m.category_multiple.toFixed(4) + ' (' + esc(r.category || 'global') + ' multiple, ' + m.comparables + ' live comparables)'
      : 'TVL &times; ' + m.category_multiple.toFixed(4) + ' (global median; only ' + m.comparables + ' live comparable' + (m.comparables === 1 ? '' : 's') + ' in ' + esc(r.category || 'this category') + ')';
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    detailEl.innerHTML =
      '<button class="close" type="button" id="detail-close">Close</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">Rank #' + r.rank + ' &middot; ' + esc(r.category || 'Uncategorised') + ' &middot; ' +
      esc(r.chains.join(', ') || '—') + ' &middot; TVL ' + money(r.tvl_usd) + ' &middot; 7d ' +
      (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' &middot; tracked since ' + esc(r.listed_at || 'unknown') + ' &middot; records no token</p>' +
      '<h3>Implied value: ' + money(r.implied_value_usd) + '</h3>' +
      '<dl class="model-grid">' +
      '<div><dt>Base</dt><dd>' + money(base) + '<small>' + multNote + '</small></dd></div>' +
      '<div><dt>Growth</dt><dd>&times;' + m.growth_multiplier.toFixed(4) + '<small>' + (m.growth_pct > 0 ? '+' : '') + m.growth_pct.toFixed(1) + '% over 7 days</small></dd></div>' +
      '<div><dt>Maturity</dt><dd>&times;' + m.maturity_multiplier.toFixed(4) + '<small>' + (m.age_days == null ? 'age unknown, scored at 365 days' : m.age_days + ' days tracked') + '</small></dd></div>' +
      '<div><dt>Implied</dt><dd>' + money(r.implied_value_usd) + '<small>base &times; growth &times; maturity</small></dd></div>' +
      '</dl>' +
      '<h3>How to farm it</h3><ol class="steps">' + steps + '</ol>';
    detailEl.hidden = false;
    document.getElementById('detail-close').addEventListener('click', closeDetail);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.classList.toggle('selected', tr.getAttribute('data-slug') === slug);
    });
  }
  function closeDetail() {
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    tbody.querySelectorAll('tr.selected').forEach(function (tr) { tr.classList.remove('selected'); });
    if (location.hash.indexOf('#detail=') === 0) history.replaceState(null, '', location.pathname + location.search);
  }
  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) {
      openDetail(tr.getAttribute('data-slug'));
      detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Live token view: the market's own values, by market cap.
  document.getElementById('live-rows').innerHTML = (R.live || []).map(function (p) {
    return '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td>' + esc(p.chains.join(', ') || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // Multiples table: every category's multiple and where it came from.
  document.getElementById('multiples-rows').innerHTML = (R.multiples || []).map(function (m) {
    return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.multiple.toFixed(4) + '</td><td class="num">' + m.comparables + '</td></tr>';
  }).join('') +
    '<tr><td><strong>Global (fallback)</strong></td><td class="num"><strong>' + R.global_multiple.toFixed(4) + '</strong></td><td class="num">—</td></tr>';

  // Deep links: #detail=<slug> opens a protocol, #chain=<chain> and #watchlist=1 filter the board.
  function applyHash() {
    var h = location.hash || '';
    var m = h.match(/detail=([^&]+)/);
    if (m) openDetail(decodeURIComponent(m[1]));
    var c = h.match(/chain=([^&]+)/);
    if (c) {
      var chain = decodeURIComponent(c[1]);
      document.getElementById('chain').value = chain;
      state.chain = chain;
    }
    if (/(^|[#&])watchlist=1/.test(h)) {
      document.getElementById('watchlist').checked = true;
      state.watchlistOnly = true;
    }
  }

  render();
  applyHash();
  render();
})();
