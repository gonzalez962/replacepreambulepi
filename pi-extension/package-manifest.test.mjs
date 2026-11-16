import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("S1.1 root manifest declares the Pi package and existing extension", () => {
	const root = new URL("../", import.meta.url);
	const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

	assert.equal(manifest.name, "replacepreambulepi");
	assert.equal(manifest.version, "0.1.0");
	assert.ok(manifest.keywords?.includes("pi-package"));
	assert.deepEqual(manifest.pi?.extensions, ["./pi-extension/index.ts"]);
	assert.deepEqual(manifest.peerDependencies, { "@earendil-works/pi-coding-agent": "*" });
	assert.equal(manifest.scripts, undefined);
	assert.equal(manifest.dependencies, undefined);
	assert.ok(existsSync(new URL(manifest.pi.extensions[0], root)));
});
