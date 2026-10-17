'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('../../src/shared/store.js');
const KEY='estudiaia:v2:data',BACKUP='estudiaia:v2:backup';
function memory(seed={}){const data=new Map(Object.entries(seed));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),data};}
const result=(id='p1',course='7º básico')=>({id,course,subjectId:'matematica',subjectName:'Matemática',correct:3,total:5,at:'2026-10-17T12:00:00.000Z'});

test('a completed practice is persisted once even after reopening',()=>{
  const storage=memory(),store=createStore(storage);
  store.recordPractice(result());store.recordPractice(result());
  const p=createStore(storage).getState().progress['7º básico'];
  assert.equal(p.practiceCount,1);assert.deepEqual(p.subjects.matematica,{correct:3,total:5});assert.equal(p.history.length,1);
});
test('history caps at twenty without losing lifetime count or old attempt IDs',()=>{
  const store=createStore(memory());for(let i=0;i<21;i++)store.recordPractice(result('p'+i));
  store.recordPractice(result('p0'));const p=store.getState().progress['7º básico'];
  assert.equal(p.history.length,20);assert.equal(p.practiceCount,21);assert.equal(p.subjects.matematica.total,105);
  assert.equal(p.history[0].id,'p1');
});
test('scores and mini-question IDs are separated by course',()=>{
  const store=createStore(memory());store.recordPractice(result());store.recordCorrect('7º básico','q1');store.recordCorrect('7º básico','q1');
  store.recordCorrect('8º básico','q1');store.setCourse('8º básico');
  const state=store.getState();assert.equal(state.course,'8º básico');
  assert.deepEqual(state.progress['7º básico'].answeredIds,['q1']);assert.deepEqual(state.progress['8º básico'].answeredIds,['q1']);
  assert.equal(state.progress['8º básico'].practiceCount,0);
});
test('failed writes keep memory and previously saved progress unchanged',()=>{
  const storage=memory(),store=createStore(storage);store.recordPractice(result());const before=store.getState();const encoded=storage.getItem(KEY);
  const original=storage.setItem;storage.setItem=(k,v)=>{if(k===KEY)throw new Error('QuotaExceededError');original(k,v);};
  assert.throws(()=>store.recordPractice(result('p2')));assert.deepEqual(store.getState(),before);assert.equal(storage.getItem(KEY),encoded);
});
test('failed backup writes never replace the last good state',()=>{
  const storage=memory(),store=createStore(storage);store.recordPractice(result());const before=store.getState();
  storage.setItem=()=>{throw new Error('disk full');};assert.throws(()=>store.setCourse('8º básico'));assert.deepEqual(store.getState(),before);
});
test('invalid main JSON restores a valid backup and raises a warning',()=>{
  const storage=memory();const store=createStore(storage);store.recordPractice(result());const good=storage.getItem(KEY);
  storage.setItem(BACKUP,good);storage.setItem(KEY,'not json');const restored=createStore(storage);
  assert.equal(restored.getState().progress['7º básico'].practiceCount,1);assert.ok(restored.warning);
});
test('partially corrupt state retains valid notes and valid subject records',()=>{
  const seed={version:2,course:'7º básico',progress:{'7º básico':{subjects:{matematica:{correct:3,total:5},ciencias:{correct:'broken',total:5}},practiceCount:1,history:[],practiceIds:['p1'],answeredIds:[]}},notes:[{id:'n1',at:'2026-10-17T12:00:00.000Z',technique:'Recuerdo activo',text:'Apunte válido'},null],cache:{}};
  const store=createStore(memory({[KEY]:JSON.stringify(seed)}));const state=store.getState();
  assert.equal(state.notes[0].text,'Apunte válido');assert.equal(state.notes.length,1);assert.deepEqual(state.progress['7º básico'].subjects.matematica,{correct:3,total:5});assert.equal(state.progress['7º básico'].subjects.ciencias,undefined);assert.ok(store.warning);
});
test('invalid scores and unknown course cannot corrupt state',()=>{
  const store=createStore(memory());for(const correct of [NaN,Infinity,-1,6,2.5])assert.throws(()=>store.recordPractice({...result(),correct}));
  assert.throws(()=>store.setCourse('unknown'));assert.throws(()=>store.recordPractice({...result(),subjectId:'__proto__'}));assert.equal(store.getState().course,'7º básico');
});
test('notes survive restart; same note ID is not duplicated and empty notes fail',()=>{
  const storage=memory(),store=createStore(storage);const note={id:'n1',at:'2026-10-17T12:00:00.000Z',technique:'Recuerdo activo',text:'Mi apunte'};
  store.saveNote(note);store.saveNote(note);assert.throws(()=>store.saveNote({...note,id:'n2',text:'  '}));
  const reloaded=createStore(storage);assert.equal(reloaded.getState().notes.length,1);assert.equal(reloaded.getState().notes[0].text,'Mi apunte');
});
test('text cache is bounded and does not evict progress or notes',()=>{
  const store=createStore(memory());store.recordPractice(result());
  for(let i=0;i<101;i++)store.putCache('k'+i,'respuesta '+i);
  assert.equal(store.getCache('k0'),null);assert.equal(store.getCache('k100'),'respuesta 100');assert.equal(Object.keys(store.getState().cache).length,100);assert.equal(store.getState().progress['7º básico'].practiceCount,1);
});
test('snapshots cannot mutate internal state without a transaction',()=>{
  const store=createStore(memory());const snapshot=store.getState();snapshot.course='wrong';assert.equal(store.getState().course,'7º básico');
});
