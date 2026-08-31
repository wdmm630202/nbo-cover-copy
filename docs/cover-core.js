var NBOCoverCore = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region app/cover/core/responsive-layout.ts
	function resolveCoverLayoutMode({ width, height, pointer }) {
		if (pointer === "fine" && width >= 1180) return "desktop";
		if (width >= 680 && (width > height || pointer === "fine")) return "split";
		return "compact";
	}
	//#endregion
	exports.resolveCoverLayoutMode = resolveCoverLayoutMode;
	return exports;
})({});
