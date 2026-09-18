package processor

import (
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	assetfile "github.com/trustwallet/assets-go-libs/file"
	"github.com/trustwallet/assets/internal/config"
)

func Test_getConfiguredTagIDs(t *testing.T) {
	tests := []struct {
		name string
		tags []config.Tag
		want []string
	}{
		{
			name: "valid tags",
			tags: []config.Tag{
				{ID: "defi"},
				{ID: "staking-native"},
			},
			want: []string{"defi", "staking-native"},
		},
		{
			name: "skip empty ids",
			tags: []config.Tag{
				{ID: ""},
				{ID: "defi"},
				{ID: ""},
			},
			want: []string{"defi"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getConfiguredTagIDs(tt.tags)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("getConfiguredTagIDs() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_mergeTagIDs(t *testing.T) {
	tests := []struct {
		name         string
		primaryTags  []string
		fallbackTags []string
		want         []string
	}{
		{
			name:         "keeps primary order and appends missing fallback tags",
			primaryTags:  []string{"a", "b"},
			fallbackTags: []string{"b", "c"},
			want:         []string{"a", "b", "c"},
		},
		{
			name:         "skips empty tags",
			primaryTags:  []string{"", "a"},
			fallbackTags: []string{"", "a", "b"},
			want:         []string{"a", "b"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mergeTagIDs(tt.primaryTags, tt.fallbackTags)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("mergeTagIDs() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateChainInfoFile_UsesConfiguredTagsWhenAPIUnavailable(t *testing.T) {
	originalConfig := config.Default
	t.Cleanup(func() {
		config.Default = originalConfig
	})

	repoRoot := getRepositoryRoot(t)
	if err := config.SetConfig(filepath.Join(repoRoot, ".github/assets.config.yaml")); err != nil {
		t.Fatalf("failed to set config: %v", err)
	}

	config.Default.ClientURLs.AssetsManagerAPI = "http://127.0.0.1:1"

	service := NewService(assetfile.NewService())
	chainInfoFile := assetfile.NewAssetFile(filepath.Join(repoRoot, "blockchains/cosmos/info/info.json"))

	if err := service.ValidateChainInfoFile(chainInfoFile); err != nil {
		t.Fatalf("ValidateChainInfoFile() error = %v, want nil", err)
	}
}

func TestValidateChainInfoFile_ReturnsErrorWhenAPIUnavailableAndNoFallbackTags(t *testing.T) {
	originalConfig := config.Default
	t.Cleanup(func() {
		config.Default = originalConfig
	})

	repoRoot := getRepositoryRoot(t)
	if err := config.SetConfig(filepath.Join(repoRoot, ".github/assets.config.yaml")); err != nil {
		t.Fatalf("failed to set config: %v", err)
	}

	config.Default.ClientURLs.AssetsManagerAPI = "http://127.0.0.1:1"
	config.Default.ValidatorsSettings.CoinInfoFile.Tags = nil

	service := NewService(assetfile.NewService())
	chainInfoFile := assetfile.NewAssetFile(filepath.Join(repoRoot, "blockchains/cosmos/info/info.json"))

	err := service.ValidateChainInfoFile(chainInfoFile)
	if err == nil {
		t.Fatal("ValidateChainInfoFile() error = nil, want non-nil")
	}
	if !strings.Contains(err.Error(), "failed to get tag values") {
		t.Fatalf("ValidateChainInfoFile() error = %v, want to contain %q", err, "failed to get tag values")
	}
}

func getRepositoryRoot(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("failed to resolve current file path")
	}

	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "../.."))
}
