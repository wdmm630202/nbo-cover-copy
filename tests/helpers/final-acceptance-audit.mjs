import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CANONICAL_OWNERS = Object.freeze({
  drawCover: "app/cover/core/render-core.ts",
  eraseShadeWithBrush: "app/cover/core/retouch-core.ts",
  createCoverExportAsset: "app/cover/core/export-core.ts",
  PRIMARY_TOOLS: "app/cover/core/tool-registry.ts",
  SECONDARY_TOOLS: "app/cover/core/tool-registry.ts",
  resolveCanvasInteractionMode: "app/cover/core/interaction-core.ts",
  appendRetouchPoint: "app/cover/core/interaction-core.ts",
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

function declaredNames(node) {
  const names = [];
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) names.push(node.name.text);
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    }
  }
  return names;
}

function moduleFacts(source, fileName) {
  const scriptKind = fileName.endsWith("x") ? ts.ScriptKind.TSX : fileName.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const declarations = new Set();
  const imports = [];
  const exports = new Set();
  const primitives = new Set();
  const visit = (node) => {
    for (const name of declaredNames(node)) {
      declarations.add(name);
      if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports.add(name);
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node)?.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) exports.add(element.name.text);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (["getContext", "createLinearGradient", "createRadialGradient", "quadraticCurveTo", "toBlob"].includes(name)) primitives.add(name);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "globalCompositeOperation") primitives.add("globalCompositeOperation");
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { declarations, imports, exports, primitives };
}

function asPath(rootPath, path) {
  return relative(rootPath, path).split("\\").join("/");
}

export async function auditCoreOwnership(repoRoot, options = {}) {
  const rootPath = resolve(fileURLToPath(new URL(repoRoot)));
  const candidates = (await walk(resolve(rootPath, "app")))
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .concat(resolve(rootPath, "docs/cover.js"));
  const facts = new Map();
  for (const path of candidates) {
    const name = asPath(rootPath, path);
    const source = `${await readFile(path, "utf8")}\n${options.mutants?.[name] || ""}`;
    facts.set(name, moduleFacts(source, name));
  }

  for (const [symbol, owner] of Object.entries(CANONICAL_OWNERS)) {
    const declaredBy = [...facts].filter(([, value]) => value.declarations.has(symbol)).map(([name]) => name);
    if (declaredBy.length !== 1 || declaredBy[0] !== owner) {
      throw new Error(`${symbol} 必须只由 ${owner} 定义，实际：${declaredBy.join(", ") || "无"}`);
    }
    if (!facts.get(owner)?.exports.has(symbol)) throw new Error(`${owner} 没有导出 ${symbol}`);
  }

  const permittedCanvasOwners = new Set([
    "app/cover/core/render-core.ts", "app/cover/core/retouch-core.ts", "app/cover/core/export-core.ts", "app/cover/compare-layout.ts",
  ]);
  const duplicateCanvasAlgorithms = [];
  for (const [name, value] of facts) {
    const paintPrimitives = [...value.primitives].filter((item) => item !== "getContext" && item !== "toBlob");
    if (!permittedCanvasOwners.has(name) && value.primitives.has("getContext") && paintPrimitives.length >= 2) {
      duplicateCanvasAlgorithms.push({ name, primitives: [...value.primitives] });
    }
  }
  if (duplicateCanvasAlgorithms.length) {
    throw new Error(`发现重复 Canvas 算法：${duplicateCanvasAlgorithms.map(({ name }) => name).join(", ")}`);
  }

  const staticEntry = facts.get("app/cover/core/static-entry.ts");
  for (const owner of new Set(Object.values(CANONICAL_OWNERS))) {
    const stem = `./${owner.split("/").at(-1).replace(/\.ts$/, "")}`;
    if (!staticEntry?.imports.includes(stem)) throw new Error(`static-entry 未连接 canonical 模块 ${stem}`);
  }
  const studio = facts.get("app/cover/CoverStudio.tsx");
  if (!studio?.imports.some((value) => value.endsWith("/render-core"))) throw new Error("React shell 未导入 RenderCore");
  const staticShell = facts.get("docs/cover.js");
  for (const symbol of ["drawCover", "PRIMARY_TOOLS", "SECONDARY_TOOLS"]) {
    if (staticShell?.declarations.has(symbol)) throw new Error(`静态 shell 重复定义 ${symbol}`);
  }
  return { owners: { ...CANONICAL_OWNERS }, duplicateCanvasAlgorithms };
}

export function parseScriptSources(html) {
  const sources = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<script", cursor);
    if (start < 0) break;
    const end = html.indexOf(">", start + 7);
    if (end < 0) break;
    const attributes = html.slice(start + 7, end);
    let index = 0;
    while (index < attributes.length) {
      while (/\s/.test(attributes[index] || "")) index += 1;
      let key = "";
      while (/[\w:-]/.test(attributes[index] || "")) key += attributes[index++];
      while (/\s/.test(attributes[index] || "")) index += 1;
      if (attributes[index] !== "=") { index += 1; continue; }
      index += 1;
      while (/\s/.test(attributes[index] || "")) index += 1;
      const quote = attributes[index];
      if (quote !== '"' && quote !== "'") { index += 1; continue; }
      index += 1;
      let value = "";
      while (index < attributes.length && attributes[index] !== quote) value += attributes[index++];
      index += 1;
      if (key.toLowerCase() === "src") sources.push(value);
    }
    cursor = end + 1;
  }
  return sources;
}

export function assertLayoutSnapshot(snapshot) {
  if (!snapshot?.viewport || !snapshot?.preview) throw new Error("缺少布局测量");
  if (snapshot.preview.width < 120 || snapshot.preview.height < 120) throw new Error("预览尺寸不合理");
  const intersects = (rect, area) => rect.right > area.left && rect.left < area.right && rect.bottom > area.top && rect.top < area.bottom;
  if (!intersects(snapshot.preview, snapshot.viewport)) throw new Error("预览不在 visualViewport 内");
  const minimumTarget = snapshot.minimumTarget || 44;
  for (const control of snapshot.interactive || []) {
    if (control.width < minimumTarget || control.height < minimumTarget) throw new Error(`${control.id} 点击区域不足 ${minimumTarget}px`);
    if (!intersects(control, snapshot.viewport)) throw new Error(`${control.id} 不在 visualViewport 内`);
  }
  if (snapshot.transformedOffscreen?.length) throw new Error(`transform 移出可用区域：${snapshot.transformedOffscreen.join(", ")}`);
}

export function assertToolCoverage(expectedIds, coverage) {
  const missing = expectedIds.filter((id) => coverage[id] !== true);
  if (missing.length) throw new Error(`缺少真实回调：${missing.join(", ")}`);
}

export function assertShellTraceParity(traces) {
  const names = ["compact", "split", "desktop"];
  for (const name of names) {
    const value = traces[name];
    if (!value || value.width !== 1080 || value.height !== 1920) throw new Error(`${name} 最终 render request 不是 1080×1920`);
  }
  const baseline = JSON.stringify(traces.compact.trace);
  for (const name of names.slice(1)) {
    if (JSON.stringify(traces[name].trace) !== baseline) throw new Error(`跨 shell render trace 不一致：${name}`);
  }
}
