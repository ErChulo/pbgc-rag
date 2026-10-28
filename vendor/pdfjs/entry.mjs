/* Local browser-only packaging adapter; upstream source files remain unmodified. */
import * as pdfjs from './source/pdf.mjs';
import { WorkerMessageHandler } from './source/pdf.worker.mjs';
import assets from './assets.json';
globalThis.pdfjsWorker = { WorkerMessageHandler };
class LocalBinaryDataFactory {
  async fetch({ kind, filename }) {
    const folder = kind === 'cMapUrl' ? 'cmaps' : kind === 'standardFontDataUrl' ? 'standard_fonts' : null;
    const key = folder && folder + '/' + filename;
    if (!key || !Object.hasOwn(assets, key)) throw Error('Unsupported local PDF resource: ' + kind + '/' + filename);
    return Uint8Array.from(atob(assets[key]), c => c.charCodeAt(0));
  }
}
globalThis.PBGC_PDFJS = Object.freeze({ getDocument: pdfjs.getDocument, version: pdfjs.version, LocalBinaryDataFactory });
