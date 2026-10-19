import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/operations.js',import.meta.url),'utf8');
const {wireOperations}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const markup=(await Promise.all(['../index.html',...['forms','absences','scripts','scores'].map(name=>`../modules/${name}.html`)].map(path=>readFile(new URL(path,import.meta.url),'utf8')))).join('\n');
test('full operations initialization registers form controls before loading exam rounds',async()=>{
  const controls=new Map([...markup.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],{value:'',innerHTML:'',dataset:{},classList:{toggle(){}},addEventListener(){}}]));
  controls.get('forms-print-type').value='listing';
  const $=id=>controls.get(id)||null;
  const state={exams:[],selectedExam:null,client:{}};
  const calls=[];
  const operations=wireOperations({state,$,esc:String,message(){},selectAllPages:async()=>[],subjects:[],subjectName:String,loadExamRounds:async(client,exam)=>{calls.push(exam);return [{round_no:1,name:'Đợt 1'},{round_no:2,name:'Đợt 2'}]}});
  assert.equal(typeof $('forms-exam').onchange,'function');
  assert.equal(typeof $('forms-round').onchange,'function');
  state.exams=[{id:'exam',name:'Kỳ thi'}];state.selectedExam='exam';
  operations.refreshExamSelectors();
  await operations.refreshFormRounds('exam');
  assert.equal($('forms-round').value,'1');
  assert.match($('forms-round').innerHTML,/Đợt 2/);
  assert.ok(calls.includes('exam'));
});

test('an unavailable grading control must not disable forms and their round selector',async()=>{
  const controls=new Map([...markup.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],{value:'',innerHTML:'',dataset:{},classList:{toggle(){}},addEventListener(){}}]));
  controls.get('forms-print-type').value='listing';
  controls.delete('grader-save-score');
  const $=id=>controls.get(id)||null;
  const state={exams:[],client:{}};
  const operations=wireOperations({state,$,esc:String,message(){},selectAllPages:async()=>[],subjects:[],subjectName:String,loadExamRounds:async()=>[{round_no:1,name:'Đợt 1'}]});
  await operations.refreshFormRounds('exam');
  assert.equal($('forms-round').value,'1');
});

test('deployed legacy absence markup is repaired and selecting round two enables printing',async()=>{
  const controls=new Map([...markup.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],{value:'',innerHTML:'',options:[{value:''}],dataset:{},classList:{toggle(){}},addEventListener(){}}]));
  controls.get('forms-print-type').value='listing';
  controls.delete('absence-grade-filter');controls.delete('absence-class-filter');
  controls.get('absence-search').closest=()=>({before(wrapper){const select=wrapper.children[0];controls.set(select.id,select)}});
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>({value:'',children:[],appendChild(child){this.children.push(child)}})};
  try{
    const $=id=>controls.get(id)||null;
    const errors=[];
    const state={exams:[{id:'exam',name:'Kỳ thi',managing_authority:'Cơ quan',institution_name:'Trường'}],selectedExam:'exam',client:{}};
    const operations=wireOperations({state,$,esc:String,message:(element,text,type)=>{if(type==='error')errors.push(text)},selectAllPages:async()=>[],subjects:[],subjectName:String,loadExamRounds:async()=>[{round_no:1,name:'Đợt 1'},{round_no:2,name:'Đợt 2'}]});
    await operations.refreshForms('exam');
    $('forms-round').value='2';await $('forms-round').onchange();
    assert.ok($('absence-grade-filter'));assert.ok($('absence-class-filter'));
    assert.equal($('forms-round').value,'2');
    assert.equal($('forms-authority').value,'Cơ quan');
    assert.equal($('forms-export-pdf').disabled,false);
    assert.equal($('forms-export-xlsx').disabled,false);
    assert.deepEqual(errors,[]);
  }finally{
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
});
