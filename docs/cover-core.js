var NBOCoverCore = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region app/cover/core/responsive-layout.ts
	function resolveCoverLayoutMode({ width, height, pointer }) {
		if (pointer === "fine" && width >= 1180) return "desktop";
		if (width >= 680 && (width > height || pointer === "fine")) return "split";
		return "compact";
	}
	//#endregion
	//#region app/cover/core/tool-registry.ts
	var PRIMARY_TOOLS = [
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
	];
	var SECONDARY_TOOLS = {
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
				defaultValue: 0
			},
			{
				id: "beforeOffsetY",
				primary: "compose",
				label: "拍摄前上下位置",
				kind: "range",
				settingKey: "beforeOffsetY",
				defaultValue: 0
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
	};
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
		if (primary === "photo") return context.comparisonEnabled ? SECONDARY_TOOLS.photo : SECONDARY_TOOLS.photo.filter((tool) => tool.id !== "uploadBefore");
		if (primary === "compose") {
			if (context.target === "before") {
				if (!context.comparisonEnabled) return [];
				return SECONDARY_TOOLS.compose.filter((tool) => tool.id === "target" || beforeComposeIds.has(tool.id));
			}
			return SECONDARY_TOOLS.compose.filter((tool) => tool.id === "target" || !beforeComposeIds.has(tool.id));
		}
		if (primary === "image") {
			if (context.target === "before") {
				if (!context.comparisonEnabled) return [];
				return SECONDARY_TOOLS.image.map((tool) => ({
					...tool,
					settingKey: beforeImageSettingKeys[tool.id]
				}));
			}
			return SECONDARY_TOOLS.image;
		}
		return SECONDARY_TOOLS[primary];
	}
	//#endregion
	exports.PRIMARY_TOOLS = PRIMARY_TOOLS;
	exports.SECONDARY_TOOLS = SECONDARY_TOOLS;
	exports.getSecondaryTools = getSecondaryTools;
	exports.resolveCoverLayoutMode = resolveCoverLayoutMode;
	return exports;
})({});
