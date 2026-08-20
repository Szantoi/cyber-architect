import fs from 'node:fs';
import path from 'node:path';

const DIST_DIRECTORY = path.resolve('dist');
const INDEX_PATH = path.join(DIST_DIRECTORY, 'index.html');
const BUDGETS = Object.freeze({
  entryJavaScript: 150_000,
  initialJavaScript: 500_000,
  initialCss: 180_000,
  markdownRenderer: 100_000,
  markdownVendor: 400_000
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assetSize(assetPath) {
  const normalizedPath = assetPath.replace(/^\//, '');
  const filePath = path.resolve(DIST_DIRECTORY, normalizedPath.replace(/^assets[\\/]/, 'assets/'));
  assert(filePath.startsWith(`${DIST_DIRECTORY}${path.sep}`), `Unsafe asset path in build output: ${assetPath}`);
  assert(fs.existsSync(filePath), `Referenced build asset does not exist: ${assetPath}`);
  return fs.statSync(filePath).size;
}

function findChunk(prefix) {
  const chunkName = fs.readdirSync(path.join(DIST_DIRECTORY, 'assets'))
    .find((name) => name.startsWith(`${prefix}-`) && name.endsWith('.js'));
  assert(chunkName, `Expected ${prefix} chunk was not produced.`);
  return {
    path: `/assets/${chunkName}`,
    size: assetSize(`/assets/${chunkName}`)
  };
}

assert(fs.existsSync(INDEX_PATH), 'Production bundle is missing. Run npm run build first.');
const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
const entryPath = indexHtml.match(/<script[^>]+type="module"[^>]+src="(?<path>\/assets\/[^"]+\.js)"/)?.groups?.path;
assert(entryPath, 'Production HTML is missing its module entry script.');

const initialAssetPaths = [...indexHtml.matchAll(/(?:src|href)="(?<path>\/assets\/[^"]+\.(?:js|css))"/g)]
  .map((match) => match.groups.path);
const uniqueInitialAssetPaths = [...new Set(initialAssetPaths)];
const initialJavaScriptPaths = uniqueInitialAssetPaths.filter((assetPath) => assetPath.endsWith('.js'));
const initialCssPaths = uniqueInitialAssetPaths.filter((assetPath) => assetPath.endsWith('.css'));
const initialJavaScript = initialJavaScriptPaths
  .reduce((total, assetPath) => total + assetSize(assetPath), 0);
const initialCss = initialCssPaths
  .reduce((total, assetPath) => total + assetSize(assetPath), 0);
const entryJavaScript = assetSize(entryPath);
const markdownRenderer = findChunk('MarkdownRenderer');
const markdownVendor = findChunk('markdown-vendor');

assert(entryJavaScript <= BUDGETS.entryJavaScript, `Entry JS exceeds budget: ${entryJavaScript} > ${BUDGETS.entryJavaScript} bytes.`);
assert(
  initialJavaScript <= BUDGETS.initialJavaScript,
  `Initial JS exceeds budget: ${initialJavaScript} > ${BUDGETS.initialJavaScript} bytes (${initialJavaScriptPaths.join(', ')}).`
);
assert(initialCss <= BUDGETS.initialCss, `Initial CSS exceeds budget: ${initialCss} > ${BUDGETS.initialCss} bytes.`);
assert(markdownRenderer.size <= BUDGETS.markdownRenderer, `MarkdownRenderer exceeds budget: ${markdownRenderer.size} > ${BUDGETS.markdownRenderer} bytes.`);
assert(markdownVendor.size <= BUDGETS.markdownVendor, `Markdown vendor exceeds budget: ${markdownVendor.size} > ${BUDGETS.markdownVendor} bytes.`);
assert(
  uniqueInitialAssetPaths.every((assetPath) => !/mermaid/i.test(assetPath)),
  'Mermaid must remain outside the initial page load.'
);

console.log(JSON.stringify({
  status: 'BUNDLE_BUDGET_OK',
  bytes: {
    entryJavaScript,
    initialJavaScript,
    initialCss,
    markdownRenderer: markdownRenderer.size,
    markdownVendor: markdownVendor.size
  },
  budgets: BUDGETS
}, null, 2));
