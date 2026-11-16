import assert from "node:assert/strict";
import { mock, test } from "node:test";
import plugin from "./server.ts";

async function load(options = {}) {
	let handler;
	let disposed = false;
	const cleanup = await plugin.setup({
		options,
		session: {
			async hook(name, callback) {
				assert.equal(name, "context");
				handler = callback;
				return { async dispose() { disposed = true; } };
			},
		},
	});
	assert.equal(plugin.id, "replacesystemprompt");
	assert.equal(typeof handler, "function");
	return { handler, cleanup, disposed: () => disposed };
}

test("applies ordered, case-sensitive literal rules only to system text", async () => {
	const { handler, cleanup, disposed } = await load({ rules: [
		{ match: "original", replacement: "intermediate" },
		{ match: "intermediate", replacement: "normalized" },
		{ match: "delete-me", replacement: "" },
		{ match: "literal", replacement: "$& $$ $` $'" },
	] });
	const event = {
		system: [
			{ type: "text", text: "original original delete-me Original", cache: { type: "ephemeral" }, metadata: { source: "original" } },
			{ type: "text", text: "Project: original; literal" },
			{ type: "text", text: "untouched" },
		],
		messages: [{ role: "user", content: "original" }, { role: "assistant", content: "delete-me" }, { role: "tool", content: "original" }],
		tools: { read: { description: "original", input: { type: "object" } } },
		options: { temperature: 0 },
	};
	const before = structuredClone(event);
	const originalParts = [...event.system];
	const originalMessages = event.messages;
	await handler(event);
	const expected = structuredClone(before);
	expected.system[0].text = "normalized normalized  Original";
	expected.system[1].text = "Project: normalized; $& $$ $` $'";
	assert.deepEqual(event, expected);
	assert.equal(event.messages, originalMessages);
	assert.equal(event.system[0].cache, originalParts[0].cache);
	assert.equal(event.system[0].metadata, originalParts[0].metadata);
	assert.equal(event.system[2], originalParts[2]);
	assert.deepEqual(originalParts, before.system);
	await cleanup();
	assert.equal(disposed(), true);
});

test("missing or empty rules skip hook registration without throwing", async () => {
	for (const ctxOptions of [undefined, null, {}, { rules: undefined }, { rules: [] }]) {
		const hook = mock.fn();
		const cleanup = await plugin.setup({ options: ctxOptions, session: { hook } });
		assert.equal(cleanup, undefined);
		assert.equal(hook.mock.callCount(), 0);
	}
});

test("warns once without exposing prompt text when no rule matches", async (t) => {
	const warning = t.mock.method(console, "warn", () => {});
	const { handler } = await load({ rules: [{ match: "private-match", replacement: "private-replacement" }] });
	const event = { system: [{ type: "text", text: "private-system" }], messages: [] };
	const before = structuredClone(event);
	await handler(event);
	await handler(event);
	assert.deepEqual(event, before);
	assert.equal(warning.mock.callCount(), 1);
	assert.deepEqual(warning.mock.calls[0].arguments, [
		"[replacesystemprompt] No configured rule matched system text; request unchanged. Further no-match warnings are suppressed until plugin reload.",
	]);
});

test("empty system is unchanged and configured rules are not mutated across calls", async () => {
	const options = { rules: [{ match: "original", replacement: "normalized" }] };
	const before = structuredClone(options);
	const { handler } = await load(options);
	for (let i = 0; i < 2; i++) {
		const event = { system: [{ type: "text", text: "original" }] };
		await handler(event);
		assert.equal(event.system[0].text, "normalized");
	}
	await handler({ system: [] });
	assert.deepEqual(options, before);
});

test("rejects malformed rules before registering any hook", async () => {
	for (const rules of [null, {}, "text", [null], [{}], [{ match: "", replacement: "x" }], [{ match: 1, replacement: "x" }], [{ match: "x" }], [{ match: "x", replacement: null }], [{ match: "x", replacement: "a" }, { match: "x", replacement: "b" }]]) {
		const hook = mock.fn();
		await assert.rejects(async () => plugin.setup({ options: { rules }, session: { hook } }), /replacesystemprompt: /);
		assert.equal(hook.mock.callCount(), 0);
	}
});

test("preserves emptied system parts and their metadata when a full part is deleted", async () => {
	const { handler } = await load({ rules: [{ match: "only-preamble", replacement: "" }] });
	const cache = { type: "ephemeral" };
	const metadata = { source: "preamble" };
	const originalPart = { type: "text", text: "only-preamble", cache, metadata };
	const event = { system: [originalPart] };
	await handler(event);
	assert.deepEqual(event.system, [{ type: "text", text: "", cache, metadata }]);
	assert.equal(event.system[0].cache, cache);
	assert.equal(event.system[0].metadata, metadata);
	assert.equal(originalPart.text, "only-preamble");
});

test("skips non-text or malformed system entries without failing the request", async () => {
	const { handler } = await load({ rules: [{ match: "original", replacement: "normalized" }] });
	const nonTextPart = { type: "custom" };
	const event = { system: [null, nonTextPart, { type: "text", text: "original" }] };
	await handler(event);
	assert.equal(event.system[0], null);
	assert.equal(event.system[1], nonTextPart);
	assert.equal(event.system[2].text, "normalized");
	await handler({});
});
