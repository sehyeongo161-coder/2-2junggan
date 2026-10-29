/* 최침: 26개 원문 묶음, 자동채점과 참고 답안 비교를 분리합니다. */
(()=>{
'use strict';
const DATA=JSON.parse(document.getElementById('choichim-data').textContent);
const QUESTIONS=DATA.questions;
const $=id=>document.getElementById(id);
const autoIds=new Set(['CC-003','CC-007','CC-010','CC-012','CC-013','CC-014','CC-016','CC-017','CC-018','CC-021']);
const categories={thermal:'온냉경락요법',light:'경피경락광선요법',ea:'전침요법',electro:'전기자극요법',syncope:'훈침 · RIPCORD',held:'별도 보류 문항'};
const sectionOrder=['thermal','light','ea','electro','syncope','held'];
const number=q=>Number(q.id.slice(3));
const category=q=>{const n=number(q);return n<=6?'ea':n<=9?'thermal':n<=12?'light':n<=19?'electro':n<=22?'syncope':'held';};
const byId=new Map(QUESTIONS.map(q=>[q.id,q]));
const kind=q=>q.selection_groups?'groups':q.statement_judgments?'ox':q.choices.length>0?'choice':'written';
const selfWritten=q=>kind(q)==='written'&&!autoIds.has(q.id);
const aliases={
 'CC-010':['IR','경피적외선조사요법','적외선조사요법','경피적외선요법','적외선요법'],
 'CC-012':['UV','경피자외선조사요법','자외선조사요법','경피자외선요법','자외선요법'],
 'CC-013':['TENS','경피전기자극요법','경피전기신경자극요법','경피신경전기자극요법','경피전기자극'],
 'CC-018':['SSPT','SSP','Silver Spike Point Therapy','Silver Spike Point','SSP요법','SSPT요법']
};
const choiceAnswers={'CC-014':0,'CC-021':4};
const groupLabels={current:'전류',frequency:'빈도',intensity:'강도',tissue:'조직'};
const normalize=v=>String(v).normalize('NFKC').toLowerCase().replace(/[\s()（）·.,;:／/\-_]/g,'');
const shuffle=input=>{const a=[...input];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
let host=null;try{if(parent!==window&&parent.__QUIZ_USER_ID&&parent.__QUIZ_STORAGE)host=parent;}catch{}
let storage;try{storage=host?host.__QUIZ_STORAGE:localStorage;}catch{storage={getItem(){return null;},setItem(){throw new Error('STORAGE_UNAVAILABLE');}};}
const key=host?'midterm-2-2-2026:quiz:v1:'+host.__QUIZ_USER_ID+':choichim-v1':'choichim-local-v1';
const initialItem=()=>({selected:null,draft:'',groups:{},revealed:false,outcome:null,options:[]});
function pool(scope='all',mode='all'){
 return QUESTIONS.filter(q=>(scope==='all'||category(q)===scope)&&(mode==='all'||(mode==='auto'?autoIds.has(q.id):!autoIds.has(q.id))))
 .sort((a,b)=>sectionOrder.indexOf(category(a))-sectionOrder.indexOf(category(b))||number(a)-number(b)).map(q=>q.id);
}
function fresh(scope='all',mode='all',order='ordered'){
 const ids=pool(scope,mode);return {v:1,scope,mode,order,queue:order==='random'?shuffle(ids):ids,done:[],review:[],round:0,attempts:0,correct:0,records:{},item:initialItem()};
}
function valid(s){
 if(!s||s.v!==1||!['all',...sectionOrder].includes(s.scope)||!['all','auto','reference'].includes(s.mode)||!['ordered','random'].includes(s.order))return false;
 const ids=pool(s.scope,s.mode);
 if(!['queue','done','review'].every(k=>Array.isArray(s[k])&&new Set(s[k]).size===s[k].length&&s[k].every(id=>ids.includes(id))))return false;
 if(s.queue.some(id=>s.done.includes(id)))return false;
 if(!s.item||typeof s.item.draft!=='string'||!s.item.groups||typeof s.item.groups!=='object'||!Array.isArray(s.item.options))return false;
 if(!s.records||typeof s.records!=='object'||Array.isArray(s.records))return false;
 return ['attempts','correct','round'].every(k=>Number.isInteger(s[k])&&s[k]>=0)&&s.correct<=s.attempts;
}
let state;try{state=JSON.parse(storage.getItem(key));}catch{}
if(!valid(state))state=fresh();
let view='quiz',showAnswers=false,practiceBackup=null,practiceBack=null;
const current=()=>byId.get(state.queue[0]);
function save(){
 if(practiceBackup){$('storage-note').textContent='단일 문항 연습 중 · 기존 세트는 보관되어 있습니다.';return;}
 try{storage.setItem(key,JSON.stringify(state));$('storage-note').textContent=host?'학습 진행과 입력 내용은 로그인한 계정에 저장됩니다.':'학습 진행은 이 브라우저에 저장됩니다.';}catch{$('storage-note').textContent='저장하지 못했습니다. 현재 화면에서 학습은 계속할 수 있습니다.';}
}
function send(type,values={}){if(parent!==window)parent.postMessage({type:'choichim-'+type,...values},location.origin);}
function resize(){send('size',{height:Math.ceil(document.body.getBoundingClientRect().height)});}
function focusQuestion(){requestAnimationFrame(()=>{if(parent!==window)send('focus-question',{top:$('study').offsetTop});else $('study').scrollIntoView({block:'start',behavior:'smooth'});$('question').focus({preventScroll:true});});}
function focusGrade(){requestAnimationFrame(()=>{if(parent!==window)send('focus-grade',{top:$('feedback').offsetTop,explanationTop:$('answer-detail').offsetTop});else $('feedback').scrollIntoView({block:'start',behavior:'smooth'});(state.item.outcome?$('next'):$('remember')).focus({preventScroll:true});});}
function provenance(q){return q.source_labels.map(s=>q.id==='CC-001'&&s.startsWith('22')?s+' (동일 문항 여부 미확인)':s).join(' · ')+' · '+q.id+' · PDF '+q.page+'쪽';}
function integrity(q){
 if(q.id==='CC-001')return '일부 항목은 간접 근거에 따른 추정입니다. 전체 답안은 자동채점하지 않습니다.';
 if(q.id==='CC-002')return '원래 빈칸 위치가 미확인입니다. 표 전체를 직접 적어 보고 완성된 표와 비교해 주세요.';
 if(q.id==='CC-020')return '질문과 복기 답이 모순됩니다. 원문을 유지하며 정답·오답 채점을 보류합니다.';
 if(['CC-008','CC-015'].includes(q.id))return '질문 주제만 복기되어 있습니다. 원래 선지와 정답이 없어 자료 확인용으로 수록했습니다.';
 if(q.id==='CC-024')return '옳은 것/옳지 않은 것 등 물음의 방향이 미복기되어 있습니다. 정답을 확정할 수 없습니다.';
 if(q.recorded_answer.status.includes('보류'))return '수업자료의 직접 근거가 확인되지 않은 별도 보류 문항입니다. 복기 답안만 참고하세요.';
 if(q.recorded_answer.status==='추정')return '단일 정답을 확정할 수 없는 문항입니다. 선택한 답을 복기 답안과 비교해 주세요.';
 if(['CC-004','CC-005'].includes(q.id))return '복기 선지의 OX를 연습합니다. 정오 판단의 직접 근거가 부족하여 참고 답안과만 비교합니다.';
 if(q.id==='CC-006')return '일부 선지가 미복기되어 있습니다. 전체 객관식 정답으로 자동채점하지 않습니다.';
 if(q.id==='CC-011')return '일부 선지만 복기되었고 자료의 수치 범위가 겹쳐 정오 판단을 보류합니다.';
 return '';
}
function setSelected(value){if(state.item.revealed)return;state.item.selected=value;save();renderQuestion();}
function optionButton(q,index){
 const choice=q.choices[index],missing=choice.text.trim()==='?';
 const b=make('button',undefined,'option'+(missing?' missing':''));b.type='button';
 b.append(make('span',choice.label||'·','num'),make('span',choice.text+(missing?' (미복기)':'')));
 b.setAttribute('aria-pressed',String(state.item.selected===index));b.disabled=state.item.revealed||missing;
 if(state.item.revealed&&autoIds.has(q.id)&&state.item.outcome!=='revealed'){
  if(index===choiceAnswers[q.id])b.classList.add('good');
  else if(state.item.selected===index)b.classList.add('bad');
 }
 b.onclick=()=>setSelected(index);return b;
}
function renderQuestion(){
 const q=current();if(!q)return;
 $('category').textContent=categories[category(q)];$('provenance').textContent=provenance(q);
 $('question').textContent=q.prompt;
 $('type').textContent=autoIds.has(q.id)?(kind(q)==='ox'?'선지 OX · 복기 답 기준':kind(q)==='written'?'단답형 연습':'객관식 · 복기 답 기준'):'답안 비교 · 자동채점 제외';
 const warning=integrity(q);$('integrity').hidden=!warning;$('integrity').textContent=warning;
 const area=$('answer-area');area.replaceChildren();
 const k=kind(q),item=state.item;
 if(k==='groups'){
  for(const g of q.selection_groups){
   const wrapper=make('div',undefined,'group'),fieldset=make('fieldset'),legend=make('legend',groupLabels[g.id]),buttons=make('div',undefined,'group-options');
   for(const value of g.options){const b=make('button',value);b.type='button';b.setAttribute('aria-pressed',String(item.groups[g.id]===value));b.disabled=item.revealed;b.onclick=()=>{item.groups[g.id]=value;save();renderQuestion();};buttons.append(b);}
   fieldset.append(legend,buttons);wrapper.append(fieldset);area.append(wrapper);
  }
 }else if(k==='ox'){
  area.append(make('p','복기된 아래 선지 자체가 옳은지 O/X로 판단해 주세요. 나머지 선지는 미복기입니다.','hint'));
  area.append(make('p',q.statement_judgments[0].text,'statement'));
  const row=make('div',undefined,'ox');
  for(const value of ['O','X']){const b=make('button',value,'option');b.type='button';b.setAttribute('aria-pressed',String(item.selected===value));b.disabled=item.revealed;if(item.revealed&&autoIds.has(q.id)&&item.outcome!=='revealed'){if(value===q.statement_judgments[0].recorded_judgment)b.classList.add('good');else if(item.selected===value)b.classList.add('bad');}b.onclick=()=>setSelected(value);row.append(b);}area.append(row);
 }else if(k==='choice'){
  area.append(make('p','선지 번호와 배열은 첨부 정리본 기준입니다. 원래 시험지의 번호와 다를 수 있습니다.','hint'));
  if(!item.options.length)item.options=state.order==='random'?shuffle(q.choices.map((_,i)=>i)):q.choices.map((_,i)=>i);
  item.options.forEach(i=>{if(q.choices[i])area.append(optionButton(q,i));});
 }else{
  const input=make(autoIds.has(q.id)?'input':'textarea');input.id='draft';
  if(input.tagName==='INPUT'){input.type='text';input.autocomplete='off';input.spellcheck=false;input.placeholder='치료법 이름 또는 약어';}
  else input.placeholder=q.answer_table?'Peptide / Site / Opioid receptor / Frequency(Hz)를 적어 보세요.':q.rubric?'R → I → P → C → O → R → D 순서로 적어 보세요.':'생각한 답이나 메모를 적어 보세요. (선택)';
  input.setAttribute('aria-label',autoIds.has(q.id)?'내 답안':'내 답안 또는 메모');input.value=item.draft;input.readOnly=item.revealed;
  input.oninput=()=>{item.draft=input.value;save();updateGradeButton(q);};
  area.append(input);
 }
 $('question-actions').hidden=item.revealed;$('grade').hidden=!autoIds.has(q.id)&&!selfWritten(q);$('reveal').hidden=selfWritten(q);$('reveal').textContent=autoIds.has(q.id)?'답안 보기':'참고 답안·해설 보기';
 updateGradeButton(q);renderFeedback(q);resize();
}
function updateGradeButton(q){$('grade').disabled=kind(q)==='written'?!state.item.draft.trim():state.item.selected===null;}
function answerText(q){
 if(q.id==='CC-002')return '완성된 표 (원래 빈칸 위치는 미확인)';
 if(q.id==='CC-001')return q.answer_parts.map(p=>(groupLabels[p.group])+': '+p.value+(p.group==='tissue'?' — 추정 / 간접 근거':'')).join('\n');
 if(q.id==='CC-008'||q.id==='CC-015'||q.id==='CC-011')return '정답 미확인 · 아래 정리본 해설을 참고하세요.';
 const v=q.recorded_answer.value;return Array.isArray(v)?v.join(' / '):v||'정답 미확인';
}
function appendAnswer(target,q,withRaw=true){
 const recorded=make('p',q.recorded_answer.status,'answer-label');
 const answer=make('p',answerText(q),'answer');target.append(recorded,answer);
 if(q.answer_table){
  const wrap=make('div',undefined,'table-scroll'),table=make('table'),caption=make('caption','첨부본의 완성된 아편양물질 표');caption.className='muted';table.append(caption);
  const thead=make('thead'),head=make('tr');q.table_headers.forEach(x=>{const th=make('th',x);th.scope='col';head.append(th);});thead.append(head);table.append(thead);
  const tbody=make('tbody');q.answer_table.forEach(row=>{const tr=make('tr');row.forEach(x=>tr.append(make('td',x)));tbody.append(tr);});table.append(tbody);wrap.append(table);target.append(wrap);
 }
 if(q.rubric){const list=make('ol',undefined,'rubric');q.rubric.forEach(r=>{const li=make('li');li.append(make('b',r.letter+' · '+r.term),document.createTextNode(r.text));list.append(li);});target.append(list);}
 const explanation=q.explanation_excerpts||[];
 explanation.forEach((text,i)=>{
  if(q.id==='CC-020'&&i===0)return;
  if(q.id==='CC-005')text='정리본에서 수업자료의 직접 근거를 확인하지 못했다고 기록되어 있습니다.';
  if(q.id==='CC-018')text=text.replace('needless acupuncture','needleless acupuncture');
  target.append(make('p',text,'explanation'));
 });
 if(q.id==='CC-001')target.append(make('p','근육(deep)은 가장 타당한 선택으로 추정합니다. 전침이 반드시 근육에 자입된다는 뜻은 아니며, 만성 요통과 근육 선택을 직접 연결한 문장은 확인되지 않았습니다. 0.15ms·1.0ms 펄스폭 설명은 이 선택의 직접 근거가 아닙니다.','alert'));
 if(q.id==='CC-007')target.append(make('p','급성 염증기 관련 주의사항의 출처: 최침 중간 써머리 PDF 4쪽. 수업자료 PDF 7쪽에 이 문장이 직접 있는 것은 아닙니다. (앞선 검토 기록)','source'));
 if(q.notes.length){const ul=make('ul',undefined,'note-list');q.notes.forEach(n=>ul.append(make('li',n)));target.append(ul);}
 target.append(make('p',DATA.source_name+' · PDF '+q.page+'쪽 / 첨부 정리본의 답안·해설 기록. 수업자료·써머리 원본을 이번 제작에서 재검증하지 않았습니다.','source'));
 if(withRaw){const d=make('details',undefined,'details');d.append(make('summary','추출 원문 확인'),make('pre',q.source_block_raw,'raw'));target.append(d);}
}
function renderFeedback(q){
 const i=state.item;$('feedback').hidden=!i.revealed;if(!i.revealed)return;
 const v=$('verdict');v.replaceChildren();
 const outcomes={correct:['O','복기 답과 일치합니다','good'],wrong:['X','복기 답과 다릅니다','bad'],revealed:['↗','답안을 확인했습니다','reference'],remembered:['✓','자가 확인 · 기억했어요','reference'],review:['↻','다시 볼 문항에 담았습니다','reference']};
 if(i.outcome){const [mark,text,cls]=outcomes[i.outcome];v.className='verdict '+cls;v.append(make('span',mark,'mark'),document.createTextNode(text));}
 else{v.className='verdict reference';v.textContent=q.recorded_answer.value===null?'학습 자료 확인':'참고 답안과 비교해 주세요';}
 $('answer-detail').replaceChildren();
 if(i.draft.trim())$('answer-detail').append(make('p','내 답안: '+i.draft,'hint'));
 if(kind(q)==='choice'&&Number.isInteger(i.selected))$('answer-detail').append(make('p','내 선택: '+q.choices[i.selected].label+' '+q.choices[i.selected].text,'hint'));
 appendAnswer($('answer-detail'),q);
 $('self-actions').hidden=autoIds.has(q.id)||!!i.outcome;$('next-actions').hidden=!i.outcome;
 $('remember').textContent=q.recorded_answer.value===null?'자료 확인했어요':selfWritten(q)?'맞췄어요':'기억했어요';
 $('review-again').textContent=selfWritten(q)&&q.recorded_answer.value!==null?'틀렸어요':'다시 볼래요';
 $('next').textContent=state.queue.length===1?'세트 결과 보기 →':'다음 문제 →';
}
function render(){
 if(practiceBack)practiceBack.hidden=!practiceBackup;
 $('scope').value=state.scope;$('mode').value=state.mode;$('order').value=state.order;
 $('quiz-view').hidden=view!=='quiz';$('list-view').hidden=view!=='list';$('quiz-tab').setAttribute('aria-pressed',String(view==='quiz'));$('list-tab').setAttribute('aria-pressed',String(view==='list'));
 if(view==='list'){renderList();resize();return;}
 const q=current(),total=state.queue.length+state.done.length;
 $('study').hidden=!q;$('finished').hidden=!!q;
 $('phase').textContent=state.round?'오답·다시 보기 '+state.round+'회차':'1차 학습';
 $('position').textContent=q?(state.done.length+1)+' / '+total+'문항':'완료 '+state.done.length+' / '+total+'문항';
 const selfCount=Object.values(state.records).filter(r=>r.kind==='self').length;
 $('score').textContent='자동채점 '+state.correct+' / '+state.attempts+'회 정답 · 자가 확인 '+selfCount+'문항 · 다시 보기 '+state.review.length+'문항';
 const progress=total?Math.round(state.done.length/total*100):0;$('bar').style.width=progress+'%';$('progress').setAttribute('aria-valuenow',String(progress));
 if(q)renderQuestion();else{
  $('finished-title').textContent=total?'한 세트 완료!':'이 범위에 해당하는 문항이 없습니다';
  $('finished-summary').textContent=total?state.done.length+'문항 학습 완료 · 자동채점 '+state.correct+'/'+state.attempts+'회 정답 · 오답·다시 보기 '+state.review.length+'문항':'범위 또는 출제 방식을 바꿔 주세요.';
  $('retry').hidden=!state.review.length;resize();
 }
 save();
}
function track(q,correct,revealed){host?.__QUIZ_TRACK_ATTEMPT?.({key:'choichim-'+q.id,label:q.prompt,group:'최침 · '+categories[category(q)],correct,revealed});}
function record(q,result,isAuto){
 state.item.outcome=result;
 const revisit=['wrong','review','revealed'].includes(result);
 state.review=state.review.filter(id=>id!==q.id);if(revisit)state.review.push(q.id);
 state.records[q.id]={kind:isAuto?'auto':'self',outcome:result};
}
function grade(){
 const q=current();if(!q||state.item.revealed||$('grade').disabled)return;
 if(selfWritten(q)){reveal();return;}
 if(!autoIds.has(q.id))return;
 const k=kind(q),item=state.item;
 const correct=k==='written'?[...aliases[q.id],q.recorded_answer.value].some(a=>normalize(a)===normalize(item.draft)):k==='ox'?item.selected===q.statement_judgments[0].recorded_judgment:item.selected===choiceAnswers[q.id];
 item.revealed=true;state.attempts++;if(correct)state.correct++;
 record(q,correct?'correct':'wrong',true);track(q,correct,false);save();render();focusGrade();
}
function reveal(){
 const q=current();if(!q||state.item.revealed)return;
 state.item.revealed=true;
 if(autoIds.has(q.id)){record(q,'revealed',true);track(q,false,true);}
 save();render();focusGrade();
}
function selfCheck(remembered){
 const q=current();if(!q||autoIds.has(q.id)||!state.item.revealed||state.item.outcome)return;
 record(q,remembered?'remembered':'review',false);
 if(selfWritten(q)){next();return;}
 save();render();$('next').focus({preventScroll:true});
}
function next(){if(!state.item.outcome||!current())return;const id=state.queue.shift();state.done.push(id);state.item=initialItem();save();render();if(current())focusQuestion();}
function restart(scope=state.scope,mode=state.mode,order=state.order){state=fresh(scope,mode,order);save();render();if(current()&&view==='quiz')focusQuestion();}
function retry(){if(!state.review.length)return;state.queue=state.order==='random'?shuffle(state.review):pool(state.scope,state.mode).filter(id=>state.review.includes(id));state.done=[];state.round++;state.item=initialItem();save();render();focusQuestion();}
function switchView(v){view=v;render();}
function renderList(){
 const term=normalize($('search').value);
 const qs=pool(state.scope,state.mode).map(id=>byId.get(id)).filter(q=>!term||normalize([q.prompt,q.section,...q.source_labels,...q.choices.map(c=>c.text)].join(' ')).includes(term));
 $('list-count').textContent='문항 목록 · '+qs.length+' / '+pool(state.scope,state.mode).length;
 $('toggle-answers').textContent=showAnswers?'답안 모두 접기':'답안 모두 펼치기';$('list-items').replaceChildren();
 if(!qs.length)$('list-items').append(make('p','일치하는 문항이 없습니다.','empty'));
 for(const q of qs){
  const article=make('article',undefined,'card list-item'),head=make('div',undefined,'row');head.append(make('span',categories[category(q)],'pill'),make('span',autoIds.has(q.id)?'복기 답 기준 채점':'답안 비교','type'));article.append(head,make('p',provenance(q),'meta'),make('h3',q.prompt,'question'));
  if(q.selection_groups)q.selection_groups.forEach(g=>article.append(make('p',groupLabels[g.id]+' · '+g.options.join(' / '),'hint')));
  else if(q.statement_judgments)article.append(make('p',q.statement_judgments[0].text,'statement'));
  else if(q.choices.length){const list=make('ul');q.choices.forEach(c=>list.append(make('li',(c.label||'')+' '+c.text)));article.append(list);}
  const warning=integrity(q);if(warning)article.append(make('p',warning,'alert'));
  const details=make('details',undefined,'details');details.open=showAnswers;details.append(make('summary','답안·해설·출처 확인'));const body=make('div');appendAnswer(body,q);details.append(body);details.addEventListener('toggle',resize);article.append(details);
  const jump=make('button','이 문제 풀기 →','jump');jump.onclick=()=>openQuestion(q.id);article.append(jump);$('list-items').append(article);
 }
}
function openQuestion(id){
 if(!byId.has(id))return;
 // 단일 문항 연습은 진행 중 세트의 큐를 재작성하지 않습니다.
 if(!practiceBackup)practiceBackup=JSON.parse(JSON.stringify(state));
 const q=byId.get(id);state=fresh(category(q),'all','ordered');state.queue=[id];view='quiz';render();focusQuestion();
}
function onKey(e){
 if(e.repeat||e.isComposing||view!=='quiz'||!current()||e.target?.closest?.('textarea,select,input:not(#draft),#quiz-tab,#list-tab,#reset,#again,#retry,#remember,#review-again'))return;
 if(e.key==='Enter'){
  if(e.target?.tagName==='BUTTON')return;
  e.preventDefault();if(state.item.outcome)next();else if(state.item.revealed)return;else if(autoIds.has(current().id))grade();else reveal();return;
 }
 if(e.target?.tagName==='INPUT'||state.item.revealed)return;
 const q=current();if(kind(q)==='ox'&&['o','O','x','X'].includes(e.key)){e.preventDefault();setSelected(e.key.toUpperCase());}
 if(kind(q)==='choice'&&/^[1-5]$/.test(e.key)){const index=Number(e.key)-1;if(q.choices[index]&&q.choices[index].text.trim()!=='?'){e.preventDefault();setSelected(index);}}
}
// 목록에서 시작한 1문항 연습은 계정의 진행 중 세트와 별개입니다.
practiceBack=make('button','진행 중 세트로 돌아가기','jump');practiceBack.id='practice-back';practiceBack.hidden=true;$('storage-note').before(practiceBack);
practiceBack.onclick=()=>{if(!practiceBackup)return;state=practiceBackup;practiceBackup=null;view='quiz';render();};
document.addEventListener('keydown',onKey);
$('grade').onclick=grade;$('reveal').onclick=reveal;$('next').onclick=next;$('remember').onclick=()=>selfCheck(true);$('review-again').onclick=()=>selfCheck(false);
$('reset').onclick=()=>restart();$('again').onclick=()=>restart();$('retry').onclick=retry;
$('scope').onchange=e=>restart(e.target.value);$('mode').onchange=e=>restart(state.scope,e.target.value);$('order').onchange=e=>restart(state.scope,state.mode,e.target.value);
$('quiz-tab').onclick=()=>switchView('quiz');$('list-tab').onclick=()=>switchView('list');$('search').oninput=()=>{renderList();resize();};$('toggle-answers').onclick=()=>{showAnswers=!showAnswers;renderList();resize();};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;if(e.data?.type==='choichim-key')onKey({key:e.data.key,preventDefault(){}});if(e.data?.type==='choichim-open-question')openQuestion(e.data.id);});
new ResizeObserver(resize).observe(document.body);
render();
})();
