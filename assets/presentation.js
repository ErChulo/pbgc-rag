/* Reading labels only. Exact locators and integrity metadata remain unchanged. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const number=value=>Number.isInteger(value)&&value>0;
  function formatLocation(locator,fallback='Source excerpt') {
    if(!locator||typeof locator!=='object')return fallback;
    switch(locator.type){
      case 'text-line': return number(locator.line)?`Line ${locator.line}`:fallback;
      case 'delimited-cell': return number(locator.row)&&number(locator.column)?`Row ${locator.row}, column ${locator.column}`:fallback;
      case 'word-paragraph': {
        const part=typeof locator.part==='string'?locator.part:'';
        const section=/\/header\d+\.xml$/.test(part)?'Header':/\/footer\d+\.xml$/.test(part)?'Footer':/\/footnotes\.xml$/.test(part)?'Footnotes':/\/endnotes\.xml$/.test(part)?'Endnotes':'';
        const pieces=[];
        if(section)pieces.push(section);
        if(number(locator.table)&&number(locator.row)&&number(locator.column))pieces.push(`Table ${locator.table}, row ${locator.row}, column ${locator.column}`);
        if(number(locator.paragraph))pieces.push(`Paragraph ${locator.paragraph}`);
        return pieces.join(' · ')||fallback;
      }
      case 'word-binary-paragraph': return number(locator.paragraph)?`Paragraph ${locator.paragraph}`:fallback;
      case 'excel-cell': return typeof locator.sheet==='string'&&typeof locator.cell==='string'?`${locator.sheet} · Cell ${locator.cell}`:fallback;
      case 'sqlite-cell': return typeof locator.table==='string'&&typeof locator.column==='string'&&locator.rowid!==undefined?`${locator.table} · Row ${locator.rowid} · ${locator.column}`:fallback;
      case 'pdf-text-item': return number(locator.page)?`Page ${locator.page}${number(locator.item)?` · Text excerpt ${locator.item}`:''}`:fallback;
      case 'json-pointer': {
        if(typeof locator.pointer!=='string')return fallback;
        if(locator.pointer==='')return 'Document value';
        // Array indices remain zero-based; do not invent human paragraph/row positions.
        return 'JSON value: '+locator.pointer;
      }
      case 'html-text-offset': return 'HTML text excerpt';
      case 'xml-text': return typeof locator.path==='string'?`XML element: ${locator.path}`:'XML text excerpt';
      default:return fallback;
    }
  }
  return {formatLocation};
});
