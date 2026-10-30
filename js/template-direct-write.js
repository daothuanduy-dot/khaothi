import {writeWorkbookArchive} from './template-export-core.js?v=201';
export const equalBytes=(a,b)=>{const x=new Uint8Array(a),y=new Uint8Array(b);return x.length===y.length&&x.every((v,i)=>v===y[i]);};
export async function saveDirectFiles(files,writes,JSZip,{check=()=>{},onSaved=()=>{},DOMParserClass=globalThis.DOMParser}={}){
 const prepared=[];
 // Prepare and validate the entire batch before opening any writable stream.
 for(let i=0;i<files.length;i++){
  const changes=writes.filter(w=>w.fileIndex===i);if(!changes.length)continue;
  check();const file=files[i];if(!file.handle)throw new Error('Chọn lại thư mục có quyền ghi.');
  if(!equalBytes(await (await file.handle.getFile()).arrayBuffer(),file.bytes))throw new Error(`${file.path}: tệp đã thay đổi sau khi đọc; dừng ghi và đọc lại.`);
  prepared.push({file,bytes:await writeWorkbookArchive(file.bytes,changes,JSZip,DOMParserClass)});
 }
 check();
 for(const item of prepared)if(!equalBytes(await (await item.file.handle.getFile()).arrayBuffer(),item.file.bytes))throw new Error(`${item.file.path}: tệp đã thay đổi; chưa ghi tệp nào.`);
 const saved=[];
 try{
  for(const {file,bytes} of prepared){
   check();if(!equalBytes(await (await file.handle.getFile()).arrayBuffer(),file.bytes))throw new Error(`${file.path}: tệp đã thay đổi; dừng ghi.`);
   const stream=await file.handle.createWritable({mode:'exclusive'});
   try{check();if(!equalBytes(await (await file.handle.getFile()).arrayBuffer(),file.bytes))throw new Error(`${file.path}: tệp đã thay đổi trong khi mở ghi.`);await stream.write(bytes);check();if(!equalBytes(await (await file.handle.getFile()).arrayBuffer(),file.bytes))throw new Error(`${file.path}: tệp bị sửa trong lúc ghi; hủy lưu.`);await stream.close();}catch(error){try{await stream.abort();}catch{}throw error;}
   saved.push(file.path);file.bytes=bytes;onSaved(file.path);
  }
 }catch(error){throw new Error(`${error.message} Đã ghi ${saved.length} tệp${saved.length?': '+saved.join(', '):''}. Các tệp còn lại chưa ghi. Đọc lại thư mục trước khi tiếp tục.`);}
 return saved;
}
