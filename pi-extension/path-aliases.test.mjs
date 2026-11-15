import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "./index.ts";

// Synthetic paths only: handlers are invoked directly and never execute tools.
const root = "/synthetic/core runtime";
function setup(packageRoot = root) {
	const hooks = new Map();
	extension({ on(name, handler) { hooks.set(name, handler); } }, { getPackageDir: () => packageRoot });
	return hooks;
}
const gemini = { model: { id: "gemini-pro" } };
function context(hooks, event) {
	return hooks.get("context_with_system")(event, gemini);
}
async function aliasFor(hooks) {
	const result = await context(hooks, { type: "context_with_system", messages: [{ role: "user", content: root }] });
	const alias = result.messages[0].content;
	assert.notEqual(alias, root, "the core root must receive a neutral alias");
	assert.ok(alias.length > 0);
	return alias;
}

test("S4.1 gates path projection by request model and retains filters and request-bound restoration", async (t) => {
	for (const [name, model, enabled, laterModel] of [
		["Gemini", { id: "gemini-pro" }, true, { id: "other" }],
		["mixed-case Gemini", { id: "vendor-GeMiNi-pro" }, true, undefined],
		["non-Gemini", { id: "other" }, false, { id: "gemini-pro" }],
		["missing model", undefined, false, { id: "gemini-pro" }],
	]) {
		await t.test(name, async () => {
			const hooks = setup();
			const alias = "/__runtime_root__";
			const guideline = "You can inspect PI_* environment variables for current model and session details.";
			const messages = [{ role: "system", sections: { preamble: "old", docs: "docs", rules: `- ${guideline}\n- Keep ${root}/rules` } }, { role: "user", content: `Read ${root}/file` }];
			const original = structuredClone(messages);
			const result = await hooks.get("context_with_system")({ type: "context_with_system", messages }, { model });
			assert.deepEqual(result.messages, [
				{ role: "system", sections: { preamble: "You are a coding assistant. Help users inspect files, run commands, and modify code.", docs: "", rules: `- Keep ${enabled ? alias : root}/rules` } },
				{ role: "user", content: `Read ${enabled ? alias : root}/file` },
			]);
			assert.deepEqual(messages, original);
			const message = { role: "assistant", content: [{ type: "text", text: `See ${alias}/file` }, { type: "toolCall", id: "read", name: "read", arguments: { path: `${alias}/file` } }] };
			const before = structuredClone(message);
			const finalized = await hooks.get("message_end")({ type: "message_end", message }, { model: laterModel });
			const expected = enabled ? { ...message, content: [{ type: "text", text: `See ${root}/file` }, { type: "toolCall", id: "read", name: "read", arguments: { path: `${root}/file` } }] } : message;
			assert.deepEqual(finalized?.message ?? message, expected);
			assert.deepEqual(message, before);
		});
	}
});

test("S1.1 projects textual paths consistently without changing other values or input", async () => {
	const hooks = setup();
	const alias = await aliasFor(hooks);
	const messages = [
		{ role: "system", sections: { rules: `Read ${root}/docs and ${root}-other`, skills: `${root}/skills` }, toolsAdded: [{ name: "read", description: root, parameters: { path: root } }] },
		{ role: "user", content: `Use ${root}/a and /synthetic/.pi/file and /synthetic/gentle-pi/file` },
		{ role: "assistant", content: [{ type: "text", text: `${root}/b` }, { type: "toolCall", id: "id", name: "read", arguments: { path: `${root}/c`, other: "keep" } }] },
		{ role: "toolResult", toolCallId: "id", toolName: "read", content: [{ type: "text", text: `${root}/d` }] },
	];
	const original = structuredClone(messages);
	const expected = structuredClone(messages);
	expected[0].sections = { rules: `Read ${alias}/docs and ${root}-other`, skills: `${alias}/skills` };
	expected[1].content = `Use ${alias}/a and /synthetic/.pi/file and /synthetic/gentle-pi/file`;
	expected[2].content[0].text = `${alias}/b`;
	expected[2].content[1].arguments.path = `${alias}/c`;
	expected[3].content[0].text = `${alias}/d`;
	const result = await context(hooks, { type: "context_with_system", messages });
	assert.deepEqual(result.messages, expected);
	assert.deepEqual(messages, original);
});

test("S1.1 and S3.1 translate sentence-final periods without changing distinct prefixes", async () => {
	const hooks = setup();
	const alias = await aliasFor(hooks);
	const project = (event) => context(hooks, event);
	const text = `First ${root}. Next ${root}-other and ${root}.extension. Last ${root}.`;
	const result = await project({ type: "context_with_system", messages: [{ role: "user", content: text }] });
	assert.equal(result.messages[0].content, `First ${alias}. Next ${root}-other and ${root}.extension. Last ${alias}.`);
	const final = await hooks.get("message_end")({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: `First ${alias}. Next ${alias}-other and ${alias}.extension. Last ${alias}.` }] } });
	assert.equal(final.message.content[0].text, `First ${root}. Next ${alias}-other and ${alias}.extension. Last ${root}.`);
});

test("S1.1 Windows root retains separators and similar prefixes remain distinct", async () => {
	const windowsRoot = "C:\\Synthetic Space\\runtime";
	const hooks = setup(windowsRoot);
	const project = async (content) => (await context(hooks, { type: "context_with_system", messages: [{ role: "user", content }] })).messages[0].content;
	const alias = await project(windowsRoot);
	assert.notEqual(alias, windowsRoot);
	assert.equal(await project(windowsRoot), alias);
	assert.equal(await project(`${windowsRoot}\\doc ${windowsRoot}-other`), `${alias}\\doc ${windowsRoot}-other`);
	const result = await hooks.get("message_end")({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: `${alias}\\doc` }] } });
	assert.equal(result.message.content[0].text, `${windowsRoot}\\doc`);
});

test("S2.1 restores supported tool inputs before permission inspection without executing operations", async () => {
	const hooks = setup();
	const handler = hooks.get("message_end");
	assert.equal(typeof handler, "function", "message_end hook must be registered");
	const alias = await aliasFor(hooks);
	const calls = [
		... ["read", "grep", "find", "ls"].map((name) => ({ type: "toolCall", id: name, name, arguments: { path: `${alias}/file name`, untouched: alias } })),
		{ type: "toolCall", id: "bash", name: "bash", arguments: { command: `printf '%s' '${alias}/file name'`, untouched: alias } },
		... ["write", "edit"].map((name) => ({ type: "toolCall", id: name, name, arguments: { path: `${alias}/file` } })),
	];
	const message = { role: "assistant", content: calls };
	const original = structuredClone(message);
	const result = await handler({ type: "message_end", message });
	// Simulate the host extracting calls after message_end, then a permission guard inspecting them.
	const inspected = result.message.content.filter((block) => block.type === "toolCall").map(({ name, arguments: input }) => ({ name, input }));
	assert.deepEqual(inspected, [
		... ["read", "grep", "find", "ls"].map((name) => ({ name, input: { path: `${root}/file name`, untouched: alias } })),
		{ name: "bash", input: { command: `printf '%s' '${root}/file name'`, untouched: alias } },
		... ["write", "edit"].map((name) => ({ name, input: { path: `${alias}/file` } })),
	]);
	assert.deepEqual(message, original);
});

test("S3.1 restores final assistant text and supported calls without modifying other blocks or input", async () => {
	const hooks = setup();
	const handler = hooks.get("message_end");
	assert.equal(typeof handler, "function", "message_end hook must be registered");
	const alias = await aliasFor(hooks);
	const message = { role: "assistant", content: [{ type: "text", text: `See ${alias}/file` }, { type: "toolCall", id: "id", name: "read", arguments: { path: `${alias}/file` } }, { type: "thinking", thinking: `${alias}/private` }] };
	const original = structuredClone(message);
	const result = await handler({ type: "message_end", message });
	const expected = structuredClone(message);
	expected.content[0].text = `See ${root}/file`;
	expected.content[1].arguments.path = `${root}/file`;
	assert.deepEqual(result.message, expected);
	assert.deepEqual(message, original);
});
