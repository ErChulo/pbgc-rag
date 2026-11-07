/* Original-PDF page view. Only the verified source bytes enter the existing
 * bounded, disposable raster worker. No document HTML or active PDF is embedded. */
(function(root){'use strict';const API=root.PBGCRag;
API.mountPdfPreview=function({readBytes}){
 const $=id=>document.getElementById(id),canvas=$('source-preview-canvas');
 let source=null,page=1,pages=null,bytes=null,controller=null,serial=0,busy=false,original=false,zoom='fit',rasterWidth=0;
 const scales={fit:1.25,'150':1.875,'200':2.5};
 function clearImage(){canvas.width=0;canvas.height=0;canvas.hidden=true;rasterWidth=0;}
 function invalidate(){serial++;controller?.abort();controller=null;busy=false;clearImage();}
 function width(){if(!rasterWidth)return;const viewport=$('source-preview-viewport');if(zoom==='fit'){canvas.style.width='100%';canvas.style.maxWidth=rasterWidth+'px';}else{const base=rasterWidth/(scales[zoom]/scales.fit);canvas.style.width=Math.round(Math.min(base,viewport.clientWidth)*Number(zoom)/100)+'px';canvas.style.maxWidth='none';}}
 function controls(){
  const pdf=!!source&&/\.pdf$/i.test(source.name);$('source-view-switch').hidden=!pdf;
  $('source-show-original').setAttribute('aria-pressed',String(original));$('source-show-text').setAttribute('aria-pressed',String(!original));
  $('source-preview').hidden=!original;$('source-records').hidden=original;
  for(const id of ['source-prev','source-next','source-page'])$(id).hidden=original;
  $('source-preview-cancel').hidden=!busy;$('source-preview-cancel').disabled=false;
  $('source-preview-prev').disabled=busy||!pages||page<=1;$('source-preview-next').disabled=busy||!pages||page>=pages;
  $('source-preview-page').disabled=busy;$('source-preview-go').disabled=busy;$('source-preview-zoom').disabled=busy;
  $('source-preview-page').max=pages||200;$('source-preview-page').value=page;
  $('source-preview-page-count').textContent=pages?`Page ${page} of ${pages}`:'Original PDF page';
 }
 function localError(message){$('source-preview-error').textContent=message;$('source-preview-error').hidden=false;}
 function reset(){invalidate();source=null;bytes=null;pages=null;page=1;zoom='fit';original=false;$('source-preview-zoom').value='fit';$('source-preview-error').hidden=true;$('source-preview-retry').hidden=true;$('source-preview-status').textContent='';controls();}
 async function render(target=page){
  if(!source||!/\.pdf$/i.test(source.name))return;
  if(!Number.isInteger(target)||target<1||target>(pages||200)){localError(`Choose a whole page number from 1 to ${pages||200}.`);return;}
  invalidate();original=true;page=target;const job=serial,ownSource=source;controller=new AbortController();const signal=controller.signal;busy=true;
  $('source-preview-error').hidden=true;$('source-preview-retry').hidden=true;$('source-preview-status').textContent='Opening the original PDF page…';controls();
  try{
   if(!bytes)bytes=readBytes(ownSource);
   if(!pages){const info=await API.inspectPdfPages(bytes,{signal});if(job!==serial)return;pages=info.pages;}
   if(target>pages)throw Error('Selected page is outside this PDF.');
   controls();$('source-preview-status').textContent=`Rendering original page ${target} of ${pages}…`;
   const raster=await API.renderPdfPage(bytes,target,{signal,scale:scales[zoom],maxPixels:4000000});
   if(job!==serial||signal.aborted||!original||source!==ownSource||!$('source-view').open)return;
   if(!Number.isInteger(raster.width)||!Number.isInteger(raster.height)||raster.width<1||raster.height<1||raster.width>4096||raster.height>4096||raster.width*raster.height>4000000||!(raster.data instanceof Uint8ClampedArray)||raster.data.length!==raster.width*raster.height*4)throw Error('Invalid page raster.');
   canvas.width=raster.width;canvas.height=raster.height;canvas.getContext('2d').putImageData(new ImageData(raster.data,raster.width,raster.height),0,0);rasterWidth=raster.width;canvas.hidden=false;width();
   canvas.setAttribute('aria-label',`${ownSource.name}, original PDF page ${target}. Switch to Extracted text for available parsed excerpts.`);
   $('source-preview-status').textContent=`Original PDF page ${target} of ${pages}.`;
  }catch(error){
   if(job!==serial||signal.aborted)return;clearImage();localError('This page could not be displayed. Try again, read the extracted text, or save the original PDF.');
   const details=document.createElement('p');details.textContent='Page preview: '+String(error.message||error).slice(0,500);$('source-verification').append(details);$('source-preview-status').textContent='Preview unavailable.';$('source-preview-retry').hidden=false;
  }finally{if(job===serial){busy=false;controller=null;controls();}}
 }
 function text(){invalidate();original=false;$('source-preview-status').textContent='';$('source-preview-error').hidden=true;$('source-preview-retry').hidden=true;controls();}
 $('source-show-original').addEventListener('click',()=>{if(!busy)render();});$('source-show-text').addEventListener('click',text);
 $('source-preview-prev').addEventListener('click',()=>render(page-1));$('source-preview-next').addEventListener('click',()=>render(page+1));
 function go(){const input=$('source-preview-page');render(input.valueAsNumber);}
 $('source-preview-go').addEventListener('click',go);$('source-preview-page').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();go();}});
 $('source-preview-zoom').addEventListener('change',()=>{const value=$('source-preview-zoom').value;if(!Object.hasOwn(scales,value)){localError('Choose Fit width, 150% or 200%.');return;}zoom=value;render();});
 $('source-preview-retry').addEventListener('click',()=>render());
 $('source-preview-cancel').addEventListener('click',()=>{invalidate();$('source-preview-error').hidden=true;$('source-preview-status').textContent='Preview cancelled. The original file is unchanged.';$('source-preview-retry').hidden=false;controls();$('source-preview-retry').focus();});
 $('source-view').addEventListener('close',()=>{if(!$('source-view').open)reset();});root.addEventListener('resize',width);
 reset();return{setSource(value,target){reset();source=value;page=Number.isInteger(target)&&target>=1&&target<=200?target:1;controls();},close:reset};
};})(globalThis);
