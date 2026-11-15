import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "./index.ts";

function handlers(options) {
	const registered = new Map();
	extension({ on(name, callback) { registered.set(name, callback); } }, options ?? { getPackageDir: () => "/synthetic/core" });
	return registered;
}

test("replaces only existing preamble sections across the request without mutation", async () => {
	const handler = handlers().get("context_with_system");
	assert.ok(handler);
	const messages = [
		{ role: "system", content: "base", sections: { preamble: "future text", rules: "rules" }, toolsAdded: [{ name: "read", description: "read", parameters: { type: "object" } }], timestamp: 1 },
		{ role: "user", content: "hello", timestamp: 2 },
		{ role: "system", content: "patch", sections: { rules: "new rules", preamble: "changed text" }, toolsRemoved: [{ name: "old" }], timestamp: 3 },
		{ role: "system", content: "delete", sections: { preamble: null }, timestamp: 4 },
		{ role: "system", content: "no preamble", sections: { other: "value" }, timestamp: 5 },
		{ role: "system", content: "opaque", timestamp: 6 },
	];
	const original = structuredClone(messages);
	const result = await handler({ type: "context_with_system", messages });
	const expected = structuredClone(original);
	expected[0].sections.preamble = "You are a coding assistant. Help users inspect files, run commands, and modify code.";
	expected[2].sections.preamble = expected[0].sections.preamble;
	expected[3].sections.preamble = expected[0].sections.preamble;
	assert.deepEqual(result.messages, expected);
	assert.deepEqual(messages, original);
});

function project(messages) {
	return handlers().get("context_with_system")({ type: "context_with_system", messages });
}

test("empties existing docs in initial and patch messages without changing other fields", async () => {
	const messages = [
		{ role: "system", content: "base", sections: { docs: "<docs>Pi documentation</docs>", rules: "keep" }, toolsAdded: [{ name: "read" }] },
		{ role: "system", content: "patch", sections: { docs: "updated docs" }, toolsRemoved: [{ name: "old" }] },
		{ role: "system", sections: { docs: null } },
		{ role: "system", sections: { docs: "" } },
		{ role: "system", sections: { rules: "unchanged" } },
		{ role: "system", content: "opaque <docs>keep</docs>" },
		{ role: "user", content: "keep", sections: { docs: "user docs" } },
	];
	const original = structuredClone(messages);
	const expected = structuredClone(messages);
	for (const i of [0, 1, 2, 3]) expected[i].sections.docs = "";
	assert.deepEqual((await project(messages)).messages, expected);
	assert.deepEqual(messages, original);
});

test("removes only the exact PI environment guideline from rules including repeated patches", async () => {
	const sentence = "You can inspect PI_* environment variables for current model and session details.";
	const messages = [
		{ role: "system", sections: { rules: `<rules>\n- Keep this.\n- ${sentence}\n- Keep that.\n</rules>`, skills: sentence } },
		{ role: "system", sections: { rules: `- ${sentence}\r\n- Keep.\r\n- ${sentence}\r\n` } },
		{ role: "system", sections: { rules: sentence } },
		{ role: "system", sections: { rules: null } },
		{ role: "system", sections: { docs: "docs", preamble: "old", rules: `prefix ${sentence} suffix` } },
		{ role: "system", content: sentence },
		{ role: "user", content: sentence, sections: { rules: sentence } },
		{ role: "system", sections: { rules: sentence.toLowerCase() } },
	];
	const original = structuredClone(messages);
	const expected = structuredClone(messages);
	expected[0].sections.rules = "<rules>\n- Keep this.\n- Keep that.\n</rules>";
	expected[1].sections.rules = "- Keep.\r\n";
	expected[2].sections.rules = "";
	expected[4].sections = { docs: "", preamble: "You are a coding assistant. Help users inspect files, run commands, and modify code.", rules: "prefix  suffix" };
	const result = await project(messages);
	assert.deepEqual(result.messages, expected);
	assert.deepEqual(messages, original);
	assert.deepEqual((await project(result.messages)).messages, expected);
});
