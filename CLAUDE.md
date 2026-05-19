# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Trust Wallet's public asset registry. It is **mostly data, not code**: ~100 blockchain directories under `blockchains/`, each holding token `info.json` + `logo.png` files, plus `tokenlist.json`, `tokenlist-extended.json`, validator lists, and dApp logos in `dapps/`. The Go program under `cmd/` and `internal/` exists solely to validate, fix, and auto-update this data. Most PRs touch only JSON/PNG files; code changes are rare.

A separate Python project `hormuz-hawk/` (an OSINT trading bot) was added recently and is unrelated to the assets pipeline — do not lump it together with the Go tooling.

## Commands

The Go tooling is driven through the Makefile. All commands run from repo root.

- `make check` — Run all validators across the tree. This is what CI runs; the same logic gates PRs.
- `make fix` — Apply automatic fixes (JSON reformat, EIP-55 address checksum rename, logo resize/compress, etc.). Safe to run before submitting a PR.
- `make update-auto` — Pull external data (Binance token list etc.). Run by the scheduled `periodic-update.yml` workflow, not normally needed locally.
- `make test` — `go test -race -cover ./...`
- `make lint` — Installs (if missing) and runs `golangci-lint` with the config in `.golangci.yml` (2 min timeout).
- `make fmt` — `gofmt -w` over non-vendor `*.go` files.
- `make all` — `fmt lint test` (does not run `check`).

Single-package / single-test invocation:

```
go test ./internal/processor -run TestName -v
```

Adding entries via the CLI (these wrap `go run cmd/main.go ...`):

- `make add-token asset_id=c60_t0x4Fabb145d64652a948d72533023f6E7A623C7C53` — scaffold `info.json` for an asset (uses `coinID_tAddress` format).
- `make add-tokenlist asset_id=...` / `make add-tokenlist-extended asset_id=...` — append a token to the chain's `tokenlist.json` / `tokenlist-extended.json`. Reads the asset's existing `info.json` and bumps the tokenlist `version.major`.

Global flags accepted by the binary (not commonly needed): `--config` (default `.github/assets.config.yaml`), `--root` (default `.`).

## Data layout the validators enforce

The directory layout is a contract — validators key off path shape, not file contents.

```
blockchains/<chain>/                   # chain name MUST be lowercase
  info/{info.json, logo.png}           # chain-level metadata
  assets/<address>/{info.json, logo.png}
  validators/list.json
  validators/assets/<valoper-id>/logo.png
  tokenlist.json
  tokenlist-extended.json
dapps/<domain>.png                     # all-lowercase .png only
```

For EVM chains (`coin.IsEVM(...)`), `<address>` MUST be the EIP-55 checksummed form. `make fix` will rename a wrongly-cased folder to the correct checksum (`FixETHAddressChecksum`), so prefer running fix over manual renames.

Allowed files at each level are not hardcoded — they come from `.github/assets.config.yaml` under `validators_settings.*.allowed_files`. **If you add a new top-level file or directory, you must whitelist it there** or `make check` will fail repo-wide.

`tokenlist.json` files carry a `version.major` that is incremented whenever the list changes — the `add-tokenlist*` commands handle this; manual edits should bump it too.

## Architecture of the Go tooling

The whole pipeline is three flat lists of functions dispatched by file type. Once you grok this, the rest is mechanical.

1. **`cmd/main.go`** → `manager.InitCommands()` + `manager.Execute()`. Cobra wiring only.

2. **`internal/manager/manager.go`** builds the dependency graph on each command:
   - Reads the config (`internal/config`) into the package-global `config.Default`.
   - Walks the working tree via `assets-go-libs/file.ReadLocalFileStructure`, producing a flat `[]string` of paths.
   - Wires `file.Service` → `processor.Service` → `report.Service` → `service.Service`.

3. **`internal/service/service.go`** is the runner. `RunJob` iterates paths, calls `fileService.GetAssetFile(path)` (which classifies the path into a `file.Type` like `TypeAssetFolder`, `TypeAssetInfoFile`, `TypeChainLogoFile`, ...) and hands the `*AssetFile` to a job function (`Check` or `Fix`). Errors are wrapped through `report.Service` so the whole run completes before failing.

4. **`internal/processor/service.go`** is the dispatch table. `GetValidator(f)`, `GetFixers(f)`, and `GetUpdatersAuto()` each return a `[]Validator` / `[]Fixer` / `[]Updater` based on `f.Type()`. To add a new check, you (a) implement a method on `Service` with signature `func(*file.AssetFile) error` in `validators.go` / `fixers.go`, then (b) register it in the `switch f.Type()` block here. Don't add ad-hoc dispatch elsewhere.

5. **Validators in `internal/processor/validators.go`** delegate the actual rule logic to `github.com/trustwallet/assets-go-libs/validation/*` (the schema/format library lives in that external repo, not here). Composite errors are unwrapped in `service.UnwrapComposite` so each leaf error gets its own log line and increments the failure counter.

6. **`internal/processor/updaters_auto.go`** runs scheduled external pulls (currently `UpdateBinanceTokens`). Updaters are different from validators/fixers — they don't operate on a single file, they take no arg and `Run() error`.

Key external dependency: most of the heavy lifting (file type classification, path conventions, validation schemas, image resizing, JSON formatting, EIP-55, coin registry) is in `github.com/trustwallet/assets-go-libs` and `github.com/trustwallet/go-primitives`. When something looks magic (where does `file.TypeAssetFolder` come from? what does `validation.ValidateAssetRequiredKeys` enforce?), it is in one of those modules, not in this repo.

## CI flow

- `.github/workflows/pr-ci.yml` — runs `make check`, `make test`, `make lint` on every non-master push/PR. This is the gate.
- `.github/workflows/check.yml` — same, on master.
- `.github/workflows/fix.yml` — on push to master/branches in the `trustwallet` org, runs `make fix` and auto-commits the result via `trust-wallet-merge-bot`. On forks it only checks. **Be aware**: editing-then-pushing can produce a follow-up auto-commit that reformats your JSON.
- `.github/workflows/periodic-update.yml` — twice-daily `make update-auto` + auto-commit.

## Conventions worth knowing

- The Go module is `go 1.18`. Stick to APIs available there; don't introduce generics/`slices`/`maps` package usage casually.
- `golangci-lint` config (`.golangci.yml`) forbids `print*` and `fmt.Print*` (`forbidigo`); use `logrus` (already imported as `log`). Function length limit is 60 lines/statements (`funlen`) and complexity caps are tight — split rather than fight the linter.
- `config.Default` is an intentionally global singleton (`// nolint:gochecknoglobals`). Don't try to refactor it away.
- JSON files in `blockchains/*/` are formatted by `file.FormatJSONFile` (4-space indent, sorted/structured per the model). Run `make fix` rather than hand-formatting.
- Logos: PNGs only; `FixLogo` resizes/compresses against limits in `assets-go-libs/image`. If a logo check fails, run `make fix` before tweaking by hand.
