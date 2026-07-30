# NBO 灵感封面

南铂个人使用的免费图片转封面文案工具。

## 已实现

- 上传 JPG、PNG、WEBP 后手动开始识别，可随时停止并忽略本轮结果
- Gemini 多模态真实识图，不再套用固定男士写真模板
- 采集 Google/Bing 公开搜索联想并显示来源与时间
- 每轮生成 3 组高意向方案，严格校验上行 7 字、下行 8 字
- 整理小红书、抖音、视频号正文与相关话题
- 支持“不满意，换一批”和一键复制
- 密码首次验证后在当前浏览器记住 180 天
- API 密钥仅保存在 Apps Script 项目属性中，不进入仓库

## 公开入口

- GitHub Pages：<https://wdmm630202.github.io/nbo-cover-copy/>
- AI 应用：<https://script.google.com/macros/s/AKfycbwE3jYEnaSh75A-5ft6T-ChSvDnKrLFHvKi8fBvMEHhyRcBgieWcKsuN-3iuuzwQIQ_/exec>

GitHub Pages 和 Sites 只负责跳转，核心 AI 页面与服务端逻辑由 Google Apps Script 托管。

## 源码

- `apps-script/Code.gs`：访问验证、Gemini 调用、公开搜索联想、字数校验与刷新
- `apps-script/Index.html`：响应式网页、上传预览、开始/停止、结果与复制交互
- `docs/index.html`：GitHub Pages 稳定入口
- `app/page.tsx`：Sites 入口

## 免费版边界

- 使用 Gemini API 免费层；达到 Google 免费额度后需等待额度恢复
- “当前公开趋势信号”来自公开搜索联想，不代表小红书或抖音官方热榜
- 图片会发送给 Gemini 做本次识别；本站不建立图片存储
