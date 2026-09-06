# 南铂封面 Live 模式

基于已发布版本 `4e4e7c4` 增量开发。默认关闭；普通模式继续使用原来的绘制和 JPG / PNG 导出路径。静态网页与 React 工作台共用排版、动画时间线、绘制核心、Live 控件和文件封装。

## 使用

1. 添加精修主照片与拍摄前素颜照，调整照片构图。
2. 预览右上角点击「制作 Live」。三行文字固定为 45% / 45% / 114%，左对齐，顶部与素颜框对齐。每行最多六字；只在 Live 下限制，原有长标题不会被开启开关或其他参数修改截断。
   每次开启 Live，固定默认文案为「男士素人改造 / 原来普通男生 / 也能拍成这样」。该默认值独立于普通模式草稿，不随换照片、动画样式、平台或其它参数更新；用户可主动编辑三行文字。
3. 可修改三行文字、颜色、图片、图片缩放位置旋转、亮度、压暗、涂抹和水印。字号、版式、对比开关、素颜框尺寸与自动对齐被锁定并变灰。
4. 「动画与保存」提供帅气合焦、Q 萌验证成功、简洁验证成功三种已有透明动画。默认帅气合焦；动画只放在第三行文字下方、素颜框左侧。
5. 「播放动效」预览；「导出 Live」生成实况配对文件包。导出中的设置和照片采用独立快照，编辑不会把两次状态混进同一个文件。支持取消。
6. 关闭 Live 恢复开启前的字号、版式和对比框参数；用户在 Live 中主动更改的文案、照片和其他可编辑参数保留。

## 三秒分镜

| 时间 | 画面 |
| --- | --- |
| 0–1 秒 | 素颜照按比例填满整个画布，缩入右下素颜框。压暗、圆角和边缘逐渐到位。 |
| 1–2 秒 | 精修照按比例填满画布，在一秒内落到用户手动设定的最终构图；素颜框保持落位。 |
| 2–3 秒 | 左下播放一秒完成动效，三行文字、前后拍摄胶囊和水印一起出现，停留在完整成品。 |

抖音输出 1080×1920；切换其他平台时沿用原有 1080×1440 尺寸。照片只进行裁切、缩放和旋转，不拉伸或重绘人物。30 fps 共 90 帧；封面取第 90 帧，标记时间 `89/30 = 2.9667 秒`。辅助线只在预览显示。

## 苹果相册保存

Live Photo 使用带同一关联标识的 JPG 和 H.264 MOV，并包含 Apple 定格时间元数据。它不是 GIF，也不是改扩展名的视频。导出的 JPG 和 MOV 必须保持配对；仅分别下载到手机不能自动成为一张实况照片。

Mac 保存流程：解压 Live 文件包 → 打开「南铂实况保存助手」→ 选择包含一组同名 JPG / MOV 的文件夹 → 验证后点「存入照片」。助手通过 PhotoKit 将 `.photo` 与 `.pairedVideo` 一次性加入同一个相册资产；点击保存才申请添加权限。启用 iCloud 照片的设备可随后同步。网页不直接写入手机相册。

保存助手支持 macOS 13 及以上、Intel 和 Apple 芯片。当前构建使用本地签名，未进行 Apple 公证；网络下载后首次打开可能受到系统限制。本地应用在 `outputs/live-helper/南铂实况保存助手.app`；源代码在 `scripts/live-photo-helper.swift`。不会自动启动、访问相册、上传或保存用户素材。

苹果 Photos 框架已识别浏览器实际导出的配对文件为 `LIVE_PHOTO_VALID`。这项验证不等于已完成 iPhone 真机保存和长按播放验收；保存助手的相册写入需在用户点击保存后发生，自动检查不会写入个人相册。

## 维护和验证

- `app/cover/core/live-layout.ts`：默认文案、锁定值与三段时间线。
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
