// Pi 0.85+ owns these click callbacks. Patch only their local attachment points,
// not MouseRegion globally: child mouse handlers and terminal input stay intact.
const PATCHED = Symbol.for("pi-claude-style-tools:keyboard-only-display");

export function patchDisplayToggleMouse(assistantProto: any, toolProto: any): void {
	if (!assistantProto[PATCHED] && typeof assistantProto.updateContent === "function") {
		const updateContent = assistantProto.updateContent;
		assistantProto.updateContent = function (...args: any[]) {
			const result = updateContent.apply(this, args);
			const children = this.contentContainer?.children;
			if (Array.isArray(children)) {
				for (let i = 0; i < children.length; i++) {
					const region = children[i];
					// Native assistant content uses immediate MouseRegions only for
					// thinking visibility. Keep the rendered child, including any of
					// its own mouse handling; do not recursively strip other regions.
					if (region?.constructor?.name === "MouseRegion" && region.child) {
						children[i] = region.child;
					}
				}
			}
			return result;
		};
		assistantProto[PATCHED] = true;
	}
	if (!toolProto[PATCHED] && typeof toolProto.createResultRegion === "function") {
		// Older Pi versions have no result region factory and need no patch.
		toolProto.createResultRegion = function (component: any) {
			return component;
		};
		toolProto[PATCHED] = true;
	}
}
