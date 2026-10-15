import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/operations.js', import.meta.url), 'utf8');
const { parseQuickScore, validateEssayScore, excelColumnIndex, parseImportedScore } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

test('quick entry inserts the configured decimal point from the right', () => {
  assert.equal(parseQuickScore('875', 2), 8.75);
  assert.equal(parseQuickScore('85', 2), 8.5);
  assert.equal(parseQuickScore('8', 2), 8);
  assert.equal(parseQuickScore('', 2), null);
});

test('essay score validation checks range and configured increments', () => {
  const config = { maximum_score: 10, score_step: 0.25 };
  assert.equal(validateEssayScore(7.5, config), null);
  assert.match(validateEssayScore(10.25, config), /0 đến 10/);
  assert.match(validateEssayScore(7.3, config), /bước 0.25/);
});

test('Excel column and score parsing supports flexible import mappings', () => {
  assert.equal(excelColumnIndex('A'), 0);
  assert.equal(excelColumnIndex('B'), 1);
  assert.equal(excelColumnIndex('F'), 5);
  assert.equal(excelColumnIndex('AA'), 26);
  assert.equal(excelColumnIndex('XFD'), 16383);
  assert.throws(() => excelColumnIndex('XFE'), /không vượt quá XFD/);
  assert.equal(parseImportedScore(8.25, 2), 8.25);
  assert.equal(parseImportedScore('8,5', 3), 8.5);
  assert.throws(() => parseImportedScore('-1', 4), /dòng 4/);
  assert.throws(() => parseImportedScore('n/a', 5), /dòng 5/);
});

test('every operations DOM lookup has a matching static control', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const moduleNames = ['forms', 'absences', 'scripts', 'scores'];
  const markup = [index, ...await Promise.all(moduleNames.map(name =>
    readFile(new URL(`../modules/${name}.html`, import.meta.url), 'utf8')
  ))].join('\n');
  const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const lookups = [...source.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(ids.size > 0);
  const dynamicIds = new Set(['close-bag-assignments', 'save-bag-assignments', 'draw-bag-assignments']);
  for (const id of lookups) assert.ok(ids.has(id) || dynamicIds.has(id), `Missing DOM control #${id}`);
});

test('the script subject selector is populated before exams and configs finish loading', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.60_script_any_subject.sql', import.meta.url), 'utf8');
  assert.match(source, /setSubjectOptions\('script-subject',allSubjectOptions\(\)\)/);
  assert.match(source, /refreshScriptConfigs:\(\)=>/);
  assert.match(app, /if\(tab==='scripts'\)operations\?\.refreshScriptConfigs\(\)/);
  assert.doesNotMatch(source, /Hãy lưu cấu hình môn là môn tự luận trước khi lập phương án phách/);
  assert.doesNotMatch(migration, /exam_subject_assessment_configs/);
  assert.doesNotMatch(migration, /chưa được khai báo có bài tự luận/);
  const randomCodeMigration = await readFile(new URL('../sql/v0.1.61_random_script_code.sql', import.meta.url), 'utf8');
  assert.match(randomCodeMigration, /gen_random_bytes\(8\)/);
  assert.match(randomCodeMigration, /gen_random_uuid\(\)::text/);
  const bagMigration = await readFile(new URL('../sql/v0.1.62_script_heads_bag_grading.sql', import.meta.url), 'utf8');
  assert.match(bagMigration, /phach_prefix/);
  assert.match(bagMigration, /compact_room_no::text/);
  assert.match(bagMigration, /exam_can_grade_script_room/);
  assert.match(bagMigration, /exam_set_script_bag_assignments/);
  assert.match(bagMigration, /exam_script_bag_assignments/);
  const scripts = await readFile(new URL('../modules/scripts.html', import.meta.url), 'utf8');
  assert.doesNotMatch(scripts, /script-is-essay|Môn có bài tự luận, cần đánh phách/);
  assert.match(source, /data-room-prefix/);
  assert.match(scripts, /đầu phách/i);
  assert.match(source, /data-script-assign/);
  assert.match(source, /Không phân công riêng/);
});

test('v0.1.63 enforces fixed mandatory seats and groups grader access safely', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.63_fixed_seats_groups_scores.sql', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /fixedSeatPlan=await findCurrentRoomingFinalization/);
  assert.match(app, /row\.seat_number=next/);
  assert.match(app, /'Vị trí','SBD','Họ và tên'/);
  assert.match(app, /hasSeats\?`<td>\$\{a\.seat_number\}<\/td>`:''/);
  assert.match(migration, /exam_validate_fixed_mandatory_seats/);
  assert.match(migration, /candidate_id,a\.room_code,a\.sbd/);
  assert.match(migration, /exam_grader_group_members/);
  assert.match(migration, /exam_can_grade_script_room/);
  assert.match(migration, /exam_delete_script_runs/);
  assert.match(migration, /exam_draw_script_bag_assignments/);
  assert.match(migration, /v_old text:='\^\[A-Za-z\]\{1,3\}\$'/);
  assert.match(migration, /v_new text:='\^\[A-Za-z0-9\]\{1,6\}\$'/);
  assert.doesNotMatch(migration, /v_(?:old|new) text:=\$old\$/);
  assert.match(index, /id="google-login"/);
  assert.match(app, /signInWithOAuth/);
  assert.doesNotMatch(migration, /password\s+text/i);
});

test('score import and aggregate total use a configurable Excel column map and addition', async () => {
  const module = await readFile(new URL('../modules/scores.html', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../sql/v0.1.63_fixed_seats_groups_scores.sql', import.meta.url), 'utf8');
  assert.match(module, /id="scores-sbd-column"/);
  assert.match(module, /id="scores-mcq-column"/);
  assert.match(source, /exam_import_mcq_scores/);
  assert.match(source, /exam_get_combined_scores/);
  assert.match(migration, /then essay\.score\+mcq\.score end/);
});
