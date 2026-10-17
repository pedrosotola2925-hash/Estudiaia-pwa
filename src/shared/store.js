(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.EstudiaStore=factory(root.EstudiaCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  const KEY='estudiaia:v2:data',BACKUP='estudiaia:v2:backup';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const safeInteger=v=>Number.isSafeInteger(v)&&v>=0;
  const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
  const validAt=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
  const blankProgress=()=>({subjects:{},practiceCount:0,history:[],practiceIds:[],answeredIds:[]});
  const defaults=()=>({version:2,course:'7º básico',progress:{},notes:[],cache:{}});
  function practice(value){
    if(!plain(value)||!validId(value.id)||!validAt(value.at)||value.total!==5||!safeInteger(value.correct)||value.correct>5)throw core.invalid('Resultado de práctica no válido.');
    const subject=core.assertSubject(value.subjectId);
    return {id:value.id,course:core.assertCourse(value.course),subjectId:subject.id,subjectName:subject.nombre,correct:value.correct,total:5,at:value.at};
  }
  function note(value){
    if(!plain(value)||!validId(value.id)||!validAt(value.at))throw core.invalid('Nota no válida.');
    return {id:value.id,at:value.at,technique:core.requireText(value.technique,100),text:core.requireText(value.text)};
  }
  function normalize(raw){
    if(!plain(raw)||raw.version!==2)throw core.invalid('Estado no compatible.');
    const state=defaults();let repaired=false;
    if(core.COURSES.includes(raw.course))state.course=raw.course;else repaired=true;
    if(plain(raw.progress))for(const [course,input] of Object.entries(raw.progress)){
      if(!core.COURSES.includes(course)||!plain(input)){repaired=true;continue;}
      const p=blankProgress();
      if(plain(input.subjects))for(const [id,score] of Object.entries(input.subjects)){
        if(core.SUBJECTS.some(s=>s.id===id)&&plain(score)&&safeInteger(score.correct)&&safeInteger(score.total)&&score.correct<=score.total)p.subjects[id]={correct:score.correct,total:score.total};
        else repaired=true;
      }
      else repaired=true;
      const uniqueIds=field=>{
        if(!Array.isArray(input[field])){repaired=true;return [];}
        const values=[...new Set(input[field].filter(validId))];if(values.length!==input[field].length)repaired=true;return values;
      };
      p.answeredIds=uniqueIds('answeredIds');p.practiceIds=uniqueIds('practiceIds');
      const history=new Map();
      if(Array.isArray(input.history))for(const item of input.history){
        try{const valid=practice({...item,course});const {course:ignored,...entry}=valid;if(history.has(entry.id))repaired=true;history.set(entry.id,entry);}
        catch{repaired=true;}
      }else repaired=true;
      p.history=[...history.values()].slice(-20);
      p.practiceIds=[...new Set([...p.practiceIds,...p.history.map(h=>h.id)])];
      if(!safeInteger(input.practiceCount))repaired=true;
      p.practiceCount=Math.max(safeInteger(input.practiceCount)?input.practiceCount:0,p.practiceIds.length);
      state.progress[course]=p;
    }else repaired=true;
    const notes=new Map();
    if(Array.isArray(raw.notes))for(const value of raw.notes){try{const n=note(value);if(notes.has(n.id))repaired=true;notes.set(n.id,n);}catch{repaired=true;}}
    else repaired=true;
    state.notes=[...notes.values()];
    if(plain(raw.cache))for(const [key,entry] of Object.entries(raw.cache)){
      if(['__proto__','prototype','constructor'].includes(key)||key.length>50000||!plain(entry)||typeof entry.text!=='string'||!entry.text.trim()||entry.text.length>20000||!validAt(entry.at)){repaired=true;continue;}
      state.cache[key]={text:entry.text,at:entry.at};
    }else repaired=true;
    const keys=Object.keys(state.cache);for(const key of keys.slice(0,Math.max(0,keys.length-100)))delete state.cache[key];
    return {state,repaired};
  }
  function createStore(storage){
    let state=defaults(),warning='';
    try{
      const raw=storage.getItem(KEY);
      if(raw!==null){
        try{const parsed=normalize(JSON.parse(raw));state=parsed.state;if(parsed.repaired)warning='Se recuperaron los datos válidos; algunos registros estaban dañados.';}
        catch{
          warning='Los datos guardados estaban dañados. Se intentó recuperar una copia anterior.';
          const backup=storage.getItem(BACKUP);
          if(backup!==null)try{state=normalize(JSON.parse(backup)).state;}catch{state=defaults();}
        }
      }
    }catch{warning='No se pudo leer el almacenamiento. Los cambios podrían no guardarse.';}
    function commit(next){
      const prior=JSON.stringify(state),encoded=JSON.stringify(next);
      try{storage.setItem(BACKUP,prior);storage.setItem(KEY,encoded);}
      catch{const e=new Error('No se pudo guardar. El almacenamiento está lleno o no está disponible.');e.code='STORAGE_ERROR';throw e;}
      state=next;
    }
    function getProgress(next,course){core.assertCourse(course);return next.progress[course]||(next.progress[course]=blankProgress());}
    return {
      warning,
      getState:()=>clone(state),
      setCourse(course){core.assertCourse(course);if(state.course===course)return;const next=clone(state);next.course=course;commit(next);},
      recordPractice(value){
        const valid=practice(value);if(state.progress[valid.course]?.practiceIds.includes(valid.id))return false;
        const next=clone(state),p=getProgress(next,valid.course);
        const score=p.subjects[valid.subjectId]||{correct:0,total:0};
        const newScore={correct:score.correct+valid.correct,total:score.total+5};
        if(!safeInteger(newScore.correct)||!safeInteger(newScore.total)||!safeInteger(p.practiceCount+1))throw core.invalid();
        p.subjects[valid.subjectId]=newScore;p.practiceCount++;p.practiceIds.push(valid.id);
        const {course,...entry}=valid;p.history.push(entry);p.history=p.history.slice(-20);commit(next);return true;
      },
      recordCorrect(course,id){
        core.assertCourse(course);if(!validId(id))throw core.invalid();
        if(state.progress[course]?.answeredIds.includes(id))return false;
        const next=clone(state);getProgress(next,course).answeredIds.push(id);commit(next);return true;
      },
      saveNote(value){
        const valid=note(value),next=clone(state),index=next.notes.findIndex(n=>n.id===valid.id);
        if(index<0)next.notes.push(valid);else next.notes[index]=valid;commit(next);
      },
      getCache(key){return Object.hasOwn(state.cache,key)?state.cache[key].text:null;},
      putCache(key,text){
        if(typeof key!=='string'||!key||key.length>50000||['__proto__','prototype','constructor'].includes(key))throw core.invalid();
        const valid=core.requireText(text),next=clone(state);delete next.cache[key];next.cache[key]={text:valid,at:new Date().toISOString()};
        const keys=Object.keys(next.cache);for(const old of keys.slice(0,Math.max(0,keys.length-100)))delete next.cache[old];commit(next);
      }
    };
  }
  return Object.freeze({createStore});
});
