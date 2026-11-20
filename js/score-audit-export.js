// v0.1.405 - Report all assigned-subject scores regardless of elective registration.
// Official totals come from the dedicated penalty-adjusted RPC; never recompute deductions in JavaScript.
export function wireScoreAuditExport({state,$,esc,message}) {
  const panel=$('template-export-panel');
  if(!panel)return;
  const codes={TOAN:'Toán',VAN:'Ngữ văn',N1:'Tiếng Anh',LY:'Vật lý',HOA:'Hóa học',SINH:'Sinh học',SU:'Lịch sử',DIA:'Địa lý',KTPL:'GDKT&PL',TIN:'Tin học'};
  const norm=v=>({ANH:'N1',GDKTPL:'KTPL'}[String(v||'').toUpperCase()]||String(v||'').toUpperCase());
  const date=v=>{const s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:s;};
  const number=v=>v===null||v===undefined||v===''?'':Number.isFinite(Number(v))?Number(v):'';
  const controls=document.createElement('fieldset');
  controls.style.cssText='margin:18px 0;padding:14px;border:1px solid #cbd5e1;border-radius:10px';
  controls.innerHTML='<legend style="font-weight:700">Kiểm tra và xuất điểm theo môn được gán cho lớp</legend><p>Chỉ đọc dữ liệu. Điểm xuất lấy từ RPC điểm chính thức sau xử lý vi phạm. Kiểm tra thành phần dựa trên cấu hình và nguồn điểm thực tế.</p><div class="form-actions"><button type="button" class="btn btn-primary" data-audit>Kiểm tra thành phần điểm</button><button type="button" class="btn btn-light" data-export>Xuất dữ liệu</button><select data-format aria-label="Định dạng xuất"><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF (in / lưu PDF)</option></select></div><div data-status class="notice hidden" role="status"></div><div data-result class="table-wrap" style="max-height:420px;overflow:auto"></div>';
  panel.appendChild(controls);
  const status=controls.querySelector('[data-status]'),result=controls.querySelector('[data-result]');
  const auditBtn=controls.querySelector('[data-audit]'),exportBtn=controls.querySelector('[data-export]');
  let cache=null,busy=false;
  const notify=(s,type='info')=>message(status,s,type);
  async function allRows(query,label){const out=[];for(let offset=0;;offset+=700){const {data,error}=await query.range(offset,offset+699);if(error)throw new Error(`${label}: ${error.message}`);out.push(...(data||[]));if((data||[]).length<700)break;}return out;}
  async function load(){
    const id=$('forms-exam')?.value||state.selectedExam;
    if(!id)throw new Error('Hãy chọn kỳ thi trước khi kiểm tra hoặc xuất dữ liệu.');
    if(cache?.id===id&&cache?.revision===(state.statisticsRevision||0))return cache;
    const exam=state.exams.find(e=>e.id===id);
    if(!exam)throw new Error('Không tìm thấy kỳ thi đang chọn.');
    if(!['default','choice','subject'].includes(exam.exam_mode))throw new Error('Chỉ hỗ trợ kỳ thi mặc định, lựa chọn hoặc theo môn.');
    const [students,configs,registrations,componentPayload,absences]=await Promise.all([
      allRows(state.client.from('exam_candidates').select('id,sbd,student_code,student_name,class_code,date_of_birth').eq('exam_id',id),'Danh sách học sinh'),
      allRows(state.client.from('exam_subject_class_configs').select('class_code,subject_code').eq('exam_id',id),'Cấu hình môn theo lớp'),
      allRows(state.client.from('exam_candidate_subjects').select('candidate_id,subject_code').eq('exam_id',id),'Môn học sinh đăng ký'),
      state.client.rpc('exam_score_audit_component_data',{p_exam_id:id}).then(({data,error})=>{if(error)throw new Error('Không đọc được cấu hình thành phần điểm: '+error.message);return data;}),
      allRows(state.client.from('exam_absences').select('candidate_id,subject_code').eq('exam_id',id),'Danh sách vắng')
    ]);
    const byClass=new Map();for(const c of configs){const cls=String(c.class_code||'').trim(),code=norm(c.subject_code);if(!cls||!code)continue;if(!byClass.has(cls))byClass.set(cls,new Set());byClass.get(cls).add(code);}
    // In choice mode, class configs may not list compulsory VAN or all electives.
    // Build report columns from the union of class assignments and actual registrations.
    const registered=new Map();
    for(const r of registrations){const code=norm(r.subject_code),cid=String(r.candidate_id||'');if(!code||!cid)continue;if(!registered.has(cid))registered.set(cid,new Set());registered.get(cid).add(code);}
    if(exam.exam_mode==='choice'){
      for(const c of students){const cls=String(c.class_code||'').trim();if(!cls)continue;
        if(!byClass.has(cls))byClass.set(cls,new Set());
        const set=byClass.get(cls);set.add('TOAN');set.add('VAN');
        for(const code of registered.get(String(c.id))||[])set.add(code);
      }
    }
    const order=['TOAN','VAN','N1','LY','HOA','SINH','TIN','SU','DIA','KTPL'];
    for(const [cls,set] of byClass)byClass.set(cls,new Set([...set].sort((a,b)=>{
      const ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?999:ia)-(ib<0?999:ib)||a.localeCompare(b);
    })));
      const defs=new Map();for(const d of (componentPayload?.components||[])){const code=norm(d.subject_code);if(!defs.has(code))defs.set(code,[]);defs.get(code).push(d);}for(const v of defs.values())v.sort((a,b)=>Number(a.display_order||0)-Number(b.display_order||0));
    const componentMap=new Map();for(const s of (componentPayload?.scores||[]))componentMap.set(`${s.candidate_id}|${norm(s.subject_code)}|${s.component_id}`,s.score);
    const absent=new Set(absences.map(a=>`${a.candidate_id}|${norm(a.subject_code)}`));
    const subjects=[...new Set([...byClass.values()].flatMap(s=>[...s]))];if(!subjects.length)throw new Error('Chưa có môn được gán cho lớp. Không thể kiểm tra hoặc xuất báo cáo.');
    const official=new Map();for(const code of subjects){
      const {data,error}=await state.client.rpc('exam_get_official_subject_results_for_export',{p_exam_id:id,p_subject_code:code});
      if(error)throw new Error(`Không lấy được điểm chính thức môn ${code}: ${error.message}`);
      official.set(code,new Map((data||[]).map(s=>[String(s.candidate_id||''),s])));
    }
    const loaded={id,revision:state.statisticsRevision||0,exam,students,byClass,registered,defs,componentMap,absent,official,subjects};
    if(($('forms-exam')?.value||state.selectedExam)!==id)throw new Error('Kỳ thi đã thay đổi trong lúc tải. Hãy thao tác lại.');
    cache=loaded;return loaded;
  }
  const score=(p,c,code)=>p.official.get(code)?.get(String(c.id));
  const officialValue=(p,c,code)=>{const s=score(p,c,code);if(p.absent.has(`${c.id}|${code}`)||s?.is_absent)return 'Vắng';return s?.official_total_score==null?'':number(s.official_total_score);};
  const classGroups=p=>{const map=new Map();for(const c of p.students){if(!map.has(c.class_code))map.set(c.class_code,[]);map.get(c.class_code).push(c);}return [...map.entries()].sort(([a],[b])=>String(a).localeCompare(String(b),'vi',{numeric:true})).map(([cls,rows])=>[cls,rows.sort((a,b)=>String(a.student_name).localeCompare(String(b.student_name),'vi')||String(a.sbd).localeCompare(String(b.sbd)))]);};
  function issues(p){const out=[];let checked=0,absent=0,complete=0,missing=0,unconfigured=0;
    for(const c of p.students){const subjects=p.byClass.get(c.class_code);if(!subjects?.size){out.push([c.sbd,c.student_name,c.class_code,'—','Lớp chưa được gán môn']);unconfigured++;continue;}
      for(const code of subjects){checked++;const key=`${c.id}|${code}`,s=score(p,c,code);
        if(p.absent.has(key)||s?.is_absent){absent++;continue;}
        const defs=p.defs.get(code)||[];
        // Older subjects can use the assessment configuration without component rows.
        // The official RPC returns the authoritative score mode and missing flags.
        if(!defs.length){
          if(!s){missing++;out.push([c.sbd,c.student_name,c.class_code,codes[code]||code,'Không có dữ liệu điểm môn từ RPC']);continue;}
          const mode=String(s.score_mode||'').toLowerCase();
          const gaps=[];
          if(mode==='mcq'||mode==='combined')if(s.mcq_missing||s.mcq_score==null)gaps.push('Trắc nghiệm');
          if(mode==='essay'||mode==='combined')if(s.essay_missing||s.essay_score==null)gaps.push('Tự luận');
          if(!['mcq','essay','combined'].includes(mode)){
            unconfigured++;out.push([c.sbd,c.student_name,c.class_code,codes[code]||code,'Chưa xác định được hình thức điểm môn']);continue;
          }
          if(gaps.length||s.total_score==null){missing++;out.push([c.sbd,c.student_name,c.class_code,codes[code]||code,[...(gaps.length?[`Thiếu: ${gaps.join(', ')}`]:[]),...(s.total_score==null?['Chưa có điểm môn']:[])].join('; ')]);}else complete++;
          continue;
        }
        const active=defs.filter(d=>d.is_active);
        const missingComponents=active.filter(d=>{
          const stored=p.componentMap.get(`${key}|${d.id}`);
          if(stored!==null&&stored!==undefined&&stored!=='')return false;
          const kind=String(d.component_code||'').toUpperCase();
          // Existing score channels remain authoritative for MCQ and essay components.
          if(kind==='MCQ')return s?.mcq_score===null||s?.mcq_score===undefined;
          if(kind==='ESSAY'||kind==='TL')return s?.essay_score===null||s?.essay_score===undefined;
          // Do not silently classify unknown components as missing: their entry_source may be external.
          return false;
        });
        const missingTotal=s?.total_score===null||s?.total_score===undefined||s?.total_score==='';
        const unknown=active.filter(d=>!['MCQ','ESSAY','TL'].includes(String(d.component_code||'').toUpperCase()) && p.componentMap.get(`${key}|${d.id}`)==null);
        if(missingComponents.length||missingTotal||unknown.length){missing++;const names=missingComponents.map(d=>d.component_name||d.name||`Thành phần ${d.component_no||d.id}`);out.push([c.sbd,c.student_name,c.class_code,codes[code]||code,[...(names.length?[`Thiếu: ${names.join(', ')}`]:[]),...(missingTotal?['Chưa có điểm môn']:[]),...(unknown.length?[`Chưa xác minh nguồn: ${unknown.map(d=>d.component_name||d.component_code).join(', ')}`]:[])].join('; ')]);}else complete++;
      }
    }return {out,checked,absent,complete,missing,unconfigured};
  }
  async function act(fn){if(busy)return;busy=true;auditBtn.disabled=true;exportBtn.disabled=true;notify('Đang đọc cấu hình và điểm của kỳ thi…');try{const p=await load();await fn(p);}catch(e){notify(e.message||String(e),'error');}finally{busy=false;auditBtn.disabled=false;exportBtn.disabled=false;}}
  auditBtn.onclick=()=>act(async p=>{const x=issues(p);notify(`Đã đối chiếu ${x.checked} lượt học sinh–môn; đủ ${x.complete}, thiếu ${x.missing}, vắng ${x.absent}, thiếu cấu hình ${x.unconfigured}.`,'success');result.innerHTML=x.out.length?`<table><thead><tr>${['SBD','Họ tên','Lớp','Môn','Kết quả kiểm tra'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${x.out.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>Không phát hiện thiếu điểm/thành phần trong phạm vi kiểm tra.</p>';});
  exportBtn.onclick=()=>act(async p=>{
    const groups=classGroups(p),format=controls.querySelector('[data-format]').value;
    for(const [cls] of groups)if(!p.byClass.get(cls)?.size)throw new Error(`Lớp ${cls} chưa được gán môn; không xuất báo cáo thiếu cột.`);
    const headers=cls=>['STT','SBD','Mã định danh','Họ và tên','Ngày sinh',...[...p.byClass.get(cls)].map(code=>codes[code]||code)];
    const rows=(cls,list)=>list.map((c,i)=>[i+1,String(c.sbd||''),String(c.student_code||''),c.student_name||'',date(c.date_of_birth),...[...p.byClass.get(cls)].map(code=>officialValue(p,c,code))]);
    if(format==='xlsx'){
      if(!window.XLSX)throw new Error('Thư viện Excel chưa được tải.');const wb=window.XLSX.utils.book_new();
      for(const [cls,list] of groups){const data=rows(cls,list),ws=window.XLSX.utils.aoa_to_sheet([[`KẾT QUẢ ${p.exam.name||''} — LỚP ${cls}`],headers(cls),...data]);ws['!cols']=headers(cls).map((_,i)=>({wch:i===3?28:i===4?15:14}));for(let r=2;r<data.length+2;r++)for(const c of [1,2]){const addr=window.XLSX.utils.encode_cell({r,c});if(ws[addr])ws[addr].t='s';}window.XLSX.utils.book_append_sheet(wb,ws,String(cls).replace(/[\\/?*\[\]:]/g,'').slice(0,31));}
      window.XLSX.writeFile(wb,`diem-theo-lop-${p.id.slice(0,8)}.xlsx`);
    }else{
      const sections=groups.map(([cls,list])=>`<section><h3>${esc(p.exam.name||'Kết quả kỳ thi')} — LỚP ${esc(cls)}</h3><table><thead><tr>${headers(cls).map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows(cls,list).map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('');
      const w=window.open('','_blank');if(!w)throw new Error('Trình duyệt chặn cửa sổ in.');w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Điểm theo lớp</title><style>@page{size:A3 landscape;margin:12mm}body{font:10pt Arial,sans-serif}h3{text-align:center}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #555;padding:4px;text-align:center;overflow-wrap:anywhere}section{break-after:page}section:last-child{break-after:auto}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body>${sections}</body></html>`);w.document.close();w.focus();w.print();
    }
    notify(`Đã chuẩn bị ${format==='xlsx'?'Excel':'bản in PDF'} cho ${groups.length} lớp. Điểm lấy từ RPC đã xử lý vi phạm, không trừ lại trên trình duyệt.`,'success');
  });
  return {invalidate(){cache=null;result.innerHTML='';}};
}
