import test from 'node:test';
import assert from 'node:assert/strict';
import { examExport } from '../../shared/exam-export.js';
import { serializeCsv } from '../../frontend/app/components/csv-export.js';
test('Exam CSV: student exports only own seat, preserves Unicode and escapes formulas', () => {
  const result = examExport('exams', [{examDate:'2026-11-16', subjectName:'=Ngữ văn', status:'PUBLISHED', mySeat:{candidateNumber:'001',seatNumber:2}, candidates:[{fullName:'Không được xuất'}]}], 'STUDENT');
  assert.equal(result.rows[0][0], '16/11/2026');
  assert.deepEqual(result.rows[0].slice(-2), ['001',2]);
  assert.equal(result.rows[0].length,result.headers.length);
  const csv=serializeCsv(result.headers,result.rows);
  assert.ok(csv.includes("'=Ngữ văn"));assert.ok(!csv.includes('Không được xuất'));
});
test('Exam CSV: staff schedule does not export candidate lists; all filtered rows retained', () => {
  const result=examExport('exams', Array.from({length:23},()=>({status:'DRAFT',mySeat:{candidateNumber:'SECRET'}})), 'STAFF');
  assert.equal(result.rows.length,23);assert.equal(result.headers.length,10);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('Exam CSV: room mode and empty results have aligned columns', () => {
  const result=examExport('rooms',[{code:'A01',name:'Phòng A',capacity:40,active:false}], 'MANAGER');
  assert.deepEqual(result.rows,[['A01','Phòng A',40,'Ngừng sử dụng']]);
  assert.deepEqual(examExport('exams',[], 'STUDENT').rows,[]);
});
