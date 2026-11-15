import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Set this to the text you want in place of Pi's preamble.
const replacement = "You are a coding assistant. Help users inspect files, run commands, and modify code.";
// Leave empty to suppress Pi's docs, or set custom section text here.
const docsReplacement = "";
const environmentGuideline = "You can inspect PI_* environment variables for current model and session details.";

export default function (pi: ExtensionAPI) {
	pi.on("context_with_system", (event) => ({
		messages: event.messages.map((message) => {
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
			return { ...message, sections };
		}),
	}));
}
