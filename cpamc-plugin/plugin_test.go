package main

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/MoeForge/moego/base64"
	"github.com/MoeForge/moego/ojson"
)

// These tests exercise the same JSON RPC dispatcher used by the native ABI.
func rpc(t *testing.T, method, request string) ojson.Result {
	t.Helper()
	raw, err := handleMethod(method, []byte(request))
	if err != nil {
		t.Fatalf("%s: %v", method, err)
	}
	if !ojson.ValidBytes(raw) {
		t.Fatalf("%s returned invalid JSON: %s", method, raw)
	}
	result := ojson.ParseBytes(raw)
	if !result.Get("ok").Bool() {
		t.Fatalf("%s failed: %s", method, raw)
	}
	return result.Get("result")
}

func encoded(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func configureForTest(t *testing.T, path string) {
	t.Helper()
	t.Chdir(filepath.Dir(path))
	rpc(t, "plugin.register", `{}`)
}

func management(t *testing.T, method, path, body string) (int, string) {
	t.Helper()
	doc := ojson.NewDocString(`{}`)
	for key, value := range map[string]string{"Method": method, "Path": path, "Body": encoded(body)} {
		if err := doc.Set(key, value); err != nil {
			t.Fatal(err)
		}
	}
	result := rpc(t, "management.handle", doc.String())
	decoded, err := base64.StdEncoding.DecodeString(result.Get("Body").String())
	if err != nil {
		t.Fatal(err)
	}
	return int(result.Get("StatusCode").Int()), string(decoded)
}

const rulesRoute = "/v0/management/plugins/replacesystemprompt/rules"
const formRoute = "/v0/resource/plugins/replacesystemprompt/form"

func edit(t *testing.T, method, body string, wantSuccess bool) {
	t.Helper()
	status, response := management(t, method, rulesRoute, body)
	if (status >= 200 && status < 300) != wantSuccess {
		t.Fatalf("%s %s: status %d, body %s", method, rulesRoute, status, response)
	}
}

func normalize(t *testing.T, format, body string) ojson.Result {
	t.Helper()
	doc := ojson.NewDocString(`{}`)
	if err := doc.Set("FromFormat", format); err != nil {
		t.Fatal(err)
	}
	if err := doc.Set("ToFormat", format); err != nil {
		t.Fatal(err)
	}
	if err := doc.Set("Body", encoded(body)); err != nil {
		t.Fatal(err)
	}
	result := rpc(t, "request.normalize", doc.String())
	decoded, err := base64.StdEncoding.DecodeString(result.Get("Body").String())
	if err != nil || !ojson.ValidBytes(decoded) {
		t.Fatalf("invalid normalized body %q: %v", decoded, err)
	}
	return ojson.ParseBytes(decoded)
}

func TestScenarios(t *testing.T) {
	t.Run("S6.1", func(t *testing.T) {
		configureForTest(t, filepath.Join(t.TempDir(), "rules.json"))
		for _, base := range []string{"/v0/resource/plugins/replacesystemprompt-linux-amd64", "/v0/resource/plugins/replacesystemprompt"} {
			doc := ojson.NewDocString(`{}`)
			if err := doc.Set("ResourceBasePath", base); err != nil {
				t.Fatal(err)
			}
			rpc(t, "management.register", doc.String())
			status, html := management(t, "GET", base+"/form", "")
			if status != 200 || !strings.Contains(html, "<form") {
				t.Errorf("GET %s/form: status %d body %s", base, status, html)
			}
			for _, tc := range []struct{ method, path string }{{"GET", base + "/other"}, {"GET", "/v0/resource/plugins/other/form"}, {"POST", base + "/form"}} {
				if status, _ := management(t, tc.method, tc.path, ""); status != 404 {
					t.Errorf("%s %s: status %d", tc.method, tc.path, status)
				}
			}
		}
		edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
		edit(t, "DELETE", `{"match":"alpha"}`, true)
	})
	t.Run("S5.1", func(t *testing.T) {
		configureForTest(t, filepath.Join(t.TempDir(), "rules.json"))
		for _, method := range []string{"plugin.register", "plugin.reconfigure"} {
			t.Run(method, func(t *testing.T) {
				reg := rpc(t, method, `{}`)
				for _, field := range []string{"Name", "Version", "Author", "GitHubRepository"} {
					if strings.TrimSpace(reg.Get("metadata."+field).String()) == "" {
						t.Errorf("metadata.%s is blank", field)
					}
				}
				if got := reg.Get("metadata.GitHubRepository").String(); got != "https://github.com/router-for-me/CLIProxyAPI" {
					t.Errorf("repository = %q", got)
				}
				if !reg.Get("capabilities.request_normalizer").Bool() {
					t.Error("missing request normalizer capability")
				}
			})
		}
	})
	t.Run("S2.3", func(t *testing.T) {
		root := t.TempDir()
		t.Chdir(root)
		if err := os.Mkdir("plugins", 0700); err != nil {
			t.Fatal(err)
		}
		rpc(t, "plugin.register", `{}`)
		path := filepath.Join(root, "plugins", "replacesystemprompt-rules.json")
		data, err := os.ReadFile(path)
		if err != nil || string(data) != "[]" {
			t.Fatalf("initial rules = %q, error %v", data, err)
		}
		edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
		rpc(t, "plugin.register", `{}`)
		if got := normalize(t, "openai", `{"messages":[{"role":"system","content":"alpha"}]}`).Get("messages.0.content").String(); got != "beta" {
			t.Fatalf("reload = %q", got)
		}
	})
	t.Run("S1.1", func(t *testing.T) {
		configureForTest(t, filepath.Join(t.TempDir(), "rules.json"))
		edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
		edit(t, "POST", `{"match":"beta!","replacement":""}`, true)
		cases := []struct{ name, format, body, path, want string }{
			{"chat system", "openai", `{"messages":[{"role":"system","content":"alpha! Alpha"},{"role":"developer","content":[{"type":"text","text":"alpha!"}]},{"role":"user","content":"alpha!"},{"role":"tool","content":"alpha!"}]}`, "messages.0.content", " Alpha"},
			{"responses input", "openai-response", `{"input":[{"role":"system","content":"alpha!"},{"role":"developer","content":[{"type":"input_text","text":"alpha!"}]},{"role":"user","content":"alpha!"}]}`, "input.0.content", ""},
			{"gemini snake wrapper", "gemini", `{"request":{"system_instruction":{"parts":[{"text":"alpha!"}]},"contents":[{"role":"user","parts":[{"text":"alpha!"}]}]}}`, "request.system_instruction.parts.0.text", ""},
			{"responses instructions", "openai-response", `{"instructions":"alpha!","input":[{"role":"user","content":"alpha!"}]}`, "instructions", ""},
			{"claude system", "claude", `{"system":[{"type":"text","text":"alpha!"}],"messages":[{"role":"user","content":"alpha!"}]}`, "system.0.text", ""},
			{"gemini system", "gemini", `{"systemInstruction":{"parts":[{"text":"alpha!"}]},"contents":[{"role":"user","parts":[{"text":"alpha!"}]}]}`, "systemInstruction.parts.0.text", ""},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				got := normalize(t, tc.format, tc.body)
				if value := got.Get(tc.path).String(); value != tc.want {
					t.Errorf("instruction = %q, want %q", value, tc.want)
				}
				switch tc.name {
				case "chat system":
					for path, want := range map[string]string{"messages.1.content.0.text": "", "messages.2.content": "alpha!", "messages.3.content": "alpha!"} {
						if value := got.Get(path).String(); value != want {
							t.Errorf("%s = %q, want %q", path, value, want)
						}
					}
				case "responses input":
					if got.Get("input.1.content.0.text").String() != "" || got.Get("input.2.content").String() != "alpha!" {
						t.Error("responses roles changed incorrectly")
					}
				case "gemini snake wrapper":
					if got.Get("request.contents.0.parts.0.text").String() != "alpha!" {
						t.Error("user content changed")
					}
				case "responses instructions":
					if got.Get("input.0.content").String() != "alpha!" {
						t.Error("user content changed")
					}
				case "claude system":
					if got.Get("messages.0.content").String() != "alpha!" {
						t.Error("user content changed")
					}
				case "gemini system":
					if got.Get("contents.0.parts.0.text").String() != "alpha!" {
						t.Error("user content changed")
					}
				}
			})
		}
	})
	t.Run("S2.1", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "replacesystemprompt-rules.json")
		configureForTest(t, path)
		body := `{"messages":[{"role":"system","content":"alpha"}]}`
		check := func(want string) {
			t.Helper()
			if got := normalize(t, "openai", body).Get("messages.0.content").String(); got != want {
				t.Fatalf("got %q, want %q", got, want)
			}
		}
		check("alpha")
		edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
		check("beta")
		rpc(t, "plugin.reconfigure", `{}`)
		check("beta")
		configureForTest(t, path)
		check("beta")
		edit(t, "DELETE", `{"match":"alpha"}`, true)
		check("alpha")
		configureForTest(t, path)
		check("alpha")
	})
	t.Run("S2.2", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "replacesystemprompt-rules.json")
		configureForTest(t, path)
		edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
		before, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		edit(t, "POST", `{"match":"","replacement":"bad"}`, false)
		after, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if string(before) != string(after) {
			t.Fatal("invalid edit changed persisted rules")
		}
		if got := normalize(t, "openai", `{"messages":[{"role":"system","content":"alpha"}]}`).Get("messages.0.content").String(); got != "beta" {
			t.Fatalf("invalid edit changed active rules: %q", got)
		}
		t.Run("duplicate match", func(t *testing.T) {
			status, response := management(t, "POST", rulesRoute, `{"match":"alpha","replacement":"different"}`)
			if status != 409 || response != `{"error":"duplicate match"}` {
				t.Errorf("duplicate: status %d body %s", status, response)
			}
			after, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if string(before) != string(after) {
				t.Error("duplicate changed stored rules")
			}
			if got := normalize(t, "openai", `{"messages":[{"role":"system","content":"alpha different"}]}`).Get("messages.0.content").String(); got != "beta different" {
				t.Errorf("duplicate changed active rules: %q", got)
			}
		})
		t.Run("duplicate persisted rules", func(t *testing.T) {
			root := t.TempDir()
			t.Chdir(root)
			if err := os.Mkdir("plugins", 0700); err != nil {
				t.Fatal(err)
			}
			badPath := filepath.Join(root, "plugins", "replacesystemprompt-rules.json")
			bad := `[{"match":"x","replacement":"y"},{"match":"x","replacement":"z"}]`
			if err := os.WriteFile(badPath, []byte(bad), 0600); err != nil {
				t.Fatal(err)
			}
			_, err := handleMethod("plugin.register", []byte(`{}`))
			if err == nil {
				t.Error("duplicate persisted rules accepted")
			}
			if got := normalize(t, "openai", `{"messages":[{"role":"system","content":"alpha"}]}`).Get("messages.0.content").String(); got != "beta" {
				t.Errorf("failed load changed active rules: %q", got)
			}
			after, err := os.ReadFile(badPath)
			if err != nil || string(after) != bad {
				t.Errorf("failed load changed file: %s %v", after, err)
			}
		})
		t.Run("persistence failure", func(t *testing.T) {
			root := t.TempDir()
			t.Chdir(root)
			if err := os.Mkdir("plugins", 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(filepath.Join("plugins", "replacesystemprompt-rules.json"), 0700); err != nil {
				t.Fatal(err)
			}
			if _, err := handleMethod("plugin.register", []byte(`{}`)); err == nil {
				t.Fatal("invalid target accepted")
			}
			if _, err := os.Stat("replacesystemprompt-rules.json"); !os.IsNotExist(err) {
				t.Fatalf("unexpected fallback: %v", err)
			}
		})
	})
	t.Run("S2.2_existing_file_failure", func(t *testing.T) {
		root := t.TempDir()
		dir := filepath.Join(root, "data")
		t.Chdir(root)
		dir = filepath.Join(root, "plugins")
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dir, "replacesystemprompt-rules.json")
		rpc(t, "plugin.register", `{}`)
		edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
		before, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		moved := filepath.Join(root, "saved")
		if err := os.Rename(dir, moved); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Remove(dir); _ = os.Rename(moved, dir) })
		if err := os.WriteFile(dir, []byte("block"), 0600); err != nil {
			t.Fatal(err)
		}
		edit(t, "POST", `{"match":"beta","replacement":"bad"}`, false)
		after, err := os.ReadFile(filepath.Join(moved, "replacesystemprompt-rules.json"))
		if err != nil {
			t.Fatal(err)
		}
		if string(before) != string(after) {
			t.Fatal("failed persistence changed saved rules")
		}
		if got := normalize(t, "openai", `{"messages":[{"role":"system","content":"alpha"}]}`).Get("messages.0.content").String(); got != "beta" {
			t.Fatalf("active rule changed: %q", got)
		}
	})
	t.Run("S2.1_concurrent", func(t *testing.T) {
		configureForTest(t, filepath.Join(t.TempDir(), "rules.json"))
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			for i := 0; i < 30; i++ {
				edit(t, "POST", `{"match":"alpha","replacement":"beta"}`, true)
				edit(t, "DELETE", `{"match":"alpha"}`, true)
			}
		}()
		go func() {
			defer wg.Done()
			for i := 0; i < 100; i++ {
				got := normalize(t, "openai", `{"messages":[{"role":"system","content":"alpha"}]}`).Get("messages.0.content").String()
				if got != "alpha" && got != "beta" {
					t.Errorf("inconsistent snapshot: %q", got)
					return
				}
			}
		}()
		wg.Wait()
	})
	t.Run("S3.1", func(t *testing.T) {
		configureForTest(t, filepath.Join(t.TempDir(), "rules.json"))
		rpc(t, "management.register", `{"ResourceBasePath":"/v0/resource/plugins/replacesystemprompt"}`)
		status, html := management(t, "GET", formRoute, "")
		if status != 200 {
			t.Fatalf("form status = %d", status)
		}
		for _, part := range []string{"<form", "match", "replacement", "POST", "DELETE", rulesRoute} {
			if !strings.Contains(html, part) {
				t.Errorf("form missing %q", part)
			}
		}
		edit(t, "POST", `{"match":"private-marker","replacement":"private-value"}`, true)
		_, html = management(t, "GET", formRoute, "")
		if strings.Contains(html, "private-marker") || strings.Contains(html, "private-value") {
			t.Error("public form exposes stored rules")
		}
	})
	t.Run("S4.1", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "rules.json")
		configureForTest(t, path)
		reg := rpc(t, "plugin.register", `{}`)
		if !reg.Get("capabilities.request_normalizer").Bool() || !reg.Get("capabilities.management_api").Bool() {
			t.Fatalf("missing capabilities: %s", reg.Raw)
		}
		if reg.Get("metadata.Name").String() == "" {
			t.Fatal("missing plugin name")
		}
		routes := rpc(t, "management.register", `{"BasePath":"/v0/management","ResourceBasePath":"/v0/resource/plugins/replacesystemprompt"}`)
		if !strings.Contains(routes.Raw, "resources") || !strings.Contains(routes.Raw, "routes") {
			t.Fatalf("missing resource or management routes: %s", routes.Raw)
		}
	})
}
