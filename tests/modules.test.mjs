import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modules = ['exams', 'school-students', 'candidates', 'subjects', 'sbd', 'rooming', 'forms', 'absences', 'scripts', 'accounts', 'scores', 'settings'];

test('each application tab has a separate mount and HTML module with unique IDs', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const loader = await readFile(new URL('../js/module-loader.js', import.meta.url), 'utf8');
  const ids = [...index.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

  for (const name of modules) {
    assert.match(index, new RegExp(`id="module-${name}"`));
    const html = await readFile(new URL(`../modules/${name}.html`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`<section\\s+class="tab-panel(?:\\s+hidden)?"\\s+id="tab-${name}"`));
    assert.match(loader, new RegExp(`'${name}'`));
    ids.push(...[...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  }

  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must remain unique across modules');
});

test('whole-school roster is independent and enrolls checked students without overwriting exam records', async () => {
  const roster = await readFile(new URL('../modules/school-students.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.72_school_students.sql', import.meta.url), 'utf8');

  assert.match(roster, /id="school-student-grade"/);
  assert.match(roster, /id="school-student-class"/);
  assert.match(roster, /id="school-student-check-all"/);
  assert.match(app, /rpc\('exam_import_school_students'/);
  assert.match(app, /rpc\('exam_add_school_students_to_exam'/);
  assert.match(migration, /create table if not exists public\.school_students/);
  assert.match(migration, /not exists\(\s*select 1 from public\.exam_candidates/);
  const schemaAndPolicies = migration.slice(0, migration.indexOf('create or replace function'));
  assert.doesNotMatch(schemaAndPolicies, /from public\.exam_candidates/);
});

test('whole-school roster supports create, edit, and delete with exam history preserved', async () => {
  const roster = await readFile(new URL('../modules/school-students.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.72_school_students.sql', import.meta.url), 'utf8');

  assert.match(roster, /id="school-student-add"/);
  assert.match(roster, /id="school-student-dialog"/);
  assert.match(app, /data-school-student-edit/);
  assert.match(app, /data-school-student-delete/);
  assert.match(app, /async function saveSchoolStudent\(event\)/);
  assert.match(app, /from\('school_students'\)\.update\(student\)/);
  assert.match(app, /from\('school_students'\)\.insert\(student\)/);
  assert.match(app, /from\('school_students'\)\.delete\(\)/);
  assert.match(migration, /grant select,insert,update,delete on public\.school_students to authenticated/);
});

test('whole-school roster applies normalized grade, class, and search filters and ignores stale loads', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /function normalizedSchoolStudentValue\(value\)/);
  assert.match(app, /function schoolStudentMatches\(student,\{grade='',classCode='',query=''\}=\{\}\)/);
  assert.match(app, /const source=schoolStudentCatalog\.length\?schoolStudentCatalog:schoolStudents/);
  assert.match(app, /let schoolStudentLoadToken=0/);
  assert.match(app, /let schoolStudentsLoaded=false/);
  assert.match(app, /let schoolStudentsLoading=false/);
  assert.match(app, /function schoolStudentSelectionKey\(value\)/);
  assert.match(app, /selectedSchoolStudentCodes\.has\(schoolStudentSelectionKey\(student\.student_code\)\)/);
  assert.match(app, /function buildSchoolStudentQuery\(\{grade='',classCode='',query='',searchField=''\}=\{\}\)/);
  assert.match(app, /request=request\.eq\('grade_code',grade\)/);
  assert.match(app, /request=request\.eq\('class_code',classCode\)/);
  assert.match(app, /request=request\.ilike\(searchField,`%\$\{query\}%`\)/);
  assert.match(app, /function schoolStudentFilterValues\(\)/);
  assert.match(app, /schoolStudents=\[\];\s*renderSchoolStudents\(\);/);
  assert.match(app, /queryFilteredSchoolStudents\(filters\)\)\.filter\(student=>schoolStudentMatches\(student,filters\)\)/);
  assert.match(app, /rpc\('exam_add_school_students_to_exam'/);
  assert.match(app, /schoolStudentFilters\(\);[\s\S]*?await refreshSchoolStudentsFromDatabase\(\);/);
  assert.match(app, /const loadToken=\+\+schoolStudentLoadToken/);
  assert.match(app, /if\(loadToken!==schoolStudentLoadToken\)return/);
  assert.match(app, /try\{\s*wire\(\);[\s\S]*?wireSchoolStudents\(\);/);
  assert.match(app, /Không khởi tạo được danh sách học sinh/);
});

test('candidate deletion clears editable elective-plan references and preserves locked plans', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.74_candidate_delete_room_plan_fix.sql', import.meta.url), 'utf8');

  assert.match(app, /rpc\('exam_delete_candidates_from_exam'/);
  assert.match(migration, /public\.exam_elective_room_plan_candidates/);
  assert.match(migration, /p\.status='locked'[\s\S]*?raise exception/);
  assert.match(migration, /p\.status<>'locked'/);
  assert.match(migration, /delete from public\.exam_candidates/);
  assert.match(migration, /grant execute on function public\.exam_delete_candidates_from_exam\(uuid,uuid\[\]\) to authenticated/);
});

test('subject registration cleanup supports all subjects or a selected subject', async () => {
  const subjects = await readFile(new URL('../modules/subjects.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.75_subject_registrations_and_foreign_languages.sql', import.meta.url), 'utf8');

  assert.match(subjects, /id="subject-delete-code"/);
  assert.match(subjects, /id="subject-delete-registrations"/);
  assert.match(app, /rpc\('exam_delete_subject_registrations'/);
  assert.match(migration, /if v_subject_code is null then\s+delete from public\.exam_candidate_subjects where exam_id=p_exam_id/);
  assert.match(migration, /where exam_id=p_exam_id and upper\(btrim\(subject_code\)\)=v_subject_code/);
  assert.match(migration, /grant execute on function public\.exam_delete_subject_registrations\(uuid,text\) to authenticated/);
});

test('elective roster import exposes immediate status feedback for every import outcome', async () => {
  const subjects = await readFile(new URL('../modules/subjects.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(subjects, /id="roster-import-status"/);
  assert.match(app, /const importStatus=\(text,type='info'\)=>/);
  assert.match(app, /Chưa thực hiện: hãy chọn kỳ thi trước/);
  assert.match(app, /Đang đọc và kiểm tra \$\{file\.name\}/);
  assert.match(app, /Nạp thất bại: \$\{detail\}/);
});

test('elective roster import has a database migration for all supported subject codes', async () => {
  const migration = await readFile(new URL('../sql/v0.1.88_fix_candidate_subject_code_check.sql', import.meta.url), 'utf8');
  assert.match(migration, /exam_candidate_subjects_subject_code_check/);
  for (const code of ['TOAN','VAN','N1','N2','N3','N4','N5','N6','N7','GDKTPL','KTPL','SU','DIA','LY','HOA','SINH','TIN']) {
    assert.match(migration, new RegExp(`'${code}'::text`));
  }
});

test('KTPL is the canonical code for the GDKTPL subject', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const rooming = await readFile(new URL('../js/rooming.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.89_normalize_gdktpl_to_ktpl.sql', import.meta.url), 'utf8');
  assert.match(app, /\['KTPL','GDKTPL'\]\.includes\(raw\)\?'KTPL'/);
  assert.doesNotMatch(rooming, /code:'GDKTPL'/);
  assert.match(migration, /set subject_code='KTPL'/);
  assert.match(migration, /where upper\(btrim\(old\.subject_code\)\)='GDKTPL'/);
});

test('foreign-language catalog provides N1 through N7 and preserves legacy English records', async () => {
  const rooming = await readFile(new URL('../js/rooming.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.75_subject_registrations_and_foreign_languages.sql', import.meta.url), 'utf8');

  for (const [code, language] of [
    ['N1', 'Tiếng Anh'], ['N2', 'Tiếng Nga'], ['N3', 'Tiếng Pháp'],
    ['N4', 'Tiếng Trung Quốc'], ['N5', 'Tiếng Đức'], ['N6', 'Tiếng Nhật'], ['N7', 'Tiếng Hàn']
  ]) {
    assert.match(rooming, new RegExp(`code:'${code}', name:'${language}'`));
    assert.match(migration, new RegExp(`when '${code}' then '${language}'`));
  }
  assert.match(app, /raw==='ANH'\?'N1'/);
  assert.match(migration, /'ANH'::text/);
});

test('exam deletion reports live blocking tables and the UI provides actionable steps', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.76_exam_delete_blocker_diagnostics.sql', import.meta.url), 'utf8');

  assert.match(app, /rpc\('exam_get_delete_blockers'/);
  assert.match(app, /exam_elective_room_plans:'Xử lý phương án xếp phòng môn lựa chọn/);
  assert.match(app, /Việc cần làm trước khi thử lại/);
  assert.match(migration, /c\.confrelid='public\.exam_sessions'::regclass/);
  assert.match(migration, /c\.confdeltype in \('a','r'\)/);
  assert.match(migration, /'row_count',v_row_count/);
  assert.match(migration, /grant execute on function public\.exam_get_delete_blockers\(uuid\) to authenticated/);
});

test('candidate class control is a dropdown, including legacy module markup at runtime', async () => {
  const candidates = await readFile(new URL('../modules/candidates.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(candidates, /<select id="candidate-edit-class"/);
  assert.match(app, /function ensureCandidateClassDropdown\(\)[\s\S]*?control\.tagName==='SELECT'[\s\S]*?createElement\('select'\)[\s\S]*?control\.replaceWith\(select\)/);
  assert.match(app, /ensureCandidateClassDropdown\(\)/);
});

test('exam creation and selection do not force navigation to the subjects tab', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /switchTab\('subjects'\)/);
  assert.match(app, /notifyExamSelected\(data,true\)/);
  assert.match(app, /notifyExamSelected\(exam\)/);
  assert.match(app, /function updateSelectedExamTitle\(\)/);
});

test('rooming preview leads to save-and-assign without a separate assignment button', async () => {
  const rooming = await readFile(new URL('../modules/rooming.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

  assert.match(rooming, /Xem trước phương án phòng/);
  assert.match(rooming, /Kiểm tra và lưu phân bổ/);
  assert.match(rooming, /môn của từng thí sinh/);
  assert.doesNotMatch(rooming, /id="assign-rooming"/);
  assert.match(app, /if\(!state\.preview\.assignmentsCreated&&!assignRoomingCandidates\(\)\)return/);
  assert.doesNotMatch(app, /result\.assignments=\[\]/);
});

test('rooming restores saved assignments and official finalizations after a page update', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const diagnostics = await readFile(new URL('../sql/verify_rooming_persistence.sql', import.meta.url), 'utf8');

  assert.match(app, /from\('exam_rooming_finalizations'\)/);
  assert.match(app, /from\('exam_room_assignments'\)/);
  assert.match(app, /from\('exam_rooming_plan_snapshots'\)/);
  assert.match(app, /restoreRoomingPlan\(/);
  assert.match(app, /Đã khôi phục phân phòng chính thức từ CSDL/);
  assert.match(diagnostics, /exam_room_assignments/);
  assert.match(diagnostics, /is_current/);
});

test('official rooming validation rejects only cross-session subject collisions', async () => {
  const migration = await readFile(
    new URL('../sql/v0.1.55_fix_room_session_collision_check.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /a\.value->>'ca1_subject_code'\s*=\s*b\.value->>'ca2_subject_code'/);
  assert.match(migration, /a\.value->>'ca2_subject_code'\s*=\s*b\.value->>'ca1_subject_code'/);
  assert.doesNotMatch(migration, /ca1_subject_code' in \(b\.value->>'ca1_subject_code'/);
});

test('rooming exports use styled A4 worksheets and page breaks between rooms', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(index, /xlsx-js-style@1\.2\.0/);
  assert.match(app, /name:'Times New Roman',sz:12/);
  assert.match(app, /paperSize:9,orientation:'landscape',fitToWidth:1,fitToHeight:0/);
  assert.match(app, /ws\['!rowBreaks'\]=breaks/);
  assert.match(app, /listingMerges\.push\(\{s:\{r:listingPositions\.totalRow,c:0\}/);
  assert.match(app, /receiptBreaks\.push\(\{id:receiptData\.length-1,max:16383,man:1\}\)/);
  assert.match(app, /roomExportRowPositions\(listingHeaderRow,items\.length\)/);
  assert.match(app, /book_append_sheet\(wb,wsListing,'Danh sach niem yet'\)/);
  assert.match(app, /book_append_sheet\(wb,wsReceipts,'Phieu thu bai'\)/);
  assert.match(app, /@page\{size:A4 landscape;margin:2mm\}/);
  assert.match(app, /\.page\{width:293mm;min-height:205mm;page-break-after:always/);
  assert.match(app, /@media print\{html,body\{width:293mm;margin:0!important\}/);
  assert.match(app, /tr\{break-inside:avoid;page-break-inside:avoid\}/);
  assert.match(app, /\.receipt\{font-size:12pt\}/);
  assert.match(app, /border:1px solid #000/);
});

test('rooming supports independent rounds, automatic/manual modes, and detailed validation', async () => {
  const rooming = await readFile(new URL('../modules/rooming.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.91_rooming_rounds_manual.sql', import.meta.url), 'utf8');
  assert.match(rooming, /id="rooming-round"/);
  assert.match(rooming, /-- Chọn đợt thi --/);
  assert.doesNotMatch(rooming, /<option value="1">Đợt 1/);
  assert.match(rooming, /id="rooming-adjustment-mode"/);
  assert.doesNotMatch(rooming, /max="25"/);
  assert.match(app, /findOfficialRoundCandidateIds/);
  assert.match(app, /data-room-assignment/);
  assert.match(app, /validateRoomingPlan/);
  assert.match(app, /exam_save_rooming_round_plan/);
  assert.match(app, /exam_finalize_rooming_round_plan/);
  assert.match(migration, /exam_rooming_round_plans/);
  assert.match(migration, /round_no smallint.*in \(1,2\)/);
  assert.match(migration, /round_no=1.*status='official'/s);
  assert.match(migration, /p_round_no <> 2\s+or not exists/s);
  assert.doesNotMatch(migration, /where old\.exam_id=p_exam_id and old\.round_no=1 and old\.status='official'\s+and a\.value->>'candidate_id'=c\.id::text\s+\)\s+and \(p_plan_type/s);
  assert.match(migration, /count\(distinct s\.subject_code\) filter \(where s\.subject_order=1\)=1/);
  assert.match(migration, /count\(distinct s\.subject_code\) filter \(where s\.subject_order=2\)=1/);
});

test('forms rounds use the same security-definer round source as rooming', async () => {
  const source = await readFile(new URL('../js/operations.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const shared = await readFile(new URL('../js/rounds.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.101_exam_rounds_rpc.sql', import.meta.url), 'utf8');
  assert.match(source, /loadExamRounds\(state\.client,examId\)/);
  assert.match(app, /loadExamRounds/);
  assert.match(shared, /exam_get_rounds/);
  assert.match(shared, /exam_list_rounds/);
  assert.match(shared, /exam_get_round_candidates/);
  assert.doesNotMatch(source, /from\('exam_rounds'\)\.select\('round_no,name,is_active'\)/);
  assert.match(migration, /create or replace function public\.exam_get_rounds\(p_exam_id uuid\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /from public\.exam_rounds r/);
  assert.match(migration, /grant execute on function public\.exam_get_rounds\(uuid\) to authenticated/);
});

test('rooming provides independent round management with protected deletion', async () => {
  const rooming = await readFile(new URL('../modules/rooming.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.104_exam_round_management.sql', import.meta.url), 'utf8');
  assert.match(rooming, /id="manage-rounds"/);
  assert.match(app, /openRoundManagement/);
  assert.match(app, /exam_create_round/);
  assert.match(app, /exam_update_round/);
  assert.match(app, /exam_delete_round/);
  assert.match(migration, /create or replace function public\.exam_list_rounds/);
  assert.match(migration, /create or replace function public\.exam_create_round/);
  assert.match(migration, /create or replace function public\.exam_update_round/);
  assert.match(migration, /create or replace function public\.exam_delete_round/);
  assert.match(migration, /status='official'/);
});

test('forms expose and persist print header typography settings', async () => {
  const forms = await readFile(new URL('../modules/forms.html', import.meta.url), 'utf8');
  const operations = await readFile(new URL('../js/operations.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.106_form_print_settings.sql', import.meta.url), 'utf8');
  for(const type of ['listing','receipt','roster']){
    assert.ok(forms.includes(`id="forms-${type}-title"`));
    for(const part of ['header','body'])for(const property of ['family','size','weight','style'])
      assert.ok(forms.includes(`id="forms-${type}-${part}-${property}"`));
  }
  assert.match(operations, /form_font_family/);
  assert.match(operations, /form_font_size/);
  assert.match(operations, /font-family:\$\{esc\(forms\.exam\.form_font_family/);
  assert.match(app, /form_font_family,form_font_size/);
  assert.match(migration, /add column if not exists form_font_family/);
  assert.match(migration, /add column if not exists form_font_size/);
});

test('choice roster print is class-per-page with an empty notes column', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /const groups=new Map\(\)/);
  assert.match(app, /class-page\$\{pageIndex===groups\.size-1\?' last':''\}/);
  assert.match(app, /<th>Ghi chú<\/th>/);
  assert.match(app, /<td><\/td><\/tr>/);
  assert.doesNotMatch(app, /<th>Trạng thái<\/th>/);
  assert.doesNotMatch(app, /Tổng số: \$\{rows\.length\}/);
  assert.match(app, /@page\{size:A4 portrait;margin:8mm\}/);
  assert.match(app, /break-after:page/);
});
