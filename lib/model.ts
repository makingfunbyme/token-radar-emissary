type Protocol = {
  slug: string; name: string; category: string; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
};
type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] };
const DAY = 86_400_000;
const CONSTANTS = {
  boardLimit: 160, maxValue: 100_000_000_000_000, tvlBase: 50_000_000,
  tvlMultipleBase: 0.35, tvlPremiumWeight: 4.9, tvlPremiumCap: 0.38,
  growthMin: -60, growthMax: 120, growthWeight: 0.35,
  unknownAge: 365, ageCap: 1095, persistenceBase: 0.55, persistenceWeight: 0.45,
  categoryMin: 0.9, categoryMax: 1.15,
  excludedCategories: ['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'],
  excludedWords: ['wrapped', 'staked', 'staking'],
  exchangePrefixes: ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini',
    'Robinhood', 'HTX', 'Deribit', 'Bitstamp'],
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isPreToken = (p: Protocol) => p.gecko_id == null && p.symbol == null && p.mcap_usd == null;
const productWords = new RegExp(`\\b(?:${CONSTANTS.excludedWords.join('|')})\\b`, 'i');
const exchangePrefix = new RegExp(`^(?:${CONSTANTS.exchangePrefixes.join('|')})`, 'i');
const versionSuffix = /\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
function exclusionReasons(p: Protocol) {
  const reasons: string[] = [];
  if (CONSTANTS.excludedCategories.includes(p.category)) reasons.push(`Category: ${p.category}`);
  const word = p.name.match(productWords)?.[0];
  if (word) reasons.push(`Product word: ${word}`);
  const prefix = p.name.match(exchangePrefix)?.[0];
  if (prefix) reasons.push(`Exchange prefix: ${prefix}`);
  if (versionSuffix.test(p.name)) reasons.push('Version suffix');
  return reasons;
}
const money = (value: number) => new Intl.NumberFormat('en-US', {
  notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1,
}).format(value);

export function parseSnapshot(json: string): Snapshot {
  const s: Snapshot = JSON.parse(json);
  if (!s || !Number.isFinite(Date.parse(s.as_of)) || typeof s.source !== 'string' ||
      !Number.isFinite(s.floor_usd) || s.floor_usd <= 0 ||
      !Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) throw new Error('Invalid snapshot header');
  const slugs = new Set<string>();
  for (const p of s.protocols) {
    if (!p || ![p.slug, p.name, p.category].every(value => typeof value === 'string' && value.length) ||
        slugs.has(p.slug) || !Array.isArray(p.chains) || !p.chains.every(c => typeof c === 'string') ||
        !Number.isFinite(p.tvl_usd) || p.tvl_usd < 0 ||
        ![p.change_7d, p.mcap_usd].every(value => value === null || Number.isFinite(value)) ||
        ![p.gecko_id, p.symbol].every(value => value === null || typeof value === 'string') ||
        (p.listed_at !== null && !Number.isFinite(Date.parse(p.listed_at)))) throw new Error(`Invalid protocol: ${p?.slug}`);
    slugs.add(p.slug);
  }
  if (new Set(s.watchlist).size !== s.watchlist.length || !s.watchlist.every(slug => slugs.has(slug))) {
    throw new Error('Invalid watchlist slugs');
  }
  return s;
}

const templates: Record<string, [string, string, string]> = {
  Dexs: ['swap a small amount between liquid assets and optionally seed a stable pair', 'record swap fees and any LP position', 'pool imbalance and impermanent loss'],
  Lending: ['supply a supported stablecoin into a lending market', 'review utilization and the supply rate', 'market liquidity and collateral depegs'],
  Yield: ['deposit a supported stablecoin into a plain yield vault', 'check realized yield net of fees', 'underlying strategy losses'],
  'Yield Aggregator': ['deposit a supported stablecoin into one aggregator vault', 'track the vault share price and allocation changes', 'strategy migrations and withdrawal queues'],
  RWA: ['use an eligible settlement asset in a redeemable RWA vault', 'check redemption terms and reserve reporting', 'eligibility restrictions and redemption windows'],
  Derivatives: ['post supported collateral for a small unleveraged position if available', 'track mark price and fees', 'settlement and liquidation risk'],
  Perps: ['use supported margin for a small position at minimum leverage', 'check funding and close exposure on schedule', 'liquidation and funding spikes'],
  'Liquid Staking': ['stake the chain’s eligible native asset through a liquid staking pool', 'check the receipt token discount', 'slashing and exit queues'],
  'Liquid Restaking': ['deposit a supported staking receipt into one restaking pool', 'check operator exposure and share conversion', 'stacked slashing and unlock delays'],
  Restaking: ['deposit eligible stake with one operator', 'check delegation and unstaking terms', 'operator slashing and exit delays'],
  'Staking Pool': ['stake a supported native asset in one pool', 'check validator and exit status', 'unbonding delays and validator penalties'],
  'Risk Curators': ['supply a supported stablecoin to a curator-managed vault', 'review exposure caps and allocations', 'concentrated borrowers and liquidity limits'],
  'Onchain Capital Allocator': ['supply a supported stablecoin to an allocator vault', 'check strategy weights and withdrawal liquidity', 'allocator changes and idle liquidity'],
  Bridge: ['bridge a supported stablecoin on one listed route', 'confirm receipt and check the return route quote', 'relay delays and wrapped asset liquidity'],
  Launchpad: ['use a supported settlement asset for a small eligible allocation', 'verify claim terms and vesting dates', 'allocation caps and lockups'],
  'NFT Marketplace': ['use a supported settlement asset for one liquid collection offer', 'track execution and marketplace fees', 'thin liquidity and unauthenticated collections'],
  CEX: ['fund an eligible spot account with a supported settlement asset and test a small spot order', 'check the withdrawal minimum and custody terms', 'regional restrictions and suspended withdrawals'],
  Chain: ['fund a wallet with a small amount of the chain’s native gas asset and test a transfer', 'verify finality and the return route', 'withdrawal delays and bridge liquidity'],
};

function farm(p: Protocol) {
  const [action, review, risk] = templates[p.category] ??
    ['use a supported asset in the smallest reversible core action', 'check the balance and exit route', 'contract risk and withdrawal limits'];
  const chain = p.chains[0] ?? 'a supported chain';
  const capital = Math.round(clamp(Math.sqrt(p.tvl_usd / 5000), 25, 500) / 5) * 5;
  const weeks = p.tvl_usd >= 100_000_000 ? '3–4 weeks' : '2–3 weeks';
  const tx = chain === 'Ethereum' ? 5 : 1;
  const chains = [...new Set(p.chains)];
  const routes = Math.min(4, chains.length);
  const steps = [
    { time: '10–15 min', cost: '$0', text: `Verify the ${p.category} deployment on ${chain}, check its supported assets and quote a $${capital}–$${capital * 3} position. Skip deployments with unclear withdrawal terms.` },
    ...(chains.length > 1 ? [{
      time: '5–10 min', cost: '$0',
      text: `Compare the ${chain} and ${chains[1]} deployments for liquidity, gas and exit terms. Proceed on ${chain} only if its terms suit the planned position.`,
    }] : []),
    { time: '10–25 min', cost: `$${tx}–$${tx * 5 + routes}`, text: `On ${chain}, ${action}. Set aside $${capital}–$${capital * 3} of capital and keep a separate gas balance for the exit.` },
    { time: weeks, cost: '$0', text: `Monitor the recorded activity and ${review} once a week. Watch for ${risk}; reassess the exit if conditions worsen.` },
    ...(p.change_7d != null && p.listed_at ? [{
      time: '5–10 min', cost: '$0',
      text: `Record the snapshot’s ${p.change_7d.toFixed(1)}% weekly TVL change and ${p.listed_at} tracking start. Check whether recent flows changed liquidity or exit terms before renewing the position.`,
    }] : []),
    { time: '15–30 min', cost: `$${tx}–$${tx * 6 + routes}`, text: `Unwind on ${chain} when the review window ends, subject to any lockup. Record net fees and confirm the returned balance before closing the log.` },
  ];
  return {
    farm_steps: steps.map(s => `${s.text} Time: ${s.time}. Estimated cost: ${s.cost}.`),
    farm_details: steps,
    farm_cost: `$${tx * 2}–$${tx * 11 + routes * 2}`,
  };
}

export function buildRadar(snapshot: Snapshot) {
  const c = CONSTANTS;
  const watchlist = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(isPreToken);
  const classified = preToken.map(p => ({ ...p, watchlist: watchlist.has(p.slug), exclusion_reasons: exclusionReasons(p) }));
  // Watchlist coverage takes precedence over structural exclusions among pre-token records.
  const excluded = classified.filter(p => !p.watchlist && p.exclusion_reasons.length)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));
  const eligible = classified.filter(p => p.watchlist || !p.exclusion_reasons.length);
  const groups = new Map<string, Protocol[]>();
  for (const p of eligible) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category)!.push(p);
  }
  const weights = new Map<string, number>();
  const CATEGORY_WEIGHTS = Array.from(groups, ([category, members]) => {
    const tvls = members.map(p => p.tvl_usd).sort((a, b) => a - b);
    const middle = (tvls.length - 1) / 2;
    const median_tvl = (tvls[Math.floor(middle)] + tvls[Math.ceil(middle)]) / 2;
    for (const p of members) {
      const less = tvls.filter(tvl => tvl < p.tvl_usd).length;
      const tied = tvls.filter(tvl => tvl === p.tvl_usd).length;
      const position = tvls.length === 1 ? 0.5 : (less + (tied - 1) / 2) / (tvls.length - 1);
      weights.set(p.slug, c.categoryMin + position * (c.categoryMax - c.categoryMin));
    }
    return { category, median_tvl, count: tvls.length, min: c.categoryMin, max: c.categoryMax };
  }).sort((a, b) => a.category.localeCompare(b.category));
  const candidates = eligible.map(p => {
    const age_days = p.listed_at ? Math.max(0, (Date.parse(snapshot.as_of) - Date.parse(p.listed_at)) / DAY) : c.unknownAge;
    const age_label = age_days < 90 ? 'new' : age_days < 365 ? 'young' : age_days <= 730 ? 'seasoned' : 'veteran';
    const growth = clamp(p.change_7d ?? 0, c.growthMin, c.growthMax);
    const confidence = p.listed_at && p.change_7d != null ? 'high' : p.listed_at || p.change_7d != null ? 'medium' : 'low';
    const tvl_premium = p.tvl_usd > c.tvlBase
      ? Math.min(c.tvlPremiumCap, c.tvlPremiumWeight * Math.log10(p.tvl_usd / c.tvlBase)) : 0;
    const tvl_multiple = c.tvlMultipleBase + tvl_premium;
    const persistence = c.persistenceBase + Math.min(age_days, c.ageCap) / c.ageCap * c.persistenceWeight;
    const growth_mult = 1 + growth / 100 * c.growthWeight;
    const cat_mult = weights.get(p.slug)!;
    const implied_value_usd = Math.min(c.maxValue, Math.round(p.tvl_usd * tvl_multiple * growth_mult * persistence * cat_mult));
    const signals = [
      p.change_7d == null ? '7d TVL change unavailable' : `TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% over 7d`,
      `${money(p.tvl_usd)} TVL · ${(p.tvl_usd / snapshot.floor_usd).toFixed(2)}× watchlist floor`,
      p.listed_at ? `Tracked ${Math.round(age_days)} days · snapshot records no token` : 'Listing date unavailable · model uses 365 days',
      `${p.category} · ${p.chains.length} listed chain${p.chains.length === 1 ? '' : 's'}`,
    ];
    return { ...p, watchlist_override: p.watchlist && p.exclusion_reasons.length > 0, age_days, age_label, growth, confidence, implied_value_usd,
      factors: { tvl_premium, tvl_multiple, growth_mult, persistence, cat_mult }, signals };
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));
  const extra = Math.max(0, c.boardLimit - watchlist.size);
  const selected = new Set(candidates.filter(p => !p.watchlist).slice(0, extra).map(p => p.slug));
  const board = candidates.filter(p => p.watchlist || selected.has(p.slug))
    .map((p, index) => ({ ...p, rank: index + 1, ...farm(p) }));
  const live = snapshot.protocols.filter(p => p.mcap_usd != null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || a.slug.localeCompare(b.slug));
  const exclusion_rules = `Exclude pre-token categories ${c.excludedCategories.join(', ')}; whole words ${c.excludedWords.join(', ')}; names starting with ${c.exchangePrefixes.join(', ')}; and names ending in a space followed by a version such as V2, v2 or 2.0. Name rules ignore case. Watchlist coverage takes precedence; matching rows are tagged “watchlist override”.`;
  return { board, live, excluded, meta: {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, constants: c, CATEGORY_WEIGHTS,
    exclusion_rules,
    counts: { ranked: board.length, pre_token_universe: preToken.length, eligible: eligible.length, excluded: excluded.length, live: live.length,
      watchlist: watchlist.size, covered: board.filter(p => p.watchlist).length, protocols: snapshot.protocols.length },
    method: [
      'Launch candidates have null CoinGecko ID, symbol and market cap and pass the structural filter. Keep the full watchlist and fill the board by implied value.',
      exclusion_rules,
      'Implied value is the fully diluted value a launch would need to be consistent with the protocol’s on-chain traction.',
      `TVL multiple starts at ${c.tvlMultipleBase}× TVL, a conservative fully diluted launch baseline. Above ${money(c.tvlBase)}, add ${c.tvlPremiumWeight} × log₁₀(TVL / ${money(c.tvlBase)}), capped at +${c.tvlPremiumCap}× TVL. The cap is reached around ${money(c.tvlBase * 10 ** (c.tvlPremiumCap / c.tvlPremiumWeight))}.`,
      'Persistence = 0.55 + 0.45 × min(age, 1,095) / 1,095. Unknown age uses 365 days.',
      'Growth factor = 1 + 0.35 × (7d TVL growth clamped to −60% through +120%) / 100. Missing growth uses 0%.',
      'CATEGORY_WEIGHTS reports each eligible category’s median TVL. The factor uses ascending TVL percentile within that cohort, with tied TVLs sharing their average position and singleton cohorts receiving the midpoint. The factor spans 0.90–1.15.',
      'Implied value = TVL × TVL multiple × growth factor × persistence × category factor, rounded to dollars and capped at $100T. Confidence measures listing-date and 7d-change completeness.',
    ],
  } };
}

type Board = ReturnType<typeof buildRadar>['board'];

export function boardIssue(board: Board, snapshot: Snapshot): string | null {
  if (!Array.isArray(board) || board.length < 100 || board.length > 200) return 'Board must contain 100–200 rows';
  const seen = new Set<string>();
  const watchlist = new Set(snapshot.watchlist);
  const candidates = new Map(snapshot.protocols.filter(isPreToken).map(p => [p.slug, p]));
  for (const [index, row] of board.entries()) {
    const protocol = candidates.get(row.slug);
    if (!protocol || row.name !== protocol.name || seen.has(row.slug)) return `Invalid board slug: ${row.slug}`;
    const excluded = exclusionReasons(protocol).length > 0;
    if ((excluded && !watchlist.has(row.slug)) || row.watchlist_override !== excluded) return `Invalid launch candidate: ${row.slug}`;
    seen.add(row.slug);
    if (row.rank !== index + 1) return `Invalid rank: ${row.slug}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 0 ||
        row.implied_value_usd > CONSTANTS.maxValue || (index > 0 && row.implied_value_usd > board[index - 1].implied_value_usd)) {
      return `Invalid implied value: ${row.slug}`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 4 || row.farm_steps.length > 6 ||
        row.farm_steps.some(step => typeof step !== 'string' || step.length < 20 || step.length > 600)) return `Invalid farm plan: ${row.slug}`;
  }
  return snapshot.watchlist.find(slug => !seen.has(slug)) ? 'Board is missing a watchlist protocol' : null;
}

export function dataScript(radar: ReturnType<typeof buildRadar>): string {
  return `window.RADAR = ${JSON.stringify(radar).replace(/</g, '\\u003c')};\n`;
}
