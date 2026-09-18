package processor

import (
	"os"
	"path/filepath"
	"reflect"
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

func TestValidateChainInfoFile_UsesConfiguredTagsWhenAPIUnavailable(t *testing.T) {
	originalConfig := config.Default
	t.Cleanup(func() {
		config.Default = originalConfig
	})

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}

	repoRoot := filepath.Clean(filepath.Join(wd, "../.."))
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
