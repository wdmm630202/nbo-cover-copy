import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
let chromium;
for(const specifier of ['playwright',pathToFileURL(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href]) {
  try { ({chromium}=await import(specifier));break; } catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
}
const executablePath=process.env.NBO_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let available=Boolean(chromium);
try {await access(executablePath);}catch{available=false;}
export {chromium,executablePath,available};
