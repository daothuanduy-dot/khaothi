import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/operations.js',import.meta.url),'utf8');
const {parseQuickScore,validateEssayScore}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('quick scores preserve explicit decimals and reject malformed or negative input',()=>{
  for(const [input,expected] of [['85',8.5],['875',8.75],['10',10],['0',0],['8,5',8.5],['8.75',8.75],['',null]]){
    assert.equal(parseQuickScore(input,2),expected,input);
  }
  for(const input of ['-85','8a5','8..5'])assert.ok(Number.isNaN(parseQuickScore(input,2)));
  assert.match(validateEssayScore('',{maximum_score:10}),/nhập điểm/);
  assert.equal(validateEssayScore(0,{maximum_score:10,decimal_places:2}),null);
  assert.match(validateEssayScore(8.755,{maximum_score:10,decimal_places:2}),/thập phân/);
  assert.match(validateEssayScore(8.5,{maximum_score:10,score_step:1}),/bước/);
});

function graderHarness(rpc){
  const controls=new Map();
  const $=id=>{if(!controls.has(id))controls.set(id,{value:'',innerHTML:'',disabled:false});return controls.get(id)};
  const cache={graderQueue:[],graderIndex:0};
  let config={exam_id:'exam',subject_code:'VAN',maximum_score:10,decimal_places:2,score_step:null};
  const portion=source.slice(source.indexOf('  let graderWindow='),source.indexOf('  async function applyGraderDefault()'));
  const harness=new Function('$','cache','state','selectedGraderConfig','esc','validateEssayScore','message','setInterval','clearInterval',
    portion+';return {loadGraderQueue,saveGraderScore,updateGraderWindow,renderGraderQueue};')(
      $,cache,{client:{rpc}},()=>config,String,validateEssayScore,()=>{},()=>0,()=>{}
    );
  return {...harness,$,cache,setConfig:value=>{config=value}};
}
const openWindow=()=>({starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+60000).toISOString(),server_now:new Date().toISOString()});
test('teacher chooses phach, sees server window and cannot save blank or closed-window scores',async()=>{
  let windowData=openWindow(),writes=0;
  const h=graderHarness(async name=>{
    if(name==='exam_get_grading_window')return {data:windowData};
    if(name==='exam_get_grading_heads')return {data:[{phach_prefix:'A'}]};
    if(name==='exam_get_grading_queue')return {data:[{phach_code:'A1',score:null}]};
    if(name==='exam_save_script_score'){writes++;return {data:{}}}
    throw Error(name);
  });
  await h.loadGraderQueue();
  assert.match(h.$('grader-phach-select').innerHTML,/A1/);
  assert.equal(h.$('grader-save-score').disabled,false);
  await assert.rejects(h.saveGraderScore(),/nhập điểm/);
  h.$('grader-score').value='8.5';
  await h.saveGraderScore();
  assert.equal(writes,1);
  windowData={...windowData,ends_at:new Date(Date.now()-60000).toISOString(),server_now:new Date().toISOString()};
  await h.loadGraderQueue();
  assert.equal(h.$('grader-save-score').disabled,true);
  await assert.rejects(h.saveGraderScore(9),/thời hạn/);
  assert.equal(writes,1);
});
test('late window response from another exam cannot replace the current queue',async()=>{
  let release;
  const h=graderHarness(async(name,args)=>{
    if(name==='exam_get_grading_window'&&args.p_exam_id==='exam')return new Promise(resolve=>{release=resolve});
    if(name==='exam_get_grading_window')return {data:openWindow()};
    if(name==='exam_get_grading_heads')return {data:[{phach_prefix:'B'}]};
    if(name==='exam_get_grading_queue')return {data:[{phach_code:'B1',score:null}]};
    throw Error(name);
  });
  const oldLoad=h.loadGraderQueue();
  h.setConfig({exam_id:'new',subject_code:'VAN',maximum_score:10,decimal_places:2});
  await h.loadGraderQueue();
  release({data:openWindow()});
  await oldLoad;
  assert.equal(h.cache.graderQueue[0].phach_code,'B1');
});
