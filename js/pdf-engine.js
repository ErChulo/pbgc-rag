/* Bounded offline text extraction adapter for the pinned local Mozilla PDF.js engine. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, expandedStream: 8 * 1024 * 1024, expandedTotal: 32 * 1024 * 1024, streams: 10000, pages: 2000, items: 100000, textChars: 4 * 1024 * 1024, dictionaryTokens: 100000 });
  const fail = text => { throw Error('PDF import: ' + text); };
  function dictionary(source, start) {
    let i = start, tokens = 0;
    const whitespace = () => { while (i < source.length) { if (/\s|\0/.test(source[i])) i++; else if (source[i] === '%') { while (i < source.length && !/[\r\n]/.test(source[i])) i++; } else break; } };
    function value(depth = 0) {
      if (++tokens > LIMITS.dictionaryTokens || depth > 64) fail('dictionary resource limit exceeded.');
      whitespace();
      if (source.startsWith('<<', i)) {
        i += 2; const out = Object.create(null);
        while (true) {
          whitespace(); if (source.startsWith('>>', i)) { i += 2; return out; }
          const key = value(depth + 1); if (!key || typeof key.name !== 'string') fail('malformed dictionary key.');
          if (Object.hasOwn(out, key.name)) fail('duplicate dictionary key.');
          out[key.name] = value(depth + 1);
        }
      }
      if (source[i] === '[') { i++; const out = []; while (true) { whitespace(); if (source[i] === ']') { i++; return out; } out.push(value(depth + 1)); } }
      if (source[i] === '/') {
        i++; const begin = i; while (i < source.length && !/[\s\0()<>\[\]{}/%]/.test(source[i])) i++;
        return { name: source.slice(begin, i).replace(/#([0-9a-f]{2})/gi, (_, n) => String.fromCharCode(parseInt(n, 16))) };
      }
      if (source[i] === '(') {
        let nesting = 1; i++;
        while (i < source.length && nesting) { const c = source[i++]; if (c === '\\') i++; else if (c === '(') nesting++; else if (c === ')') nesting--; }
        if (nesting) fail('unclosed dictionary string.'); return { string: true };
      }
      if (source[i] === '<') { const end = source.indexOf('>', ++i); if (end < 0) fail('unclosed hex string.'); i = end + 1; return { string: true }; }
      const m = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(source.slice(i));
      if (m) {
        i += m[0].length; const number = Number(m[0]); const checkpoint = i; whitespace();
        const reference = /^(\d+)\s+R\b/.exec(source.slice(i));
        if (reference) { i += reference[0].length; return { ref: number, generation: Number(reference[1]) }; }
        i = checkpoint; if (!Number.isFinite(number)) fail('invalid numeric dictionary value.'); return number;
      }
      const keyword = /^(true|false|null)\b/.exec(source.slice(i));
      if (keyword) { i += keyword[0].length; return keyword[1] === 'null' ? null : keyword[1] === 'true'; }
      fail('unsupported or malformed dictionary value.');
    }
    const result = value(); whitespace(); return { result, end: i };
  }
  function checkContent(bytes) {
    if(bytes.length>2*1024*1024)fail('decoded content stream exceeds 2 MiB.');
    const text=new TextDecoder('latin1').decode(bytes);
    for(let i=0;i<text.length;i++){
      if(text[i]==='%'){while(i<text.length&&!/[\r\n]/.test(text[i]))i++;continue;}
      if(text[i]==='('){let depth=1,size=0;i++;while(i<text.length&&depth){if(++size>65536)fail('a content literal exceeds 65536 encoded characters.');if(text[i]==='\\'){i+=2;continue;}if(text[i]==='(')depth++;else if(text[i]===')')depth--;i++;}if(depth)fail('unclosed content literal.');i--;}
      else if(text[i]==='<'&&text[i+1]!=='<'){const begin=i;while(i<text.length&&text[i]!=='>')i++;if(i-begin>131072)fail('a content hex literal exceeds limits.');}
      else if(text[i]==='<'&&text[i+1]==='<')i++;
    }
  }
  async function countInflate(bytes, remaining, content) {
    let reader,total=0;const chunks=[];
    try{
      reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
      while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
        if(total>LIMITS.expandedStream||total>remaining||(content&&total>2*1024*1024)){await reader.cancel();fail('decoded stream expansion exceeds limits.');}
        if(content)chunks.push(value);
      }
    }catch(error){if(error.message.startsWith('PDF import:'))throw error;fail('invalid or unsupported Flate stream.');}
    finally{if(reader)reader.releaseLock();}
    if(content){const joined=new Uint8Array(total);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}checkContent(joined);}
    return total;
  }
  async function preflight(bytes) {
    const source=new TextDecoder('latin1').decode(bytes);
    if(!/^%PDF-1\.[0-7]/.test(source.slice(0,9)))fail('only PDF 1.0–1.7 is currently supported.');
    const objects=/\b(\d+)\s+(\d+)\s+obj\b/g;
    let object,total=0,objectCount=0;const checkedStreams=new Set(),streams=[],contents=new Set();
    while((object=objects.exec(source))){
      if(++objectCount>50000)fail('object count exceeds limits.');
      let begin=objects.lastIndex;while(begin<source.length){if(/[\s\0]/.test(source[begin]))begin++;else if(source[begin]==='%'){while(begin<source.length&&!/[\r\n]/.test(source[begin]))begin++;}else break;}
      if(!source.startsWith('<<',begin))continue;
      const {result:dict,end}=dictionary(source,begin);
      if(dict.Type?.name==='ObjStm')fail('compressed object streams are not yet supported by the bounded preflight.');
      if(dict.Contents!==undefined&&dict.Contents!==null){
        for(const ref of Array.isArray(dict.Contents)?dict.Contents:[dict.Contents]){
          if(!ref||!Number.isSafeInteger(ref.ref)||!Number.isSafeInteger(ref.generation))fail('page content must use direct stream references.');
          contents.add(`${ref.ref} ${ref.generation}`);
        }
      }
      if(!source.startsWith('stream',end)){objects.lastIndex=end;continue;}
      checkedStreams.add(end);let start=end+6;
      if(source.startsWith('\r\n',start))start+=2;else if(source[start]==='\n'||source[start]==='\r')start++;else fail('stream must start on a new line.');
      if(streams.length>=LIMITS.streams)fail('stream count exceeds limits.');
      const length=dict.Length;
      if(!Number.isSafeInteger(length)||length<0||start+length>bytes.length)fail('streams require a bounded direct Length; indirect lengths are unsupported.');
      let stop=start+length;while(/[\r\n]/.test(source[stop]||'x'))stop++;
      if(!source.startsWith('endstream',stop)||!/[\s\0<>\[\]()/%]/.test(source[stop+9]||'x'))fail('declared stream length does not match endstream.');
      let filter=dict.Filter;if(Array.isArray(filter)){if(filter.length!==1)fail('multiple stream filters are unsupported.');filter=filter[0];}
      if(filter&&!['FlateDecode','Fl'].includes(filter.name))fail('only raw and Flate-compressed streams are supported by the bounded preflight.');
      const params=Array.isArray(dict.DecodeParms)?dict.DecodeParms[0]:dict.DecodeParms;
      if(params&&(params.ref||typeof params!=='object'||(params.Columns!==undefined&&(!Number.isInteger(params.Columns)||params.Columns<1||params.Columns>10000))||(params.Colors!==undefined&&(!Number.isInteger(params.Colors)||params.Colors<1||params.Colors>32))||(params.BitsPerComponent!==undefined&&![1,2,4,8,16].includes(params.BitsPerComponent))))fail('stream predictor dimensions exceed supported bounds.');
      streams.push({start,length,filter,key:`${object[1]} ${object[2]}`});objects.lastIndex=stop+'endstream'.length;
    }
    for(const match of source.matchAll(/\bstream(?:\r\n|\r|\n)/g))if(!checkedStreams.has(match.index)&&!streams.some(s=>match.index>=s.start&&match.index<s.start+s.length))fail('a stream lies outside the supported bounded object structure.');
    for(const key of contents)if(!streams.some(s=>s.key===key))fail('indirect content arrays or missing streams are unsupported.');
    for(const stream of streams){const data=bytes.subarray(stream.start,stream.start+stream.length),content=contents.has(stream.key);
      if(stream.filter)total+=await countInflate(data,LIMITS.expandedTotal-total,content);
      else{if(content)checkContent(data);total+=data.length;}
      if(total>LIMITS.expandedTotal)fail('total decoded stream size exceeds limits.');
    }
  }
  async function parsePDFAdvanced(input) {
    if (!(input instanceof Uint8Array) || input.byteLength > LIMITS.bytes || input.byteLength < 8) fail('select a PDF of at most 16 MiB.');
    const bytes = input.slice(); // PDF.js may transfer its input; originals must remain intact.
    await preflight(bytes);
    const engine = root.PBGC_PDFJS;
    if (!engine || typeof engine.getDocument !== 'function') fail('the verified local PDF engine is unavailable.');
    let loading, document, total = 0; const records = [], pagesWithoutNativeText = [];
    try {
      loading = engine.getDocument({ data: bytes, BinaryDataFactory: engine.LocalBinaryDataFactory, cMapUrl: 'local-cmaps/', standardFontDataUrl: 'local-fonts/', useWorkerFetch: false, useWasm: false, useSystemFonts: false, disableFontFace: true, disableAutoFetch: true, disableRange: true, disableStream: true, enableXfa: false, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, maxImageSize: 1000000, stopAtErrors: true, verbosity: 0 });
      loading.onPassword = () => { loading.destroy().catch(()=>{}); };
      document = await loading.promise;
      if (!Number.isInteger(document.numPages) || document.numPages > LIMITS.pages) fail('page count exceeds limits.');
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        try {
          const reader = page.streamTextContent({ includeMarkedContent: false, disableNormalization: false }).getReader();
          let index = 0;
          try {
            while (true) {
              const { value, done } = await reader.read(); if (done) break;
              for (const item of value.items) {
                if (typeof item.str !== 'string' || !item.str.trim()) continue;
                index++; total += item.str.length;
                if (records.length >= LIMITS.items || total > LIMITS.textChars) { await reader.cancel(); fail('extracted text exceeds limits.'); }
                if (!Array.isArray(item.transform) || item.transform.length !== 6 || item.transform.some(n => !Number.isFinite(n)) || !Number.isFinite(item.width) || !Number.isFinite(item.height)) fail('invalid text geometry.');
                records.push({ text: item.str, fields: { extraction: 'native PDF text; no OCR or image interpretation', direction: item.dir, fontName: item.fontName, hasEOL: item.hasEOL, extractor: 'Mozilla PDF.js ' + engine.version }, locator: { kind: 'pdf', label: `Page ${pageNumber} · text item ${index}`, page: pageNumber, textItem: index, transform: [...item.transform], width: item.width, height: item.height, boundingBox: null, coordinateSystem: 'PDF user space; transform and dimensions are extraction geometry, not exact glyph bounding boxes', pageView: [...page.view], rotation: page.rotate } });
              }
            }
          } finally { reader.releaseLock(); }
          if(!index)pagesWithoutNativeText.push(pageNumber);
        } finally { page.cleanup(); }
      }
      if (!records.length) fail('no native text found; scanned-image OCR is not available.');
      records[0].fields.documentPageCount=document.numPages;
      records[0].fields.pagesWithoutNativeText=pagesWithoutNativeText;
      return records;
    } catch (error) {
      if (error.message && error.message.startsWith('PDF import:')) throw error;
      fail('native text extraction failed: ' + (error.message || 'unsupported PDF'));
    } finally { if (loading) await loading.destroy(); }
  }
  const api = { parsePDFAdvanced, pdfAdvancedLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
