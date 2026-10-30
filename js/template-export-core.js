export const normalized=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase().replace(/[^A-Z0-9]/g,'');
const aliases={TOAN:['TOAN'],VAN:['NGUVAN','VAN'],LY:['VATLI','VATLY'],HOA:['HOAHOC'],SINH:['SINHHOC'],SU:['LICHSU'],DIA:['DIALI','DIALY'],KTPL:['GDKTPL','GIAODUCKINHTEVAPHAPLUAT'],N1:['NGOAINGU1','TIENGANH'],N4:['TIENGTRUNG'],N5:['TIENGDUC'],TIN:['TINHOC']};
export function identifySubject(text){const n=normalized(text).replace(/^MONHOC/,'').replace(/^MONTHI/,'');return Object.entries(aliases).find(([,names])=>names.includes(n))?.[0]||'';}
export function colIndex(value){const letters=String(value||'').trim().toUpperCase();if(!/^[A-Z]{1,3}$/.test(letters))throw new Error('Cột phải là chữ cái Excel, ví dụ K hoặc L.');const n=[...letters].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;if(n>=16384)throw new Error('Cột vượt XFD.');return n;}
export function colName(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export function inspectSheet(ws,XLSX,period){
 const range=XLSX.utils.decode_range(ws['!ref']||'A1'),cells=Object.entries(ws).filter(([a])=>/^[A-Z]+\d+$/.test(a));
 const top=cells.filter(([a])=>XLSX.utils.decode_cell(a).r<60);
 const labels=top.map(([address,c])=>({address,text:String(c.v??''),key:normalized(c.v),...XLSX.utils.decode_cell(address)}));
 const id=labels.find(c=>/MADINHDANH|MAHOCSINH/.test(c.key));
 const name=labels.find(c=>/HOVATEN/.test(c.key));const cls=labels.find(c=>c.key==='TENLOP'||c.key==='LOP');
 const subjectCell=labels.find(c=>/^MONHOC|^MONTHI/.test(c.key));
 const metadata=labels.filter(c=>/NAMHOC|HOCKY/.test(c.key)).map(c=>c.text).join(' ');
 const mid=labels.filter(c=>c.key==='DDGGK'||c.key==='DIEMGIUAKY'||c.key==='GIUAHKI'||c.key==='GIUAHKII');
 const end=labels.filter(c=>c.key==='DDGCK'||c.key==='DIEMCUOIKY'||c.key==='CUOIHKI'||c.key==='CUOIHKII');
 let headerEnd=Math.max(id?.r??0,name?.r??0,cls?.r??0);
 for(const m of ws['!merges']||[])if(m.s.r<=headerEnd&&m.e.r>=headerEnd&&[id?.c,name?.c,cls?.c].includes(m.s.c))headerEnd=Math.max(headerEnd,m.e.r);
 const target=(period.startsWith('mid')?mid:end);
 const classLine=labels.find(c=>c.key.startsWith('LOP')&&c.text.includes(':'));
 return {enabled:!!id,idColumn:id?colName(id.c):'',nameColumn:name?colName(name.c):'',classColumn:cls?colName(cls.c):'',classCode:classLine?classLine.text.replace(/^\s*Lớp\s*:\s*/i,'').trim():'',subject:identifySubject(subjectCell?.text),target:target.length===1?colName(target[0].c):'',firstRow:headerEnd+2,lastRow:range.e.r+1,metadata,subjectText:subjectCell?.text||'',headers:labels.filter(c=>c.r===id?.r).map(c=>`${colName(c.c)}: ${c.text}`).join('; ')};
}
export function buildTemplatePlan(mappings,sources,{includeAbsent=false,decimals='keep'}={}){
 const writes=[],issues=[],summary=[],destinations=new Set(),covered=new Set(),sourceMaps=new Map();
 for(const [code,rows] of Object.entries(sources)){
  const map=new Map();for(const r of rows){const id=String(r.student_code??'').trim();if(!id){issues.push({subject:code,status:'Mã nguồn trống',id:'',sheet:'',file:'',cell:''});continue;}if(map.has(id))map.set(id,null);else map.set(id,r);}sourceMaps.set(code,map);
 }
 const duplicateTargets=new Set(),identityCounts=new Map();
 for(const m of mappings.filter(m=>m.enabled)){
  if(!m.subject||!m.target||!m.idColumn||!Number.isInteger(Number(m.firstRow))||Number(m.firstRow)<1)throw new Error(`${m.fileName} / ${m.sheetName}: cần xác định môn, cột mã, cột đích và dòng bắt đầu.`);
  const ci=colIndex(m.idColumn),ti=colIndex(m.target);if([ci,m.nameColumn?colIndex(m.nameColumn):-1,m.classColumn?colIndex(m.classColumn):-1].includes(ti))throw new Error('Cột điểm trùng cột thông tin học sinh.');
  for(let row=Number(m.firstRow);row<=m.lastRow;row++){const c=m.ws[colName(ci)+row];if(c?.v==null||c.v==='')continue;const id=String(c.v).trim(),k=`${m.subject}|${id}`;identityCounts.set(k,(identityCounts.get(k)||0)+1);}
 }
 for(const [k,n] of identityCounts)if(n>1)duplicateTargets.add(k);
 for(const m of mappings.filter(m=>m.enabled)){
  const source=sourceMaps.get(m.subject);if(!source)throw new Error(`Chưa tải kết quả môn ${m.subject}.`);
  const stats={file:m.fileName,sheet:m.sheetName,subject:m.subject,target:m.target,writes:0,skipped:0};summary.push(stats);
  const issue=(status,row,id,old='',score='')=>{stats.skipped++;issues.push({file:m.fileName,sheet:m.sheetName,subject:m.subject,cell:m.target+row,id,status,old,score});};
  const idCol=m.idColumn.toUpperCase(),target=m.target.toUpperCase();
  const occupied=Object.entries(m.ws).find(([address,cell])=>address.match(/^([A-Z]+)(\d+)$/)?.[1]===target&&Number(address.match(/\d+/)[0])>=Math.min(Number(m.firstRow),m.detectedFirstRow||Number(m.firstRow))&&(cell.f!=null||(cell.v!=null&&cell.v!=='')));
  if(occupied){stats.blocked=true;issue('CHẶN: cột đích đã có dữ liệu hoặc công thức; không ghi cả cột',Number(occupied[0].match(/\d+/)[0]),'',occupied[1].v??occupied[1].f);continue;}
  if((m.ws['!merges']||[]).some(r=>colIndex(target)>=r.s.c&&colIndex(target)<=r.e.c&&r.e.r>=Number(m.firstRow)-1))throw new Error(`${m.sheetName}: cột điểm có ô gộp trong vùng học sinh.`);
  for(let row=Number(m.firstRow);row<=m.lastRow;row++){
   const cell=m.ws[idCol+row],id=cell?.v==null?'':String(cell.v).trim();
   if(!id){if(m.nameColumn&&m.ws[m.nameColumn+row]?.v)issue('Mã mẫu trống',row,'');continue;}
   if(cell.f||(cell.t!=='s'&&cell.t!=='str')){issue('Mã mẫu không phải Text',row,id);continue;}
   if(duplicateTargets.has(`${m.subject}|${id}`)){issue('Mã trùng trong mẫu cùng môn',row,id);continue;}
   const r=source.get(id);if(r===undefined){issue('Không có học sinh dự thi môn này',row,id);continue;}if(r===null){issue('Mã nguồn trùng',row,id);continue;}
   const classValue=m.classColumn?String(m.ws[m.classColumn+row]?.v??'').trim():m.classCode;
   if(!classValue||normalized(classValue)!==normalized(r.class_code)){issue('Sai hoặc thiếu lớp',row,id);continue;}
   covered.add(`${m.subject}|${id}`);
   if(r.is_absent&&!includeAbsent){issue('Bỏ qua môn vắng',row,id);continue;}
   if(r.total_score==null||r.total_score===''||!Number.isFinite(Number(r.total_score))){issue('Chưa có điểm ghép hợp lệ',row,id);continue;}
   let score=Number(r.total_score);if(score<0){issue('Điểm âm không hợp lệ',row,id);continue;}
   if(decimals!=='keep'){const d=Number(decimals);if(![0,1,2,3].includes(d))throw new Error('Số chữ số thập phân không hợp lệ.');score=Math.round((score+Number.EPSILON)*10**d)/10**d;}
   const address=target+row,old=m.ws[address];
   if(old?.f){issue('Giữ ô công thức',row,id,old.f,score);continue;}
   if(old?.v!=null&&old.v!==''){issue('CHẶN: ô đã có dữ liệu',row,id,old.v,score);continue;}
   const key=`${m.fileIndex}|${m.sheetName}|${address}`;if(destinations.has(key))throw new Error('Hai ánh xạ ghi vào cùng ô.');destinations.add(key);
   writes.push({fileIndex:m.fileIndex,sheetName:m.sheetName,address,score,old:old?.v??'',id,subject:m.subject});stats.writes++;
  }
 }
 for(const [code,map] of sourceMaps)for(const [id,r] of map)if(r&&r.total_score!=null&&!covered.has(`${code}|${id}`))issues.push({file:'',sheet:'',subject:code,id,cell:'',status:'Kết quả nguồn chưa đối chiếu được với mẫu',score:r.total_score,old:''});
 return {writes,issues,summary};
}

// Patch only numeric score cells in the original XML; never reconstruct the workbook.
export function patchSheetXml(xml,writes){
 let result=xml;
 for(const {address,score} of writes){
  if(!/^[A-Z]{1,3}[1-9]\d*$/.test(address)||!Number.isFinite(score))throw new Error('Ô/điểm ghi không hợp lệ.');
  const cellPattern=new RegExp(`<((?:[\\w]+:)?c)\\b([^>]*\\br=["']${address}["'][^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1>)`);
  let found=false;
  result=result.replace(cellPattern,(_all,tag,attrs,inner='')=>{found=true;if(/<(?:\w+:)?f\b/.test(inner))throw new Error('Không ghi đè ô công thức.');const prefix=tag.includes(':')?tag.split(':')[0]+':':'';return `<${tag}${attrs.replace(/\s+t=["'][^"']*["']/g,'')}><${prefix}v>${score}</${prefix}v>${inner.replace(/<(?:\w+:)?v\b[^>]*>[\s\S]*?<\/(?:\w+:)?v>/g,'').replace(/<(?:\w+:)?is\b[^>]*>[\s\S]*?<\/(?:\w+:)?is>/g,'')}</${tag}>`;});
  if(!found){const rowNo=address.match(/\d+/)[0],rowPattern=new RegExp(`<((?:[\\w]+:)?row)\\b([^>]*\\br=["']${rowNo}["'][^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1>)`);let rowFound=false;
   result=result.replace(rowPattern,(_all,tag,attrs,inner='')=>{rowFound=true;const prefix=tag.includes(':')?tag.split(':')[0]+':':'',cell=`<${prefix}c r="${address}"><${prefix}v>${score}</${prefix}v></${prefix}c>`;let inserted=false;inner=inner.replace(/<((?:\w+:)?c)\b([^>]*\br=["']([A-Z]+)\d+["'][^>]*?)(?:\/>|>[\s\S]*?<\/\1>)/g,(all,_tag,_attrs,col)=>{if(!inserted&&colIndex(col)>colIndex(address.replace(/\d+/,''))){inserted=true;return cell+all;}return all;});return `<${tag}${attrs}>${inner}${inserted?'':cell}</${tag}>`;});
   if(!rowFound)throw new Error(`Không tìm thấy hàng của ô ${address}.`);
  }
 }
 // A manually selected column can extend beyond the original used range.
 result=result.replace(/(<(?:\w+:)?dimension\b[^>]*\bref=["'])([A-Z]+\d+)(?::([A-Z]+\d+))?(["'])/,(_all,before,start,end,quote)=>{
  const last=end||start;let maxCol=colIndex(last.replace(/\d+/,'')),maxRow=Number(last.match(/\d+/)[0]);
  for(const w of writes){maxCol=Math.max(maxCol,colIndex(w.address.replace(/\d+/,'')));maxRow=Math.max(maxRow,Number(w.address.match(/\d+/)[0]));}
  return before+start+':'+colName(maxCol)+maxRow+quote;
 });
 return result;
}
export async function writeWorkbookArchive(bytes,changes,JSZip,DOMParserClass=globalThis.DOMParser){
 const zip=await JSZip.loadAsync(bytes),wbPart=zip.file('xl/workbook.xml'),relPart=zip.file('xl/_rels/workbook.xml.rels');if(!wbPart||!relPart)throw new Error('Tệp không phải workbook XLSX chuẩn.');
 const parse=s=>new DOMParserClass().parseFromString(s,'application/xml');const wb=parse(await wbPart.async('string')),rels=parse(await relPart.async('string'));
 const elements=(doc,name)=>[...doc.querySelectorAll('*')].filter(n=>n.localName.split(':').at(-1)===name);
 const relMap=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
 for(const sheet of elements(wb,'sheet')){
  const items=changes.filter(c=>c.sheetName===sheet.getAttribute('name'));if(!items.length)continue;
  const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relMap.get(rid);if(!target)throw new Error('Không tìm được đường dẫn sheet.');
  const segments=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),safe=[];for(const s of segments){if(s==='..')safe.pop();else if(s&&s!=='.')safe.push(s);}const path=safe.join('/'),part=zip.file(path);if(!part)throw new Error('Không tìm được XML sheet.');zip.file(path,patchSheetXml(await part.async('string'),items));
 }
 if(changes.some(c=>!elements(wb,'sheet').some(s=>s.getAttribute('name')===c.sheetName)))throw new Error('Sheet đích không tồn tại.');
 return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
