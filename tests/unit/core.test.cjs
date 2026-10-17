'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../src/shared/core.js');
const five = () => Array.from({length:5},(_,i)=>({p:`Pregunta de prueba ${i+1}`,o:['uno','dos','tres','cuatro'],c:i%4,e:'Explicación de prueba.'}));
const lesson = () => ({titulo:'Lección de prueba',slides:Array.from({length:4},()=>({emoji:'📖',titulo:'Concepto',texto:'Una explicación sencilla.'})),final:{pregunta:'¿Cuál?',a:'Uno',b:'Dos',correcta:'A'}});

test('JSON blocks and fenced JSON parse without evaluating code',()=>{
  assert.deepEqual(core.parseJSONBlock('[[JSON]]\n[1,2]\n[[/JSON]]'),[1,2]);
  assert.deepEqual(core.parseJSONBlock('```json\n{"a":1}\n```'),{a:1});
  assert.deepEqual(core.parseJSONBlock('{"a":2}'),{a:2});
  assert.throws(()=>core.parseJSONBlock('alert(1)'));
  assert.throws(()=>core.parseJSONBlock(''));
});
test('valid five-question practice preserves answer and explanation',()=>{
  const parsed=core.validatePractice(five());
  assert.equal(parsed.length,5); assert.equal(parsed[1].c,1); assert.equal(parsed[0].e,'Explicación de prueba.');
});
for(const c of [-1,4,1.5,NaN,Infinity,'1']) test(`practice rejects invalid answer index ${String(c)}`,()=>{
  const qs=five();qs[0].c=c;assert.throws(()=>core.validatePractice(qs),/formato/i);
});
for(const mutate of [q=>q.p='',q=>q.o[0]={x:1},q=>q.o.pop(),q=>q.e='',q=>q.e=null]) test('practice rejects malformed text, options or explanations',()=>{
  const qs=five();mutate(qs[0]);assert.throws(()=>core.validatePractice(qs),/formato/i);
});
test('practice must have exactly five questions',()=>{
  assert.throws(()=>core.validatePractice(five().slice(0,4)));assert.throws(()=>core.validatePractice([...five(),five()[0]]));assert.throws(()=>core.validatePractice(null));
});
test('lesson validates cards and final A/B answer',()=>{
  assert.equal(core.validateLesson(lesson()).slides.length,4);
  for(const n of [0,3,7]) {const l=lesson();l.slides=Array.from({length:n},()=>lesson().slides[0]);assert.throws(()=>core.validateLesson(l));}
  const l=lesson();l.final.correcta='C';assert.throws(()=>core.validateLesson(l));
  const bad=lesson();bad.slides[0].texto={html:'unsafe'};assert.throws(()=>core.validateLesson(bad));
});
test('mini-question parser supports multiline stem and validates complete A/B structure',()=>{
  const q=core.parseMiniQuestion('Texto\n[[PREGUNTA]]\nElige la opción.\nPiensa antes de responder.\nA) Primera\nB) Segunda\nCORRECTA: b\n[[FIN_PREGUNTA]]');
  assert.deepEqual(q,{enunciado:'Elige la opción. Piensa antes de responder.',opciones:[{letra:'A',texto:'Primera'},{letra:'B',texto:'Segunda'}],correcta:'B'});
  for(const raw of ['sin bloque','[[PREGUNTA]]\nA) Algo\nCORRECTA: A\n[[FIN_PREGUNTA]]','[[PREGUNTA]]\nPregunta\nA) Uno\nB) Dos\nCORRECTA: C\n[[FIN_PREGUNTA]]']) assert.equal(core.parseMiniQuestion(raw),null);
});
test('cache keys preserve operators and distinguish grade, model and date',()=>{
  const input={kind:'tutor',course:'7º básico',model:'m',text:'2+3'};
  const key=core.cacheKey(input);
  assert.notEqual(key,core.cacheKey({...input,text:'2-3'}));
  assert.notEqual(key,core.cacheKey({...input,course:'8º básico'}));
  assert.notEqual(key,core.cacheKey({...input,model:'other'}));
  assert.notEqual(core.cacheKey({...input,context:'2026-10-17'}),core.cacheKey({...input,context:'2026-10-18'}));
  assert.equal(key,core.cacheKey({...input,text:' 2+3 '}));
});
const png=[137,80,78,71,13,10,26,10];
function file(size=8){const bytes=new Uint8Array(size);if(size>=8)bytes.set(png);return {name:'nota.PNG',mime:'image/png',bytes};}
test('note uploads accept a matching header up to exactly 4 MiB',()=>{
  assert.doesNotThrow(()=>core.validateNoteFile(file()));
  assert.doesNotThrow(()=>core.validateNoteFile(file(4*1024*1024)));
  assert.doesNotThrow(()=>core.validateNoteFile({name:'a.pdf',mime:'application/pdf',bytes:new TextEncoder().encode('%PDF-1.7\n')}));
  assert.doesNotThrow(()=>core.validateNoteFile({name:'a.jpg',mime:'image/jpeg',bytes:Uint8Array.from([255,216,255,224])}));
  assert.doesNotThrow(()=>core.validateNoteFile({name:'a.webp',mime:'image/webp',bytes:new TextEncoder().encode('RIFF0000WEBP')}));
});
test('note uploads reject empty, too large, spoofed, SVG and filename mismatch',()=>{
  for(const f of [file(0),file(4*1024*1024+1),{...file(),mime:'application/pdf'},{...file(),name:'a.svg',mime:'image/svg+xml'},{...file(),name:'a.pdf'},{...file(),bytes:new Uint8Array(20)}]) assert.throws(()=>core.validateNoteFile(f));
});
