import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "./index.ts";

// Synthetic paths only: handlers are invoked directly and never execute tools.
const root = "/synthetic/core runtime";
function setup() {
	const hooks = new Map();
	extension({ on(name, handler) { hooks.set(name, handler); } }, { getPackageDir: () => root });
	return hooks;
}
async function aliasFor(hooks) {
	const result = await hooks.get("context_with_system")({ type: "context_with_system", messages: [{ role: "user", content: root }] });
	const alias = result.messages[0].content;
	assert.notEqual(alias, root, "the core root must receive a neutral alias");
	assert.ok(alias.length > 0);
	return alias;
}

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
	const result = await hooks.get("context_with_system")({ type: "context_with_system", messages });
	assert.deepEqual(result.messages, expected);
	assert.deepEqual(messages, original);
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
