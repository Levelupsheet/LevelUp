const fs = require('node:fs');
const ts = require('typescript');
// Development CLI only. Production routes use Next's compiled modules.
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText,file);
module.exports = {
 ...require('../../src/lib/contentEngine.ts'),
 ...require('../../src/lib/contentGeneration.ts'),
 ...require('../../src/lib/contentImport.ts'),
 ...require('../../src/lib/contentPipeline.ts'),
};
