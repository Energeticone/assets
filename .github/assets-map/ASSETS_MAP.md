# Assets Map — `energeticone/assets`

Snapshot taken **2026-10-06** on branch `claude/modest-archimedes-vn9aqv`.
Machine-readable version: [`assets-map.json`](assets-map.json).
To regenerate the numbers: `python3 .github/assets-map/map_assets.py .`

## 1. At a glance

| Area | What it holds | Size |
|---|---|---|
| `blockchains/` | Trust Wallet–style token registry: 100 chain folders, **10,234 token assets**, 379 staking validators, 10 tokenlists (+3 extended) | 21,026 files · 346 MB |
| `dapps/` | dApp logos (`<domain>.png`) | 306 PNGs · 6.3 MB |
| `rawfotra/` | RAWFOTRA v6.9 PWA ("Counsel from history's greatest minds"), deployed to Vercel at https://rawfotra.vercel.app | 23 files · 3.1 MB |
| `travelnow/` | TravelNow PWA: a 3D globe showing visa-free travel for 199 passports | 20 files · 1.7 MB |
| `tipclip/` | TipClip: an NFC tipping clip (Node server, static pages, iOS App Clip stub, hardware notes) | 11 files · 96 KB |
| `hormuz-hawk/` | Python bot: OSINT scanner and classifier, eToro trading client with risk and log modules, Flask dashboard | 17 files · 132 KB |
| `cmd/`, `internal/` | Go CLI that validates, fixes and auto-updates the asset registry (`go run ./cmd check`) | 14 Go files |
| `.github/` | 8 workflows, issue templates, validator config (`assets.config.yaml`) | 13 files, plus this map |

**Headline totals**

- **Chains:** 100 folders in total. 36 hold tokens and 16 have validator lists (two more, `ontology` and `vechain`, have empty lists).
- **Tokens:** 10,234. By status: 5,612 active, 4,559 abandoned, 63 spam.
- **Token standards:** 38. The largest are ERC20 (6,721), BEP20 (2,484), BEP2 (199), SPL (152), TRC10 (145), POLYGON (90), ETC20 (84), TRC20 (73) and AVALANCHE (58).
- **Concentration:** Ethereum and BNB Smart Chain together hold 90% of all tokens (9,205 of 10,234).
- **Abandoned tokens:** 4,331 of the 4,559 abandoned tokens are on Ethereum. That is 64% of Ethereum's folder.

## 2. Registry layout

```
blockchains/<chain>/
├── info/info.json + logo.png          # chain metadata (name, symbol, decimals, status, links)
├── assets/<token-id>/info.json + logo.png
│     token-id = contract address (EVM/Tron/Solana…), BEP2 symbol (binance), ESDT id (elrond), asset id (algorand/waves)
├── validators/list.json + assets/<validator-id>/logo.png
├── tokenlist.json                      # curated list used by the wallet
└── tokenlist-extended.json             # (arbitrum/ethereum/optimism only)
dapps/<domain>.png
```

## 3. Every chain

Sorted by token count, then by validator count.

| Chain folder | Name | Symbol | Status | Tokens | Token standard(s) | Active / Abandoned / Spam | Validators | tokenlist |
|---|---|---|---|---:|---|---|---:|---:|
| `ethereum` | Ethereum | ETH | active | 6721 | ERC20 | 2340 / 4331 / 50 | — | 296 (+2 ext) |
| `smartchain` | BNB Smart Chain | BNB | active | 2484 | BEP20 | 2419 / 65 / 0 | — | 66 |
| `tron` | TRON | TRX | active | 218 | TRC10, TRC20 | 71 / 134 / 13 | 11 | — |
| `binance` | BNB Beacon Chain | BNB | active | 199 | BEP2 | 184 / 15 / 0 | 33 | 138 |
| `solana` | Solana | SOL | active | 152 | SPL | 151 / 1 / 0 | 19 | — |
| `polygon` | Polygon | MATIC | active | 90 | POLYGON | 89 / 1 / 0 | — | 8 |
| `classic` | Ethereum Classic | ETC | active | 84 | ETC20 | 83 / 1 / 0 | — | — |
| `avalanchec` | Avalanche C-Chain | AVAX | active | 58 | AVALANCHE | 58 / 0 / 0 | — | 58 |
| `terra` | Terra Classic | LUNC | active | 41 | CW20, TERRA | 41 / 0 / 0 | 13 | — |
| `fantom` | Fantom | FTM | active | 27 | FANTOM | 27 / 0 / 0 | — | 18 |
| `elrond` | Elrond | eGLD | active | 20 | ESDT | 16 / 4 / 0 | — | — |
| `oasis` | Oasis Network | ROSE | abandoned | 18 | OASIS | 18 / 0 / 0 | — | — |
| `thundertoken` | ThunderCore (TT) | TT | active | 16 | TT20 | 16 / 0 / 0 | — | — |
| `heco` | Huobi ECO Chain | HT | active | 13 | HRC20 | 13 / 0 / 0 | — | — |
| `waves` | Waves | WAVES | active | 12 | WAVES | 12 / 0 / 0 | 14 | — |
| `meter` | Meter | MTRG | active | 11 | METER | 11 / 0 / 0 | — | 11 |
| `optimism` | Optimistic Ethereum | OETH | active | 11 | OPTIMISM | 11 / 0 / 0 | — | 6 (+4 ext) |
| `wanchain` | Wanchain | WAN | active | 6 | WAN20 | 6 / 0 / 0 | 1 | — |
| `gochain` | GoChain | GO | active | 6 | GO20 | 3 / 3 / 0 | — | — |
| `tomochain` | TomoChain | TOMO | active | 6 | TRC21 | 2 / 4 / 0 | — | — |
| `xdai` | Gnosis Chain | xDAI | active | 6 | XDAI | 6 / 0 / 0 | — | 4 |
| `arbitrum` | Arbitrum | ARETH | active | 5 | ARBITRUM | 5 / 0 / 0 | — | 5 |
| `celo` | Celo | CELO | active | 5 | CELO | 5 / 0 / 0 | — | — |
| `kava` | Kava | KAVA | active | 4 | KAVA | 4 / 0 / 0 | 30 | — |
| `kcc` | KuCoin Community Chain | KCS | active | 4 | KRC20 | 4 / 0 / 0 | — | — |
| `poa` | POA | POA | active | 3 | POA20 | 3 / 0 / 0 | — | — |
| `ronin` | Ronin | RON | active | 3 | RONIN | 3 / 0 / 0 | — | — |
| `aurora` | Aurora | ETH | active | 2 | AURORA | 2 / 0 / 0 | — | — |
| `neo` | Neo | NEO | active | 2 | NEP5 | 2 / 0 / 0 | — | — |
| `algorand` | Algorand | ALGO | active | 1 | ALGORAND | 1 / 0 / 0 | — | — |
| `eos` | EOS | EOS | active | 1 | EOS | 1 / 0 / 0 | — | — |
| `nuls` | NULS | NULS | active | 1 | NRC20 | 1 / 0 / 0 | — | — |
| `ontology` | Ontology | ONT | active | 1 | ONTOLOGY | 1 / 0 / 0 | — | — |
| `stellar` | Stellar | XLM | active | 1 | STELLAR | 1 / 0 / 0 | — | — |
| `theta` | THETA | THETA | active | 1 | THETA | 1 / 0 / 0 | — | — |
| `vechain` | VeChain | VET | active | 1 | VET | 1 / 0 / 0 | — | — |
| `iotex` | IoTeX | IOTX | active | — | — | — | 70 | — |
| `cosmos` | Cosmos | ATOM | active | — | — | — | 59 | — |
| `tezos` | Tezos | XTZ | active | — | — | — | 35 | — |
| `harmony` | Harmony | ONE | active | — | — | — | 25 | — |
| `polkadot` | Polkadot | DOT | active | — | — | — | 25 | — |
| `loom` | Loom Network | LOOM | abandoned | — | — | — | 20 | — |
| `osmosis` | Osmosis | OSMO | active | — | — | — | 17 | — |
| `nativeevmos` | ⚠️ no info.json | — | — | — | — | — | 5 | — |
| `band` | BandChain | BAND | active | — | — | — | 2 | — |
| `aeternity` | Aeternity | AE | active | — | — | — | — | — |
| `aion` | Aion | AION | active | — | — | — | — | — |
| `ark` | Ark | ARK | abandoned | — | — | — | — | — |
| `aryacoin` | Aryacoin | AYA | abandoned | — | — | — | — | — |
| `avalanchex` | Avalanche X-Chain | AVAX | active | — | — | — | — | — |
| `bitcoin` | Bitcoin | BTC | active | — | — | — | — | — |
| `bitcoincash` | Bitcoin Cash | BCH | active | — | — | — | — | — |
| `bitcoingold` | Bitcoin Gold | BTG | active | — | — | — | — | — |
| `bluzelle` | Bluzelle | BLZ | active | — | — | — | — | — |
| `boba` | Boba | BOBAETH | active | — | — | — | — | — |
| `callisto` | Callisto Network | CLO | active | — | — | — | — | — |
| `cardano` | Cardano | ADA | active | — | — | — | — | — |
| `cronos` | Cronos | CRO | active | — | — | — | — | — |
| `cryptoorg` | Crypto.org | CRO | active | — | — | — | — | — |
| `dash` | Dash | DASH | active | — | — | — | — | — |
| `decred` | Decred | DCR | active | — | — | — | — | — |
| `digibyte` | DigiByte | DGB | active | — | — | — | — | — |
| `doge` | Dogecoin | DOGE | active | — | — | — | — | — |
| `ecash` | eCash | XEC | active | — | — | — | — | — |
| `ellaism` | Ellaism | ELLA | abandoned | — | — | — | — | — |
| `energyweb` | Energy Web Token | EWT | active | — | — | — | — | — |
| `ether-1` | Ether-1 | ETHO | abandoned | — | — | — | — | — |
| `filecoin` | Filecoin | FIL | active | — | — | — | — | — |
| `fio` | FIO Protocol | FIO | active | — | — | — | — | — |
| `firo` | Firo | FIRO | active | — | — | — | — | — |
| `groestlcoin` | Groestlcoin | GRS | active | — | — | — | — | — |
| `icon` | ICON | ICX | active | — | — | — | — | — |
| `iost` | IOST | IOST | abandoned | — | — | — | — | — |
| `kavaevm` | KavaEvm | KAVA | active | — | — | — | — | — |
| `kin` | Kin | KIN | active | — | — | — | — | — |
| `klaytn` | klaytn | KLAY | active | — | — | — | — | — |
| `kusama` | Kusama | KSM | active | — | — | — | — | — |
| `litecoin` | Litecoin | LTC | active | — | — | — | — | — |
| `metis` | Metis | METIS | active | — | — | — | — | — |
| `moonbeam` | Moonbeam | GLMR | active | — | — | — | — | — |
| `moonriver` | Moonriver | MOVR | active | — | — | — | — | — |
| `nano` | Nano | XNO | active | — | — | — | — | — |
| `near` | NEAR Protocol | NEAR | active | — | — | — | — | — |
| `nebulas` | Nebulas | NAS | active | — | — | — | — | — |
| `nervos` | Nervos Network | CKB | abandoned | — | — | — | — | — |
| `nimiq` | Nimiq | NIM | active | — | — | — | — | — |
| `platon` | PlatON | LAT | active | — | — | — | — | — |
| `qtum` | Qtum | QTUM | active | — | — | — | — | — |
| `ravencoin` | Ravencoin | RVN | active | — | — | — | — | — |
| `ripple` | XRP | XRP | active | — | — | — | — | — |
| `smartbch` | smartBCH | BCH | active | — | — | — | — | — |
| `steem` | Steem | STEEM | abandoned | — | — | — | — | — |
| `terrav2` | Terra | LUNA | active | — | — | — | — | — |
| `thorchain` | THORChain | RUNE | active | — | — | — | — | — |
| `ton` | Telegram Open Network | GRAM | abandoned | — | — | — | — | — |
| `viacoin` | Viacoin | VIA | active | — | — | — | — | — |
| `xdc` | XinFin Network | XDC | abandoned | — | — | — | — | — |
| `zcash` | Zcash | ZEC | active | — | — | — | — | — |
| `zelcash` | Flux | FLUX | active | — | — | — | — | — |
| `zilliqa` | Zilliqa | ZIL | active | — | — | — | — | — |

## 4. Validators

| Chain | Validators | Logos with no matching validator |
|---|---:|---:|
| iotex | 70 | 0 |
| cosmos | 59 | 0 |
| tezos | 35 | 0 |
| binance | 33 | 0 |
| kava | 30 | 0 |
| harmony | 25 | 5 |
| polkadot | 25 | 1 |
| loom | 20 | 0 |
| solana | 19 | **29** |
| osmosis | 17 | 0 |
| waves | 14 | 0 |
| terra | 13 | 0 |
| tron | 11 | 0 |
| nativeevmos | 5 | 0 |
| band | 2 | 0 |
| wanchain | 1 | 0 |
| ontology, vechain | 0 (empty `list.json`) | 0 |

Every listed validator has a logo. There are 35 orphan logos: logo folders for validators that no longer appear in `list.json`.

## 5. Data-quality findings

| # | Finding | Count | Where |
|---|---|---:|---|
| 1 | Token folder has `info.json` but no `logo.png` | 89 | smartchain 54, ethereum 26, elrond 4, tron 2, binance/polygon/solana 1 each. The full list is under `issues.asset_missing_logo` in the JSON |
| 2 | Chain folder has no `info/` (no name, symbol or logo) | 1 | `nativeevmos` (it has only 5 validators) |
| 3 | Orphan validator logos | 35 | solana 29, harmony 5, polkadot 1 |
| 4 | Tokens marked `abandoned` | 4,559 | 45% of the registry. They are candidates for pruning |
| 5 | Tokens marked `spam` | 63 | ethereum 50, tron 13 |
| 6 | Chains marked `abandoned` | 11 | ark, aryacoin, ellaism, ether-1, iost, loom, nervos, oasis, steem, ton, xdc. `oasis` still carries 18 active tokens |
| 7 | `go run ./cmd check` fails the root-folder rule | 6 | `rawfotra/`, `travelnow/`, `tipclip/`, `hormuz-hawk/`, `CLAUDE.md`, `vercel.json` are missing from `validators_settings.root_folder.allowed_files` in `.github/assets.config.yaml`. The **Check** workflow will be red on `master` until they are whitelisted or moved |
| 8 | Compiled Python file committed | 1 | `hormuz-hawk/__pycache__/config.cpython-311.pyc` is tracked even though `.gitignore` excludes `__pycache__/` |

Checker run on 2026-10-06: `Total files: 32446, errors: 105`. 99 of those errors were network failures, because `api.assets.trustwallet.com` returned *Bad Gateway* from this environment. The other 6 are finding #7.

## 6. dApps

There are 306 logos named `<domain>.png`, for example `1inch.exchange.png` and `app.uniswap.org.png`. The complete list is in `dapps.files` in the JSON.

## 7. Applications

| App | Stack | Entry points | Deployment |
|---|---|---|---|
| **RAWFOTRA** v6.9 | Vanilla JS PWA with a service worker, an offline consensus engine and optional Claude-powered council | `index.html`, `app.js`, `data/freemasonry-circle.js` (67 members), `eval/` regression fixtures | Vercel: the root `vercel.json` has `outputDirectory: rawfotra`. Also GitHub Pages |
| **TravelNow** | Vanilla JS PWA with a canvas globe | `index.html` (showcase), `app.html`, `data/passports.json`, `data/world.json` | GitHub Pages; has its own `vercel.json` |
| **TipClip** | Node server (payments, SMS, store), static HTML, Swift App Clip | `server/server.js`, `public/*.html`, `ios/TipClipApp.swift` | GitHub Pages (`public/` only) |
| **Hormuz Hawk** | Python | `run.py`, `bot.py`, `osint/`, `trading/`, `dashboard/` | Not deployed by CI; secrets go in `.env` (see `.env.example`) |

## 8. Automation (`.github/workflows`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `check.yml` | push to master | Runs the asset validator |
| `pr-ci.yml` | non-master pushes and PRs | Runs the validator and tests |
| `fix.yml` / `fix-dryrun.yml` | push / PR | Auto-fixers (logo resize, checksum casing, and so on) |
| `periodic-update.yml` | cron 01:00 and 13:00 UTC | External updates (tokenlists and similar) |
| `s3_upload.yml`, `upload-ipfs.yml` | push to master | Publish assets to S3 and IPFS |
| `pages.yml` | changes to the apps | Deploy rawfotra, travelnow and tipclip to GitHub Pages |
