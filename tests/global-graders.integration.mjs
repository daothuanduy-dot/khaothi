// Uses an isolated local PostgreSQL engine; never connects to Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('global groups persist across exams; only actual same-subject assignments grant grading',async()=>{
 const db=new PGlite();
 try{
  // Reuse the established v119 fixture, keeping the real migration under test.
  const previousTest=await read('./grading-security.integration.mjs');
  const fixture=previousTest.match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(new Function('id',`return \`${fixture}\`;`)(id));
  await db.exec(`
   alter table exam_script_bag_assignments add column assignment_method text,add column assigned_by uuid,add column assigned_at timestamptz;
   create table exam_grader_groups(id uuid primary key default gen_random_uuid(),exam_id uuid not null references exam_sessions(id),subject_code text,name text,created_by uuid,updated_at timestamptz);
   create table exam_script_bag_assignment_draws(run_id uuid,exam_id uuid,subject_code text,bag_count integer,grader_count integer,drawn_by uuid);
   insert into exam_grader_groups values('${id(50)}','${id(10)}','VAN','Legacy group','${id(1)}',now());
   insert into exam_grader_group_members values('${id(50)}','${id(2)}');
  `);
  const old=await read('../sql/v0.1.63_fixed_seats_groups_scores.sql');
  for(const name of ['exam_can_grade_script_room','exam_save_grader_group','exam_set_script_bag_assignments','exam_draw_script_bag_assignments']){
   const start=old.indexOf(`create or replace function public.${name}(`);
   await db.exec(old.slice(start,old.indexOf('$$;',start)+3));
  }
  await db.exec(await read('../sql/v0.1.119_accounts_grading_security.sql'));
  const migration=await read('../sql/v0.1.120_global_graders.sql');
  await db.exec(migration);await db.exec(migration);
  const sql=async(query)=>(await db.query(query)).rows;
  const actor=async n=>db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated;`);
  await actor(1);
  for(const n of [2,3])await sql(`select exam_set_account_role('${id(n)}','grader','VAN')`);
  await sql(`select exam_set_account_role('${id(4)}','grader','TOAN')`);
  await sql(`select exam_save_grader_group(null,'VAN','${id(50)}','Global group',array['${id(2)}','${id(3)}']::uuid[])`);
  await assert.rejects(sql(`select exam_save_grader_group(null,'VAN',null,'Wrong subject',array['${id(4)}']::uuid[])`));
  const assign=async rows=>db.query('select exam_set_script_bag_assignments($1,$2::jsonb)',[id(20),JSON.stringify(rows)]);
  await assert.rejects(assign([{room_code:'01',user_id:id(4)}]));
  await assign([{room_code:'01',group_id:id(50)}]);
  await sql(`select exam_set_grading_window('${id(10)}',now()-interval '1 hour',now()+interval '1 hour')`);
  await actor(2);
  assert.equal((await sql('select * from exam_list_grading_work()')).length,1);
  assert.deepEqual((await sql(`select phach_code from exam_get_grading_queue('${id(10)}','VAN','')`)).map(r=>r.phach_code),['A1','A2']);
  await assert.rejects(sql(`select exam_save_script_score('${id(10)}','VAN','B1',5)`));
  await sql(`select exam_save_script_score('${id(10)}','VAN','A1',7)`);
  await actor(3);
  await assert.rejects(sql(`select exam_save_script_score('${id(10)}','VAN','A2',8)`));
  await actor(4);
  assert.equal((await sql('select * from exam_list_grading_work()')).length,0);
  await assert.rejects(sql(`select exam_get_grading_queue('${id(10)}','VAN','')`));
  await actor(1);
  await assert.rejects(assign([]));
  await assert.rejects(assign([{room_code:'01',user_id:id(3)}]));
  await assert.rejects(sql(`select exam_draw_script_bag_assignments('${id(20)}')`));
  await assert.rejects(sql(`select exam_assign_grader('${id(10)}','VAN','${id(2)}',true)`));
  await db.exec('reset role');
  assert.equal((await sql('select * from exam_grader_assignments')).length,0);
  assert.equal((await sql(`select exam_id from exam_grader_groups where id='${id(50)}'`))[0].exam_id,null);
  // Global group is not tied to a second exam either.
  await db.exec(`insert into exam_sessions values('${id(11)}','Other',null);insert into exam_script_runs values('${id(22)}','${id(11)}','VAN','locked',now());insert into exam_script_records values('${id(34)}','${id(22)}','03','D1',1,false)`);
  await actor(1);
  await db.query('select exam_set_script_bag_assignments($1,$2::jsonb)',[id(22),JSON.stringify([{room_code:'03',group_id:id(50)}])]);
  await actor(2);
  assert.equal((await sql(`select * from exam_get_grading_queue('${id(11)}','VAN','')`)).length,1);
  await db.exec(`reset role;delete from exam_script_bag_assignments where run_id='${id(22)}';delete from exam_script_records where run_id='${id(22)}';delete from exam_script_runs where id='${id(22)}';delete from exam_sessions where id='${id(11)}';`);
  assert.equal((await sql(`select * from exam_grader_groups where id='${id(50)}'`)).length,1);
 }finally{await db.close()}
});
