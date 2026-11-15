import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "./index.ts";

test("replaces only existing preamble sections across the request without mutation", async () => {
	let handler;
	extension({ on(name, callback) { assert.equal(name, "context_with_system"); handler = callback; } });
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
	expected[0].sections.preamble = "";
	expected[2].sections.preamble = "";
	expected[3].sections.preamble = "";
	assert.deepEqual(result.messages, expected);
	assert.deepEqual(messages, original);
});
