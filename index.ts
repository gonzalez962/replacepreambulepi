import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Set this to the text you want in place of Pi's preamble.
const replacement = "You are a coding assistant. Help users inspect files, run commands, and modify code.";

export default function (pi: ExtensionAPI) {
	pi.on("context_with_system", (event) => ({
		messages: event.messages.map((message) =>
			message.role === "system" && message.sections && Object.hasOwn(message.sections, "preamble")
				? { ...message, sections: { ...message.sections, preamble: replacement } }
				: message,
		),
	}));
}
