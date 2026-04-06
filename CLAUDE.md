# CLAUDE.md — Trust Wallet Assets Repository

## Project Overview

Trust Wallet Assets is a community-maintained repository of cryptocurrency token metadata, blockchain information, and dApp logos used by Trust Wallet and other projects. It contains logos, metadata (info.json), and token lists for 100+ blockchains and 300+ dApps.

## Repository Structure

```
blockchains/          # Per-chain directories (ethereum/, bitcoin/, solana/, etc.)
  <chain>/
    assets/           # Token directories keyed by contract address
      <address>/
        info.json     # Token metadata (name, symbol, decimals, type, status, links)
        logo.png      # Token logo image
    info/             # Chain-level metadata
      info.json       # Chain info (name, symbol, explorer, etc.)
      logo.png        # Chain logo
    validators/       # Staking validator info (staking chains only)
    tokenlist.json    # Standard token list with trading pairs
    tokenlist-extended.json
dapps/                # dApp logos as <domain>.png (e.g., aave.com.png)
cmd/                  # CLI entry point (main.go)
internal/             # Core Go packages
  config/             # Configuration, validation rules, staking chain definitions
  manager/            # CLI command definitions (cobra)
  processor/          # Validators, fixers, and auto-updaters
  service/            # Job execution engine
  report/             # Error counting and reporting
.github/
  workflows/          # 7 CI/CD workflows (check, fix, periodic-update, etc.)
  assets.config.yaml  # Validation and runtime configuration
```

## Language & Build

- **Go 1.18** — module path: `github.com/trustwallet/assets`
- Key dependencies: `trustwallet/assets-go-libs`, `trustwallet/go-libs`, `trustwallet/go-primitives`, `cobra`, `logrus`

## Common Commands

```sh
make check           # Validate entire repository (runs in CI)
make fix             # Auto-fix issues (JSON formatting, checksums, logo resizing)
make test            # Run unit tests
make lint            # Run golangci-lint (23 linters)
make fmt             # Format Go code
make update-auto     # Fetch external updates (Binance tokens, token lists)
make add-token asset_id=c60_t0x...         # Create token info.json template
make add-tokenlist asset_id=c60_t0x...     # Add token to tokenlist.json
```

## Validation Pipeline

Files are processed through type-based validators defined in `internal/processor/validators.go`:

- **JSON** — syntax validation
- **Asset folders** — allowed files (logo.png, info.json), address format per chain
- **Chain folders** — lowercase naming, allowed subdirectories
- **Images** — file size limits, PNG dimensions
- **Asset info.json** — structure, required fields, tag values from API
- **Token lists** — format, no duplicates between tokenlist.json and tokenlist-extended.json
- **Validators list** — format, asset folder existence (staking chains only)
- **Dapps** — PNG extension, lowercase filenames

Automatic fixers (`internal/processor/fixers.go`): JSON reformatting, EIP-55 address checksums, logo resizing, asset metadata correction, chain type normalization.

## Linting Rules

Configured in `.golangci.yml`:
- Line length limit: 120 characters
- Cyclomatic complexity max: 20
- Cognitive complexity max: 35
- Function length: 60 lines/statements
- Duplicate threshold: 100 lines
- Local import prefix: `github.com/trustwallet`
- go-fumpt formatting with extra rules

## CI/CD Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| `check.yml` | Push to master | `make check`, `make test`, `make lint` |
| `fix.yml` | Push to master | `make fix`, auto-commit fixes |
| `periodic-update.yml` | Cron (1:00, 13:00 UTC) | `make update-auto`, auto-commit |
| `pr-ci.yml` | Pull requests | PR-specific validation |
| `fix-dryrun.yml` | Various | Dry-run fix testing |
| `s3_upload.yml` | Various | Upload assets to S3 |
| `upload-ipfs.yml` | Various | Upload to IPFS |

## Data Conventions

### Asset info.json schema
```json
{
  "name": "TokenName",
  "website": "https://...",
  "description": "...",
  "explorer": "https://etherscan.io/token/0x...",
  "type": "ERC20",
  "symbol": "TKN",
  "decimals": 18,
  "status": "active",
  "id": "0x...",
  "tags": ["stablecoin"],
  "links": [{"name": "twitter", "url": "https://..."}]
}
```

### Chain info.json schema
```json
{
  "name": "Ethereum",
  "website": "https://ethereum.org/",
  "description": "...",
  "explorer": "https://etherscan.io/",
  "symbol": "ETH",
  "type": "coin",
  "decimals": 18,
  "status": "active",
  "links": [{"name": "github", "url": "..."}]
}
```

### dApp logos
- Filename: `<domain>.png` (lowercase, e.g., `app.1inch.io.png`)
- Format: PNG, 200x200 pixels

### Staking chains
Tezos, Cosmos, IoTeX, Tron, Waves, Kava, Terra, Binance — defined in `internal/config/values.go`.

## Testing

- Unit tests use table-driven pattern (see `internal/processor/updaters_auto_test.go`)
- Primary validation is integration-level via `make check`
- Run `make test` before committing Go changes

## Key Conventions for AI Assistants

1. **Never modify token/chain data files without explicit request** — the blockchains/ and dapps/ directories contain community-contributed data
2. **Run `make check` after any structural changes** to verify validation passes
3. **Run `make lint` after Go code changes** — the linter configuration is strict
4. **EVM addresses must use EIP-55 checksums** — the fixer handles this but be aware
5. **All JSON must be consistently formatted** — `make fix` normalizes formatting
6. **Logo images must be PNG** and within size/dimension limits enforced by validators
7. **Go code style**: follow existing patterns — cobra CLI, logrus logging, composite error handling, type-switch based processor dispatch
8. **Import ordering**: standard library, then external, then `github.com/trustwallet` local imports
9. **Configuration lives in `.github/assets.config.yaml`** — validation rules, API URLs, folder structure definitions
