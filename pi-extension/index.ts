import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { pathAliases, projectArguments } from "./path-aliases.ts";

// Set this to the text you want in place of Pi's preamble.
const replacement = "You are a coding assistant. Help users inspect files, run commands, and modify code.";
// Leave empty to suppress Pi's docs, or set custom section text here.
const docsReplacement = "";
const environmentGuideline = "You can inspect PI_* environment variables for current model and session details.";

export default function (pi: ExtensionAPI, options?: { getPackageDir?: () => string }) {
	let aliases: Promise<ReturnType<typeof pathAliases>> | undefined;
	const getAliases = () => aliases ??= (async () => pathAliases(options?.getPackageDir ? options.getPackageDir() : (await import("@earendil-works/pi-coding-agent")).getPackageDir()))();
	let aliasesEnabled = false;
	pi.on("context_with_system", async (event, ctx) => {
		aliasesEnabled = ctx?.model?.id?.toLowerCase().includes("gemini") ?? false;
		const project = aliasesEnabled ? (await getAliases()).project : (text: string) => text;
		return { messages: event.messages.map((original) => {
			let message = original;
			if (typeof message.content === "string") message = { ...message, content: project(message.content) } as typeof message;
			else if (Array.isArray(message.content)) message = { ...message, content: message.content.map((block) => {
				if (block.type === "text") return { ...block, text: project(block.text) };
				if (block.type === "toolCall") return { ...block, arguments: projectArguments(block.arguments, project) };
				return block;
			}) } as typeof message;
			if (message.role !== "system" || !message.sections) return message;
			const sections = { ...message.sections };
			if (Object.hasOwn(sections, "preamble")) sections.preamble = replacement;
			if (Object.hasOwn(sections, "docs")) sections.docs = docsReplacement;
			if (typeof sections.rules === "string") {
				// Remove a standalone guideline with its bullet/newline, preserving other lines.
				sections.rules = sections.rules
					.split(/(?<=\n)/)
					.filter((line) => {
						const text = line.trim();
						return text !== environmentGuideline && text !== `- ${environmentGuideline}`;
					})
					.join("")
					.replaceAll(environmentGuideline, "");
			}
			for (const [key, value] of Object.entries(sections)) {
				if (typeof value === "string") sections[key] = project(value);
			}
			return { ...message, sections };
		}) };
	});
	pi.on("message_end", async (event) => {
		const message = event.message;
		if (message.role !== "assistant" || !aliasesEnabled) return;
		const { restore } = await getAliases();
		return { message: { ...message, content: message.content.map((block) => {
			if (block.type === "text") return { ...block, text: restore(block.text) };
			if (block.type !== "toolCall") return block;
			const field = ["read", "grep", "find", "ls"].includes(block.name) ? "path" : block.name === "bash" ? "command" : undefined;
			if (!field || typeof block.arguments[field] !== "string") return block;
			return { ...block, arguments: { ...block.arguments, [field]: restore(block.arguments[field]) } };
		}) } };
	});
}
