# NBO 灵感封面

南铂个人使用的免费图片转封面文案工具。

## 已实现

- 上传 JPG、PNG、WEBP 后手动开始识别，可随时停止并忽略本轮结果
- Gemini 多模态真实识图，不再套用固定男士写真模板
- 采集 Google/Bing 公开搜索联想并显示来源与时间
- 每轮生成 3 组通用封面方案，严格校验上行 7 字、下行 8 字
- 上行、下行、完整 15 字均可单独复制
- 小红书、抖音、视频号分别生成独立的标题、描述和相关话题
- 每个平台同时给出目标观众、钩子手段和写作策略，不直接套用同一模板
- 表情符号由图片风格和平台人群决定，克制使用而非强行添加
- 所有服务异常、网络中断和未知错误都会先转换成中文，页面不直接显示英文报错
- 使用免费稳定模型优先处理；遇到繁忙会自动延时重试，并切换到免费快速备用模型
- 支持“不满意，换一批”和复制当前平台整套内容
- 密码首次验证后在当前浏览器记住 180 天
- API 密钥仅保存在 Apps Script 项目属性中，不进入仓库
- 封面制作统一使用一套正式工作台，原有九种版式与构图工具保持不变
- 可切换“前后对比”，加入独立拍摄前照片、四周溶图、虚线框与“拍摄前/后”胶囊
- 拍摄前照片仅保留在当前浏览器内存中，刷新即清除；抖音对比元素自动锁进居中 3:4 安全区

## 公开入口

- GitHub Pages：<https://wdmm630202.github.io/nbo-cover-copy/>
- 正式封面工作台：<https://wdmm630202.github.io/nbo-cover-copy/cover.html>
- AI 应用：<https://script.google.com/macros/s/AKfycbwE3jYEnaSh75A-5ft6T-ChSvDnKrLFHvKi8fBvMEHhyRcBgieWcKsuN-3iuuzwQIQ_/exec>

GitHub Pages 和 Sites 只负责跳转，核心 AI 页面与服务端逻辑由 Google Apps Script 托管。

## 源码

- `apps-script/Code.gs`：访问验证、Gemini 调用、公开搜索联想、字数校验与刷新
- `apps-script/Index.html`：响应式网页、上传预览、开始/停止、结果与复制交互
- `docs/index.html`：GitHub Pages 稳定入口
- `docs/cover.html`、`docs/cover.js`：唯一正式封面界面及导出逻辑
- `app/page.tsx`：Sites 入口

## 免费版边界

- 使用 Gemini API 免费层；达到 Google 免费额度后需等待额度恢复
- “当前公开趋势信号”来自公开搜索联想，不代表小红书或抖音官方热榜
- 图片会发送给 Gemini 做本次识别；本站不建立图片存储

## 平台字数策略

- 小红书：标题控制在 20 字内；正文建议 180–420 字；话题建议 5–8 个
- 抖音：工具标题控制在 30 字内；描述建议 60–180 字；话题建议 3–5 个
- 视频号：工具标题采用 30 字安全线；描述建议 80–220 字；话题建议 2–4 个

抖音开放平台的发布接口说明整段文本不超过 1000 字，分享能力页面另标注标题 60 字符。本工具主动采用更短的运营建议值，而不把接口最大值当成最佳创作长度。视频号公开页面暂未找到稳定可核验的独立标题硬上限，因此页面明确标注为“工具安全线”。

参考：

- <https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/create-video/video-create>
- <https://developer.open-douyin.com/m/docs/resource/zh-CN/mini-app/develop/api/open-interface/video-capacity/upload-douyin-video>
- <https://creator.xiaohongshu.com/>
