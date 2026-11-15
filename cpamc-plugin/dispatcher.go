package main

import (
	"fmt"
	"strings"

	"github.com/MoeForge/moego/base64"
	"github.com/MoeForge/moego/ojson"
	"github.com/router-for-me/CLIProxyAPI/v8/sdk/pluginabi"
)

func success(result string) ([]byte, error) {
	d := ojson.NewDocString(`{"ok":true}`)
	if err := d.SetRaw("result", result); err != nil {
		return nil, err
	}
	return d.Bytes(), nil
}
func handleMethod(method string, request []byte) ([]byte, error) {
	if len(request) > 0 && !ojson.ValidBytes(request) {
		return nil, fmt.Errorf("invalid request")
	}
	r := ojson.ParseBytes(request)
	switch method {
	case pluginabi.MethodPluginRegister, pluginabi.MethodPluginReconfigure:
		if err := configure(method == pluginabi.MethodPluginReconfigure); err != nil {
			return nil, err
		}
		return success(fmt.Sprintf(`{"schema_version":%d,"metadata":{"Name":"replacesystemprompt","Version":"1.0.0","Author":"CLIProxyAPI","GitHubRepository":"https://github.com/router-for-me/CLIProxyAPI"},"capabilities":{"request_normalizer":true,"management_api":true}}`, pluginabi.SchemaVersion))
	case pluginabi.MethodManagementRegister:
		base := strings.TrimRight(r.Get("ResourceBasePath").String(), "/")
		if base == "" {
			return nil, fmt.Errorf("resource base path required")
		}
		path := base + "/form"
		resourceFormPath.Store(&path)
		return success(`{"routes":[{"Method":"GET","Path":"/plugins/replacesystemprompt/rules"},{"Method":"POST","Path":"/plugins/replacesystemprompt/rules"},{"Method":"DELETE","Path":"/plugins/replacesystemprompt/rules"}],"resources":[{"Path":"/form","Menu":"System replacements","Description":"Edit system instruction replacement rules"}]}`)
	case pluginabi.MethodRequestNormalize:
		raw, err := base64.StdEncoding.DecodeString(r.Get("Body").String())
		if err != nil {
			return nil, fmt.Errorf("invalid body")
		}
		result := normalizePayload(raw)
		d := ojson.NewDocString(`{}`)
		if err = d.Set("Body", base64.StdEncoding.EncodeToString(result)); err != nil {
			return nil, err
		}
		return success(d.String())
	case pluginabi.MethodManagementHandle:
		body, err := base64.StdEncoding.DecodeString(r.Get("Body").String())
		if err != nil {
			return nil, fmt.Errorf("invalid body")
		}
		status, content, contentType := managementHandler(r.Get("Method").String(), r.Get("Path").String(), body)
		d := ojson.NewDocString(`{"Headers":{}}`)
		_ = d.Set("StatusCode", status)
		_ = d.Set("Body", base64.StdEncoding.EncodeToString([]byte(content)))
		_ = d.Set("Headers.Content-Type", []string{contentType})
		return success(d.String())
	default:
		return []byte(`{"ok":false,"error":{"code":"unknown_method","message":"unknown method"}}`), nil
	}
}

func normalizePayload(raw []byte) []byte {
	if !ojson.ValidBytes(raw) {
		return raw
	}
	doc := ojson.NewDoc(raw)
	rules := currentRules.Load()
	if rules == nil {
		return raw
	}
	apply := func(path string) {
		v := doc.Get(path)
		if v.Type != ojson.String {
			return
		}
		s := v.String()
		for _, rule := range *rules {
			s = strings.ReplaceAll(s, rule.Match, rule.Replacement)
		}
		_ = doc.Set(path, s)
	}
	for _, prefix := range []string{"", "request."} {
		apply(prefix + "instructions")
		apply(prefix + "system")
		for _, key := range []string{"systemInstruction", "system_instruction"} {
			for i := range doc.Get(prefix + key + ".parts").Array() {
				apply(fmt.Sprintf("%s%s.parts.%d.text", prefix, key, i))
			}
		}
		for i := range doc.Get(prefix + "system").Array() {
			apply(fmt.Sprintf("%ssystem.%d.text", prefix, i))
		}
		for _, key := range []string{"messages", "input"} {
			for i, item := range doc.Get(prefix + key).Array() {
				if role := item.Get("role").String(); role != "system" && role != "developer" {
					continue
				}
				path := fmt.Sprintf("%s%s.%d.content", prefix, key, i)
				apply(path)
				for j, block := range item.Get("content").Array() {
					typ := block.Get("type").String()
					if typ == "text" || typ == "input_text" || typ == "output_text" {
						apply(fmt.Sprintf("%s.%d.text", path, j))
					}
				}
			}
		}
	}
	return doc.Bytes()
}
