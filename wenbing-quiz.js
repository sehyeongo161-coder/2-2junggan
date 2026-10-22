/* 온병학: 원복기·족보 변형·개념확인. 과목별 저장 및 오답 회차를 공유합니다. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const labels=['①','②','③','④','⑤','⑥','⑦'];
const TYPES={short:'단답형',fill:'빈칸',mc:'객관식',manual:'자료 확인'};
const SCOPES={past:'족보 문제',variant:'족보 변형',concept:'개념확인',all:'전체 문제',reference:'미완성 복기 확인'};
let bank=[],byId=new Map(),categories={},s=null,uid=null,loaded=false,pending=null;
let scope='past',topic='all',viewMode='quiz',listAnswersShown=true,lastHeight=0;
function host(){try{const p=parent;return p!==window&&p.location.origin===location.origin&&typeof p.__QUIZ_USER_ID==='string'&&p.__QUIZ_STORAGE&&typeof p.__QUIZ_TRACK_ATTEMPT==='function'?p:null;}catch{return null;}}
function prefix(){return 'midterm-2-2-2026:quiz:v1:'+uid+':wenbing-v1';}
function key(){return prefix()+':scope:'+scope+':topic:'+topic+(['concept','all'].includes(scope)?':past-core-v2':'');}
function save(){host()?.__QUIZ_STORAGE.setItem(key(),JSON.stringify(s));}
function saveScope(){host()?.__QUIZ_STORAGE.setItem(prefix()+':selection',JSON.stringify({scope,topic}));}
function inScope(q,which){return which==='all'||which==='reference'&&q.referenceOnly||q.kind===which;}
function broadBank(){return bank.filter(q=>inScope(q,scope));}
function scopedBank(){return broadBank().filter(q=>topic==='all'||q.category===topic);}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function blankState(){return {order:shuffle(scopedBank().map(q=>q.id)),cursor:0,draft:[],selected:[],checked:false,preview:false,decision:null,results:{},phase:'first',retryRound:0};}
function loadedState(){
 let old;try{old=JSON.parse(host().__QUIZ_STORAGE.getItem(key())||'null');}catch{}
 const ids=scopedBank().map(q=>q.id),valid=new Set(ids);
 if(!old||!Array.isArray(old.order)||!old.order.length||new Set(old.order).size!==old.order.length||old.order.some(id=>!valid.has(id)))return blankState();
 if(old.phase!=='retry'&&old.phase!=='done'&&old.order.length!==ids.length)return blankState();
 old.cursor=Math.max(0,Math.min(old.order.length,Number(old.cursor)||0));
 old.draft=Array.isArray(old.draft)?old.draft.map(String):[];
 old.selected=Array.isArray(old.selected)?old.selected.map(String):[];
 old.checked=!!old.checked;old.preview=!!old.preview;
 old.results=old.results&&typeof old.results==='object'?Object.fromEntries(Object.entries(old.results).filter(([id])=>valid.has(id))):{};
 old.phase=['retry','done'].includes(old.phase)?old.phase:'first';old.retryRound=Math.max(0,Number(old.retryRound)||0);
 return old;
}
function current(){return byId.get(s.order[s.cursor]);}
function clearAnswer(){Object.assign(s,{draft:[],selected:[],checked:false,preview:false,decision:null});}
function wrongIds(){return scopedBank().filter(q=>s.results[q.id]&&!s.results[q.id].correct&&!s.results[q.id].reviewed).map(q=>q.id);}
function prepareNextRound(){
 if(s.cursor<s.order.length)return;
 const wrong=wrongIds();
 if(!wrong.length){s.phase='done';save();return;}
 s.phase='retry';s.retryRound++;s.order=shuffle(wrong);s.cursor=0;clearAnswer();save();
}
function send(type,payload={}){try{parent.postMessage({type:'wenbing-'+type,...payload},location.origin);}catch{}}
function resize(){const height=Math.max(350,Math.ceil(document.body.getBoundingClientRect().height));if(height!==lastHeight){lastHeight=height;send('size',{height});}}
function focusQuestion(){send('focus-question',{top:Math.max(0,Math.round($('stage').getBoundingClientRect().top+scrollY))});}
function focusGrade(){requestAnimationFrame(()=>requestAnimationFrame(()=>{resize();const node=$('grade-result')||$('manual-answer');if(!node)return;const body=node.querySelector('.grade-body')||node;send('focus-grade',{top:Math.round(node.getBoundingClientRect().top+scrollY),explanationTop:Math.round(body.getBoundingClientRect().top+scrollY)});}));}
function advance(){s.cursor++;clearAnswer();if(s.cursor>=s.order.length)prepareNextRound();else save();render();requestAnimationFrame(()=>requestAnimationFrame(focusQuestion));}
function showAnswer(){s.preview=true;save();render();focusGrade();}
function submit(correct,revealed=false){
 const q=current();if(!q||s.checked||q.referenceOnly)return;
 s.checked=true;s.preview=true;s.decision={correct:!!correct,revealed:!!revealed};
 s.results[q.id]={correct:!!correct,revealed:!!revealed};
 if(q.countStats!==false)host()?.__QUIZ_TRACK_ATTEMPT({key:'wenbing-'+q.id,label:q.years+' · '+q.prompt.slice(0,110),group:'온병학 · '+SCOPES[q.kind],correct:!!correct,revealed:!!revealed});
 save();
 if(q.type==='manual'&&!revealed){send('flash-verdict',{correct:!!correct});advance();return;}
 render();focusGrade();
}
function reviewed(){const q=current();if(!q?.referenceOnly)return;s.results[q.id]={reviewed:true,correct:false,revealed:false};save();advance();}
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[～〜–—]/g,'~').replace(/[\s\u200b\ufeff,.，、。·_/()（）「」『』《》]/g,'');}
function accept(value,expected,aliases=[]){const n=normalize(value);return n.length>0&&[expected,...aliases].some(v=>normalize(v)===n);}
function matchesUnordered(q,start,end){
 const match=(index,used)=>index===end||q.answer.slice(start,end).some((_,offset)=>{
  const j=start+offset;if(used.has(j)||!accept(s.draft[index],q.answer[j],q.aliases?.[j]||[]))return false;
  const next=new Set(used);next.add(j);return match(index+1,next);
 });return match(start,new Set());
}
function evaluate(q){
 if(q.type==='mc'){const expected=(Array.isArray(q.answer)?q.answer:[q.answer]).map(String).sort();return JSON.stringify([...new Set(s.selected)].sort())===JSON.stringify(expected);}
 if(q.type==='short')return accept(s.draft[0],q.answer,q.accept||[]);
 if(q.type==='fill'){
  if(q.unordered)return matchesUnordered(q,0,q.answer.length);
  const covered=new Set();
  for(const group of q.groups||[]){if(!matchesUnordered(q,group.start,group.end))return false;for(let i=group.start;i<group.end;i++)covered.add(i);}
  return q.answer.every((answer,i)=>covered.has(i)||accept(s.draft[i],answer,q.aliases?.[i]||[]));
 }return false;
}
function renderScope(){
 for(const b of document.querySelectorAll('[data-scope]')){
  b.setAttribute('aria-pressed',String(b.dataset.scope===scope));
  const n=bank.filter(q=>inScope(q,b.dataset.scope)).length;
  b.querySelector('small').textContent=n;
 }
 const allowed=new Set(broadBank().map(q=>q.category));
 $('category-filter').innerHTML='<option value="all">선택 범위의 모든 범주</option>'+Object.entries(categories).filter(([id])=>allowed.has(id)).map(([id,title])=>'<option value="'+id+'">'+esc(title)+'</option>').join('');
 if(topic!=='all'&&!allowed.has(topic))topic='all';
 $('category-filter').value=topic;
 const name=topic==='all'?SCOPES[scope]:categories[topic];
 $('section-name').textContent=name+' · '+scopedBank().length+'항목';
 $('quiz-scope-help').textContent=name+' · 중복 없이 무작위 출제';
 $('list-heading').textContent=name+' 목록';
}
function setScope(next,nextTopic='all'){
 if(!Object.hasOwn(SCOPES,next))return;
 scope=next;topic=nextTopic;renderScope();saveScope();s=loadedState();
 if(viewMode==='list')renderList();else render();resize();
}
function updateHeader(){
 const v=Object.values(s.results),right=v.filter(x=>x.correct).length,wrong=v.filter(x=>!x.correct&&!x.reviewed).length,review=v.filter(x=>x.reviewed).length;
 $('summary').innerHTML='<span>전체 <b>'+scopedBank().length+'</b></span><span>풀이·확인 <b>'+v.length+'</b></span><span>최종 정답 <b>'+right+'</b></span><span>남은 오답 <b>'+wrong+'</b></span>'+(review?'<span>자료 확인 <b>'+review+'</b></span>':'');
}
function questionFigure(q){return q.figureSvg?'<figure class="figure-block"><div class="figure-tools"><span>문제 그림</span><button type="button" class="figure-zoom" aria-expanded="false">그림 확대</button></div><div class="figure-viewport" tabindex="0">'+q.figureSvg+'</div><figcaption>'+esc(q.figureCaption)+'</figcaption></figure>':'';}
function answerImage(q){return q.answerImage?'<figure class="figure-block"><img src="'+esc(q.answerImage)+'" alt="'+esc(q.answerImageCaption)+'"><figcaption>'+esc(q.answerImageCaption)+'</figcaption></figure>':'';}
function answerBody(q){
 const papers=(q.basedOnIds||[q.basedOn]).map(id=>byId.get(id)).filter(Boolean);
 const evidence=papers.length?'<p class="paper-note">'+(q.kind==='concept'?'족보 근거: ':'변형 근거: ')+papers.map(p=>esc(p.years)+(q.kind==='concept'?'':' · '+esc(p.prompt))).join(' / ')+'</p>':'';
 return '<div class="grade-body"><p class="answer-key"><b>정답:</b> '+esc(q.displayAnswer)+'</p><p><b>해설:</b> '+esc(q.explanation)+'</p>'+answerImage(q)+(q.note?'<p class="paper-note">'+esc(q.note)+'</p>':'')+evidence+'<p class="paper-note">출처: '+esc(q.source)+'</p></div>';
}
function feedback(q){
 const yes=s.decision?.correct&&!s.decision?.revealed;
 const status=s.decision?.revealed?'정답 확인 · 다음에 재출제':yes?'정답입니다!':'오답입니다 · 다음에 재출제';
 return '<div id="grade-result" class="feedback grade-feedback '+(yes?'correct':'incorrect')+'" role="status" aria-live="polite"><div class="grade-head"><span class="grade-mark" aria-hidden="true">'+(yes?'O':'X')+'</span><div><h3 class="grade-title">'+status+'</h3>'+(q.countStats===false?'<p>추정·자료 차이 문항 · 누적 통계 제외</p>':'')+'</div></div>'+answerBody(q)+'</div>';
}
function optionMarkup(q){
 const answers=new Set((Array.isArray(q.answer)?q.answer:[q.answer]).map(String));
 return (q.multiple?'<p class="help">해당하는 선지를 모두 선택하세요.</p>':'')+'<div class="options">'+q.choices.map((text,i)=>{
  const token=String(i+1),chosen=s.selected.includes(token),cls=chosen?' selected':'';
  return '<button type="button" class="opt'+cls+(s.checked?(answers.has(token)?' right':chosen?' wrong':''):'')+'" data-opt="'+token+'" aria-pressed="'+chosen+'" '+(s.checked?'disabled':'')+'><span class="num">'+esc(q.choiceLabels?.[i]||labels[i])+'</span><span>'+esc(text)+'</span></button>';
 }).join('')+'</div>';
}
function entryMarkup(q){
 if(q.referenceOnly)return '';
 const count=q.type==='fill'?q.answer.length:1;
 return '<div class="answer-fields">'+Array.from({length:count},(_,i)=>'<div class="input-row"><label for="ans-'+i+'">'+esc(q.fieldLabels?.[i]||(q.type==='fill'?'빈칸 '+(i+1):'답안 입력'))+'</label>'+(q.type==='manual'?'<textarea id="ans-'+i+'" data-field="'+i+'" placeholder="기억나는 답안을 적어 보세요">'+esc(s.draft[i]||'')+'</textarea>':'<input id="ans-'+i+'" data-field="'+i+'" autocomplete="off" spellcheck="false" '+(s.checked?'disabled':'')+' value="'+esc(s.draft[i]||'')+'" placeholder="정답 입력">')+'</div>').join('')+'</div>';
}
function render(){
 if(!s)return;if(s.cursor>=s.order.length)prepareNextRound();updateHeader();
 if(s.cursor>=s.order.length){$('stage').innerHTML='<div class="finish"><p class="pill">한 세트 완료</p><h2>선택한 범위의 풀이와 자료 확인을 마쳤습니다.</h2><p>오답 재출제 '+s.retryRound+'회차 · 남은 오답 0항목</p><button id="again" class="primary">다시 풀기 ↻</button></div>';$('again').onclick=reset;resize();return;}
 const q=current(),manual=q.type==='manual',reference=q.referenceOnly;
 const phase=s.phase==='retry'?'오답 재도전 · '+s.retryRound+'회차':'1차 출제';
 let actions='';
 if(reference)actions=s.preview?'<button id="reference-next" class="primary">내용 확인 · 다음 문제 →</button>':'<button id="manual-reveal" class="primary">답·관련 내용 확인</button>';
 else if(manual)actions=s.preview?'<div class="manual-buttons"><button id="manual-correct" class="primary">맞혔어요</button><button id="manual-wrong">틀렸어요</button></div>':'<button id="manual-reveal" class="primary">모범답안 확인</button>';
 else actions=s.checked?'<button id="next" class="primary">다음 문제 →</button>':'<button id="check" class="primary">채점하기</button><button id="show-answer">정답 보기</button>';
 const controls=q.type==='mc'?optionMarkup(q):entryMarkup(q);
 const notice=reference?'선지·문맥이 불완전하거나 판단에 조건이 필요한 복기입니다. 자료 확인으로 남기며 자동채점·오답 통계에서 제외합니다.':q.promptNote;
 const note=notice?' <div class="caution">'+esc(notice)+'</div>':'';
 $('stage').classList.toggle('grade-checked',!!s.checked);
 $('stage').innerHTML='<div class="track"><i style="width:'+100*s.cursor/s.order.length+'%"></i></div><div class="retry-stage"><strong>'+phase+'</strong><span>모든 항목을 한 번 본 뒤 오답만 다시 풀어요.</span></div><div class="meta"><b>문제 '+(s.cursor+1)+' / '+s.order.length+'</b><span class="pill">'+(reference?'자료 확인':TYPES[q.type])+'</span><span>'+esc(q.years)+'</span><span>'+esc(q.categoryName)+'</span></div><h2>'+esc(q.prompt)+'</h2>'+questionFigure(q)+note+controls+(s.checked?feedback(q):s.preview?'<div id="manual-answer" class="feedback" role="status"><h3>자료에 적힌 답안과 해설</h3>'+answerBody(q)+'</div>':'')+'<div class="actions">'+actions+'</div>';
 for(const b of $('stage').querySelectorAll('[data-opt]'))b.onclick=()=>{
  const id=b.dataset.opt;
  s.selected=q.multiple?(s.selected.includes(id)?s.selected.filter(x=>x!==id):[...s.selected,id]):[id];
  save();render();$('stage').querySelector('[data-opt="'+id+'"]')?.focus({preventScroll:true});
 };
 for(const field of $('stage').querySelectorAll('[data-field]')){
  field.oninput=()=>{s.draft[Number(field.dataset.field)]=field.value;save();};
  field.addEventListener('keydown',e=>{
   if(e.key!=='Enter'||e.isComposing||e.keyCode===229||e.repeat||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||s.checked)return;
   e.preventDefault();const i=Number(field.dataset.field);s.draft[i]=field.value;save();
   if(manual){if(!s.preview)showAnswer();return;}
   if(q.type==='fill'&&i<q.answer.length-1){$('ans-'+(i+1))?.focus();return;}
   submit(evaluate(q));
  });
 }
 if($('check'))$('check').onclick=()=>submit(evaluate(q));
 if($('show-answer'))$('show-answer').onclick=()=>submit(false,true);
 if($('manual-reveal'))$('manual-reveal').onclick=showAnswer;
 if($('manual-correct'))$('manual-correct').onclick=()=>submit(true);
 if($('manual-wrong'))$('manual-wrong').onclick=()=>submit(false);
 if($('reference-next'))$('reference-next').onclick=reviewed;
 if($('next'))$('next').onclick=advance;
 resize();
}
function renderList(){
 updateHeader();$('list-count').textContent=scopedBank().length+'항목';
 $('list-toggle-answers').textContent=listAnswersShown?'정답·해설 가리기':'정답·해설 보기';
 $('list-toggle-answers').setAttribute('aria-pressed',String(listAnswersShown));
 const area=$('list-items');area.replaceChildren();const frag=document.createDocumentFragment();
 scopedBank().forEach((q,i)=>{
  const result=s.results[q.id],status=result?(result.reviewed?'자료 확인':result.revealed?'정답 보기':result.correct?'정답':'오답'):'미응시';
  const cls=result?(result.reviewed||result.revealed?'revealed':result.correct?'correct':'wrong'):'';
  const item=document.createElement('article');item.className='paper-item'+(cls?' is-'+cls:'');
  const opts=q.type==='mc'?'<ol class="paper-choice-list">'+q.choices.map((text,j)=>'<li>'+esc(q.choiceLabels?.[j]||labels[j])+' '+esc(text)+'</li>').join('')+'</ol>':'';
  item.innerHTML='<div class="paper-top"><div class="paper-labels"><span class="paper-number">'+String(i+1).padStart(2,'0')+'</span><span>'+esc(q.years)+'</span><span>'+esc(q.categoryName)+'</span><span>'+(q.referenceOnly?'자료 확인':TYPES[q.type])+'</span></div><span class="paper-status '+cls+'">'+status+'</span></div><p class="paper-prompt">'+esc(q.prompt)+'</p>'+opts+questionFigure(q)+(listAnswersShown?'<div class="paper-answer">'+answerBody(q)+'</div>':'');frag.append(item);
 });area.append(frag);resize();
}
function selectView(mode){viewMode=mode==='list'?'list':'quiz';const quiz=viewMode==='quiz';$('quiz-view').hidden=!quiz;$('list-view').hidden=quiz;for(const [id,on]of [['view-quiz',quiz],['view-list',!quiz]]){$(id).setAttribute('aria-selected',String(on));$(id).tabIndex=on?0:-1;}if(quiz)render();else renderList();requestAnimationFrame(resize);}
function reset(){s=blankState();save();render();focusQuestion();}
function goTo(id){
 if(!byId.has(id)){
  if(/^C-\d{3}$/.test(id)){setScope('concept');selectView('quiz');$('quiz-scope-help').textContent='이전 개념확인 문항은 족보 핵심 62문항으로 개편되었습니다.';requestAnimationFrame(focusQuestion);}
  return;
 }const q=byId.get(id);
 if(!scopedBank().some(x=>x.id===id))setScope(q.kind,q.category);
 let at=s.order.indexOf(id);
 if(at<0||s.phase==='done'){s.phase='first';s.order=scopedBank().map(x=>x.id);s.cursor=0;at=s.order.indexOf(id);}
 const index=Math.min(s.cursor,s.order.length-1);const item=s.order.splice(at,1)[0];s.order.splice(index,0,item);s.cursor=index;clearAnswer();save();selectView('quiz');requestAnimationFrame(()=>requestAnimationFrame(focusQuestion));
}
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing||e.keyCode===229||e.repeat||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||viewMode!=='quiz'||!s)return;
 const t=e.target;if(t.closest?.('.figure-block')||!t.closest?.('#stage')&&t!==document.body)return;
 if(s.checked){e.preventDefault();e.stopPropagation();advance();return;}
 const q=current();if(!q)return;
 if(q.type==='mc'&&s.selected.length&&(t.closest?.('[data-opt]')||t===document.body)){
  e.preventDefault();e.stopPropagation();submit(evaluate(q));
 }
},true);
document.addEventListener('click',e=>{const b=e.target.closest('.figure-zoom');if(!b)return;const node=b.closest('.figure-block').querySelector('.figure-viewport');const zoom=node.classList.toggle('is-zoomed');b.setAttribute('aria-expanded',String(zoom));b.textContent=zoom?'화면에 맞추기':'그림 확대';if(!zoom){node.scrollLeft=0;node.scrollTop=0;}resize();});
for(const b of document.querySelectorAll('[data-scope]'))b.onclick=()=>setScope(b.dataset.scope);
$('category-filter').onchange=e=>setScope(scope,e.target.value);
$('view-quiz').onclick=()=>selectView('quiz');$('view-list').onclick=()=>selectView('list');
$('list-toggle-answers').onclick=()=>{listAnswersShown=!listAnswersShown;renderList();};$('reset').onclick=reset;
window.addEventListener('resize',()=>requestAnimationFrame(resize));
if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(document.body);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='wenbing-open-question'||typeof e.data.id!=='string')return;const id=e.data.id.replace(/^wenbing-/,'');if(!loaded)pending=id;else goTo(id);});
(async()=>{
 try{
  const p=host();if(!p)throw Error('로그인 후 온병학 탭에서 열어주세요.');uid=p.__QUIZ_USER_ID;
  const [r,c]=await Promise.all([fetch('./wenbing-bank.json?v=20261023-past-core-v2',{cache:'no-cache'}),fetch('./wenbing-categories.json?v=20261023-past-core-v2',{cache:'no-cache'})]);
  if(!r.ok||!c.ok)throw Error('온병학 문제 데이터를 불러올 수 없습니다.');
  bank=await r.json();categories=await c.json();
  if(!Array.isArray(bank)||bank.length!==214||new Set(bank.map(q=>q.id)).size!==bank.length||bank.some(q=>!Object.hasOwn(categories,q.category)||!['past','variant','concept'].includes(q.kind)||!q.prompt||!q.explanation||!q.source||!Object.hasOwn(TYPES,q.type)))throw Error('온병학 문제 데이터 형식이 올바르지 않습니다.');
  byId=new Map(bank.map(q=>[q.id,q]));
  if(bank.some(q=>q.kind==='concept'&&(!q.basedOnIds?.length||q.basedOnIds.some(id=>byId.get(id)?.kind!=='past'))))throw Error('개념확인 문항의 족보 근거를 확인할 수 없습니다.');
  let selection;try{selection=JSON.parse(p.__QUIZ_STORAGE.getItem(prefix()+':selection')||'null');}catch{}
  if(selection&&Object.hasOwn(SCOPES,selection.scope)){scope=selection.scope;topic=String(selection.topic||'all');}
  renderScope();s=loadedState();loaded=true;$('study').hidden=false;render();if(pending){goTo(pending);pending=null;}
 }catch(e){$('error').hidden=false;$('error').textContent=e.message;resize();}
})();
})();
