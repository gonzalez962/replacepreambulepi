package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/MoeForge/moego/ojson"
)

type rule struct {
	Match       string
	Replacement string
}

var currentRules atomic.Pointer[[]rule]
var stateMu sync.Mutex
var rulesPath string

func configure(reconfigure bool) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	dir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("cannot select rules directory")
	}
	for _, candidate := range []string{filepath.Join(dir, "plugins"), "/CLIProxyAPI/plugins"} {
		info, statErr := os.Stat(candidate)
		if statErr == nil && info.IsDir() {
			dir = candidate
			break
		}
		if statErr != nil && !os.IsNotExist(statErr) {
			return fmt.Errorf("cannot select rules directory")
		}
	}
	path := filepath.Join(dir, "replacesystemprompt-rules.json")
	if reconfigure && rulesPath == path && currentRules.Load() != nil {
		return nil
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		file, createErr := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if createErr != nil {
			return fmt.Errorf("cannot create rules")
		}
		_, writeErr := file.Write([]byte("[]"))
		closeErr := file.Close()
		if writeErr != nil || closeErr != nil {
			return fmt.Errorf("cannot create rules")
		}
		data = []byte("[]")
		err = nil
	}
	if err != nil {
		return fmt.Errorf("cannot load rules")
	}
	rules := []rule{}
	if err == nil {
		if !ojson.ValidBytes(data) {
			return fmt.Errorf("invalid rules file")
		}
		parsed := ojson.ParseBytes(data)
		if !parsed.IsArray() {
			return fmt.Errorf("invalid rules file")
		}
		seen := make(map[string]bool)
		for _, v := range parsed.Array() {
			if v.Get("match").Type != ojson.String || v.Get("match").String() == "" || v.Get("replacement").Type != ojson.String || seen[v.Get("match").String()] {
				return fmt.Errorf("invalid rules file")
			}
			seen[v.Get("match").String()] = true
			rules = append(rules, rule{v.Get("match").String(), v.Get("replacement").String()})
		}
	}
	rulesPath = path
	currentRules.Store(&rules)
	return nil
}

func rulesJSON(rules []rule) string {
	d := ojson.NewDocString(`[]`)
	for i, r := range rules {
		_ = d.Set(fmt.Sprintf("%d.match", i), r.Match)
		_ = d.Set(fmt.Sprintf("%d.replacement", i), r.Replacement)
	}
	return d.String()
}

func update(method string, body []byte) (int, string) {
	if !ojson.ValidBytes(body) {
		return 400, `{"error":"invalid rule"}`
	}
	r := ojson.ParseBytes(body)
	match := r.Get("match")
	replacement := r.Get("replacement")
	if match.Type != ojson.String || match.String() == "" || (method == "POST" && replacement.Type != ojson.String) {
		return 400, `{"error":"invalid rule"}`
	}
	stateMu.Lock()
	defer stateMu.Unlock()
	old := currentRules.Load()
	if old == nil {
		return 500, `{"error":"not configured"}`
	}
	next := append([]rule{}, (*old)...)
	if method == "POST" {
		for _, existing := range next {
			if existing.Match == match.String() {
				return 409, `{"error":"duplicate match"}`
			}
		}
		next = append(next, rule{match.String(), replacement.String()})
	} else {
		found := false
		for i, v := range next {
			if v.Match == match.String() {
				next = append(next[:i], next[i+1:]...)
				found = true
				break
			}
		}
		if !found {
			return 404, `{"error":"rule not found"}`
		}
	}
	if err := persist(rulesPath, []byte(rulesJSON(next))); err != nil {
		return 500, `{"error":"cannot save rules"}`
	}
	currentRules.Store(&next)
	return 200, rulesJSON(next)
}
func persist(path string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".replacesystemprompt-*.tmp")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}
