# 南铂封面 Live 模式

基于已发布版本 `4e4e7c4` 增量开发。默认关闭；普通模式继续使用原来的绘制和 JPG / PNG 导出路径。静态网页与 React 工作台共用排版、动画时间线、绘制核心、Live 控件和文件封装。

## 使用

1. 添加精修主照片与拍摄前素颜照，调整照片构图。
2. 预览右上角点击「制作 Live」。三行文字固定为 45% / 45% / 114%，左对齐，顶部与素颜框对齐。每行最多六字；只在 Live 下限制，原有长标题不会被开启开关或其他参数修改截断。
   每次开启 Live，固定默认文案为「男士素人改造 / 原来普通男士 / 也能拍成这样」。该默认值独立于普通模式草稿，不随换照片、动画样式、平台或其它参数更新；用户可主动编辑三行文字。
3. 可修改三行文字、颜色、图片、图片缩放位置旋转、亮度、压暗、涂抹和水印。字号、版式、对比开关、素颜框尺寸与自动对齐被锁定并变灰。
4. 右侧原动画位置提供曜石银、香槟金、雾海蓝、松石绿、赤陶棕五组卡片。每组由上方主角卡和下方主题卡组成；在选中的卡片内设置 0/25/50/75/100% 底色浓度（默认 50%）、人声、音效、虚线（默认开）和重播。三句主题文案继续使用原有输入框。
5. 「播放动效」预览；「导出 Live」生成实况配对文件包。导出中的设置和照片采用独立快照，编辑不会把两次状态混进同一个文件。支持取消。
6. 关闭 Live 恢复开启前的字号、版式和对比框参数；用户在 Live 中主动更改的文案、照片和其他可编辑参数保留。

## 三秒分镜

| 时间 | 画面 |
| --- | --- |
| 0–0.45 秒 | 素颜照入场，下卡出现第一句。 |
| 0.45–0.95 秒 | 第二句出现，第一句保留。 |
| 0.95–1.4 秒 | 第三句及原渐变装饰线出现，三句累加保留。 |
| 1.4–2.1 秒 | 主图揭晓，上卡从下卡上沿滑出；原主角字体动画与柔和边缘扫光完成。 |
| 2.1–3 秒 | 全部定格。配音「下一位，是你吗？」从 1 秒播放至接近结束。 |

两张卡片等大，左边缘继承原文字边界；上下间距和到素颜照的水平间距统一为 24 个设计像素（随导出宽度缩放）。整列顶部与素颜框顶部对齐，下卡底部与素颜框底部对齐。下卡直接调用 `drawCoverText`，保留原字体、颜色、行距及一字长、两端渐隐的装饰线；只增加逐句显现和整体适配卡片的缩放。普通封面不启用该适配。

视频为 30 fps 共 90 帧，抖音 2160×3840，其它平台 2160×2880。Live 照片独立沿用普通封面的原像素 JPG 导出规则，取最终定格，标记时间 `89/30 = 2.9667 秒`。普通 JPG/PNG 路径保持原规则。安全区辅助线仅在预览显示；卡片虚线随卡片开关导出。

## 苹果相册保存

Live Photo 使用带同一关联标识的 JPG 和 H.264 MOV，并包含 Apple 定格时间元数据。它不是 GIF，也不是改扩展名的视频。导出的 JPG 和 MOV 必须保持配对；仅分别下载到手机不能自动成为一张实况照片。

电脑 Chrome 点击「导出 Live」后首次选择桌面并授权，直接生成包含配对 JPG / MOV 的独立文件夹；同一页面后续导出复用已授权目录。刷新后可能需要再次选择或授权。其它浏览器保留 ZIP 下载。直接保存桌面不代表已经导入苹果相册。

Mac 相册保存流程：使用直接保存的文件夹（或先解压 Live 文件包）→ 打开「南铂实况保存助手」→ 选择包含一组同名 JPG / MOV 的文件夹 → 验证后点「存入照片」。助手通过 PhotoKit 将 `.photo` 与 `.pairedVideo` 一次性加入同一个相册资产；点击保存才申请添加权限。启用 iCloud 照片的设备可随后同步。网页不直接写入手机相册。

保存助手支持 macOS 13 及以上、Intel 和 Apple 芯片。当前构建使用本地签名，未进行 Apple 公证；网络下载后首次打开可能受到系统限制。本地应用在 `outputs/live-helper/南铂实况保存助手.app`；源代码在 `scripts/live-photo-helper.swift`。不会自动启动、访问相册、上传或保存用户素材。

苹果 Photos 框架已识别浏览器实际导出的配对文件为 `LIVE_PHOTO_VALID`。这项验证不等于已完成 iPhone 真机保存和长按播放验收；保存助手的相册写入需在用户点击保存后发生，自动检查不会写入个人相册。

## 维护和验证

- `app/cover/core/live-layout.ts`：默认文案、锁定值、原照片进场函数与两卡几何布局。
- `app/cover/core/card-pair.ts`：两卡合成、原文案绘制调用、统一虚线和自然扫光。
- `public/live/card-series.js`：三秒文案累加和主角入场时间线；`controls.js` 让预览、视频与照片快照共用此时间线。
- `scripts/render-pair-hero.mjs` + `scripts/pack-pair-hero.py`：从已确认的 v10 源码提取主角字体动画；不会生成或修改人物照片。`scripts/retime-card-audio.mjs` 重排原扫光音效，保留原男声。
- `app/cover/core/render-core.ts`：照片、涂抹、字体、字号、行距、渐变横线、虚线框、前后胶囊和水印均复用原绘制；Live 动画位置从原文字边界计算，不另设一套文字排版。
- `public/live/`：控件、动画图集、JPG / MOV 封装和 Mac 助手发布包；`docs/live/` 为静态镜像。
- `pnpm build:cover-core` 同时更新静态核心与 Live 资源；`pnpm test` 构建、类型检查并运行完整回归；`pnpm lint` 检查规范。
- `pnpm build:live-helper` 在 Mac 上构建通用架构助手；随后运行 `pnpm build:cover-core` 同步静态下载资源。
- 动画按需加载，普通模式不下载动画图集或视频编码组件。编码器取消、错误和完成时都会释放；切换样式会清空旧导出缓存。
- `node scripts/smoke-live-export.mjs` 通过真实 Chrome 操作工作台、输出分镜帧和实况文件。需 Playwright / Chrome；可用 `NBO_TEST_CHROME` 指定 Chrome。
- `swift scripts/verify-live-photo.swift 路径.JPG 路径.MOV` 只读校验关联标识、3 秒时长、最后一帧标记和 Photos 识别。

元数据模板通过 Apple 的 AVFoundation / ImageIO 生成，未加入用户素材。需要重建时：

```sh
swift scripts/generate-live-templates.swift work/live-template
node scripts/extract-live-templates.mjs
pnpm build:cover-core
```

模板提取器会拒绝未知 EXIF 布局。重建模板后必须重新完成浏览器导出与原生识别验证。旧版保存在 Git 基线；当前功能分支为 `codex/cover-live`，发布前可用该基线回退。

接口依据：[Apple Live Photo 资源验证](https://developer.apple.com/documentation/photos/phlivephoto/request(withresourcefileurls:placeholderimage:targetsize:contentmode:resulthandler:))、[Apple PHAssetCreationRequest](https://developer.apple.com/documentation/photos/phassetcreationrequest)。
