var NBOCoverCore = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region app/cover/cover-config.ts
	var PLATFORM_PRESETS = [
		{
			id: "douyin",
			label: "抖音",
			ratio: "9:16",
			width: 1080,
			height: 1920,
			note: "竖屏封面，带居中 3:4 主页安全区"
		},
		{
			id: "xiaohongshu",
			label: "小红书",
			ratio: "3:4",
			width: 1080,
			height: 1440,
			note: "适合图文与竖版内容封面"
		},
		{
			id: "shipinhao",
			label: "视频号",
			ratio: "3:4",
			width: 1080,
			height: 1440,
			note: "竖版内容常用工作尺寸"
		}
	];
	var COVER_TEMPLATES = [
		{
			id: "top-left",
			name: "上方左题",
			hint: "上方区域，左侧对齐",
			number: "01"
		},
		{
			id: "top-center",
			name: "上方居中",
			hint: "上方区域，中轴对齐",
			number: "02"
		},
		{
			id: "top-right",
			name: "上方右题",
			hint: "上方区域，右侧对齐",
			number: "03"
		},
		{
			id: "middle-left",
			name: "居中左题",
			hint: "居中区域，左侧对齐",
			number: "04"
		},
		{
			id: "middle-center",
			name: "居中",
			hint: "居中区域，中轴对齐",
			number: "05"
		},
		{
			id: "middle-right",
			name: "居中右题",
			hint: "居中区域，右侧对齐",
			number: "06"
		},
		{
			id: "bottom-left",
			name: "下方左题",
			hint: "下方区域，左侧对齐",
			number: "07"
		},
		{
			id: "bottom-center",
			name: "下方居中",
			hint: "下方区域，中轴对齐",
			number: "08"
		},
		{
			id: "bottom-right",
			name: "下方右题",
			hint: "下方区域，右侧对齐",
			number: "09"
		}
	];
	//#endregion
	//#region app/cover/core/editor-settings.ts
	var DEFAULT_COVER_SETTINGS = {
		platformId: "douyin",
		templateId: "middle-left",
		topText: "男人的",
		bottomText: "高级感",
		subtitle: "不被定义的自己",
		topColor: "#FFFFFF",
		bottomColor: "#FFFFFF",
		dividerColor: "#C9A77A",
		showDivider: true,
		subtitleColor: "#FFFFFF",
		subtitleScale: 100,
		brightness: 100,
		zoom: 100,
		offsetX: 0,
		offsetXRangeVersion: 2,
		offsetY: 0,
		rotation: 0,
		textScale: 100,
		bottomTextScale: 100,
		textScaleLinked: true,
		textStroke: 0,
		textShadow: 50,
		textShadowDefaultVersion: 1,
		titleScaleVersion: 3,
		shade: 0,
		bottomShade: 100,
		showSafeArea: true,
		compareEnabled: false,
		beforeZoom: 100,
		beforeOffsetX: 0,
		beforeOffsetY: 0,
		beforeRotation: 0,
		beforeBrightness: 100,
		beforeShade: 0,
		beforeBottomShade: 100,
		beforeFrameScale: 100,
		watermarkScale: 100,
		watermarkAlign: "left",
		watermarkOpacity: 50,
		watermarkEnabled: false,
		watermarkDefaultVersion: 1
	};
	var STATIC_SETTING_ALIASES = {
		platform: "platformId",
		template: "templateId",
		divider: "showDivider",
		safe: "showSafeArea"
	};
	function hasOwn(source, key) {
		return Object.prototype.hasOwnProperty.call(source, key);
	}
	function inferProfile(source) {
		return Object.keys(STATIC_SETTING_ALIASES).some((key) => hasOwn(source, key)) ? "static-storage" : "canonical";
	}
	function applyStaticAliases(source) {
		for (const [legacyKey, canonicalKey] of Object.entries(STATIC_SETTING_ALIASES)) if (hasOwn(source, legacyKey)) source[canonicalKey] = source[legacyKey];
	}
	function normalizeTemplateId(value, fallback = DEFAULT_COVER_SETTINGS.templateId) {
		const legacy = {
			left: "top-left",
			bottom: "top-center",
			badge: "middle-left",
			center: "middle-center",
			clean: "bottom-left",
			right: "bottom-right"
		};
		const id = typeof value === "string" ? value : "";
		if (legacy[id]) return legacy[id];
		return COVER_TEMPLATES.some((template) => template.id === id) ? id : fallback;
	}
	function normalizeCoverSettings(value, requestedProfile) {
		const source = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
		const profile = requestedProfile ?? inferProfile(source);
		if (profile !== "canonical") applyStaticAliases(source);
		if (!Object.keys(DEFAULT_COVER_SETTINGS).some((key) => hasOwn(source, key))) return { ...DEFAULT_COVER_SETTINGS };
		const numberValue = (key, min, max) => {
			const parsed = Number(source[key]);
			return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : DEFAULT_COVER_SETTINGS[key];
		};
		const booleanValue = (key) => typeof source[key] === "boolean" ? source[key] : DEFAULT_COVER_SETTINGS[key];
		const textValue = (key, maxLength) => typeof source[key] === "string" ? source[key].slice(0, maxLength) : DEFAULT_COVER_SETTINGS[key];
		const colorValue = (key) => {
			const color = typeof source[key] === "string" ? source[key].toUpperCase() : "";
			return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_COVER_SETTINGS[key];
		};
		if (source.bottomColor === "#FEE800") source.bottomColor = "#FFFFFF";
		if (Number(source.watermarkOpacity) === 92) source.watermarkOpacity = 50;
		if (Number(source.watermarkScale) <= 42) source.watermarkScale = 100;
		if (profile !== "static-memory" && Number(source.shade) === 62) source.shade = 0;
		if (profile !== "static-memory" && source.watermarkDefaultVersion !== 1) {
			source.watermarkEnabled = false;
			source.watermarkDefaultVersion = 1;
		}
		if (Number(source.titleScaleVersion ?? 0) < 2) source.textScale = Math.round(Number(source.textScale || 100) / 1.8);
		if (Number(source.titleScaleVersion ?? 0) < 3) {
			source.bottomTextScale = Number(source.textScale || 100);
			source.textScaleLinked = true;
			source.titleScaleVersion = 3;
		}
		if (source.textShadowDefaultVersion !== 1) {
			source.textShadow = 50;
			source.textShadowDefaultVersion = 1;
		}
		if (source.offsetXRangeVersion !== 2) {
			const previousOffsetX = Number(source.offsetX ?? (source.offsetXRangeVersion === 1 ? 100 : 0));
			source.offsetX = Math.max(-200, Math.min(200, source.offsetXRangeVersion === 1 ? previousOffsetX - 100 : previousOffsetX));
			source.offsetXRangeVersion = 2;
		}
		if (source.bottomText === "藏在自然状态里") source.bottomText = "藏在自然状态";
		const platformId = typeof source.platformId === "string" && PLATFORM_PRESETS.some((item) => item.id === source.platformId) ? source.platformId : DEFAULT_COVER_SETTINGS.platformId;
		const watermarkAlign = source.watermarkAlign === "left" || source.watermarkAlign === "center" || source.watermarkAlign === "right" ? source.watermarkAlign : DEFAULT_COVER_SETTINGS.watermarkAlign;
		const staticTemplateFallback = profile === "canonical" ? DEFAULT_COVER_SETTINGS.templateId : "top-left";
		const staticWatermarkDefaultVersion = Number(source.watermarkDefaultVersion);
		return {
			platformId,
			templateId: normalizeTemplateId(source.templateId, staticTemplateFallback),
			topText: textValue("topText", 18),
			bottomText: textValue("bottomText", 18),
			subtitle: textValue("subtitle", 38),
			topColor: colorValue("topColor"),
			bottomColor: colorValue("bottomColor"),
			dividerColor: colorValue("dividerColor"),
			showDivider: booleanValue("showDivider"),
			subtitleColor: colorValue("subtitleColor"),
			subtitleScale: numberValue("subtitleScale", 60, 160),
			brightness: numberValue("brightness", 0, 200),
			zoom: numberValue("zoom", 0, 400),
			offsetX: numberValue("offsetX", -200, 200),
			offsetXRangeVersion: 2,
			offsetY: numberValue("offsetY", -200, 200),
			rotation: numberValue("rotation", -180, 180),
			textScale: numberValue("textScale", 0, 200),
			bottomTextScale: numberValue("bottomTextScale", 0, 200),
			textScaleLinked: booleanValue("textScaleLinked"),
			textStroke: numberValue("textStroke", 0, 100),
			textShadow: numberValue("textShadow", 0, 100),
			textShadowDefaultVersion: 1,
			titleScaleVersion: 3,
			shade: numberValue("shade", 0, 100),
			bottomShade: numberValue("bottomShade", 0, 100),
			showSafeArea: booleanValue("showSafeArea"),
			compareEnabled: booleanValue("compareEnabled"),
			beforeZoom: numberValue("beforeZoom", 100, 300),
			beforeOffsetX: numberValue("beforeOffsetX", -100, 100),
			beforeOffsetY: numberValue("beforeOffsetY", -100, 100),
			beforeRotation: numberValue("beforeRotation", -180, 180),
			beforeBrightness: numberValue("beforeBrightness", 0, 200),
			beforeShade: numberValue("beforeShade", 0, 100),
			beforeBottomShade: numberValue("beforeBottomShade", 0, 100),
			beforeFrameScale: numberValue("beforeFrameScale", 100, 120),
			watermarkScale: numberValue("watermarkScale", 0, 300),
			watermarkAlign,
			watermarkOpacity: numberValue("watermarkOpacity", 0, 100),
			watermarkEnabled: booleanValue("watermarkEnabled"),
			watermarkDefaultVersion: profile === "static-memory" && Number.isFinite(staticWatermarkDefaultVersion) ? staticWatermarkDefaultVersion : 1
		};
	}
	function updateCoverSetting(settings, key, value) {
		return normalizeCoverSettings({
			...settings,
			[key]: value
		});
	}
	//#endregion
	//#region app/cover/core/responsive-layout.ts
	function resolveCoverLayoutMode({ width, height, pointer }) {
		if (pointer === "fine" && width >= 1180) return "desktop";
		if (width >= 680 && (width > height || pointer === "fine")) return "split";
		return "compact";
	}
	//#endregion
	//#region app/cover/core/tool-registry.ts
	function deepFreeze(value) {
		if (value && typeof value === "object") {
			for (const child of Object.values(value)) deepFreeze(child);
			Object.freeze(value);
		}
		return value;
	}
	function immutableTools(tools) {
		return deepFreeze(tools.map((tool) => ({ ...tool })));
	}
	var EMPTY_TOOLS = deepFreeze([]);
	var PRIMARY_TOOLS = deepFreeze([
		{
			id: "photo",
			label: "照片"
		},
		{
			id: "compose",
			label: "构图"
		},
		{
			id: "text",
			label: "文字"
		},
		{
			id: "image",
			label: "画面"
		},
		{
			id: "retouch",
			label: "涂抹"
		},
		{
			id: "layout",
			label: "版式"
		},
		{
			id: "more",
			label: "更多"
		}
	]);
	var SECONDARY_TOOLS = deepFreeze({
		photo: [
			{
				id: "uploadMain",
				primary: "photo",
				label: "精修图上传/更换",
				kind: "action"
			},
			{
				id: "uploadBefore",
				primary: "photo",
				label: "拍摄前照片上传/更换",
				kind: "action"
			},
			{
				id: "comparison",
				primary: "photo",
				label: "前后对比",
				kind: "toggle",
				settingKey: "compareEnabled",
				defaultValue: false
			},
			{
				id: "safeArea",
				primary: "photo",
				label: "安全区",
				kind: "toggle",
				settingKey: "showSafeArea",
				defaultValue: true
			},
			{
				id: "syncCover",
				primary: "photo",
				label: "同步封面",
				kind: "action"
			}
		],
		compose: [
			{
				id: "target",
				primary: "compose",
				label: "主照片与文字 / 拍摄前照片",
				kind: "choice"
			},
			{
				id: "zoom",
				primary: "compose",
				label: "照片缩放",
				kind: "range",
				settingKey: "zoom",
				min: 0,
				max: 400,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "offsetX",
				primary: "compose",
				label: "左右位置",
				kind: "range",
				settingKey: "offsetX",
				min: -200,
				max: 200,
				defaultValue: 0
			},
			{
				id: "offsetY",
				primary: "compose",
				label: "上下位置",
				kind: "range",
				settingKey: "offsetY",
				min: -200,
				max: 200,
				defaultValue: 0
			},
			{
				id: "rotation",
				primary: "compose",
				label: "自由旋转",
				kind: "range",
				settingKey: "rotation",
				min: -180,
				max: 180,
				defaultValue: 0,
				suffix: "°"
			},
			{
				id: "beforeZoom",
				primary: "compose",
				label: "拍摄前照片缩放",
				kind: "range",
				settingKey: "beforeZoom",
				min: 100,
				max: 300,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "beforeOffsetX",
				primary: "compose",
				label: "拍摄前左右位置",
				kind: "range",
				settingKey: "beforeOffsetX",
				defaultValue: 0,
				dynamicBounds: "beforeOffsetLimits.x"
			},
			{
				id: "beforeOffsetY",
				primary: "compose",
				label: "拍摄前上下位置",
				kind: "range",
				settingKey: "beforeOffsetY",
				defaultValue: 0,
				dynamicBounds: "beforeOffsetLimits.y"
			},
			{
				id: "beforeRotation",
				primary: "compose",
				label: "拍摄前自由旋转",
				kind: "range",
				settingKey: "beforeRotation",
				min: -180,
				max: 180,
				defaultValue: 0,
				suffix: "°"
			},
			{
				id: "alignBefore",
				primary: "compose",
				label: "尝试对齐",
				kind: "action"
			},
			{
				id: "resetBeforeFrame",
				primary: "compose",
				label: "恢复对比图默认尺寸",
				kind: "action"
			}
		],
		text: [
			{
				id: "topText",
				primary: "text",
				label: "上行主标题",
				kind: "text",
				settingKey: "topText",
				max: 18
			},
			{
				id: "bottomText",
				primary: "text",
				label: "下行主标题",
				kind: "text",
				settingKey: "bottomText",
				max: 18
			},
			{
				id: "subtitle",
				primary: "text",
				label: "补充小字",
				kind: "text",
				settingKey: "subtitle",
				max: 38
			},
			{
				id: "topColor",
				primary: "text",
				label: "上行颜色",
				kind: "color",
				settingKey: "topColor",
				defaultValue: "#FFFFFF"
			},
			{
				id: "bottomColor",
				primary: "text",
				label: "下行颜色",
				kind: "color",
				settingKey: "bottomColor",
				defaultValue: "#FFFFFF"
			},
			{
				id: "subtitleColor",
				primary: "text",
				label: "小字颜色",
				kind: "color",
				settingKey: "subtitleColor",
				defaultValue: "#FFFFFF"
			},
			{
				id: "dividerColor",
				primary: "text",
				label: "横线颜色",
				kind: "color",
				settingKey: "dividerColor",
				defaultValue: "#C9A77A"
			},
			{
				id: "textScale",
				primary: "text",
				label: "上行标题大小",
				kind: "range",
				settingKey: "textScale",
				min: 0,
				max: 200,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "bottomTextScale",
				primary: "text",
				label: "下行标题大小",
				kind: "range",
				settingKey: "bottomTextScale",
				min: 0,
				max: 200,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "subtitleScale",
				primary: "text",
				label: "小字大小",
				kind: "range",
				settingKey: "subtitleScale",
				min: 60,
				max: 160,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "textScaleLinked",
				primary: "text",
				label: "上下行大小联动",
				kind: "toggle",
				settingKey: "textScaleLinked",
				defaultValue: true
			},
			{
				id: "showDivider",
				primary: "text",
				label: "显示标题横线",
				kind: "toggle",
				settingKey: "showDivider",
				defaultValue: true
			},
			{
				id: "textStroke",
				primary: "text",
				label: "字体描边",
				kind: "range",
				settingKey: "textStroke",
				min: 0,
				max: 100,
				defaultValue: 0,
				suffix: "%"
			},
			{
				id: "textShadow",
				primary: "text",
				label: "字体阴影",
				kind: "range",
				settingKey: "textShadow",
				min: 0,
				max: 100,
				defaultValue: 50,
				suffix: "%"
			},
			{
				id: "syncCopy",
				primary: "text",
				label: "文案同步",
				kind: "action"
			}
		],
		image: [
			{
				id: "brightness",
				primary: "image",
				label: "亮度",
				kind: "range",
				settingKey: "brightness",
				min: 0,
				max: 200,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "shade",
				primary: "image",
				label: "压暗强度",
				kind: "range",
				settingKey: "shade",
				min: 0,
				max: 100,
				defaultValue: 0,
				suffix: "%"
			},
			{
				id: "bottomShade",
				primary: "image",
				label: "底部向上压暗",
				kind: "range",
				settingKey: "bottomShade",
				min: 0,
				max: 100,
				defaultValue: 100,
				suffix: "%"
			}
		],
		retouch: [
			{
				id: "retouchEnabled",
				primary: "retouch",
				label: "开启/退出涂抹",
				kind: "toggle",
				defaultValue: false
			},
			{
				id: "retouchTarget",
				primary: "retouch",
				label: "主照片记录 / 拍摄前记录",
				kind: "choice"
			},
			{
				id: "brushSize",
				primary: "retouch",
				label: "画笔大小",
				kind: "range",
				min: 20,
				max: 400,
				defaultValue: 120
			},
			{
				id: "brushFeather",
				primary: "retouch",
				label: "羽化",
				kind: "range",
				min: 0,
				max: 100,
				defaultValue: 70,
				suffix: "%"
			},
			{
				id: "brushStrength",
				primary: "retouch",
				label: "涂抹强度",
				kind: "range",
				min: 0,
				max: 100,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "retouchBefore",
				primary: "retouch",
				label: "涂抹前",
				kind: "action"
			},
			{
				id: "retouchAfter",
				primary: "retouch",
				label: "涂抹后",
				kind: "action"
			},
			{
				id: "undoRetouch",
				primary: "retouch",
				label: "撤销一步",
				kind: "action"
			},
			{
				id: "clearRetouch",
				primary: "retouch",
				label: "全部清除",
				kind: "action"
			}
		],
		layout: [{
			id: "template",
			primary: "layout",
			label: "9 个标题位置模板",
			kind: "choice"
		}, {
			id: "platform",
			primary: "layout",
			label: "抖音 / 小红书 / 视频号",
			kind: "choice"
		}],
		more: [
			{
				id: "watermarkEnabled",
				primary: "more",
				label: "使用 / 不使用水印",
				kind: "choice",
				settingKey: "watermarkEnabled",
				defaultValue: false
			},
			{
				id: "replaceWatermark",
				primary: "more",
				label: "更换水印",
				kind: "action"
			},
			{
				id: "removeWatermark",
				primary: "more",
				label: "移除临时水印并恢复固定水印",
				kind: "action"
			},
			{
				id: "watermarkAlign",
				primary: "more",
				label: "左 / 中 / 右",
				kind: "choice",
				settingKey: "watermarkAlign",
				defaultValue: "left"
			},
			{
				id: "watermarkOpacity",
				primary: "more",
				label: "水印透明度",
				kind: "range",
				settingKey: "watermarkOpacity",
				min: 0,
				max: 100,
				defaultValue: 50,
				suffix: "%"
			},
			{
				id: "memory1",
				primary: "more",
				label: "记忆 1",
				kind: "action"
			},
			{
				id: "memory2",
				primary: "more",
				label: "记忆 2",
				kind: "action"
			},
			{
				id: "memory3",
				primary: "more",
				label: "记忆 3",
				kind: "action"
			},
			{
				id: "resetSettings",
				primary: "more",
				label: "恢复默认",
				kind: "action"
			},
			{
				id: "factoryReset",
				primary: "more",
				label: "彻底重置",
				kind: "action"
			},
			{
				id: "coverRules",
				primary: "more",
				label: "长期规范",
				kind: "action"
			}
		]
	});
	var beforeComposeIds = new Set([
		"beforeZoom",
		"beforeOffsetX",
		"beforeOffsetY",
		"beforeRotation",
		"alignBefore",
		"resetBeforeFrame"
	]);
	var beforeImageSettingKeys = {
		brightness: "beforeBrightness",
		shade: "beforeShade",
		bottomShade: "beforeBottomShade"
	};
	function getSecondaryTools(primary, context) {
		if (primary === "photo") return immutableTools(context.comparisonEnabled ? SECONDARY_TOOLS.photo : SECONDARY_TOOLS.photo.filter((tool) => tool.id !== "uploadBefore"));
		if (primary === "compose") {
			if (context.target === "before") {
				if (!context.comparisonEnabled) return EMPTY_TOOLS;
				return immutableTools(SECONDARY_TOOLS.compose.filter((tool) => tool.id === "target" || beforeComposeIds.has(tool.id)));
			}
			return immutableTools(SECONDARY_TOOLS.compose.filter((tool) => tool.id === "target" || !beforeComposeIds.has(tool.id)));
		}
		if (primary === "image") {
			if (context.target === "before") {
				if (!context.comparisonEnabled) return EMPTY_TOOLS;
				return immutableTools(SECONDARY_TOOLS.image.map((tool) => ({
					...tool,
					settingKey: beforeImageSettingKeys[tool.id]
				})));
			}
			return immutableTools(SECONDARY_TOOLS.image);
		}
		return immutableTools(primary === "retouch" && !context.comparisonEnabled ? SECONDARY_TOOLS.retouch.filter((tool) => tool.id !== "retouchTarget") : SECONDARY_TOOLS[primary]);
	}
	//#endregion
	exports.DEFAULT_COVER_SETTINGS = DEFAULT_COVER_SETTINGS;
	exports.PRIMARY_TOOLS = PRIMARY_TOOLS;
	exports.SECONDARY_TOOLS = SECONDARY_TOOLS;
	exports.getSecondaryTools = getSecondaryTools;
	exports.normalizeCoverSettings = normalizeCoverSettings;
	exports.resolveCoverLayoutMode = resolveCoverLayoutMode;
	exports.updateCoverSetting = updateCoverSetting;
	return exports;
})({});
