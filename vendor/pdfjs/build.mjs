/* Build-only tool. Run from any directory; supply a pinned esbuild module path. */
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.argv[2]) throw Error('Usage: node vendor/pdfjs/build.mjs /path/to/esbuild/lib/main.js');
const { build } = await import(pathToFileURL(process.argv[2]));
await build({
  entryPoints: [fileURLToPath(new URL('./entry.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('./pdfjs-local.js', import.meta.url)),
  bundle: true, format: 'iife', platform: 'browser', target: ['chrome120'],
  define: { process: 'undefined' }, minify: true, legalComments: 'eof', logLevel: 'warning'
});
