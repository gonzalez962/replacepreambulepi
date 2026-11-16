import type { Plugin } from "@opencode/plugin";

type Rule = { match: string; replacement: string };

function readRules(value: unknown): Rule[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error("replacesystemprompt: rules must be an array.");
	const seen = new Set<string>();
	return Array.from(value, (rule, index) => {
		if (!rule || typeof rule.match !== "string" || !rule.match.length || typeof rule.replacement !== "string") {
			throw new Error(`replacesystemprompt: rule ${index + 1} requires a nonempty match and a string replacement.`);
		}
		if (seen.has(rule.match)) throw new Error(`replacesystemprompt: rule ${index + 1} duplicates an earlier match.`);
		seen.add(rule.match);
		return { match: rule.match, replacement: rule.replacement };
	});
}

export default {
	id: "replacesystemprompt",
	async setup(ctx) {
		const rules = readRules(ctx.options?.rules);
		if (!rules.length) return;
		let warned = false;
		const registration = await ctx.session.hook("context", (event) => {
			if (!Array.isArray(event?.system)) return;
			let matched = false;
			event.system.forEach((part, index) => {
				if (typeof part?.text !== "string") return;
				let text = part.text;
				for (const rule of rules) {
					if (!text.includes(rule.match)) continue;
					matched = true;
					// A callback keeps replacement tokens such as "$&" literal.
					text = text.replaceAll(rule.match, () => rule.replacement);
				}
				// Keep emptied parts to preserve cache/metadata hints (unlike Anthropic, OpenAI Chat/Gemini lowerers do not filter empty parts).
				if (text !== part.text) event.system[index] = { ...part, text };
			});
			if (!matched && !warned) {
				console.warn("[replacesystemprompt] No configured rule matched system text; request unchanged. Further no-match warnings are suppressed until plugin reload.");
				warned = true;
			}
		});
		return () => registration.dispose();
	},
} satisfies Plugin.Plugin;
