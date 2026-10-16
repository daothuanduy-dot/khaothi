import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modules = ['exams', 'school-students', 'candidates', 'subjects', 'sbd', 'rooming', 'forms', 'absences', 'scripts', 'scores', 'settings'];

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
  assert.match(rooming, /Lưu phân bổ \(xếp thí sinh\)/);
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
