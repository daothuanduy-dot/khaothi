import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/rounds.js',import.meta.url),'utf8');
const {loadExamRounds}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('round selector returns named active rounds in numeric order',async()=>{
  const client={rpc:async()=>({data:[{round_no:2,name:'Thi chiều'},{round_no:1,name:'Thi sáng'},{round_no:3,is_active:false}]})};
  assert.deepEqual((await loadExamRounds(client,'exam')).map(row=>[row.round_no,row.name]),[[1,'Thi sáng'],[2,'Thi chiều']]);
});
test('missing management RPC falls back to existing round records',async()=>{
  const client={rpc:async()=>({error:{message:'missing RPC'}}),from:()=>({select:()=>({eq:()=>({order:async()=>({data:[{round_no:2,name:'Đợt bổ sung'}]})})})})};
  assert.equal((await loadExamRounds(client,'exam'))[0].round_no,2);
});
test('empty or inactive managed rounds are reported instead of inventing rounds',async()=>{
  for(const data of [[],[{round_no:1,is_active:false}]])await assert.rejects(loadExamRounds({rpc:async()=>({data})},'exam'),/chưa có đợt đang hoạt động/);
});
test('a successful empty candidate probe does not create a selectable round',async()=>{
  const client={rpc:async name=>name==='exam_get_round_candidates'?{data:[]}:{error:{message:'missing RPC'}},from:()=>({select:()=>({eq:()=>({order:async()=>({data:[]})})})})};
  await assert.rejects(loadExamRounds(client,'exam'),/Không tải được danh sách đợt/);
});

test('late responses cannot overwrite the rounds for a newly selected exam',async()=>{
  const operations=await readFile(new URL('../js/operations.js',import.meta.url),'utf8');
  const loader=operations.slice(operations.indexOf('  let formRoundRequest='),operations.indexOf('  const formSpecs='));
  const elements=new Map();
  const $=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{}});return elements.get(id)};
  const pending={};
  const load=new Function('$','state','cache','esc','loadExamRounds',loader+';return loadFormRounds;')($,{client:{}},{},x=>x,(_,exam)=>new Promise(resolve=>{pending[exam]=resolve}));
  const first=load('first'),second=load('second');
  pending.second([{round_no:2,name:'Đợt mới'}]);await second;
  pending.first([{round_no:1,name:'Đợt cũ'}]);await first;
  assert.equal($('forms-round').value,'2');
  assert.equal($('forms-round').dataset.examId,'second');
  assert.doesNotMatch($('forms-round').innerHTML,/Đợt cũ/);
  assert.equal($('forms-round').disabled,false);
});
