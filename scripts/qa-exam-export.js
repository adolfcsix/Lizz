import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { examsPage } from '../frontend/app/features/exams.js';
const dom = new JSDOM('<main></main>', { url: 'http://localhost' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
dom.window.HTMLAnchorElement.prototype.click = function () {};
let exported;
URL.createObjectURL = blob => { exported = blob.text(); return 'blob:qa'; };
URL.revokeObjectURL = () => {};
globalThis.fetch = async () => new Response(JSON.stringify({
  rows: Array.from({ length: 23 }, (_, i) => ({ id: String(i), examDate: '2026-11-16', startTime: '08:00', endTime: '09:00', subjectName: i < 12 ? 'Toán' : 'Văn', sectionCode: 'A' + i, term: '2026-1', status: 'PUBLISHED', roomCode: 'P01', roomName: 'Phòng 1' })),
  rooms: [{ id: 'room1', code: 'P01', name: 'Phòng 1', capacity: 40, active: true }],
}));
try {
  const main = document.querySelector('main');
  await examsPage(main, { role: 'MANAGER' });
  main.querySelector('#exam-export').click();
  assert.equal((await exported).split('\r\n').length, 24, 'Export all rows, not only first page');
  const query = main.querySelector('#exam-query');
  query.value = 'Toán'; query.dispatchEvent(new dom.window.Event('input'));
  main.querySelector('#exam-export').click();
  const filtered = await exported;
  assert.equal(filtered.split('\r\n').length, 13);
  assert.ok(!filtered.includes('Văn'));
  query.value = 'không có'; query.dispatchEvent(new dom.window.Event('input'));
  assert.equal(main.querySelector('#exam-export').disabled, true);
  main.querySelector('#room-tab').click();
  main.querySelector('#exam-export').click();
  assert.ok((await exported).includes('Sức chứa'));
  assert.ok((await exported).includes('Phòng 1'));
  console.log('Exam export DOM: pagination, filters, empty results and room tab PASS');
} finally { dom.window.close(); }
