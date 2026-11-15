# Local instruction capture

Requires Node.js 22 or newer; no packages are needed. Start with:

```sh
node server.cjs
# Optional: node server.cjs --port 9000
```

Configure a client intentionally with OpenAI base URL `http://127.0.0.1:8787/v1` or Claude base URL `http://127.0.0.1:8787`. For example, with the server running:

```sh
curl http://127.0.0.1:8787/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"example","messages":[{"role":"system","content":"Synthetic instruction"},{"role":"user","content":"Hello"}]}'
curl http://127.0.0.1:8787/v1/responses -H 'Content-Type: application/json' -d '{"model":"example","instructions":"Synthetic instruction","input":"Hello"}'
curl http://127.0.0.1:8787/v1/messages -H 'Content-Type: application/json' -d '{"model":"example","system":"Synthetic instruction","messages":[{"role":"user","content":"Hello"}]}'
```

Each accepted request writes a JSON file in `captures/` beside the script and returns HTTP 403; no inference or upstream request occurs. Clients may retry 403 responses, producing multiple captures. Files contain sensitive instructions: protect them and remove them when no longer needed. The tool prints filenames, never instruction content. Browser requests from other origins are rejected; CORS is not enabled.
