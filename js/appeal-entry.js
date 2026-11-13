import {publicConfig,validatePublicConfig} from './public-config.js?v=0.1.148';
const $=id=>document.getElementById(id);
const names={TOAN:'Toán',VAN:'Ngữ văn',ANH:'Tiếng Anh',N1:'Ngoại ngữ 1',LY:'Vật lý',HOA:'Hóa học',SINH:'Sinh học',TIN:'Tin học',SU:'Lịch sử',DIA:'Địa lý',GDKTPL:'Giáo dục kinh tế và pháp luật',KTPL:'Giáo dục kinh tế và pháp luật'};
const labelSubject=code=>names[code]||code;
let client,rows=[],exams=[],grouped=[],lockedRuns=[],runRecords=[],busy=false;
const natural=(a,b)=>String(a||'').localeCompare(String(b||''),'vi',{numeric:true,sensitivity:'base'});
const notice=s=>$('notice').textContent=s;
const exam=()=>exams.find(x=>x.exam_id===$('exam').value);
const afterDeadline=()=>!!exam()?.deadline_at&&Date.now()>=Date.parse(exam().deadline_at);
async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
function td(value){const t=document.createElement('td');t.textContent=value??'—';return t;}
function select(options,value){const s=document.createElement('select');for(const [key,name] of options)s.add(new Option(name,key));s.value=value??options[0][0];return s;}
const num=v=>v===null||v===undefined?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:3});
const prefix=code=>(String(code||'').match(/^[^0-9]+/)||[''])[0].trim().toUpperCase();
function mergeRows(raw){const map=new Map();for(const r of raw){const key=r.candidate_id+'|'+r.subject_code;let g=map.get(key);if(!g){g={candidate_id:r.candidate_id,subject_code:r.subject_code,student_name:r.student_name,sbd:r.sbd,run_id:r.run_id,run_label:r.run_label,phach_code:r.phach_code,parts:{}};map.set(key,g);}g.parts[r.component_type]=r;if(r.component_type==='essay'){g.run_id=r.run_id;g.run_label=r.run_label;g.phach_code=r.phach_code;}}return [...map.values()].sort((a,b)=>natural(a.subject_code,b.subject_code)||natural(a.sbd,b.sbd)||natural(a.student_name,b.student_name));}
// Liên kết phương án theo candidate_id + subject_code, không theo mã phách hay component_type.
function attachRuns(){
 const map=new Map();
 for(const r of runRecords){
   const key=r.candidate_id+'|'+r.subject_code;
   if(!map.has(key))map.set(key,[]);
   map.get(key).push(r);
 }
 for(const g of grouped){
   g.runRecords=map.get(g.candidate_id+'|'+g.subject_code)||[];
   // Không ghi đè điểm gốc; chỉ bổ sung định danh phách để lọc.
   const preferred=g.runRecords.find(r=>r.run_id===g.run_id)||g.runRecords[0];
   if(preferred){g.run_id=preferred.run_id;g.run_label=preferred.run_label||g.run_label;g.phach_code=preferred.phach_code||g.phach_code;}
 }
}
function selectedRunRecord(g,runId){
 if(runId)return (g.runRecords||[]).find(r=>r.run_id===runId)||null;
 return (g.runRecords||[]).find(r=>r.run_id===g.run_id)||(g.runRecords||[])[0]||null;
}
function refreshPrefixes(){
 const subj=$('subject').value,run=$('run').value;
 const prefixes=[...new Set(runRecords.filter(r=>(!subj||r.subject_code===subj)&&(!run||r.run_id===run)).map(r=>prefix(r.phach_code)).filter(Boolean))].sort(natural).map(p=>[p,p]);
 fillOptions('prefix',prefixes,'Tất cả đầu phách');
}
function fillOptions(id,items,first){const el=$(id),old=el.value;el.replaceChildren(new Option(first,''));for(const [v,label] of items)el.add(new Option(label,v));if(items.some(([v])=>v===old))el.value=old;}
async function load(){if(busy)return;const id=$('exam').value;if(!id)return;const config=await rpc('exam_admin_appeal_entry_settings',{p_exam_id:id});$('mode').value=config.entry_mode;$('opened').value=String(config.is_open);const ready=afterDeadline();$('save-settings').hidden=!ready;$('mode').disabled=!ready;$('opened').disabled=!ready;$('deadline-hint').textContent=ready?'Đã hết hạn nhận đơn. Quản trị viên có thể mở nhập điểm.':'Chưa hết thời hạn nhận đơn: không được mở nhập điểm.';rows=await rpc('exam_admin_appeal_entry_rows_v2',{p_exam_id:id,p_subject:null});grouped=mergeRows(rows||[]);lockedRuns=await rpc('exam_admin_appeal_locked_runs',{p_exam_id:id})||[];runRecords=await rpc('exam_admin_appeal_run_records',{p_exam_id:id})||[];attachRuns();const configured=await rpc('exam_admin_appeal_subjects',{p_exam_id:id});const subjects=[...new Set([...(configured||[]).map(x=>x.subject_code),...grouped.map(g=>g.subject_code)])].sort((a,b)=>natural(labelSubject(a),labelSubject(b))).map(c=>[c,labelSubject(c)]);fillOptions('subject',subjects,'Tất cả môn');updateFilters();}
function updateFilters(){
 const subj=$('subject').value;
 const runs=new Map();
 for(const r of lockedRuns.filter(r=>!subj||r.subject_code===subj))runs.set(r.run_id,`${labelSubject(r.subject_code)} · ${r.run_label}`);
 fillOptions('run',[...runs].sort((a,b)=>natural(a[1],b[1])),'Tất cả phương án');
 refreshPrefixes();render();
}
function valueFrom(input){const s=input.value.trim().replace(',','.');if(!/^(?:\d+)(?:\.\d+)?$/.test(s))throw Error('Điểm phải là số không âm hợp lệ.');return Number(s);}
function componentControls(r, sharedNote){
  if(!r)return {dirty:()=>false,read:()=>null,locked:false,scoreInput:null};
  const input=document.createElement('input');input.className='score';input.type='text';input.inputMode='decimal';input.placeholder='Nhập điểm';input.value=r.new_score??'';
  const initial=input.value;
  const dirty=()=>input.value!==initial;
  const locked=!!r.draft_status&&r.draft_status!=='draft';
  input.disabled=locked;
  return {dirty,locked,scoreInput:input,read:()=>{
    const newScore=input.value.trim()?valueFrom(input):(r.new_score??r.old_score);
    if(newScore==null)throw Error('Chưa có điểm gốc để lưu');
    const oldScore=Number(r.old_score);
    const changed=Number(newScore)!==oldScore;
    const note=sharedNote.value.trim();
    if(changed&&!note)throw Error('Điểm thay đổi cần ghi chú');
    return {p_exam_id:$('exam').value,p_candidate_id:r.candidate_id,p_subject_code:r.subject_code,p_component_type:r.component_type,p_new_score:Number(newScore),p_reason:changed?'other':'unchanged',p_detail_note:note};
  }};
}
function render(){
 const subj=$('subject').value,run=$('run').value,head=$('prefix').value;
 const data=grouped.filter(g=>{if(subj&&g.subject_code!==subj)return false;const record=selectedRunRecord(g,run);if(run&&!record)return false;if(head&&prefix(record?.phach_code||g.phach_code)!==head)return false;return true;});
 const inventory=runRecords.filter(r=>(!subj||r.subject_code===subj)&&(!run||r.run_id===run)&&(!head||prefix(r.phach_code)===head));$('count').textContent=`${data.length} bài đủ điều kiện nhập · ${inventory.length} bản ghi phách trong phương án/bộ lọc. Mỗi dòng tương ứng một học sinh và một môn; chỉ lưu nháp.`;
 const tbody=$('rows');tbody.replaceChildren();const pending=[];
 for(const [i,g] of data.entries()){
  const tr=document.createElement('tr'),mcq=g.parts.mcq,essay=g.parts.essay;
  const note=document.createElement('input');note.className='shared-note';note.placeholder='Ghi chú chung cho bài thi';
  note.value=essay?.detail_note||mcq?.detail_note||'';
  const initialNote=note.value;
  const c1=componentControls(mcq,note),c2=componentControls(essay,note);
  const oldTotal=(mcq?.old_score==null?0:Number(mcq.old_score))+(essay?.old_score==null?0:Number(essay.old_score));
  const total=td('—');
  const updateTotal=()=>{
    const score=(r,c)=>{if(!r)return 0;if(c.scoreInput?.value.trim()){try{return valueFrom(c.scoreInput)}catch{return NaN}}return Number(r.new_score??r.old_score??0)};
    const sum=score(mcq,c1)+score(essay,c2);total.textContent=Number.isFinite(sum)?num(sum):'Điểm chưa hợp lệ';
    tr.classList.toggle('changed',isDirty());
  };
  const isDirty=()=>c1.dirty()||c2.dirty()||note.value!==initialNote;
  const newMcq=td('');newMcq.append(mcq?c1.scoreInput:'—');
  const newEssay=td('');newEssay.append(essay?c2.scoreInput:'—');
  const noteCell=td('');noteCell.className='note';noteCell.append(note);
  tr.append(td(i+1),td(labelSubject(g.subject_code)),td([g.sbd,g.student_name].filter(Boolean).join(' — ')),td(selectedRunRecord(g,run)?.phach_code||g.phach_code||'—'),td(mcq?num(mcq.old_score):'—'),newMcq,td(essay?num(essay.old_score):'—'),newEssay,td(num(oldTotal)),total,noteCell,td([mcq?.draft_status,essay?.draft_status].filter(Boolean).join(' / ')||'Chưa lưu'));
  const button=document.createElement('button');button.textContent='Lưu bài';button.disabled=$('opened').value!=='true'||(!mcq&&!essay)||(mcq&&c1.locked)||(essay&&c2.locked);
  const action=td('');action.append(button);tr.append(action);tbody.append(tr);
  for(const input of [c1.scoreInput,c2.scoreInput].filter(Boolean))input.addEventListener('input',updateTotal);
  note.addEventListener('input',updateTotal);updateTotal();
  const save=async()=>{
    if(!isDirty())return 0;
    let count=0;
    // Ghi chú chung được ghi vào cả hai thành phần đang có để giữ đồng nhất.
    for(const [r,c] of [[mcq,c1],[essay,c2]]){
      if(!r||c.locked)continue;
      await rpc('exam_admin_appeal_draft_save',c.read());count++;
    }
    return count;
  };
  button.onclick=async()=>{if(busy)return;try{if(!afterDeadline())throw Error('Chưa hết thời hạn nhận đơn.');busy=true;button.disabled=true;const n=await save();notice(`Đã lưu ${n} thành phần điểm của ${g.student_name||g.sbd}. Chưa cập nhật điểm chính thức.`);busy=false;await load();}catch(e){busy=false;button.disabled=false;notice('Lỗi lưu bài: '+e.message);}};
  pending.push({g,save,dirty:isDirty,tr});
 }
 $('save-all').disabled=$('opened').value!=='true'||busy;window.__appealPending=pending;
}
$('subject').onchange=updateFilters;$('run').onchange=()=>{refreshPrefixes();render();};$('prefix').onchange=render;
$('save-all').onclick=async()=>{if(busy)return;try{if(!afterDeadline())throw Error('Chưa hết thời hạn nhận đơn.');if($('opened').value!=='true')throw Error('Chưa mở nhập điểm.');const entries=(window.__appealPending||[]).filter(x=>x.dirty());if(!entries.length){notice('Không có thay đổi cần lưu.');return;}busy=true;$('save-all').disabled=true;let ok=0,failed=0,parts=0;for(const entry of entries){try{parts+=await entry.save();ok++;entry.tr.classList.add('saved');entry.tr.classList.remove('failed');}catch(e){failed++;entry.tr.classList.add('failed');console.error('Lưu phúc khảo thất bại',entry.g.candidate_id,entry.g.subject_code,e);}}busy=false;notice(`Lưu hàng loạt: ${ok} bài thành công (${parts} thành phần), ${failed} bài lỗi. ${failed?'Các dòng lỗi được tô đỏ, hãy kiểm tra và lưu lại.':'Chưa cập nhật điểm chính thức.'}`);if(!failed)await load();else $('save-all').disabled=false;}catch(e){busy=false;$('save-all').disabled=false;notice(e.message);}};
$('exam').onchange=()=>load().catch(e=>notice(e.message));$('reload').onclick=()=>load().catch(e=>notice(e.message));$('save-settings').onclick=async()=>{try{if(!afterDeadline()&&$('opened').value==='true')throw Error('Chưa hết hạn nhận đơn.');await rpc('exam_admin_appeal_entry_configure',{p_exam_id:$('exam').value,p_mode:$('mode').value,p_open:$('opened').value==='true'});notice('Đã lưu cấu hình.');await load();}catch(e){notice(e.message);}};
(async()=>{try{const {url,key}=validatePublicConfig(publicConfig);client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error('Vui lòng đăng nhập quản trị.');exams=await rpc('exam_admin_appeal_exams_period');$('exam').replaceChildren();for(const e of exams)$('exam').add(new Option(`${e.exam_name} (${e.school_year||''})`,e.exam_id));const requested=new URLSearchParams(location.search).get('exam');if(exams.some(e=>e.exam_id===requested))$('exam').value=requested;$('app').classList.remove('hidden');await load();notice('Đã tải danh sách. Điểm phúc khảo được lưu riêng dưới dạng nháp.');}catch(e){notice(e.message||String(e));}})();
