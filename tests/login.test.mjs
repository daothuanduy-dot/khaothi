import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function submitLogin('),source.indexOf('async function enterApp('));
function harness(auth){
 const controls=new Map();
 const $=id=>{if(!controls.has(id))controls.set(id,{value:'',disabled:false,setAttribute(k,v){this[k]=v}});return controls.get(id)};
 const messages=[],users=[];
 const submit=new Function('$','state','hide','message','enterApp',body+';return submitLogin;')($,{client:{auth}},()=>{},(_,text)=>messages.push(text),async user=>users.push(user));
 $('login-email').value=' teacher@example.test ';$('login-password').value='example-secret';
 return {$,messages,users,submit:()=>submit({preventDefault(){}})};
}
test('login sends real credentials once and clears password after success',async()=>{
 let finish,calls=0;
 const h=harness({signInWithPassword:args=>{calls++;assert.equal(args.email,'teacher@example.test');assert.equal(args.password,'example-secret');return new Promise(resolve=>finish=resolve)}});
 const pending=h.submit();await h.submit();assert.equal(calls,1);assert.equal(h.$('google-login').disabled,true);
 finish({data:{user:{id:'teacher'}},error:null});await pending;
 assert.deepEqual(h.users,[{id:'teacher'}]);assert.equal(h.$('login-password').value,'');
 assert.equal(h.$('login-submit').disabled,false);assert.equal(h.$('login-form')['aria-busy'],'false');
});
test('wrong password reports localized error and restores retry controls',async()=>{
 const h=harness({signInWithPassword:async()=>({error:{message:'Invalid login credentials'}})});
 await h.submit();assert.match(h.messages[0],/Email hoặc mật khẩu chưa đúng/);
 assert.equal(h.users.length,0);assert.equal(h.$('google-login').disabled,false);
 assert.equal(h.$('login-password').type,'password');
});
test('server role routes teacher to grading and rejects unassigned accounts',async()=>{
 const fn=source.slice(source.indexOf('async function enterApp('),source.indexOf('async function signOut('));
 for(const role of ['grader','unassigned']){
  const events=[];const controls=new Map();
  const $=id=>{if(!controls.has(id))controls.set(id,{classList:{add(){},remove(){}},textContent:''});return controls.get(id)};
  const state={client:{rpc:async()=>({data:role}),auth:{signOut:async()=>events.push('signout')}}};
  const enter=new Function('state','$','updateVersionDisplay','showScreen','operations','message','loadExams','renderSubjects',fn+';return enterApp;')(state,$,()=>{},s=>events.push(s),{enterAsGrader:async()=>events.push('grading')},()=>{},async()=>{},()=>{});
  await enter({email:'teacher@example.test'});
  assert.deepEqual(events,role==='grader'?['grader-screen','grading']:['signout','login-screen']);
 }
});
