import {writeWorkbookArchive} from './template-export-core.js?v=412';
export const equalBytes=(a,b)=>{const x=new Uint8Array(a),y=new Uint8Array(b);return x.length===y.length&&x.every((v,i)=>v===y[i]);};

// Resolve a new file handle from the selected directory instead of reusing
// a handle captured during the initial directory scan.
async function freshHandle(root,path){
 if(!root)throw new Error('Không còn tham chiếu thư mục. Hãy chọn lại thư mục.');
 const parts=String(path).replace(/\\/g,'/').split('/');
 if(parts[0]===root.name)parts.shift();
 if(!parts.length||parts.some(x=>!x||x==='.'||x==='..'))throw new Error('Đường dẫn tệp không hợp lệ.');
 let folder=root;
 for(const part of parts.slice(0,-1))folder=await folder.getDirectoryHandle(part,{create:false});
 return folder.getFileHandle(parts[parts.length-1],{create:false});
}
async function verify(handle,file){
 const current=await handle.getFile();
 if(!equalBytes(await current.arrayBuffer(),file.bytes))
  throw new Error(`${file.path}: nội dung tệp đã thay đổi kể từ lúc đọc. Không ghi; hãy đọc lại thư mục và xem trước lại.`);
}
export async function saveDirectFiles(files,writes,JSZip,{check=()=>{},onSaved=()=>{},directory,DOMParserClass=globalThis.DOMParser}={}){
 const prepared=[];
 // Build all changed workbooks in memory and verify every target before writing.
 for(let i=0;i<files.length;i++){
  const changes=writes.filter(w=>w.fileIndex===i);if(!changes.length)continue;
  check();const file=files[i];
  const handle=await freshHandle(directory,file.path);
  await verify(handle,file);
  const bytes=await writeWorkbookArchive(file.bytes,changes,JSZip,DOMParserClass);
  prepared.push({file,handle,bytes});
 }
 for(const item of prepared){check();await verify(item.handle,item.file);}
 const saved=[];
 try{
  for(const item of prepared){
   const {file,bytes}=item;check();
   // Reacquire the handle immediately before writing, to avoid stale handles.
   const handle=await freshHandle(directory,file.path);
   await verify(handle,file);
   const stream=await handle.createWritable();
   try{check();await stream.write(bytes);check();await stream.close();}
   catch(error){try{await stream.abort();}catch{}throw error;}
   saved.push(file.path);file.bytes=bytes;onSaved(file.path);
  }
 }catch(error){
  const detail=error?.name==='InvalidStateError'||/state cached|read from disk/i.test(error?.message||'')
   ? 'Trình duyệt báo đối tượng tệp không còn đồng bộ với ổ đĩa. Đóng Excel/ứng dụng đồng bộ, chọn lại thư mục, đọc và xem trước lại. Không tự động ghi đè.'
   : (error?.message||String(error));
  throw new Error(`${detail} Đã ghi ${saved.length} tệp${saved.length?': '+saved.join(', '):''}. Các tệp còn lại chưa ghi.`);
 }
 return saved;
}
