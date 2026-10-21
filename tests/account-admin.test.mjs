import test from 'node:test';
import assert from 'node:assert/strict';
import {accountHandler} from '../supabase/functions/manage-exam-accounts/handler.mjs';
const actor='00000000-0000-0000-0000-000000000001',target='00000000-0000-0000-0000-000000000002';
function setup({admin=true,valid=true,missing=false,blocked=false}={}){
 const calls=[];
 const handler=accountHandler({url:'https://example.test',anonKey:'public',serviceKey:'server-only',createClient:(_,key)=>{
  if(key==='public')return {auth:{getUser:async()=>({data:{user:valid?{id:actor}:null}})},rpc:async name=>name==='exam_is_admin'?{data:admin}:{error:missing?{}:null}};
  return {auth:{admin:{createUser:async attributes=>{calls.push(['create',attributes]);return {data:{user:{id:target}}}},updateUserById:async(id,attributes)=>{calls.push(['update',id,attributes]);return {data:{user:{id}}}},deleteUser:async id=>{calls.push(['delete',id]);return {error:blocked?{}:null}}}}};
 }});
 return {calls,request:async body=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer session','Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('unauthenticated and non-admin requests cannot use Auth Admin APIs',async()=>{
 for(const opts of [{valid:false},{admin:false}]){const h=setup(opts);const r=await h.request({action:'delete',user_id:target});assert.ok([401,403].includes(r.status));assert.equal(h.calls.length,0)}
});
test('missing migration and self deletion fail before changing accounts',async()=>{
 const h=setup({missing:true});assert.equal((await h.request({action:'delete',user_id:target})).status,503);assert.equal(h.calls.length,0);
 const own=setup();assert.equal((await own.request({action:'delete',user_id:actor})).status,400);assert.equal(own.calls.length,0);
});
test('create and update validate input and do not accept privilege metadata',async()=>{
 const h=setup();assert.equal((await h.request({action:'create',email:'bad',full_name:'Teacher',password:'short'})).status,400);assert.equal(h.calls.length,0);
 assert.equal((await h.request({action:'create',email:'teacher@example.test',full_name:'Teacher',password:'example-1234',role:'admin',app_metadata:{role:'admin'}})).status,200);
 assert.deepEqual(h.calls[0][1],{email:'teacher@example.test',user_metadata:{full_name:'Teacher'},password:'example-1234',email_confirm:true});
 assert.equal((await h.request({action:'update',user_id:target,email:'new@example.test',full_name:'New name'})).status,200);
 assert.equal(h.calls[1][2].password,undefined);
});
test('delete preserves database restrictions and reports conflict',async()=>{
 const h=setup({blocked:true});assert.equal((await h.request({action:'delete',user_id:target})).status,409);
 assert.deepEqual(h.calls,[['delete',target]]);
 const good=setup();assert.equal((await good.request({action:'delete',user_id:target})).status,200);
});
