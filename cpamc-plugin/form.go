package main

import (
	_ "embed"
	"strings"
	"sync/atomic"
)

var resourceFormPath atomic.Pointer[string]

const managementRulesRoute = "/v0/management/plugins/replacesystemprompt/rules"

//go:embed form.html
var formHTML string

func managementHandler(method, path string, body []byte) (int, string, string) {
	registered := resourceFormPath.Load()
	if method == "GET" && registered != nil && path == *registered {
		return 200, formHTML, "text/html; charset=utf-8"
	}
	if strings.TrimRight(path, "/") != managementRulesRoute {
		return 404, `{"error":"not found"}`, "application/json"
	}
	switch method {
	case "GET":
		p := currentRules.Load()
		if p == nil {
			return 500, `{"error":"not configured"}`, "application/json"
		}
		return 200, rulesJSON(*p), "application/json"
	case "POST", "DELETE":
		status, result := update(method, body)
		return status, result, "application/json"
	}
	return 405, `{"error":"method not allowed"}`, "application/json"
}
