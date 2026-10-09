#! /usr/bin/make -f


# Go related variables.
GOBASE := $(shell pwd)
GOBIN := $(GOBASE)/bin


# Go files.
GOFMT_FILES?=$$(find . -name '*.go' | grep -v vendor)


# Common commands.
all: fmt lint test

test:
	@echo "  >  Running unit tests"
	GOBIN=$(GOBIN) go test -cover -race -coverprofile=coverage.txt -covermode=atomic -v ./...

fmt:
	@echo "  >  Format all go files"
	GOBIN=$(GOBIN) gofmt -w ${GOFMT_FILES}

# Pinned: the unpinned install script pulls the latest golangci-lint, and
# current v2.x releases are incompatible with this repo's Go 1.18 CI and
# v1-format .golangci.yml (v2.14.0 also fails the installer's checksum).
# The release tarball is fetched directly because the install script no
# longer resolves tags this old.
GOLANGCI_LINT_VERSION := 1.46.2

lint-install:
ifeq (,$(wildcard test -f bin/golangci-lint))
	@echo "  >  Installing golint"
	mkdir -p bin
	curl -sSfL https://github.com/golangci/golangci-lint/releases/download/v$(GOLANGCI_LINT_VERSION)/golangci-lint-$(GOLANGCI_LINT_VERSION)-linux-amd64.tar.gz \
		| tar -xz -C bin --strip-components=1 golangci-lint-$(GOLANGCI_LINT_VERSION)-linux-amd64/golangci-lint
endif

lint: lint-install
	@echo "  >  Running golint"
	bin/golangci-lint run --timeout=2m


# Assets commands.
check:
	go run cmd/main.go check

fix:
	go run cmd/main.go fix

update-auto:
	go run cmd/main.go update-auto

update-manual:
	go run cmd/main.go update-manual


# Helper commands.
add-token:
	go run cmd/main.go add-token $(asset_id)

add-tokenlist:
	go run cmd/main.go add-tokenlist $(asset_id)

add-tokenlist-extended:
	go run cmd/main.go add-tokenlist-extended $(asset_id)
