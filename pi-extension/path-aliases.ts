// A stable marker, reserved for this projection; literal collisions are not distinguishable.
const alias = "/__runtime_root__";

function replacePrefix(text: string, from: string, to: string): string {
	if (!from) return text;
	let result = "";
	let cursor = 0;
	while (true) {
		const index = text.indexOf(from, cursor);
		if (index < 0) return result + text.slice(cursor);
		const before = text[index - 1];
		const after = text[index + from.length];
		const start = !before || /[\s"'`([{=,:;]/.test(before);
		const end = !after || /[\\/\s"'`)\]},:;]/.test(after);
		result += text.slice(cursor, index) + (start && end ? to : from);
		cursor = index + from.length;
	}
}

export function pathAliases(root: string) {
	// Preserve the separator style of the discovered root for reversible replacement.
	root = root.replace(/[\\/]+$/, "");
	return {
		project: (text: string) => replacePrefix(text, root, alias),
		restore: (text: string) => replacePrefix(text, alias, root),
	};
}

export function projectArguments(value: unknown, project: (text: string) => string): unknown {
	if (typeof value === "string") return project(value);
	if (Array.isArray(value)) return value.map((item) => projectArguments(item, project));
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projectArguments(item, project)]));
	}
	return value;
}
