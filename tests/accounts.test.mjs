import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/accounts.js',import.meta.url),'utf8');
const wire=new Function('SUBJECTS','confirm',source.replace(/^import .*;\r?\n/,'').replace('export function','function')+';return wireAccounts;')([],()=>true);
function harness(){
  const elements=new Map(),calls=[],messages=[];
  const $=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',disabled:false});return elements.get(id)};
  const users=[{user_id:'teacher',email:'teacher@example.test',role:'grader',subject_code:'VAN',full_name:'<script>'}];
  const state={role:'admin',exams:[{id:'exam',name:'Kỳ thi'}],client:{rpc:async(name,args)=>{
    calls.push({name,args});
    return {data:name==='exam_manage_accounts'?users:name==='exam_get_grading_window'?{starts_at:'2026-10-20T00:00:00Z',ends_at:'2026-10-21T00:00:00Z'}:null,error:null};
  }}};
  const accounts=wire({state,$,esc:v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),message:(_,text,type)=>messages.push({text,type})});
  return {accounts,$,calls,messages,state};
}
test('accounts manage global teacher roles without selecting or granting an exam',async()=>{
  const h=harness();await h.accounts.refresh();
  assert.match(h.$('accounts-user').innerHTML,/&lt;script&gt;/);
  h.$('accounts-user').value='teacher';h.$('accounts-user').onchange();
  assert.equal(h.$('accounts-subject').value,'VAN');
  await h.$('accounts-save-role').onclick();
  assert.deepEqual(h.calls.find(call=>call.name==='exam_set_account_role'),{name:'exam_set_account_role',args:{p_user_id:'teacher',p_role:'grader',p_subject_code:'VAN'}});
  assert.equal(h.calls.some(call=>call.name==='exam_assign_grader'),false);
  assert.equal(h.$('accounts-exam').value,'');
});
test('accounts window validation prevents invalid writes, serializes valid local times',async()=>{
  const h=harness();h.$('accounts-exam').value='exam';
  h.$('accounts-start').value='2026-10-21T12:00';h.$('accounts-end').value='2026-10-20T12:00';
  await h.$('accounts-save-window').onclick();assert.equal(h.calls.length,0);
  assert.equal(h.messages.at(-1).type,'error');
  h.$('accounts-end').value='2026-10-22T12:00';
  await h.$('accounts-save-window').onclick();
  assert.equal(h.calls.at(-1).name,'exam_set_grading_window');
  assert.equal(h.calls.at(-1).args.p_starts_at,new Date('2026-10-21T12:00').toISOString());
});
test('non-admin cannot dispatch account management RPCs',async()=>{
  const h=harness();h.state.role='grader';
  await h.accounts.refresh();
  assert.equal(h.calls.length,0);
  assert.equal(h.messages.at(-1).type,'error');
});

test('create account uses server function and clears password',async()=>{
 const h=harness();const requests=[];
 h.state.client.functions={invoke:async(name,args)=>{requests.push({name,...args});return {data:{user_id:'teacher'}}}};
 h.$('accounts-email').value='new@example.test';h.$('accounts-full-name').value='New Teacher';h.$('accounts-password').value='example-1234';
 await h.$('accounts-create').onclick();
 assert.equal(requests[0].name,'manage-exam-accounts');assert.equal(requests[0].body.action,'create');
 assert.equal(h.$('accounts-password').value,'');
 h.state.role='grader';await h.$('accounts-create').onclick();assert.equal(requests.length,1);
});

test('missing SQL migration produces actionable deployment error',async()=>{
 const h=harness();h.state.client.rpc=async()=>({error:{code:'PGRST202',message:'missing'}});
 await h.accounts.refresh();assert.match(h.messages.at(-1).text,/v0.1.119_accounts_grading_security.sql/);
});
