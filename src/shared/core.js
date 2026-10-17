(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.EstudiaCore=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const COURSES=Object.freeze(['3º básico','4º básico','5º básico','6º básico','7º básico','8º básico','I medio','II medio','III medio','IV medio']);
  const SUBJECTS=Object.freeze([
    {id:'matematica',nombre:'Matemática',emoji:'📐'},
    {id:'ciencias',nombre:'Ciencias',emoji:'🔬'},
    {id:'lenguaje',nombre:'Lenguaje',emoji:'📖'},
    {id:'historia',nombre:'Historia',emoji:'🏛️'},
    {id:'ingles',nombre:'Inglés',emoji:'🇬🇧'},
    {id:'tecnologia',nombre:'Tecnología',emoji:'💻'}
  ].map(Object.freeze));
  function invalid(message='Formato inválido de la respuesta.'){
    const error=new Error(message);error.code='INVALID_FORMAT';return error;
  }
  function requireText(value,max=20000){
    if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))throw invalid();
    return value.trim();
  }
  function assertCourse(course){if(!COURSES.includes(course))throw invalid('Curso no válido.');return course;}
  function assertSubject(id){const s=SUBJECTS.find(s=>s.id===id);if(!s)throw invalid('Materia no válida.');return s;}
  function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
  function parseJSONBlock(text){
    let raw=requireText(text,250000).replace(/^\uFEFF/,'');
    const block=raw.match(/\[\[JSON\]\]([\s\S]*?)\[\[\/JSON\]\]/);
    if(block)raw=block[1].trim();
    else {const fence=raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fence)raw=fence[1];}
    try{return JSON.parse(raw);}catch{throw invalid();}
  }
  function validatePractice(value){
    if(!Array.isArray(value)||value.length!==5)throw invalid();
    return value.map(q=>{
      if(!object(q)||!Array.isArray(q.o)||q.o.length!==4||!Number.isInteger(q.c)||q.c<0||q.c>3)throw invalid();
      return {p:requireText(q.p,4000),o:q.o.map(v=>requireText(v,4000)),c:q.c,e:requireText(q.e,10000)};
    });
  }
  function validateLesson(value){
    if(!object(value)||!Array.isArray(value.slides)||value.slides.length<4||value.slides.length>6||!object(value.final))throw invalid();
    const answer=typeof value.final.correcta==='string'?value.final.correcta.trim().toUpperCase():'';
    if(!['A','B'].includes(answer))throw invalid();
    return {titulo:requireText(value.titulo,300),slides:value.slides.map(s=>{
      if(!object(s))throw invalid();
      return {emoji:requireText(s.emoji,64),titulo:requireText(s.titulo,300),texto:requireText(s.texto,6000)};
    }),final:{pregunta:requireText(value.final.pregunta,4000),a:requireText(value.final.a,2000),b:requireText(value.final.b,2000),correcta:answer}};
  }
  function parseMiniQuestion(text){
    if(typeof text!=='string')return null;
    const block=text.match(/\[\[PREGUNTA\]\]([\s\S]*?)\[\[FIN_PREGUNTA\]\]/);
    if(!block)return null;
    const lines=block[1].split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const options=[],stem=[];let answer='',seenOption=false;
    for(const line of lines){
      const option=line.match(/^([AB])\)\s*(.+)$/i);
      const correct=line.match(/^CORRECTA:\s*([AB])\s*$/i);
      if(option){seenOption=true;options.push({letra:option[1].toUpperCase(),texto:option[2].trim()});}
      else if(correct){if(answer)return null;answer=correct[1].toUpperCase();}
      else if(!seenOption&&!/^CORRECTA:/i.test(line))stem.push(line);
      else return null;
    }
    if(!stem.length||options.length!==2||options[0].letra!=='A'||options[1].letra!=='B'||!['A','B'].includes(answer))return null;
    return {enunciado:stem.join(' '),opciones:options,correcta:answer};
  }
  function cacheKey({kind,course,model,text,context=''}){
    return JSON.stringify([2,requireText(kind,30),assertCourse(course),requireText(model,100),requireText(text).normalize('NFC'),context]);
  }
  function validateNoteFile({name,mime,bytes}={}){
    if(typeof name!=='string'||name.length>255||/[\0\/\\]/.test(name)||!ArrayBuffer.isView(bytes)||bytes.BYTES_PER_ELEMENT!==1||bytes.byteLength===0||bytes.byteLength>4*1024*1024)throw invalid('Archivo vacío, no válido o mayor de 4 MiB.');
    const ext=name.split('.').pop().toLowerCase();
    const start=(arr,offset=0)=>arr.every((v,i)=>bytes[offset+i]===v);
    const supported={
      'image/png':()=>ext==='png'&&start([137,80,78,71,13,10,26,10]),
      'image/jpeg':()=>['jpg','jpeg'].includes(ext)&&start([255,216,255]),
      'image/webp':()=>ext==='webp'&&start([82,73,70,70])&&start([87,69,66,80],8),
      'application/pdf':()=>ext==='pdf'&&start([37,80,68,70,45])
    };
    if(!Object.hasOwn(supported,mime)||!supported[mime]())throw invalid('El formato del archivo no coincide o no está admitido. Usa JPEG, PNG, WebP o PDF.');
  }
  return Object.freeze({COURSES,SUBJECTS,invalid,requireText,assertCourse,assertSubject,parseJSONBlock,validatePractice,validateLesson,parseMiniQuestion,cacheKey,validateNoteFile});
});
