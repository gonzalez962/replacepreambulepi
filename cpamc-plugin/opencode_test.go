package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestOpenCodeNormalizationFixtures(t *testing.T) {
	for _, name := range []string{"chat-completions", "responses"} {
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("testdata", "opencode", name+".json"))
			if err != nil {
				t.Fatal(err)
			}
			var fixture struct {
				Format   string
				Input    json.RawMessage
				Expected json.RawMessage
			}
			if err := json.Unmarshal(data, &fixture); err != nil {
				t.Fatal(err)
			}
			for _, tc := range []struct {
				name  string
				rules []string
				want  json.RawMessage
			}{
				{name: "empty rules", want: fixture.Input},
				{
					name: "ordered literal rules",
					rules: []string{
						`{"match":"fixture-original","replacement":"fixture-intermediate"}`,
						`{"match":"fixture-intermediate","replacement":"fixture-normalized"}`,
						`{"match":"fixture-delete","replacement":""}`,
					},
					want: fixture.Expected,
				},
			} {
				t.Run(tc.name, func(t *testing.T) {
					root := t.TempDir()
					pluginsDir := filepath.Join(root, "plugins")
					if err := os.Mkdir(pluginsDir, 0700); err != nil {
						t.Fatal(err)
					}
					configureForTest(t, filepath.Join(root, "rules.json"))
					rulesFile := filepath.Join(pluginsDir, "replacesystemprompt-rules.json")
					for _, rule := range tc.rules {
						edit(t, "POST", rule, true)
					}
					before, err := os.ReadFile(rulesFile)
					if err != nil {
						t.Fatal(err)
					}
					request, err := json.Marshal(map[string]string{
						"FromFormat": fixture.Format,
						"ToFormat":   fixture.Format,
						"Body":       encoded(string(fixture.Input)),
					})
					if err != nil {
						t.Fatal(err)
					}
					result := rpc(t, "request.normalize", string(request))
					body, err := base64.StdEncoding.DecodeString(result.Get("Body").String())
					if err != nil {
						t.Fatal(err)
					}
					var got, want any
					if err := json.Unmarshal(body, &got); err != nil {
						t.Fatal(err)
					}
					if err := json.Unmarshal(tc.want, &want); err != nil {
						t.Fatal(err)
					}
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("normalized request differs from fixture expectation:\ngot: %s\nwant: %s", body, tc.want)
					}
					after, err := os.ReadFile(rulesFile)
					if err != nil {
						t.Fatal(err)
					}
					if !bytes.Equal(before, after) {
						t.Fatal("normalization changed persisted rules")
					}
				})
			}
		})
	}
}
