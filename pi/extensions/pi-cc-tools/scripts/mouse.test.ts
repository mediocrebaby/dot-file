import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { patchDisplayToggleMouse } from "../extensions/mouse.ts";

class MouseRegion {
	child: any;
	onMouse: (event: any) => any;
	constructor(child: any, onMouse: (event: any) => any) { this.child = child; this.onMouse = onMouse; }
	handleMouse(event: any) { return this.child.handleMouse?.(event) ?? this.onMouse(event); }
}

test("only display-toggle wrappers are removed; rebuilding and keyboard controls survive", () => {
	let childEvents = 0;
	const child = { handleMouse() { childEvents++; return { handled: true }; } };
	const unrelated = { children: [new MouseRegion(child, () => undefined)] };
	class Assistant {
		contentContainer = { children: [] as any[] };
		hidden = true;
		updateContent() {
			this.contentContainer.children = [unrelated, new MouseRegion(child, () => { this.hidden = !this.hidden; })];
			return "updated";
		}
		setHideThinkingBlock(hidden: boolean) { this.hidden = hidden; this.updateContent(); }
	}
	class Tool {
		expanded = false;
		setExpanded(expanded: boolean) { this.expanded = expanded; }
		createResultRegion(component: any) {
			return new MouseRegion(component, () => { this.setExpanded(!this.expanded); });
		}
	}
	patchDisplayToggleMouse(Assistant.prototype, Tool.prototype);
	const patched = Assistant.prototype.updateContent;
	patchDisplayToggleMouse(Assistant.prototype, Tool.prototype);
	assert.equal(Assistant.prototype.updateContent, patched, "patch is idempotent");
	const assistant = new Assistant();
	for (const hidden of [true, false, true]) {
		assistant.setHideThinkingBlock(hidden);
		assert.equal(assistant.hidden, hidden);
		assert.equal(assistant.updateContent(), "updated");
		assert.deepEqual(assistant.contentContainer.children, [unrelated, child]);
		assert.ok(unrelated.children[0] instanceof MouseRegion, "nested unrelated regions are preserved");
	}
	const tool = new Tool();
	const result = tool.createResultRegion(child);
	assert.equal(result, child);
	for (const type of ["click", "scroll", "drag"]) result.handleMouse({ type });
	assert.equal(childEvents, 3, "child mouse handlers remain reachable");
	assert.equal(tool.expanded, false);
	tool.setExpanded(true);
	assert.equal(tool.expanded, true);
});

test("older Pi without mouse wrappers remains supported", () => {
	const child = {};
	const assistantProto = { updateContent() { return 42; } };
	const toolProto = {};
	patchDisplayToggleMouse(assistantProto, toolProto);
	assert.equal(assistantProto.updateContent.call({ contentContainer: { children: [child] } }), 42);
	assert.equal(assistantProto.updateContent.call({}), 42);
	assert.equal("createResultRegion" in toolProto, false);
});

// Defaults to the project's supported dependency. Set this path to also exercise
// the installed Pi host (including its real MouseRegion callbacks on Pi 0.85+).
const agentRoot = resolve(process.env.PI_MOUSE_TEST_AGENT_ROOT ?? "node_modules/@earendil-works/pi-coding-agent");
const load = (path: string) => import(pathToFileURL(resolve(agentRoot, "dist", path)).href);

test("real Pi components: clicks disabled, rebuilds and keyboard setters preserved", async () => {
	const { initTheme } = await load("modes/interactive/theme/theme.js");
	initTheme("dark", false);
	const { AssistantMessageComponent: Assistant } = await load("modes/interactive/components/assistant-message.js");
	const { ToolExecutionComponent: Tool } = await load("modes/interactive/components/tool-execution.js");
	const message = { role: "assistant", content: [{ type: "thinking", thinking: "A private calculation" }, { type: "text", text: "Answer" }], stopReason: "stop" };
	const click = { type: "click", button: "left" };
	const before = new Assistant(message, true);
	const nativeRegion = before.contentContainer.children.find((c: any) => c.constructor.name === "MouseRegion");
	if (nativeRegion) {
		nativeRegion.handleMouse(click);
		assert.equal(before.thinkingVisibilityOverrides.size, 1, "prove the native click changes thinking visibility");
	}
	const baselineTool = new Tool("example", "before", {}, {}, undefined, { requestRender() {} }, process.cwd());
	baselineTool.updateResult({ content: [{ type: "text", text: "result" }], isError: false }, false);
	if (typeof baselineTool.createResultRegion === "function") {
		baselineTool.contentTextRegion.handleMouse(click);
		assert.equal(baselineTool.expanded, true, "prove the native click expands tool output");
	}
	patchDisplayToggleMouse(Assistant.prototype, Tool.prototype);
	const assistant = new Assistant(message, true);
	for (const hidden of [false, true, false]) {
		assistant.setHideThinkingBlock(hidden);
		assistant.updateContent(message, true);
		assistant.updateContent(message, false);
		assistant.invalidate();
		assert.equal(assistant.hideThinkingBlock, hidden);
		assert.ok(assistant.contentContainer.children.every((c: any) => c.constructor.name !== "MouseRegion"));
		assert.equal(assistant.thinkingVisibilityOverrides?.size ?? 0, 0);
		const rendered = assistant.render(100).join("\n");
		assert.equal(rendered.includes("A private calculation"), !hidden);
	}
	const tool = new Tool("example", "call-1", {}, {}, undefined, { requestRender() {} }, process.cwd());
	tool.updateResult({ content: [{ type: "text", text: "result\n".repeat(20) }], isError: false }, false);
	for (const expanded of [true, false, true]) {
		tool.setExpanded(expanded);
		tool.invalidate();
		assert.equal(tool.expanded, expanded);
		if (typeof tool.createResultRegion === "function") {
			const child = { render: () => ["child"], invalidate() {} };
			assert.equal(tool.createResultRegion(child), child);
			assert.equal(tool.contentTextRegion, tool.contentText);
		}
		assert.ok(tool.render(100).length > 0);
	}
});
