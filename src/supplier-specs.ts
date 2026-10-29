export interface ExtractedFact {key:string;label:string;value:string|number;evidence:string;source:string;retrievedAt:string;status:'Retrieved — review required'}
export function extractSpecifications(html:string,source:string){
 const text=html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(?:td|th)>\s*<(?:td|th)[^>]*>/gi,': ').replace(/<\/(?:p|div|tr|li|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&deg;|&#176;/g,'°').replace(/&amp;/g,'&').replace(/&#(?:8211|8212);|&ndash;|&mdash;/g,'–').replace(/[ \t]+/g,' ');
 const lines=text.split('\n').map(l=>l.trim()).filter(l=>l&&l.length<1600),facts:ExtractedFact[]=[],retrievedAt=new Date().toISOString();
 const put=(key:string,label:string,value:string|number,evidence:string)=>{if(!facts.some(f=>f.key===key))facts.push({key,label,value,evidence:evidence.slice(0,350),source,retrievedAt,status:'Retrieved — review required'})};
 const number=(key:string,label:string,re:RegExp)=>{for(const line of lines){const m=line.match(re);if(m){put(key,label,Number(m[1]),line);break}}};
 number('nominalMl','Nominal volume (ml)',/(?:nominal\s*(?:volume|capacity)|volume|capacity)\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*ml\b/i);
 if(!facts.some(f=>f.key==='nominalMl')){const title=html.match(/<title[^>]*>([^<]*)/i)?.[1]||'';const m=title.match(/\b(\d+(?:\.\d+)?)\s*cl\b/i);if(m)put('nominalMl','Nominal volume (ml)',Number(m[1])*10,title)}
 number('insideDiameterMm','Inner diameter (mm)',/(?:inner|internal|inside)\s*(?:top\s*)?diameter\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*mm/i);
 number('outerDiameterMm','Outer top diameter (mm)',/(?:outer|external)\s*(?:top\s*)?diameter\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*mm/i);
 number('outerHeightMm','Outer height (mm)',/(?:outer|external)\s*height\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*mm/i);
 number('innerHeightMm','Inner height (mm)',/(?:inner|internal|inside)\s*height\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*mm/i);
 for(const [key,label,re] of [
 ['insideDiameterMm','Inner diameter (mm)',/(?:inner|internal|inside)\s*diameter[^\d\n]{0,35}(\d+(?:\.\d+)?)\s*(cm|mm)/i],
 ['outerDiameterMm','Outer top diameter (mm)',/(?:outer|external)\s*diameter\s*(?:\(?top\)?)?[^\d\n]{0,20}(\d+(?:\.\d+)?)\s*(cm|mm)/i],
 ['outerHeightMm','Outer height (mm)',/(?:outer|external)\s*height[^\d\n]{0,25}(\d+(?:\.\d+)?)\s*(cm|mm)/i],
 ['innerHeightMm','Inner height (mm)',/(?:inner|internal|inside)\s*height[^\d\n]{0,40}(\d+(?:\.\d+)?)\s*(cm|mm)/i],
 ] as [string,string,RegExp][]){for(const line of lines){const m=line.match(re);if(m){put(key,label,Number(m[1])*(m[2].toLowerCase()==='cm'?10:1),line);break}}}
 number('approxWaxCapacityG','Approximate wax capacity (g), not measured ml',/(?:approx(?:imate)?\.?\s*)?wax\s*(?:weight|capacity)\s*[:–-]?\s*(?:approx(?:imately)?\.?\s*)?(\d+(?:\.\d+)?)\s*g\b/i);
 number('maxFragrancePct','Published maximum fragrance % — confirm its basis',/(?:fragrance\s*(?:load|addition|maximum|limit))\s*[:–-]?\s*(?:up\s*to|maximum|max\.?)?\s*(\d+(?:\.\d+)?)\s*%/i);
 for(const line of lines){const range=line.match(/fragrance\s*(?:load|addition|usage|range)\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*%?\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/i);if(range){put('minFragrancePct','Published minimum working fragrance % — confirm basis',Number(range[1]),line);put('maxFragrancePct','Published maximum fragrance % — confirm basis',Number(range[2]),line);break}}
 number('maxDyePct','Published maximum dye %',/(?:maximum\s*dye\s*(?:usage|load|addition)?|dye\s*(?:usage|load|addition|limit))\s*[:–-]?\s*(?:up\s*to|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*%/i);
 const title=html.match(/<title[^>]*>([^<]*)/i)?.[1]||'';const pack=title.match(/(?:pack|box|bag)\s*of\s*(\d+)/i);if(pack)put('packDescription','Published pack quantity',`${pack[1]} units per pack`,title);
 for(const [key,label,re] of [
  ['wickNotes','Published wick recommendations',/(?:recommended\s*wick|wick\s*(?:recommendation|guide|for\s+prosoy)|TCR\s*33\s*\/\s*20|ECO\s*12)/i],
  ['compatibilityText','Published wax compatibility',/(?:compatible\s*(?:with|wax)|suitable\s*for|wax\s*type|container candles\s*:|pillar candles\s*:)/i],
  ['fragranceGuidance','Published fragrance guidance',/(?:fragrance\s*(?:load|addition|limit|percentage)|recommended\s*(?:usage|dose)).*\d.*%/i],
  ['dyeGuidance','Published dye usage guidance',/(?:dye|colourant|colorant).*(?:dose|usage|recommend|maximum|addition|%)/i],
  ['meltGuidance','Published melting guidance',/(?:melt\s*(?:to|temperature)|heat\s*(?:to|temperature)|melting\s*temperature).*\d/i],
  ['mixGuidance','Published mixing guidance',/(?:mix(?:ing)?\s*temp|fragrance\s*(?:mixing|addition)\s*temp|add\s*fragrance.*\d+\s*°)/i],
  ['pourGuidance','Published pouring guidance',/(?:pour(?:ing)?\s*temp).*\d/i],
  ['cure','Published curing guidance',/(?:cure|curing)\s*(?:time|for|:).*\d/i],
  ['packDescription','Published pack quantity / weight / volume',/(?:pack\s*(?:of|quantity|size)|box\s*of|bag\s*of|net\s*weight|product\s*weight).*\d/i],
  ['safetyGuidance','Published safety guidance',/(?:safety\s*(?:guidance|in\s*use)|burn\s*test|never\s*leave|flammable)/i],
 ] as [string,string,RegExp][]){const matches=lines.filter(l=>re.test(l)&&l.length>20),specific=key==='wickNotes'?matches.filter(l=>/^recommended\s*wick/i.test(l)):[];const line=specific.length?specific.join(' | ').slice(0,900):matches[0];if(line)put(key,label,line.slice(0,900),line)}
 for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const title=match[2].replace(/<[^>]*>/g,' ').trim(),href=match[1];if(!/sds|safety.data|technical|specification|ifra|clp/i.test(title+' '+href)||!/\.pdf(?:\?|$)|saved_attachments|\bSDS\b|safety\s*data\s*sheet|technical\s*data\s*sheet|IFRA\s*(?:document|certificate)/i.test(title+' '+href))continue;
  try{const u=new URL(href,source);if(u.protocol==='https:'&&!u.username&&!u.password){const key=/sds|safety.data/i.test(title+' '+href)?'sds':/ifra/i.test(title+' '+href)?'fragranceDocumentation':/clp/i.test(title+' '+href)?'clp':'technicalDocument';put(key,title||'Technical document',u.toString(),title||href)}}catch{}
 }
 return facts;
}
