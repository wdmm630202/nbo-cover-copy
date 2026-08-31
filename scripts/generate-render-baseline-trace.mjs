import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildBaselineFixture } from "../tests/helpers/render-trace-harness.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const fixturePath = fileURLToPath(new URL("../tests/fixtures/render-baseline-trace.json", import.meta.url));
const fixture = buildBaselineFixture(repoRoot);
await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(`Wrote ${fixture.cases.length} baseline traces from ${fixture.provenance.commit} to ${fixturePath}`);
