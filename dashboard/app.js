'use strict';

const radar = window.RADAR;
const byId = id => document.getElementById(id);
const form = byId('filters');
const drawer = byId('drawer');
const html = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const bands = [5e6, 50e6, 100e6, 500e6, 1e9];
const bandLabels = ['$5M', '$50M', '$100M', '$500M', '$1B+'];
const valueBands = [0, 1e6, 5e6, 10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 1e9, 2e9];
const defaults = () => ({ search: '', categories: [], chains: [], confidence: '', age: '', min: -1, max: 5, implied: 0, watch: false });
const state = { filters: defaults(), sort: 'rank', ascending: true, focus: '', shot: new URLSearchParams(location.search).get('shot') };
const index = new Map(radar.board.map(row => [row.slug, row]));
const field = name => form.elements.namedItem(name);
const percent = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const trend = value => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderHeader() {
  const { meta } = radar;
  byId('date').dateTime = meta.as_of;
  byId('date').textContent = meta.as_of;
  byId('source').textContent = meta.source.replace(/\s+https?:\/\/\S+,?/, ' ·');
  byId('source').title = meta.source;
  const { ranked, live, covered, watchlist } = meta.counts;
  byId('metrics').innerHTML = [[ranked, 'Ranked pre-token'], [live, 'Live aside'], [`${covered}/${watchlist}`, 'Watchlist covered']]
    .map(([value, label]) => `<div class="metric"><strong>${value}</strong><span class="micro">${label}</span></div>`).join('');
  byId('ticker').innerHTML = radar.live.slice(0, 6).map(p => {
    const arrow = p.change_7d > 0 ? '↑' : p.change_7d < 0 ? '↓' : '·';
    return `<div class="quote" title="${html(p.name)} · market cap · 7d TVL change"><b>${html(p.symbol || p.name)}</b><span class="cap">${compact.format(p.mcap_usd)}</span><span class="${trend(p.change_7d)}">${arrow} ${percent(p.change_7d)}</span></div>`;
  }).join('');
}

function renderOptions() {
  for (const [key, values] of [
    ['categories', tally(radar.board.map(row => row.category))],
    ['chains', tally(radar.board.flatMap(row => [...new Set(row.chains)])).slice(0, 12)],
  ]) {
    byId(key).innerHTML = values.map(([name, count]) =>
      `<label class="option"><input type="checkbox" data-group="${key}" value="${html(name)}"><span>${html(name)}</span><small>${count}</small></label>`
    ).join('');
  }
}

function renderExclusions() {
  const footnote = document.createElement('p');
  footnote.className = 'footnote';
  footnote.textContent = radar.meta.exclusion_rules;
  form.after(footnote);

  const section = document.createElement('details');
  section.className = 'excluded';
  section.innerHTML = `<summary>Excluded / market infrastructure <span class="tag">${radar.meta.counts.excluded}</span></summary>
    <div class="table-wrap" tabindex="0" aria-label="Excluded protocols">
      <table><thead><tr><th scope="col">Protocol</th><th scope="col">Category</th><th scope="col">TVL</th><th scope="col">Reason</th></tr></thead>
        <tbody>${radar.excluded.map(p => `<tr><td>${html(p.name)}</td><td>${html(p.category)}</td>
          <td>${compact.format(p.tvl_usd)}</td><td>${html(p.exclusion_reasons.join(' · '))}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  document.querySelector('.board').after(section);
}

function syncFilters() {
  const f = state.filters;
  for (const key of ['search', 'confidence', 'age', 'min', 'max', 'implied']) field(key).value = f[key];
  field('watch').checked = f.watch;
  for (const input of form.querySelectorAll('[data-group]')) input.checked = f[input.dataset.group].includes(input.value);
  renderRanges();
}

function renderRanges() {
  const { min, max, implied } = state.filters;
  byId('maxValue').textContent = max === bands.length ? 'Uncapped' : compact.format(bands[max]);
  byId('minValue').textContent = min < 0 ? 'Any' : bandLabels[min];
  byId('impliedMinValue').textContent = implied ? compact.format(valueBands[implied]) : 'Any';
  field('min').setAttribute('aria-valuetext', byId('minValue').textContent);
  field('max').setAttribute('aria-valuetext', byId('maxValue').textContent);
  field('implied').setAttribute('aria-valuetext', byId('impliedMinValue').textContent);
}

function renderChips() {
  const f = state.filters;
  const chips = [...f.categories.map(v => ['categories', v]), ...f.chains.map(v => ['chains', v])];
  for (const key of ['search', 'confidence', 'age']) if (f[key].trim()) chips.push([key, f[key].trim()]);
  if (f.min >= 0) chips.push(['min', `≥ ${compact.format(bands[f.min])}`]);
  if (f.max < bands.length) chips.push(['max', `≤ ${compact.format(bands[f.max])}`]);
  if (f.implied) chips.push(['implied', `Implied ≥ ${compact.format(valueBands[f.implied])}`]);
  if (f.watch) chips.push(['watch', 'Watchlist only']);
  byId('chips').innerHTML = chips.map(([key, value]) =>
    `<button type="button" class="chip" data-key="${key}" data-value="${html(value)}" aria-label="Remove filter ${html(value)}">${html(value)} ×</button>`
  ).join('');
}

function filteredRows() {
  const f = state.filters;
  const search = f.search.toLowerCase().trim();
  return radar.board.filter(row =>
    (!search || `${row.name} ${row.category}`.toLowerCase().includes(search)) &&
    (!f.categories.length || f.categories.includes(row.category)) &&
    (!f.chains.length || row.chains.some(chain => f.chains.includes(chain))) &&
    (!f.confidence || f.confidence === row.confidence) &&
    (!f.age || f.age === row.age_label) &&
    (f.min < 0 || row.tvl_usd >= bands[f.min]) && (f.max === bands.length || row.tvl_usd <= bands[f.max]) &&
    row.implied_value_usd >= valueBands[f.implied] &&
    (!f.watch || row.watchlist)
  ).sort((a, b) => (a[state.sort] - b[state.sort]) * (state.ascending ? 1 : -1) || a.rank - b.rank);
}

function rowMarkup(row) {
  const tag = row.watchlist_override ? 'watchlist override' : row.watchlist ? 'watchlist'
    : row.tvl_usd < radar.meta.floor_usd ? 'below floor' : 'off watchlist';
  const dots = '<i></i>'.repeat(Math.min(row.chains.length, 4));
  const top = row.rank <= 3 ? `top-${row.rank}` : row.rank <= 10 ? 'top-ten' : '';
  return `<tr data-slug="${html(row.slug)}" class="${top}">
    <td class="rank"><span>${String(row.rank).padStart(2, '0')}</span></td>
    <td class="protocol"><button type="button" tabindex="${row.slug === state.focus ? 0 : -1}" aria-haspopup="dialog" aria-label="Open ${html(row.name)} details" title="${html(row.name)}">${html(row.name)}</button>
      <div class="protocol-meta"><span class="category">${html(row.category)}</span><span class="tag ${row.watchlist ? 'watch' : ''}">${tag}</span>
      <span class="dots" title="${html(row.chains.join(', '))}" aria-label="${row.chains.length} listed chains">${dots}${row.chains.length > 4 ? '+' : ''}</span></div>
    </td>
    <td title="${dollars.format(row.tvl_usd)}">${compact.format(row.tvl_usd)}</td>
    <td class="${trend(row.change_7d)}">${percent(row.change_7d)}</td>
    <td class="age">${row.age_label}<small>${Math.round(row.age_days)}d${row.listed_at ? '' : ' est.'}</small></td>
    <td><span class="confidence ${row.confidence}">${row.confidence}</span></td>
    <td class="value" title="${dollars.format(row.implied_value_usd)}">${compact.format(row.implied_value_usd)}
      <meter aria-label="Implied value relative to rank one" min="0" max="${radar.board[0].implied_value_usd}" value="${row.implied_value_usd}"></meter></td>
    <td class="fees">${html(row.est_monthly_cost_usd)}<small>${html(row.time_to_farm_days)} days</small></td>
  </tr>`;
}

function renderBoard() {
  const rows = filteredRows();
  if (!rows.some(row => row.slug === state.focus)) state.focus = rows[0]?.slug ?? '';
  byId('count').textContent = `Showing ${rows.length} of ${radar.board.length}`;
  renderChips();
  byId('rows').innerHTML = rows.length ? rows.map(rowMarkup).join('') :
    '<tr><td class="empty" colspan="8">No protocols match these filters.</td></tr>';
  for (const button of document.querySelectorAll('[data-sort]')) {
    const active = button.dataset.sort === state.sort;
    const header = button.closest('th');
    if (active) header.setAttribute('aria-sort', state.ascending ? 'ascending' : 'descending');
    else header.removeAttribute('aria-sort');
    button.lastElementChild.textContent = active ? (state.ascending ? '↑' : '↓') : '↕';
  }
}

function dataGrid(entries) {
  return `<dl class="fields">${entries.map(([key, value]) =>
    `<div class="datum"><dt>${html(key)}</dt><dd>${html(value ?? '—')}</dd></div>`
  ).join('')}</dl>`;
}

function openDetail(row) {
  const f = row.factors;
  const cohort = radar.meta.CATEGORY_WEIGHTS.find(group => group.category === row.category);
  const c = radar.meta.constants;
  const factors = [
    ['TVL multiple', f.tvl_multiple, `${c.tvlMultipleBase}× baseline + ${f.tvl_premium.toFixed(4)}× premium`],
    ['Growth factor', f.growth_mult, `1 + ${c.growthWeight} × (${percent(row.growth)})`],
    ['Persistence', f.persistence, `${c.persistenceBase} + ${c.persistenceWeight} × ${Math.min(row.age_days, c.ageCap).toFixed(0)} / ${c.ageCap}`],
    ['Category factor', f.cat_mult, `${compact.format(cohort.median_tvl)} cohort median · n=${cohort.count}`],
  ];
  const multipliers = factors.map(([, value]) => value.toFixed(6));
  byId('drawerLabel').textContent = 'Protocol detail';
  byId('detail').innerHTML = `
    <div class="detail-heading"><div><h2 id="drawerTitle">${html(row.name)}</h2><p>Rank #${row.rank} · ${html(row.category)} · ${row.confidence} confidence</p></div><div><span class="micro">Implied value</span><br><strong>${dollars.format(row.implied_value_usd)}</strong></div></div>
    <section class="detail-section"><h3>Value derivation</h3>
      <div class="derivation">
        <div class="factors" aria-label="Value factors on a shared scale from 0 to 1.5">
          ${factors.map(([label, value, note]) => `<div class="factor"><div><span class="micro">${label}</span><b>${value.toFixed(4)}×</b></div>
            <div class="factor-track" aria-hidden="true"><i style="--fill: ${value / 1.5 * 100}%"></i></div><small>${html(note)}</small></div>`).join('')}
        </div>
        <dl class="equation" aria-label="Step-by-step value calculation">
          <div><dt>Protocol TVL</dt><dd>${dollars.format(row.tvl_usd)}</dd></div>
          ${factors.map(([label], i) => `<div><dt>${label}</dt><dd>× ${multipliers[i]}</dd></div>`).join('')}
          <div><dt>Implied value</dt><dd>≈ ${dollars.format(row.implied_value_usd)}</dd></div>
        </dl>
      </div>
    </section>
    <section class="detail-section"><div class="plan-heading"><h3>Farm plan</h3>
      <button type="button" class="quiet" id="copyPlan" aria-label="Copy farm plan for ${html(row.name)}">Copy plan</button><span id="copyStatus" class="visually-hidden" role="status"></span></div>
      <p class="farm-summary"><strong>${html(row.est_monthly_cost_usd)}</strong> estimated monthly gas <span aria-hidden="true">·</span> <strong>${html(row.time_to_farm_days)} days</strong> to farm</p>
      <ol class="plan">${row.farm_details.map((step, i) => `<li><span class="step-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div>${html(step.text)}<div class="step-chips"><span>${html(step.time)}</span><span>${html(step.cost)} fees</span></div></div></li>`).join('')}</ol>
      ${row.farm_chain_fees.length ? `<details class="chain-fees"><summary>Gas by chain · per interaction</summary>${dataGrid(row.farm_chain_fees.map(({ chain, fee }) => [chain, fee]))}</details>` : ''}
    </section>
    <section class="detail-section"><h3>Snapshot record</h3>${dataGrid([
      ['Slug', row.slug], ['Name', row.name], ['Category', row.category], ['Chains', row.chains.join(', ') || '—'],
      ['TVL', dollars.format(row.tvl_usd)], ['7d TVL change', percent(row.change_7d)],
      ['Market cap', row.mcap_usd], ['Listed at', row.listed_at], ['CoinGecko ID', row.gecko_id], ['Symbol', row.symbol],
    ])}</section>
    <section class="detail-section"><h3>Signals</h3><ul class="signals">${row.signals.map(signal => `<li>${html(signal)}</li>`).join('')}</ul></section>
    <p class="footnote">The snapshot records no token when CoinGecko ID, symbol, and market cap are all blank. Records can lag deployments and token listings. Modeled value and fee bands are estimates.</p>`;
  const copy = byId('copyPlan');
  const copyStatus = byId('copyStatus');
  copy.addEventListener('click', async () => {
    const plan = [
      `${row.name} farm plan`,
      `${row.est_monthly_cost_usd} estimated monthly gas · ${row.time_to_farm_days} days to farm`,
      ...row.farm_steps.map((step, i) => `${i + 1}. ${step}`),
      ...row.farm_chain_fees.map(({ chain, fee }) => `${chain} gas per interaction: ${fee}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(plan);
      copy.textContent = 'Copied';
      copyStatus.textContent = 'Farm plan copied.';
    } catch {
      copy.textContent = 'Copy failed';
      copyStatus.textContent = 'Could not copy the farm plan.';
    }
  });
  drawer.showModal();
  drawer.scrollTop = 0;
}

function openMethod() {
  byId('drawerLabel').textContent = 'Radar methodology';
  byId('detail').innerHTML = `<div class="detail-heading"><h2 id="drawerTitle">Scoring model</h2></div>
    <ul class="method">${radar.meta.method.map(note => `<li>${html(note)}</li>`).join('')}</ul>
    <section class="detail-section"><h3>Eligible category medians</h3>${dataGrid(radar.meta.CATEGORY_WEIGHTS.map(group =>
      [group.category, `${compact.format(group.median_tvl)} · n=${group.count}`]))}</section>`;
  drawer.showModal();
  drawer.scrollTop = 0;
}

form.addEventListener('input', event => {
  const input = event.target;
  const f = state.filters;
  if (input.dataset.group) {
    const group = input.dataset.group;
    f[group] = [...form.querySelectorAll(`[data-group="${group}"]:checked`)].map(option => option.value);
  } else if (input.name === 'watch') {
    f.watch = input.checked;
  } else if (input.name === 'implied') {
    f.implied = Number(input.value);
    renderRanges();
  } else if (input.name === 'min' || input.name === 'max') {
    f[input.name] = Number(input.value);
    if (f.min > f.max) f[input.name === 'min' ? 'max' : 'min'] = Number(input.value);
    syncFilters();
  } else {
    f[input.name] = input.value;
  }
  renderBoard();
});
form.addEventListener('submit', event => event.preventDefault());
byId('reset').addEventListener('click', () => {
  state.filters = defaults();
  syncFilters();
  renderBoard();
});
byId('chips').addEventListener('click', event => {
  const chip = event.target.closest('[data-key]');
  if (!chip) return;
  const { key, value } = chip.dataset;
  state.filters[key] = Array.isArray(state.filters[key]) ? state.filters[key].filter(v => v !== value) : defaults()[key];
  syncFilters();
  renderBoard();
  (byId('chips').firstElementChild || byId('search')).focus();
});
for (const button of document.querySelectorAll('[data-sort]')) {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    state.ascending = state.sort === key ? !state.ascending : key === 'rank';
    state.sort = key;
    renderBoard();
  });
}
const tbody = byId('rows');
tbody.addEventListener('click', event => {
  const tr = event.target.closest('tr[data-slug]');
  if (!tr) return;
  tr.querySelector('button').focus({ preventScroll: true });
  openDetail(index.get(tr.dataset.slug));
});
tbody.addEventListener('focusin', event => {
  if (!event.target.matches('.protocol button')) return;
  tbody.querySelector('button[tabindex="0"]')?.setAttribute('tabindex', '-1');
  event.target.tabIndex = 0;
  state.focus = event.target.closest('tr').dataset.slug;
});
tbody.addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const row = event.target.closest('tr');
  const next = {
    ArrowDown: row.nextElementSibling, ArrowUp: row.previousElementSibling,
    Home: tbody.firstElementChild, End: tbody.lastElementChild,
  }[event.key];
  next?.querySelector('button')?.focus();
});
byId('close').addEventListener('click', () => drawer.close());
byId('methodButton').addEventListener('click', openMethod);
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'f' || event.altKey || event.ctrlKey || event.metaKey ||
      drawer.open || event.target.closest('input, textarea, select, [contenteditable]')) return;
  event.preventDefault();
  byId('search').focus();
});

const density = byId('density');
function syncDensity() {
  const compactRows = !state.shot && new URLSearchParams(location.hash.slice(1)).get('density') === 'compact';
  document.querySelector('.board').classList.toggle('compact-rows', compactRows);
  density.setAttribute('aria-pressed', String(compactRows));
  density.textContent = compactRows ? 'Compact' : 'Comfortable';
}
density.addEventListener('click', () => {
  const hash = new URLSearchParams(location.hash.slice(1));
  hash.set('density', density.getAttribute('aria-pressed') === 'true' ? 'comfortable' : 'compact');
  history.replaceState(null, '', `#${hash}`);
  syncDensity();
});
window.addEventListener('hashchange', syncDensity);
syncDensity();

renderHeader();
renderOptions();
renderExclusions();
if (state.shot === 'filtered') Object.assign(state.filters, { categories: ['Lending'], chains: ['Ethereum'], confidence: 'high' });
syncFilters();
renderBoard();
if (state.shot === 'filtered') {
  for (const checked of form.querySelectorAll('[data-group]:checked')) {
    const list = checked.closest('.options');
    list.scrollTop = Math.max(0, checked.getBoundingClientRect().top - list.getBoundingClientRect().top - 20);
  }
}
if (state.shot === 'detail') {
  const row = radar.board.find(row => row.watchlist);
  if (row) openDetail(row);
}
if (['board', 'detail', 'filtered'].includes(state.shot)) {
  document.querySelector('.workspace').inert = true;
  if (state.shot === 'detail') {
    byId('close').inert = true;
    drawer.addEventListener('cancel', event => event.preventDefault());
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
