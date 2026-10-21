// Run with PGLITE_MODULE pointing to an isolated @electric-sql/pglite/dist/index.js.
// This suite never connects to Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to an isolated @electric-sql/pglite/dist/index.js install.');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const migration=await readFile(new URL('../sql/v0.1.119_accounts_grading_security.sql',import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('SQL migration: roles, deadlines, ownership, audit, validation and atomic import',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create role authenticated; create role anon;
 create schema auth;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.exam_is_admin() returns boolean language sql stable security definer as $$select auth.uid()='${id(1)}'::uuid$$;
 create table exam_sessions(id uuid primary key,name text,form_exam_title text);
 create table exam_user_profiles(user_id uuid primary key,email text,full_name text);
 create table exam_grader_assignments(exam_id uuid,subject_code text,user_id uuid,active boolean default true,assigned_by uuid,assigned_at timestamptz default now(),primary key(exam_id,subject_code,user_id));
 create table exam_subject_assessment_configs(exam_id uuid,subject_code text,is_essay boolean,maximum_score numeric,score_step numeric,decimal_places smallint,default_score numeric,primary key(exam_id,subject_code));
 create table exam_script_runs(id uuid primary key,exam_id uuid,subject_code text,status text,locked_at timestamptz);
 create table exam_script_records(id uuid primary key,run_id uuid references exam_script_runs(id),room_code text,phach_code text,script_order integer,is_absent boolean default false);
 create table exam_script_scores(script_record_id uuid primary key references exam_script_records(id),score numeric(6,3),entered_by uuid,entered_at timestamptz,updated_at timestamptz);
 create table exam_script_score_events(id bigint generated always as identity primary key,script_record_id uuid references exam_script_records(id),previous_score numeric,new_score numeric,changed_by uuid,changed_at timestamptz);
 create table exam_script_bag_assignments(run_id uuid,room_code text,user_id uuid,group_id uuid);
 create table exam_grader_group_members(group_id uuid,user_id uuid);
 grant usage on schema public,auth to authenticated;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 alter table exam_script_records enable row level security;
 create policy admin_only on exam_script_records for select to authenticated using(exam_is_admin());
 insert into auth.users values('${id(1)}','admin@test'),('${id(2)}','teacher1@test'),('${id(3)}','teacher2@test'),('${id(4)}','teacher3@test');
 insert into exam_sessions values('${id(10)}','Exam',null);
 insert into exam_subject_assessment_configs values('${id(10)}','VAN',true,10,null,2,null),('${id(10)}','TOAN',true,10,0.25,2,null);
 insert into exam_script_runs values('${id(20)}','${id(10)}','VAN','locked',now()),('${id(21)}','${id(10)}','TOAN','locked',now());
 insert into exam_script_records values
 ('${id(30)}','${id(20)}','01','A1',1,false),('${id(31)}','${id(20)}','01','A2',2,false),
 ('${id(32)}','${id(20)}','02','B1',3,false),('${id(33)}','${id(21)}','01','C1',1,false);
 `);
 // Use the real pre-existing room/bag restriction rather than a permissive stub.
 const prior=await readFile(new URL('../sql/v0.1.63_fixed_seats_groups_scores.sql',import.meta.url),'utf8');
 await db.exec(prior.slice(prior.indexOf('create or replace function public.exam_can_grade_script_room('),prior.indexOf('create or replace function public.exam_delete_script_runs(')));
 // Install the real old definitions to detect CREATE OR REPLACE signature
 // incompatibilities; these bodies are replaced before invoking the new RPCs.
 const installFunctions=async(file,names)=>{
  const source=await readFile(new URL(`../sql/${file}`,import.meta.url),'utf8');
  for(const name of names){
   const start=source.indexOf(`create or replace function public.${name}(`);
   assert.notEqual(start,-1,`Missing historical function ${name}`);
   const end=source.indexOf('$$;',source.indexOf('as $$',start));
   assert.notEqual(end,-1,`Missing function delimiter for ${name}`);
   await db.exec(source.slice(start,end+3));
  }
 };
 await installFunctions('v0.1.59_forms_absence_scripts_scoring.sql',[
  'exam_current_user_role','exam_assign_grader','exam_list_grading_work','exam_import_script_scores'
 ]);
 await installFunctions('v0.1.62_script_heads_bag_grading.sql',['exam_get_grading_queue']);
 await installFunctions('v0.1.63_fixed_seats_groups_scores.sql',['exam_get_grading_heads']);
 await installFunctions('v0.1.117_score_entry_mode.sql',['exam_save_script_score']);
 // Mirror the actual admin-only SELECT policies from v59 for fixture tables.
 for(const table of ['exam_subject_assessment_configs','exam_script_runs','exam_grader_assignments','exam_script_scores','exam_script_score_events']){
  await db.exec(`alter table ${table} enable row level security;
   create policy admin_only on ${table} for select to authenticated using(exam_is_admin());`);
 }
 await db.exec(migration);await db.exec(migration);
 const as=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated;`);
 const scalar=async sql=>(await db.query(sql)).rows[0];
 const save=(code,score,subject='VAN')=>db.query(`select exam_save_script_score('${id(10)}','${subject}','${code}',${score})`);
 await as(1);
 assert.equal((await scalar('select exam_current_user_role() role')).role,'admin');
 await db.query(`select exam_set_account_role('${id(2)}','grader','VAN'),exam_set_account_role('${id(3)}','grader','VAN'),exam_set_account_role('${id(4)}','grader','TOAN')`);
 for(const n of [2,3,4])await db.query(`select exam_assign_grader('${id(10)}','${n===4?'TOAN':'VAN'}','${id(n)}',true)`);
 await assert.rejects(db.query(`select exam_assign_grader('${id(10)}','TOAN','${id(2)}',true)`));
 await as(2);
 assert.equal((await scalar('select exam_current_user_role() role')).role,'grader');
 assert.deepEqual((await db.query('select subject_code from exam_list_grading_work()')).rows,[{subject_code:'VAN'}]);
 await assert.rejects(save('A1',8.5),/thời hạn/);
 await assert.rejects(db.query('select * from exam_manage_accounts()'),/Admin/);
 await assert.rejects(db.query(`select exam_set_account_role('${id(2)}','admin',null)`),/Admin/);
 await assert.rejects(db.query(`select * from exam_get_grading_queue('${id(10)}','TOAN','')`),/phân công/);
 assert.equal((await db.query('select * from exam_script_records')).rows.length,0);
 for(const table of ['exam_script_scores','exam_script_score_events','exam_grader_assignments']){
  assert.equal((await db.query(`select * from ${table}`)).rows.length,0,`${table} must hide rows from graders`);
  for(const statement of [`update ${table} set ${table==='exam_grader_assignments'?'active=false':table==='exam_script_scores'?'score=10':'new_score=10'}`,`delete from ${table}`,`truncate ${table}`]){
   await assert.rejects(db.query(statement),{code:'42501'});
  }
 }
 for(const table of ['exam_account_roles','exam_grading_windows','exam_grading_head_claims']){
  await assert.rejects(db.query(`select * from ${table}`),{code:'42501'});
  await assert.rejects(db.query(`delete from ${table}`),{code:'42501'});
 }
 await assert.rejects(db.query(`insert into exam_script_scores(script_record_id,score) values('${id(30)}',10)`),/permission/);
 await as(1);
 await assert.rejects(db.query(`select exam_set_grading_window('${id(10)}',now(),now())`));
 await db.query(`select exam_set_grading_window('${id(10)}',now()+interval '1 hour',now()+interval '2 hour')`);
 await as(2);
 await assert.rejects(save('A1',8),{code:'42501'});
 await as(1);
 await db.query(`select exam_set_grading_window('${id(10)}',now()-interval '1 hour',now()+interval '1 hour')`);
 await as(2);
 for(const value of ['null',-1,11,8.555,"'NaN'::numeric"])await assert.rejects(save('A1',value));
 // Exercise the real v63 room restriction, including group membership.
 await db.exec('reset role');
 await db.query(`insert into exam_script_bag_assignments values('${id(20)}','01','${id(3)}',null)`);
 await as(2);
 await assert.rejects(save('A1',8.5),{code:'42501'});
 assert.equal((await db.query(`select * from exam_get_grading_queue('${id(10)}','VAN','A')`)).rows.length,0);
 await db.exec('reset role');
 await db.exec(`update exam_script_bag_assignments set user_id=null,group_id='${id(50)}';
 insert into exam_grader_group_members values('${id(50)}','${id(2)}')`);
 await as(2);
 await save('A1',8.5);await save('A1',9);
 await db.exec('reset role');
 await db.query('delete from exam_script_bag_assignments');
 await as(3);
 assert.deepEqual((await db.query(`select * from exam_get_grading_heads('${id(10)}','VAN')`)).rows,[{phach_prefix:'B'}]);
 await assert.rejects(save('A2',7),/giáo viên khác/);
 await assert.rejects(save('A1',7),/giáo viên khác/);
 await assert.rejects(db.query(`select exam_import_script_scores('${id(10)}','VAN','[{"phach_code":"B1","score":7},{"phach_code":"Z1","score":8}]')`));
 await as(1);
 let events=(await db.query(`select * from exam_get_score_audit('${id(10)}')`)).rows;
 assert.equal(events.length,2);assert.equal(Number(events[0].previous_score),8.5);assert.equal(Number(events[0].new_score),9);
 assert.equal(events[0].changed_by_email,'teacher1@test');
 assert.equal(events[0].changed_by,id(2));
 assert.equal(events[1].previous_score,null);
 assert.equal(Number(events[1].new_score),8.5);
 assert.equal(events[1].changed_by,id(2));
 await db.exec('reset role');
 assert.equal((await db.query(`select * from exam_grading_head_claims where head='B'`)).rows.length,0);
 assert.equal((await db.query(`select * from exam_script_scores where script_record_id='${id(32)}'`)).rows.length,0,'failed import rolls back score');
 assert.equal((await db.query(`select * from exam_script_score_events where script_record_id='${id(32)}'`)).rows.length,0,'failed import rolls back audit');
 assert.equal((await scalar(`select entered_by from exam_script_scores where script_record_id='${id(30)}'`)).entered_by,id(2));
 await as(4);
 await assert.rejects(save('C1',8.6,'TOAN'),/Điểm/);
 await save('C1',8.75,'TOAN');
 await save('C1',0,'TOAN');
 await save('C1',10,'TOAN');
 await as(3);
 await assert.rejects(db.query(`select exam_import_script_scores('${id(10)}','VAN','[{"phach_code":"B1","score":7},{"phach_code":"B1","score":8}]')`));
 const imported=await scalar(`select exam_import_script_scores('${id(10)}','VAN','[{"phach_code":"B1","score":7.25}]') result`);
 assert.equal(imported.result.saved_count,1);
 await assert.rejects(db.query(`select * from exam_get_score_audit('${id(10)}')`),{code:'42501'});
 await as(1);
 await db.query(`select exam_set_grading_window('${id(10)}',now()-interval '2 hour',now()-interval '1 hour')`);
 await as(2);await assert.rejects(save('A1',8),/thời hạn/);
 await as(1);
 await db.query(`select exam_set_account_role('${id(2)}','grader','TOAN')`);
 await as(2);
 assert.equal((await db.query('select * from exam_list_grading_work()')).rows.length,0);
 await assert.rejects(save('A1',8),/phân công/);
 await as(1);
 await db.query(`select exam_set_account_role('${id(3)}','admin',null)`);
 await as(3);
 assert.equal((await scalar('select exam_is_admin() allowed')).allowed,true);
 assert.equal((await db.query('select * from exam_script_records')).rows.length,4,'existing RLS policies must use the new admin predicate');
 await as(1);
 await db.query(`select exam_set_account_role('${id(3)}','grader','VAN')`);
 await db.exec('reset role');
 const snapshot=async()=>({
  scores:(await db.query('select * from exam_script_scores order by script_record_id')).rows,
  events:(await db.query('select * from exam_script_score_events order by id')).rows,
  claims:(await db.query('select * from exam_grading_head_claims order by run_id,head')).rows,
  roles:(await db.query('select * from exam_account_roles order by user_id')).rows,
 });
 const beforeRerun=await snapshot();
 await db.exec(migration);
 assert.deepEqual(await snapshot(),beforeRerun,'rerunning migration preserves scores, audit, claims and roles');
 await as(3);
 assert.equal((await scalar('select exam_is_admin() allowed')).allowed,false,'rerun must preserve explicit role changes');
 assert.equal((await db.query('select * from exam_script_records')).rows.length,0);
 await assert.rejects(db.query('select exam_legacy_is_admin_119()'),/permission/);
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);set role authenticated`);
 assert.equal((await scalar('select exam_current_user_role() role')).role,'anonymous');
 await assert.rejects(save('B1',8),{code:'42501'});
 await db.exec('reset role;set role anon');
 await assert.rejects(save('B1',8),{code:'42501'});
 }finally{await db.close()}
});
