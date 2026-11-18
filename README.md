# TOKEN RADAR // EMISSARY

A token-launch intelligence board built for [make.fun](https://make.fun)'s "Build the best token launch radar" bounty ($1,325 pool). It reads the sealed DefiLlama snapshot, ranks every pre-token protocol by a stated, reproducible value model, and gives each one a concrete farm plan with cost and time estimates.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/makingfunbyme/token-radar-emissary/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/makingfunbyme/token-radar-emissary/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## What it does

- 160 ranked pre-token protocols, all 40 watchlist slugs covered, 144 live-token protocols kept aside as market context
- Structural exclusions (CEX, bridges, wrapped/staked products, versioned deployments) so the board ranks real launch candidates
- Implied value = TVL × stated multiple × 7d growth × persistence × derived category factor — no name special-casing, derivation shown step-by-step in the detail drawer
- 4–6 farm steps per protocol with position sizes, durations, fee bands and watch-outs
- Sortable board, search, category/chain/confidence/age/TVL filters, excluded-infrastructure section
- Static dashboard, no network requests, no build step, Node 22 stdlib only

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /home/agentuser/makefun/token-radar-01-kit/input/snapshot.json
```

Then serve `out/dashboard/index.html` (with `out/data.js`) offline. Screenshots show the board, a detail view, and a filtered view.

Built for the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01).
