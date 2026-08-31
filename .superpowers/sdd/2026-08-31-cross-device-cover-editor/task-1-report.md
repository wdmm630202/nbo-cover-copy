# Task 1 报告：冻结封面工具功能与桌面基线

## 实现

- 新增 `tests/cover-feature-inventory.test.mjs`，读取当前 `CoverStudio.tsx`、`docs/cover.html`、`docs/cover.js`，逐项断言固定功能令牌仍存在。
- 新增 `tests/fixtures/cover-feature-inventory.json`，写入 brief 要求的 42 个 `requiredTokens`，作为后续改版的功能保留契约。
- 按 Controller ruling 未对 `tests/rendered-html.test.mjs` 做无意义修改；该测试作为基线一起运行。
- 未修改生产代码或产品行为。

## 命令与结果

- `pnpm exec node --test tests/cover-feature-inventory.test.mjs`：受本机 pnpm ignored-build policy 阻断（`ERR_PNPM_IGNORED_BUILDS`，触发 install）；未作为测试结论依据。
- `/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/cover-feature-inventory.test.mjs`：按要求 RED，失败原因是 fixture 不存在（`ENOENT .../tests/fixtures/cover-feature-inventory.json`）。
- `/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/cover-feature-inventory.test.mjs tests/rendered-html.test.mjs`：GREEN，4/4 通过。
- `/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vinext/dist/cli.js build`：通过，Build complete。
- `/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false`：通过。
- `/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs`：42/42 通过（新增库存测试后总数为 42）。
- `git diff --check`：通过。

## RED/GREEN 证据

RED：测试已先写入，未创建 fixture 时测试明确失败，错误为读取 fixture 的 `ENOENT`，不是断言或语法错误。

GREEN：创建 brief 指定的精确 fixture 后，库存测试与 `rendered-html.test.mjs` 4/4 通过；完整 Node 测试 42/42 通过。

## 变更文件

- `tests/cover-feature-inventory.test.mjs`（新增）
- `tests/fixtures/cover-feature-inventory.json`（新增）
- `tests/rendered-html.test.mjs`（未修改；无必要断言）

工作树中已有的 `pnpm-workspace.yaml` 修改与本任务无关，未触碰。

## 自检

- `requiredTokens` 与 task brief 逐项一致，共 42 项。
- 测试只读取现有源文件，不引入 mock，不改变生产行为。
- 使用了要求的 bundled Node 可执行文件完成 RED、GREEN、构建、类型检查和全量测试。
- 已检查 whitespace error；无新增 diff 检查问题。

## 关注事项

- 当前 Mac 的 `pnpm exec` 会因依赖安装脚本被忽略而失败；后续测试应继续使用 brief/controller 指定的 bundled Node executable，或先由环境维护者处理 pnpm build-script policy。
- 本任务未对桌面截图/浏览器视觉进行改动或重新生成；冻结的是现有源码功能令牌与已有渲染 HTML 测试基线。
