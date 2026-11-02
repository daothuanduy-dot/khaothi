export function normalizeStudentText(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
}
export function matchesStudent(student,query){
  const text=normalizeStudentText(query);if(!text)return true;
  const name=normalizeStudentText(student.student_name),words=name.split(/[^a-z0-9]+/).filter(Boolean);
  const initials=words.map(word=>word[0]).join(''),compact=text.replace(/\s/g,'');
  return initials.startsWith(compact)||name.includes(text)
    ||[student.sbd,student.student_code].some(value=>normalizeStudentText(value).includes(text))
    ||(text.includes(' ')&&text.split(' ').every((word,index)=>words[index]?.startsWith(word)));
}
export function createStudentPicker({root,input,list,toggle,esc,onSelect,emptyLabel='Tất cả học sinh'}){
  let items=[],selected='',query='',open=false,active=-1,rows=[];
  const label=row=>[row.class_code,row.sbd||row.student_code,row.student_name].filter(Boolean).join(' · ');
  const selectedLabel=()=>items.find(row=>String(row.id)===selected)?label(items.find(row=>String(row.id)===selected)):'';
  function paint(){
    rows=[{id:'',student_name:emptyLabel},...items.filter(row=>matchesStudent(row,query))];
    if(active>=rows.length)active=rows.length-1;
    list.hidden=!open;input.setAttribute('aria-expanded',String(open));
    input.removeAttribute('aria-activedescendant');
    list.innerHTML=rows.map((row,index)=>`<div role="option" id="${esc(list.id)}-${index}" data-student-pick="${esc(row.id)}" aria-selected="${String(row.id)===selected}" class="student-picker-option${index===active?' active':''}">${esc(row.id?label(row):emptyLabel)}</div>`).join('')+(rows.length===1?'<div class="student-picker-empty">Không có học sinh phù hợp.</div>':'');
    if(open&&active>=0){input.setAttribute('aria-activedescendant',`${list.id}-${active}`);list.querySelector(`[id="${list.id}-${active}"]`)?.scrollIntoView({block:'nearest'})}
  }
  function close(){open=false;query='';active=-1;input.value=selectedLabel();paint()}
  function choose(id){
    const next=String(id);if(onSelect(next)===false){close();return}
    selected=next;close();input.focus();
  }
  input.onfocus=()=>{if(input.disabled)return;query='';open=true;active=-1;input.select();paint()};
  input.onclick=()=>{if(!open&&!input.disabled){query='';open=true;active=-1;input.select();paint()}};
  input.oninput=event=>{if(event.isComposing)return;query=input.value;open=true;active=-1;paint()};
  input.addEventListener('compositionend',()=>{query=input.value;open=true;active=-1;paint()});
  input.onkeydown=event=>{
    if(event.isComposing)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();open=true;if(!rows.length)paint();active=Math.max(0,Math.min(rows.length-1,active+(event.key==='ArrowDown'?1:-1)));paint();
    }else if(event.key==='Enter'&&open){event.preventDefault();if(active>=0)choose(rows[active].id);else if(rows.length===2)choose(rows[1].id)}
    else if(event.key==='Escape'){event.preventDefault();close()}
    else if(event.key==='Tab')close();
  };
  list.onmousedown=event=>event.preventDefault();
  list.onclick=event=>{const option=event.target.closest('[data-student-pick]');if(option)choose(option.dataset.studentPick)};
  toggle.onclick=()=>{if(input.disabled)return;if(open)close();else input.focus()};
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))close()});
  return {
    setItems(next,value=''){
      items=next;const changed=selected!==String(value);selected=String(value);
      if(changed||!open)input.value=selectedLabel();paint();
    },
    setDisabled(value){input.disabled=value;toggle.disabled=value;if(value)close()},
    close
  };
}
