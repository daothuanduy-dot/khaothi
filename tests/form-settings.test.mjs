import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/operations.js',import.meta.url),'utf8');
const {buildClassRoomRows,groupReceiptRows}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const settingsSource=source.slice(source.indexOf('  const formSpecs='),source.indexOf('  async function loadForms()'));
function editor(){
  const controls=new Map();
  const $=id=>{if(!controls.has(id))controls.set(id,{value:'',classList:{toggle(name,on){this[name]=on}}});return controls.get(id)};
  return {$,...new Function('$',settingsSource+';return {formSpecs,classRoomGroups,classRoomValues,showFormSettings,normalizeFormPrintSettings,currentFormPrintSettings,applyFormPrintSettings};')($)};
}
test('legacy settings migrate into independent form settings and round-trip edits',()=>{
  const e=editor();
  e.applyFormPrintSettings({header:{family:'Arial',size:16},body:{size:11},widths:{receipt:[7,12]}});
  e.$('forms-receipt-title').value='Tiêu đề thu bài mới';
  e.$('forms-receipt-header-style').value='italic';
  e.$('forms-listing-body-size').value='13';
  const settings=e.currentFormPrintSettings();
  assert.equal(settings.receipt.title,'Tiêu đề thu bài mới');
  assert.equal(settings.receipt.header.style,'italic');
  assert.equal(settings.listing.header.style,'normal');
  assert.equal(settings.listing.body.size,13);
  assert.equal(settings.receipt.body.size,11);
  assert.equal(settings.receipt.widths[0],7);
  e.applyFormPrintSettings(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(e.currentFormPrintSettings(),settings);
});
test('invalid font sizes and column widths block saving and exporting',()=>{
  const e=editor();e.applyFormPrintSettings({});
  e.$('forms-receipt-width-2').value='0';
  assert.throws(()=>e.currentFormPrintSettings(),/Độ rộng cột/);
  e.$('forms-receipt-width-2').value='25';
  e.$('forms-roster-header-size').value='100';
  assert.throws(()=>e.currentFormPrintSettings(),/Cỡ chữ/);
});

test('choosing a form shows only its settings and retains edits',()=>{
  const e=editor();e.applyFormPrintSettings({});
  e.$('forms-listing-title').value='Tiêu đề đang sửa';
  e.$('forms-print-type').value='classrooms';e.showFormSettings();
  assert.equal(e.$('forms-settings-classrooms').classList.hidden,false);
  for(const key of ['listing','receipt','roster'])assert.equal(e.$(`forms-settings-${key}`).classList.hidden,true);
  assert.equal(e.$('forms-class-filter-wrap').classList.hidden,false);
  e.$('forms-print-type').value='listing';e.showFormSettings();
  assert.equal(e.$('forms-listing-title').value,'Tiêu đề đang sửa');
  assert.equal(e.$('forms-class-filter-wrap').classList.hidden,true);
});

test('class room list includes unassigned students, distinct rooms by subject and no duplicate assignments',()=>{
  const candidates=[{id:'b',class_code:'12A2',sbd:'002',gender:'Nữ'},{id:'a',class_code:'12A1',sbd:'001',gender:'Nam'}];
  const assignments=[
    {candidate_id:'a',plan_type:'mandatory',subject_code:'TOAN',room_code:'01'},
    {candidate_id:'a',plan_type:'mandatory',subject_code:'VAN',room_code:'02'},
    {candidate_id:'a',plan_type:'elective',ca1_subject_code:'LI',ca2_subject_code:'HOA',room_code:'03'},
    {candidate_id:'a',plan_type:'elective',ca1_subject_code:'LI',ca2_subject_code:'HOA',room_code:'03'},
    {candidate_id:'other',plan_type:'mandatory',room_code:'99'}
  ];
  const rows=buildClassRoomRows(candidates,assignments);
  assert.equal(rows.length,2);
  assert.equal(rows[0].mandatory_rooms,'TOAN: 01; VAN: 02');
  assert.equal(rows[0].elective_rooms,'LI / HOA: 03');
  assert.equal(rows[1].mandatory_rooms,'Chưa phân phòng');
  assert.equal(rows[1].gender,'Nữ');
  const e=editor();e.$('forms-class-filter').value='12A2';
  assert.deepEqual(e.classRoomGroups({classRoomRows:rows}),[['12A2',[rows[1]]]]);
});

test('Excel uses edited titles, independent fonts and widths without restyling receipt totals',()=>{
  const e=editor();e.applyFormPrintSettings({});
  e.$('forms-print-type').value='all';
  e.$('forms-receipt-title').value='PHIẾU THU BÀI MỚI';
  e.$('forms-receipt-header-family').value='Arial';
  e.$('forms-receipt-header-size').value='18';
  e.$('forms-receipt-body-style').value='italic';
  e.$('forms-receipt-width-2').value='35';
  const sheets={};
  const window={XLSX:{utils:{book_new:()=>({}),aoa_to_sheet:rows=>Object.fromEntries(rows.flatMap((row,r)=>row.map((v,c)=>[`${r}:${c}`,{v}]))),decode_cell:address=>({r:Number(address.split(':')[0])}),book_append_sheet:(_,sheet,name)=>{sheets[name]=sheet}},writeFile:()=>{}}};
  const row={room_code:'01',subject_code:'TOAN',sbd:'001',student_name:'Nguyễn An',class_code:'12A1'};
  const cache={forms:{exam:{form_font_family:'Times New Roman',form_font_size:11},examId:'exam',roundNo:2,listingRows:[row],receiptRows:[row],rosterRows:[row],classRoomRows:[{...row,gender:'Nam',mandatory_rooms:'Toán: 01',elective_rooms:'Lí: 03'},{...row,class_code:'12A2',gender:'Nữ'}]}};
  const fn=source.slice(source.indexOf('  function exportFormsExcel()'),source.indexOf('  function compactPrintPages('));
  new Function('$','currentFormPrintSettings','cache','window','nameOf','classRoomGroups','classRoomValues','formSpecs','groupReceiptRows',fn+';exportFormsExcel();')(e.$,e.currentFormPrintSettings,cache,window,x=>x||'',e.classRoomGroups,e.classRoomValues,e.formSpecs,groupReceiptRows);
  const receipt=sheets['Phieu thu bai'];
  assert.equal(receipt['1:0'].v,'PHIẾU THU BÀI MỚI');
  assert.equal(receipt['1:0'].s.font.name,'Arial');
  assert.equal(receipt['1:0'].s.font.sz,18);
  assert.equal(receipt['4:2'].s.font.italic,true);
  assert.equal(receipt['!cols'][2].wch,35);
  assert.equal(receipt['5:0'].v,'Tổng số thí sinh');
  assert.equal(receipt['5:0'].s.font.sz,11);
  assert.equal(receipt['5:0'].s.font.italic,undefined);
  assert.match(receipt['6:0'].v,/Tổng số bài/);
  assert.match(receipt['6:5'].v,/Tổng số tờ/);
  assert.match(receipt['7:0'].v,/SBD thí sinh vắng/);
  assert.equal(receipt['9:0'].v,'Cán bộ coi thi 1');
  assert.equal(receipt['9:5'].v,'Cán bộ coi thi 2');
  assert.equal(sheets['Danh sach niem yet']['1:0'].s.font.sz,12);
  assert.equal(sheets['Lop 1 - 12A1']['2:0'].v,'Lớp: 12A1 · Đợt 2');
  assert.equal(sheets['Lop 1 - 12A1']['4:4'].v,'Nam');
  assert.equal(sheets['Lop 1 - 12A1']['4:5'].v,'Toán: 01');
  assert.equal(sheets['Lop 1 - 12A1']['4:6'].v,'Lí: 03');
  assert.equal(sheets['Lop 2 - 12A2']['4:4'].v,'Nữ');
});

test('elective receipts group mixed subjects by room for the selected sitting only',()=>{
  const rows=[
    {candidate_id:'a',room_code:'01',subject_order:1,subject_code:'LY',sbd:'002'},
    {candidate_id:'b',room_code:'01',subject_order:1,subject_code:'HOA',sbd:'001'},
    {candidate_id:'a',room_code:'01',subject_order:2,subject_code:'SU',sbd:'002'},
    {candidate_id:'b',room_code:'01',subject_order:2,subject_code:'DIA',sbd:'001'},
    {candidate_id:'c',room_code:'02',subject_order:1,subject_code:'HOA',sbd:'003'}
  ];
  const first=groupReceiptRows(rows,1),second=groupReceiptRows(rows,2);
  assert.equal(first.length,2);assert.equal(second.length,1);
  assert.deepEqual(first[0].rows.map(row=>row.subject_code),['HOA','LY']);
  assert.deepEqual(second[0].rows.map(row=>row.subject_code),['DIA','SU']);
});

test('printed receipt has one mixed-subject room list and the complete footer',()=>{
  const e=editor();e.applyFormPrintSettings({});
  e.$('forms-print-type').value='receipt';e.$('forms-receipt-order').value='2';
  const rows=['HOA','LY'].map((subject_code,i)=>({candidate_id:String(i),sbd:String(i),room_code:'01',subject_order:2,subject_code,student_name:'Học sinh '+i}));
  let html='';
  const window={open:()=>({document:{write:value=>html=value,close(){}}})};
  const fn=source.slice(source.indexOf('  function exportFormsPdf()'),source.indexOf('  async function loadAbsences()'));
  new Function('$','cache','window','currentFormPrintSettings','groupReceiptRows','compactPrintPages','esc','nameOf',fn+';exportFormsPdf();')(e.$,{forms:{exam:{},receiptRows:rows}},window,e.currentFormPrintSettings,groupReceiptRows,x=>x,x=>String(x??''),x=>x||'');
  assert.equal((html.match(/<section class="page receipt">/g)||[]).length,1);
  assert.match(html,/<h3>PHIẾU THU BÀI · PHÒNG 01 · MÔN 2<\/h3>/);
  for(const text of ['HOA','LY','Tổng số bài','Tổng số tờ','Số thí sinh vắng','SBD thí sinh vắng','Cán bộ coi thi 1','Cán bộ coi thi 2'])assert.ok(html.includes(text));
});
