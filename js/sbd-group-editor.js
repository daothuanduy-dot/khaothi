export function createSbdGroupEditor({root,input,loadCandidates,onChange,escape}){
 let examId=null,groups=[],classes=[],request=0,loading=false,error='';
 const save=()=>{input.value=groups.filter(g=>g.length).map(g=>g.join(', ')).join('\n');onChange();render()};
 function render(){
  root.innerHTML='';
  if(!examId){root.textContent='Chọn kỳ thi để tạo nhóm lớp.';return}
  if(loading){root.textContent='Đang tải danh sách lớp…';return}
  if(error){root.textContent=error;const retry=document.createElement('button');retry.type='button';retry.className='btn btn-light';retry.textContent='Thử tải lại';retry.onclick=()=>load(examId,true);root.append(retry);return}
  const used=new Set(groups.flat());
  const missing=classes.filter(c=>!used.has(c.code));
  root.innerHTML=`<p>${classes.length} lớp · ${groups.length} nhóm · ${missing.length} lớp chưa vào nhóm${missing.length?': '+missing.map(c=>escape(c.code)).join(', '):''}</p>`+
   groups.map((group,index)=>`<div class="panel"><div class="form-actions"><b>Nhóm ${index+1} · ${group.length} lớp · ${classes.filter(c=>group.includes(c.code)).reduce((n,c)=>n+c.count,0)} học sinh</b> <button type="button" class="btn btn-light" data-up="${index}" ${index===0?'disabled':''}>↑</button><button type="button" class="btn btn-light" data-down="${index}" ${index===groups.length-1?'disabled':''}>↓</button><button type="button" class="btn btn-light" data-delete="${index}">Xóa nhóm</button></div><div class="form-grid">${classes.map(c=>`<label><input type="checkbox" data-group="${index}" data-class="${escape(c.code)}" ${group.includes(c.code)?'checked':''} ${used.has(c.code)&&!group.includes(c.code)?'disabled':''}> ${escape(c.code)} (${c.count} HS)</label>`).join('')}${group.filter(code=>!classes.some(c=>c.code===code)).map(code=>`<label><input type="checkbox" checked data-group="${index}" data-class="${escape(code)}"> ${escape(code)} — lớp không còn trong kỳ, bỏ chọn để loại</label>`).join('')}</div></div>`).join('')+
   '<button type="button" class="btn btn-secondary" data-add>+ Tạo nhóm</button>';
 }
 root.addEventListener('change',event=>{
  const el=event.target.closest('[data-group]');if(!el)return;
  const index=Number(el.dataset.group),code=el.dataset.class;
  if(el.checked){if(groups.some((g,i)=>i!==index&&g.includes(code))){render();return}groups[index].push(code)}
  else groups[index]=groups[index].filter(c=>c!==code);
  save();
 });
 root.addEventListener('click',event=>{
  const el=event.target.closest('button');if(!el||el.disabled)return;
  if(el.hasAttribute('data-add'))groups.push([]);
  else if(el.hasAttribute('data-delete'))groups.splice(Number(el.dataset.delete),1);
  else if(el.hasAttribute('data-up')){const i=Number(el.dataset.up);[groups[i-1],groups[i]]=[groups[i],groups[i-1]]}
  else if(el.hasAttribute('data-down')){const i=Number(el.dataset.down);[groups[i+1],groups[i]]=[groups[i],groups[i+1]]}
  else return;
  save();
 });
 async function load(id,retry=false){
  if(examId===id&&!retry)return;
  examId=id;const token=++request;groups=String(input.value||'').split(/\r?\n/).map(line=>line.split(/[,;]/).map(c=>c.trim()).filter(Boolean)).filter(g=>g.length);classes=[];error='';
  if(!id){loading=false;render();return}
  loading=true;render();
  try{
   const candidates=await loadCandidates(id);if(token!==request)return;
   const counts=new Map();for(const c of candidates){const code=String(c.class_code||'').trim();if(code)counts.set(code,(counts.get(code)||0)+1)}
   classes=[...counts].map(([code,count])=>({code,count})).sort((a,b)=>a.code.localeCompare(b.code,'vi',{numeric:true}));
   if(candidates.some(c=>!String(c.class_code||'').trim()))error='Có học sinh chưa có lớp. Hãy cập nhật lớp trong danh sách thí sinh rồi tải lại.';
  }catch(e){if(token!==request)return;error='Không tải được lớp: '+e.message}
  finally{if(token===request){loading=false;render()}}
 }
 return {load};
}
