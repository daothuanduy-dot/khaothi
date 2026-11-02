export function scriptEntryState(row){
  if(row.has_score)return row.no_paper?'no_paper':Number(row.score)===0?'zero':'score';
  if(row.snapshot_absent||row.reported_absent)return 'absent';
  return row.phach_code?'missing':'unassigned';
}
export function scriptControlSummary(rows){
  return {total:rows.length,entered:rows.filter(row=>row.has_score).length,missing:rows.filter(row=>scriptEntryState(row)==='missing').length,
    zero:rows.filter(row=>scriptEntryState(row)==='zero').length,noPaper:rows.filter(row=>scriptEntryState(row)==='no_paper').length,
    absent:rows.filter(row=>row.snapshot_absent||row.reported_absent).length,violation:rows.filter(row=>row.violations?.length).length};
}
export function filterScriptControl(rows,{head='',status='all',query=''}={}){
  const text=query.trim().toLocaleLowerCase('vi');
  return rows.filter(row=>(!head||row.head===head)&&(!text||[row.phach_code,row.sbd].some(value=>String(value||'').toLocaleLowerCase('vi').includes(text)))&&
    (status==='all'||status==='scored'&&row.has_score||status==='violation'&&row.violations?.length||status==='absent'&&(row.snapshot_absent||row.reported_absent)||scriptEntryState(row)===status));
}
export function wireScoreControl({state,$,esc,message,subjectName=code=>code,onScoresCleared=()=>{}}){
  let examId='',runId='',runs=[],rows=[],selected=new Set(),preview=null,busy=false;
  const notify=(text,type='info')=>message($('score-control-message'),text,type);
  const date=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
  const admin=()=>{if(state.role!=='admin'||!state.client)throw new Error('Chỉ Admin được kiểm soát điểm.')};
  async function check(query){const {data,error}=await query;if(error){if(['PGRST202','PGRST205','42P01'].includes(error.code))throw new Error('Cần chạy migration 141 để kiểm soát và xóa điểm theo phách.');throw new Error(error.message)}return data}
  const rpc=(name,args)=>{admin();return check(state.client.rpc(name,args))};
  const scopeValid=()=>!!examId&&examId===state.selectedExam&&runId===$('score-control-run').value&&runs.some(run=>run.id===runId&&run.subject_code===$('score-control-subject').value);
  function requireScope(){admin();if(!scopeValid())throw new Error('Kỳ thi hoặc phương án đã đổi. Hãy tải lại trước khi thao tác.');}
  const visible=()=>filterScriptControl(rows,{head:$('score-control-head').value,status:$('score-control-filter').value||'all',query:$('score-control-search').value});
  const summaryText=s=>`${s.total} bài · Có điểm/Không bài ${s.entered} · Chưa nhập ${s.missing} · Điểm 0 ${s.zero} · Không bài ${s.noPaper} · Vắng ${s.absent} · Có vi phạm ${s.violation}`;
  function invalidate(){preview=null;$('score-control-preview').hidden=true;}
  function render(){
    const exam=state.exams.find(row=>row.id===examId),current=runs.find(row=>row.id===runId);
    $('score-control-exam').textContent=exam?`Kỳ thi: ${exam.name} (${exam.school_year})${current?` · Phương án ${current.id}`:''}`:'Chọn kỳ thi tại tab Kỳ thi.';
    $('score-control-summary').textContent=summaryText(scriptControlSummary(rows));
    const heads=[...new Set(rows.map(row=>row.head).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    $('score-control-head-summary').innerHTML=heads.length?`<table><thead><tr><th>Đầu phách</th><th>Tổng bài</th><th>Có điểm/Không bài</th><th>Chưa nhập</th><th>Vắng</th></tr></thead><tbody>${heads.map(head=>{
      const s=scriptControlSummary(rows.filter(row=>row.head===head));return `<tr><td><button type="button" data-control-head="${esc(head)}">${esc(head)}</button></td><td>${s.total}</td><td>${s.entered}</td><td>${s.missing}</td><td>${s.absent}</td></tr>`;
    }).join('')}</tbody></table>`:'';
    const labels={score:'Có điểm',zero:'Điểm 0',no_paper:'Không bài',missing:'Chưa nhập',absent:'Vắng',unassigned:'Chưa có phách'};
    $('score-control-rows').innerHTML=`<table><thead><tr><th>Chọn</th><th>Phách</th><th>SBD</th><th>Lớp</th><th>Điểm gốc</th><th>Nhập điểm</th><th>Vắng / Vi phạm</th></tr></thead><tbody>${visible().map(row=>{
      const flags=[row.snapshot_absent?'Vắng khi đánh phách':'',row.reported_absent?'Có báo vắng':'',...(row.violations||[]).map(v=>`Vi phạm ${v.round_no?`đợt ${v.round_no}`:'chưa phân đợt'}: ${v.penalty_type==='zero'?'điểm 0':`trừ ${v.deduction_percent}%`}`)].filter(Boolean);
      return `<tr><td><input type="checkbox" data-control-record="${esc(row.id)}" aria-label="Chọn phách ${esc(row.phach_code||'chưa có mã')}" ${selected.has(row.id)?'checked':''} ${busy||!row.has_score||!row.phach_code?'disabled':''}></td><td>${esc(row.phach_code||'—')}</td><td>${esc(row.sbd||'')}</td><td>${esc(row.class_code||'')}</td><td>${row.has_score&&!row.no_paper?esc(row.score):'—'}</td><td>${esc(labels[scriptEntryState(row)])}</td><td>${esc(flags.join('; ')||'—')}</td></tr>`;
    }).join('')||'<tr><td colspan="7">Không có bài theo bộ lọc.</td></tr>'}</tbody></table>`;
    $('score-control-selected').textContent=`Đã chọn ${selected.size} phách có điểm/Không bài, gồm cả các phách đang ẩn bởi bộ lọc.`;
    $('score-control-preview-selected').disabled=busy||!scopeValid()||!selected.size;
    $('score-control-preview-head').disabled=busy||!scopeValid()||!$('score-control-head').value;
    $('score-control-confirm').disabled=busy||!scopeValid()||!preview;
    $('score-control-audit-load').disabled=busy||!examId||examId!==state.selectedExam;
  }
  function fillRuns(){
    const subject=$('score-control-subject').value,choices=runs.filter(row=>row.subject_code===subject);
    $('score-control-run').innerHTML=choices.map(row=>`<option value="${esc(row.id)}">${esc(date(row.locked_at||row.created_at))} · ${esc(row.id)}</option>`).join('')||'<option value="">Chưa có phương án đã khóa</option>';
    $('score-control-run').value=choices.some(row=>row.id===runId)?runId:choices[0]?.id||'';
  }
  async function loadRows(){
    invalidate();selected.clear();rows=[];
    const id=$('score-control-run').value;
    if(!id){runId='';return}
    const data=await rpc('exam_get_script_score_control',{p_run_id:id});
    if(data.run.exam_id!==examId||data.run.subject_code!==$('score-control-subject').value)throw new Error('Phương án phách không đúng kỳ thi/môn.');
    runId=id;rows=data.rows;
    const head=$('score-control-head').value;
    const heads=[...new Set(rows.map(row=>row.head).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    $('score-control-head').innerHTML='<option value="">Tất cả đầu phách</option>'+heads.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
    $('score-control-head').value=heads.includes(head)?head:'';
  }
  async function load(){
    admin();const id=state.selectedExam||'';
    if(id!==examId){runId='';rows=[];selected.clear();invalidate();$('score-control-audit').innerHTML='';$('score-control-head').value=''}
    examId=id;runs=[];
    if(id)for(let offset=0;;offset+=500){
      const page=await check(state.client.from('exam_script_runs').select('id,subject_code,locked_at,created_at').eq('exam_id',id).eq('status','locked').order('locked_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(offset,offset+499));
      runs.push(...page);if(page.length<500)break;
    }
    const previous=$('score-control-subject').value,codes=[...new Set(runs.map(row=>row.subject_code))].sort();
    $('score-control-subject').innerHTML=codes.map(code=>`<option value="${esc(code)}">${esc(subjectName(code))}</option>`).join('')||'<option value="">Chưa có môn đánh phách</option>';
    $('score-control-subject').value=codes.includes(previous)?previous:codes[0]||'';
    fillRuns();await loadRows();
    if(!runs.length)notify('Kỳ thi chưa có phương án phách đã khóa.');
  }
  async function run(fn){if(busy)return;busy=true;const controls=[...$('score-control').querySelectorAll('input,select,button')],previous=controls.map(row=>row.disabled);controls.forEach(row=>row.disabled=true);
    try{admin();await fn()}catch(error){notify(error.message||String(error),'error')}finally{busy=false;controls.forEach((row,index)=>row.disabled=previous[index]);render()}}
  $('score-control-subject').onchange=()=>run(async()=>{runId='';fillRuns();await loadRows()});
  $('score-control-run').onchange=()=>run(loadRows);
  for(const id of ['score-control-head','score-control-filter'])$(id).onchange=()=>{invalidate();render()};
  $('score-control-search').oninput=()=>{invalidate();render()};
  $('score-control-head-summary').onclick=event=>{if(busy)return;const button=event.target.closest('[data-control-head]');if(button){$('score-control-head').value=button.dataset.controlHead;invalidate();render()}};
  $('score-control-rows').onchange=event=>{if(busy)return;const box=event.target.closest('[data-control-record]');if(!box)return;
    const row=rows.find(row=>row.id===box.dataset.controlRecord);if(!row?.has_score||!row.phach_code)return;
    if(box.checked)selected.add(row.id);else selected.delete(row.id);invalidate();render();
  };
  $('score-control-select-visible').onclick=()=>{if(busy)return;for(const row of visible())if(row.has_score&&row.phach_code)selected.add(row.id);invalidate();render()};
  $('score-control-clear-selection').onclick=()=>{if(busy)return;selected.clear();invalidate();render()};
  $('score-control-refresh').onclick=()=>run(load);
  async function makePreview(head){
    requireScope();invalidate();
    const data=await rpc('exam_preview_script_score_clear',{p_run_id:runId,p_head:head||null,p_record_ids:head?null:[...selected]});
    preview=data;$('score-control-preview').hidden=false;$('score-control-note').value='';
    const exam=state.exams.find(row=>row.id===examId);
    $('score-control-preview-summary').textContent=`${exam?.name||examId} · ${subjectName(data.subject_code)} · Phương án ${data.run_id} · ${data.head?`Cả đầu phách ${data.head}`:'Các phách đã chọn'} · Sẽ xóa ${data.delete_count} điểm/ghi nhận Không bài trên ${data.record_count} phách. Bản xem trước có hiệu lực 15 phút.`;
    $('score-control-preview-rows').innerHTML=`<table><thead><tr><th>Phách</th><th>Điểm trước</th><th>Không bài</th><th>Cập nhật</th></tr></thead><tbody>${data.rows.filter(row=>row.score_data).map(row=>`<tr><td>${esc(row.phach_code)}</td><td>${esc(row.score_data.score)}</td><td>${row.score_data.no_paper?'Có':'Không'}</td><td>${esc(date(row.score_data.updated_at))}</td></tr>`).join('')}</tbody></table>`;
  }
  $('score-control-preview-selected').onclick=()=>run(()=>makePreview(null));
  $('score-control-preview-head').onclick=()=>run(async()=>{const head=$('score-control-head').value;if(!head)throw new Error('Chọn một đầu phách cụ thể.');await makePreview(head)});
  $('score-control-cancel').onclick=()=>{if(!busy){invalidate();render()}};
  $('score-control-confirm').onclick=()=>run(async()=>{
    requireScope();if(!preview)throw new Error('Hãy xem trước phạm vi xóa.');
    const token=preview.token;
    let result;
    try{result=await rpc('exam_confirm_script_score_clear',{p_preview_id:token,p_note:$('score-control-note').value.trim()})}
    catch(error){invalidate();throw error}
    invalidate();selected.clear();
    onScoresCleared();
    try{await loadRows();notify(`Đã xóa ${result.deleted_count} điểm/ghi nhận Không bài và lưu nhật ký.`,'success')}
    catch(error){rows=[];notify(`Đã xóa ${result.deleted_count} điểm nhưng chưa tải lại được danh sách: ${error.message}`,'error')}
  });
  $('score-control-audit-load').onclick=()=>run(async()=>{
    admin();if(!examId||examId!==state.selectedExam)throw new Error('Kỳ thi đã đổi. Hãy tải lại.');
    const events=await check(state.client.from('exam_script_score_clear_events').select('id,run_id,subject_code,phach_code,previous_data,note,changed_by,changed_at').eq('exam_id',examId).order('id',{ascending:false}).range(0,99));
    $('score-control-audit').innerHTML=`<table><thead><tr><th>Thời gian</th><th>Môn / Phương án</th><th>Phách</th><th>Điểm / Không bài trước</th><th>Người xóa</th><th>Ghi chú</th></tr></thead><tbody>${events.map(row=>`<tr><td>${esc(date(row.changed_at))}</td><td>${esc(subjectName(row.subject_code))}<br><small>${esc(row.run_id)}</small></td><td>${esc(row.phach_code)}</td><td>${esc(row.previous_data.score)}${row.previous_data.no_paper?' · Không bài':''}</td><td>${esc(row.changed_by)}</td><td>${esc(row.note)}</td></tr>`).join('')||'<tr><td colspan="6">Chưa có nhật ký xóa điểm.</td></tr>'}</tbody></table>`;
  });
  return {refresh:()=>run(load)};
}
