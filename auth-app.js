import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const gate = $('account-gate'), quizRoot = $('quiz-root'), toolbar = $('account-toolbar');
let auth, db, authenticatedUid=null, appLoaded=false, registering=false, statsOpen=false;
let currentStats=[];
let lastQuizScroll=0,lastStatsScroll=0;
const approvedDisplayNames = ['고세현','석주형','홍대진','안선웅','박준영','김지원'];

// 이름별 가입용 가상 이메일: 기존 관리자 생성 계정의 이메일과 겹치지 않도록 새 식별자를 사용합니다.
// 본인 확인 절차가 없으므로 가입 선점 위험이 있습니다. 서버 보안 규칙은 이 이메일 6개만 허용합니다.
function normalizeName(name){return String(name||'').normalize('NFC').trim().replace(/\s/g,'');}
function nameUid(name){const hex=[...new TextEncoder().encode(normalizeName(name))].map(b=>b.toString(16).padStart(2,'0')).join('');return 'student-'+hex;}
function nameEmail(name){return `${nameUid(name)}-first@example.com`;}
function showMessage(msg,okay=false){$('auth-message').textContent=msg;$('auth-message').classList.toggle('ok',okay);}
function switchRegister(yes){$('auth-signin').hidden=yes;$('auth-register').hidden=!yes;showMessage('');}
function friendly(error){
  const code=String(error?.code||'');
  if(/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login-credentials/.test(code))return '아이디 또는 비밀번호가 올바르지 않습니다.';
  if(/too-many-requests|resource-exhausted/.test(code))return '잠시 후 다시 시도해 주세요.';
  if(/email-already-in-use/.test(code))return '이미 가입된 이름입니다. 로그인하거나 관리자에게 문의해 주세요.';
  if(/operation-not-allowed|admin-restricted-operation/.test(code))return 'Firebase에서 신규 가입이 차단되어 있습니다. 관리자에게 가입 허용 설정을 요청해 주세요.';
  if(/weak-password/.test(code))return '비밀번호 보안 조건을 확인해 주세요.';
  if(/permission-denied/.test(code))return '승인되지 않은 사용자이거나 이용이 중지된 계정입니다.';
  return '요청을 처리하지 못했습니다. Firebase 설정 또는 네트워크를 확인해 주세요.';
}
function setBusy(form,busy){for(const b of form.querySelectorAll('button,input'))b.disabled=busy;}
function setAuthenticatedUI(profile){
  gate.hidden=true;toolbar.hidden=false;
  $('account-name').textContent=`${profile.name}님`;
  $('study-nav').hidden=false;
  document.body.classList.add('has-study-nav');
  if(!statsOpen&&!reviewSession)quizRoot.hidden=false;
  syncStudyNav();
}
function showGate(){
  gate.hidden=false;quizRoot.hidden=true;toolbar.hidden=true;
  $('analytics-panel').hidden=true;$('review-panel').hidden=true;
  $('study-nav').hidden=true;document.body.classList.remove('has-study-nav');
  statsOpen=false;reviewSession=null;
}

async function approveUser(user){
  const name=approvedDisplayNames.find(n=>nameEmail(n)===user.email);
  if(!name)throw new Error('NOT_APPROVED');
  const snap=await getDoc(doc(db,'profiles',nameUid(name)));
  const profile=snap.exists()?snap.data():null;
  if(!profile?.approved||!profile?.active)throw new Error('NOT_APPROVED');
  if(profile.name!==name)throw new Error('INVALID_PROFILE');
  return profile;
}

let saveTimer, saveChain=Promise.resolve(), pendingProgress=new Map();
// 진행 기록은 먼저 이 기기에 보관하고 Firestore에 동기화합니다.
// 서버/권한/네트워크 오류가 발생해도 현재 브라우저에서 입력한 내용은 보존합니다.
const PROGRESS_BACKUP_PREFIX='midterm-2-2:pending-progress:v2:';
function progressBackupKey(uid){return PROGRESS_BACKUP_PREFIX+uid;}
function readProgressBackup(uid){
 try{
  const data=JSON.parse(localStorage.getItem(progressBackupKey(uid))||'[]');
  return new Map(Array.isArray(data)?data.filter(x=>Array.isArray(x)&&typeof x[0]==='string') : []);
 }catch{return new Map();}
}
function writeProgressBackup(uid,short,payload){
 try{
  const entries=readProgressBackup(uid);
  entries.set(short,payload);
  localStorage.setItem(progressBackupKey(uid),JSON.stringify([...entries]));
  return true;
 }catch{return false;}
}
function clearProgressBackup(uid,short,payload){
 try{
  const entries=readProgressBackup(uid);
  if(entries.get(short)===payload){
   entries.delete(short);
   if(entries.size)localStorage.setItem(progressBackupKey(uid),JSON.stringify([...entries]));
   else localStorage.removeItem(progressBackupKey(uid));
  }
 }catch{}
}
function progressErrorDescription(err){
 const code=String(err?.code||'').replace(/^firestore\//,'');
 if(code==='permission-denied')return 'Firebase 권한 거부(permission-denied)';
 if(code==='resource-exhausted')return 'Firebase 사용량 제한(resource-exhausted)';
 if(code==='unavailable'||code==='deadline-exceeded')return '네트워크·서버 연결 불안정('+code+')';
 if(code==='unauthenticated')return '로그인 인증 만료(unauthenticated)';
 return 'Firebase 연결 오류'+(code?' ('+code+')':'');
}
let activeSaves=0;
const pendingStats=new Set();
const failedStats=new Set();
async function retryStats(){for(const job of [...failedStats]){await job();failedStats.delete(job);}}
function syncStatus(text){$('sync-status').textContent=text;}
function flushProgress(){
  clearTimeout(saveTimer);
  const items=[...pendingProgress];pendingProgress.clear();activeSaves++;
  saveChain=saveChain.catch(()=>{}).then(async()=>{
    for(let i=0;i<items.length;i++){
      const [key,payload]=items[i];
      try{
        const uid=auth.currentUser?.uid;
        if(!uid)throw Object.assign(new Error('로그인 세션이 종료되었습니다.'),{code:'unauthenticated'});
        await setDoc(doc(db,'users',uid,'progress',encodeURIComponent(key)),{payload,updatedAt:serverTimestamp()});
        clearProgressBackup(uid,key,payload);
      }catch(e){
        for(const [k,v] of items.slice(i))if(!pendingProgress.has(k))pendingProgress.set(k,v);
        const localCopy=!!auth.currentUser&&items.slice(i).every(([k,v])=>writeProgressBackup(auth.currentUser.uid,k,pendingProgress.get(k)??v));
        syncStatus((localCopy?'기기에 임시저장 · ':'저장 실패 · ')+progressErrorDescription(e)+' · 다시 시도');
        console.warn('진행 기록 Firebase 저장 실패:',e?.code||e?.message||e);
        throw e;
      }
    }
    if(!pendingProgress.size&&activeSaves===1)syncStatus(failedStats.size?'오답 통계 저장 실패 · 새로고침 전 확인하세요':'저장됨');
  });
  saveChain=saveChain.finally(()=>{activeSaves--;});
  return saveChain;
}
async function prepareProgress(user){
  const snapshots=await getDocs(collection(db,'users',user.uid,'progress'));
  const prefix='midterm-2-2-2026:quiz:v1:'+user.uid+':';
  const memory=new Map(snapshots.docs.map(x=>[decodeURIComponent(x.id),x.data().payload]));
  // 서버 반영에 실패했던 최신 로컬 입력을 복원하고 다시 동기화합니다.
  pendingProgress.clear();
  for(const [short,payload] of readProgressBackup(user.uid)){
    if(typeof payload!=='string')continue;
    memory.set(short,payload);
    pendingProgress.set(short,payload);
  }
  window.__QUIZ_STORAGE={
    getItem(key){return memory.get(key.slice(prefix.length))??null;},
    setItem(key,value){
      const short=key.slice(prefix.length);memory.set(short,value);pendingProgress.set(short,value);
      writeProgressBackup(user.uid,short,value);
      syncStatus('저장 중…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushProgress().catch(()=>{}),1400);
    }
  };
  syncStatus(pendingProgress.size?'기기 기록 복원됨 · 서버 동기화 중':'저장됨');
  if(pendingProgress.size)flushProgress().catch(()=>{});
}
window.addEventListener('beforeunload',e=>{
  if(activeSaves||failedStats.size||pendingProgress.size||pendingStats.size||$('sync-status')?.textContent==='저장 중…'){
    e.preventDefault();e.returnValue='';
  }
});
window.addEventListener('online',()=>{if(pendingProgress.size)flushProgress().catch(()=>{});});
$('sync-status').onclick=async()=>{try{await retryStats();await flushProgress();}catch{syncStatus('저장 실패 · 다시 시도');}};

// 기존 상한론/방제학 문제은행은 Firebase의 보호된 퀴즈 스크립트에서 렌더됩니다.
// 채점 결과 DOM만 관찰하므로 저장된 답/채점 로직을 변경하지 않습니다.
function installLegacyGradeMarkers(){
 const configs=[
  {id:'feedback',check:'check',reveal:'show',next:'next',question:'question-title'},
  {id:'daja-feedback',check:'daja-check',reveal:'daja-reveal',next:'daja-next',question:'daja-title'}
 ];
 const focusElement=el=>{
  if(!el)return;
  const y=window.scrollY+el.getBoundingClientRect().top-Math.min(125,window.innerHeight*0.14);
  window.scrollTo({top:Math.max(0,y),behavior:'smooth'});
 };
 for(const conf of configs){
  const fb=$(conf.id);if(!fb)continue;
  let action=null;
  const check=$(conf.check),show=$(conf.reveal),next=$(conf.next);
  if(check)check.addEventListener('click',()=>{action='check';fb.dataset.gradingCycle='';},true);
  if(show)show.addEventListener('click',()=>{action='reveal';fb.dataset.gradingCycle='';},true);
  if(next)next.addEventListener('click',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>focusElement($(conf.question)))),true);
  let busy=false,readyForUser=false;
  function update(){
   if(busy||fb.hidden||!fb.textContent.trim())return;
   // The marker is presentation only. Never change answer evaluation.
   const header=fb.querySelector('h3,h4,.result-title');
   const heading=String(header?.textContent||'').trim();
   const ownText=String(fb.textContent||'').replace(/^[OX]\s*(?:정답|오답)\s*/,'');
   // A partly wrong answer can show the correct words in green in the explanation.
   // Therefore inspect the question's actual checked blanks/inputs before counting any green answers.
   const questionRoot=fb.closest('.card')||fb.parentElement;
   const inputErrors=questionRoot?.querySelectorAll('.blank.wrong, input[aria-invalid="true"], input.incorrect, textarea.incorrect')?.length||0;
   const wrongCount=fb.querySelectorAll('.wrong,.incorrect,.miss,.extra,[aria-invalid="true"]').length+inputErrors;
   const correctCount=fb.querySelectorAll('.correct,.right,.yes').length;
   let verdict;
   if(action==='reveal')verdict=false;
   else if(wrongCount>0||/오답|틀렸|불일치|다시\s*풀|부족|미일치/.test(heading))verdict=false;
   else if(correctCount>0||/정답입니다|모두\s*(?:정답|맞)|맞혔습니다|정확합니다/.test(heading))verdict=true;
   else if(/오답|틀렸|불일치|빠뜨린\s*약재|추가\s*입력/.test(ownText))verdict=false;
   else if(/정답입니다|모두\s*(?:정답|맞)|맞혔습니다|정확히/.test(ownText))verdict=true;
   else if(action==='check'&&!$(conf.next)?.hidden&&$(conf.next))verdict=true;
   else return; // Unknown presentation: avoid showing an incorrect O/X.
   const value=verdict?'O':'X';
   if(fb.dataset.gradingCycle===value&&fb.querySelector('.universal-grade-head'))return;
   fb.dataset.gradingCycle=value;
   busy=true;
   let mark=fb.querySelector('.universal-grade-head');
   if(!mark){mark=document.createElement('div');mark.className='universal-grade-head';fb.prepend(mark);}
   mark.innerHTML='<span class="universal-grade-mark" aria-hidden="true">'+value+'</span><strong>'+
     (verdict?'정답입니다!':action==='reveal'?'정답 확인':'오답입니다')+'</strong>';
   mark.classList.toggle('grade-right',verdict);mark.classList.toggle('grade-wrong',!verdict);
   busy=false;
   if(action||readyForUser){
    action=null;
    requestAnimationFrame(()=>{
     const detail=fb.querySelector('.result-explanation,.explanation,.answer-explanation,p,ol,ul')||fb;
     if(window.__QUIZ_SCROLL_GRADE)window.__QUIZ_SCROLL_GRADE({gradeNode:fb,explanationNode:detail});
     else focusElement(fb);
    });
   }
  }
  const observer=new MutationObserver(update);
  observer.observe(fb,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','class','style']});
  update();
  readyForUser=true;
 }
 // Any existing subject's Next button scrolls to the newly rendered question.
 document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('#next,#daja-next,#review-next');
  if(!btn||btn.id==='review-next')return;
  const anchor=btn.id==='daja-next'?'daja-title':'question-title';
  requestAnimationFrame(()=>requestAnimationFrame(()=>focusElement($(anchor))));
 },true);
}
async function startQuiz(user){
  // 공개 index.html 에는 정답/문제/quiz JS가 없습니다. 보안 규칙 통과 후에만 내려받습니다.
  if(appLoaded)return;
  const bundle=await getDoc(doc(db,'protectedContent','quiz'));
  if(!bundle.exists())throw new Error('CONTENT_NOT_UPLOADED');
  const {dataJson,quizScript}=bundle.data();
  if(typeof dataJson!=='string'||typeof quizScript!=='string')throw new Error('INVALID_CONTENT');
  await prepareProgress(user);
  window.__QUIZ_USER_ID=user.uid;
  window.__QUIZ_TRACK_ATTEMPT=event=>{
    if(!auth.currentUser||auth.currentUser.uid!==user.uid)return;
    const id=encodeURIComponent(event.key);
    if(id.length>1400)return;
    // 빈칸 하나를 한 문항으로 기록. 오답과 정답보기 횟수는 별개입니다.
    const save=()=>setDoc(doc(db,'users',user.uid,'errorStats',id),{
      label:String(event.label).slice(0,200),
      group:String(event.group).slice(0,100),
      total:increment(1),wrong:increment(!event.correct&&!event.revealed?1:0),
      revealed:increment(event.revealed?1:0),
      updatedAt:serverTimestamp()
    },{merge:true});
    const task=save();
    pendingStats.add(task);
    task.catch(()=>{failedStats.add(save);syncStatus('오답 통계 저장 실패 · 네트워크를 확인하세요');}).finally(()=>pendingStats.delete(task));
  };
  const source=document.createElement('script');source.id='quiz-data';source.type='application/json';source.textContent=dataJson;
  document.body.appendChild(source);
  // Firestore에 저장된 기존 퀴즈 스크립트에서 '빈칸은 반드시 입력' 검사만 제거합니다.
  // 빈 입력은 평가 함수에서 오답으로 처리되고, 오답 통계/재출제 기능은 그대로 작동합니다.
  const blankAnswerGuards = [
    ["if(!reveal){const missing=s.drafts.findIndex(v=>!v.trim());if(missing!==-1){$('answer-'+missing).focus();toast('빈칸에 답을 입력해 주세요.');return;}}", '빈칸에 답을 입력해 주세요.'],
    ["if(!reveal){const blank=s.drafts.findIndex(x=>!x.trim());if(blank>=0){$('daja-answer-'+blank).focus();toast('모든 빈칸에 답을 입력해 주세요.');return;}}", '모든 빈칸에 답을 입력해 주세요.']
  ];
  let patchedQuizScript = quizScript;
  for (const [guard, message] of blankAnswerGuards) {
    if (patchedQuizScript.includes(guard)) {
      patchedQuizScript = patchedQuizScript.replace(guard, '');
    } else if (patchedQuizScript.includes(message)) {
      throw new Error('빈칸 채점 수정이 퀴즈 코드와 일치하지 않습니다. 관리자에게 문의해 주세요.');
    }
  }
  // 서버에 저장된 퀴즈 스크립트가 새로고침 아이콘을 글자로 덮어쓰지 않도록 합니다.
  // 버튼 내부의 SVG는 index.html에 유지하며 모드별 의미만 접근성 이름으로 갱신합니다.
  const resetLabelOverride = "refreshButton.textContent=isBangjae?'↻ 새로고침':'진행 초기화';";
  if (patchedQuizScript.includes(resetLabelOverride)) {
    patchedQuizScript = patchedQuizScript.replace(
      resetLabelOverride,
      "refreshButton.setAttribute('aria-label',active==='bangjae-herbs-ordered'?'순서대로 채점 기록 초기화':isBangjae?'새로고침':'진행 초기화');"
    );
  } else if (patchedQuizScript.includes('refreshButton.textContent')) {
    throw new Error('새로고침 버튼 코드 버전이 일치하지 않습니다.');
  }
  // 방제학 순서대로에서 가장 최근 채점 결과를 기존 Firebase 진행 상태에 저장합니다.
  const orderedResultPatches = [["...(key==='bangjae-herbs-ordered'?{cursor:0}:{})","...(key==='bangjae-herbs-ordered'?{cursor:0,orderedResults:{}}:{})"],["if(active==='bangjae-herbs-ordered'){\n   // 이 모드에서는 저장할 값이 현재 위치와 이번 답안뿐입니다.\n }else if(s.lastOK)","if(active==='bangjae-herbs-ordered'){\n   s.orderedResults ||= {};\n   s.orderedResults[q.id]=s.reveal?'revealed':s.lastOK?'correct':'wrong';\n }else if(s.lastOK)"],["const btn=el('button',{type:'button',className:'bangjae-number-tick'+(isCurrent?' current':'')});\n   btn.append(el('span',{className:'tick-number'},String(num)));","const outcomes=CONFIG[active].data.filter(x=>x.num===num).map(x=>(loadSession(active).orderedResults||{})[x.id]||'unseen');\n   const state=outcomes.includes('wrong')?'wrong':outcomes.includes('revealed')?'revealed':outcomes.every(x=>x==='correct')?'correct':outcomes.includes('correct')?'partial':'unseen';\n   const btn=el('button',{type:'button',className:'bangjae-number-tick'+(isCurrent?' current':'')+' status-'+state});\n   btn.append(el('span',{className:'tick-number'},String(num)),el('span',{className:'tick-mark'},({correct:'✓',wrong:'×',revealed:'?',partial:'◐'})[state]||''));"],["btn.setAttribute('aria-label',`${num}번${isCurrent?', 현재 문제':''} · 여기부터 풀기`);","btn.setAttribute('aria-label',`${num}번${isCurrent?', 현재 문제':''} · ${({correct:'정답',wrong:'오답',revealed:'정답 보기',partial:'일부 정답',unseen:'미응시'})[state]} · 여기부터 풀기`);"],["btn.title=`${num}번부터 이어서 풀기`;","btn.title=`${num}번부터 이어서 풀기 · ${({correct:'정답',wrong:'오답',revealed:'정답 보기',partial:'일부 정답',unseen:'미응시'})[state]}`;"],["if(active!=='bangjae-herbs-ordered')h.append(el('span',{className:'overview-status'+(completed?' correct':hasWrong?' retry':'')},completed?'완료':hasWrong?'오답 복습':'미완료'));","if(active==='bangjae-herbs-ordered'){\n     const status=(s.orderedResults||{})[q.id]||'unseen';\n     h.append(el('span',{className:'overview-status status-'+status},({correct:'✓ 정답',wrong:'× 오답',revealed:'? 정답 보기',unseen:'미응시'})[status]||'미응시'));\n   }else h.append(el('span',{className:'overview-status'+(completed?' correct':hasWrong?' retry':'')},completed?'완료':hasWrong?'오답 복습':'미완료'));"],["`전체 ${c.data.length}문제`:`전체 ${c.data.length}문제 · 완료 ${s.mastered.length}`","`전체 ${c.data.length}문제 · 정답 ${Object.values(s.orderedResults||{}).filter(x=>x==='correct').length} · 오답 ${Object.values(s.orderedResults||{}).filter(x=>x==='wrong').length}`:`전체 ${c.data.length}문제 · 완료 ${s.mastered.length}`"],["순서대로는 26~60번을 자유롭게 앞뒤로 이동하며 정답·오답 횟수를 집계하지 않습니다. 출전이 나뉜 같은 번호는 연속 출제하고, 현재 위치는 저장됩니다.","순서대로는 26~60번을 자유롭게 이동하며 문제별 최근 정답·오답·정답 보기를 저장해 번호와 목록에 표시합니다. 출전이 다른 같은 번호는 각각 기록합니다. 정답·오답 횟수는 별도로 누적하지 않습니다."]];
  for (const [before,after] of orderedResultPatches){
    if(patchedQuizScript.split(before).length!==2)throw new Error('방제학 채점결과 패치 버전 불일치');
    patchedQuizScript=patchedQuizScript.replace(before,after);
  }
  // '순서대로' 새로고침만 최근 정답/오답/정답보기 표시를 지웁니다.
  // Firebase의 errorStats 누적 통계와 다른 과목/모드 세션은 변경하지 않습니다.
  const orderedRefreshBefore = "if(active==='bangjae-herbs-ordered'){\n   stepBangjaeOrdered(1);\n   toast('다음 처방으로 이동했습니다.');\n   return;\n }";
  const orderedRefreshAfter = "if(active==='bangjae-herbs-ordered'){\n   if(!confirm('방제학 순서대로의 정답·오답·정답 보기 표시를 초기화할까요? 다른 학습 기록은 유지됩니다.'))return;\n   const s=loadSession(active);\n   s.orderedResults={};s.orderedFinished=false;s.orderedPhase='first';s.orderedRetryRound=0;\n   s.done=false;s.reveal=false;s.lastOK=false;s.drafts=[];\n   saveSession();\n   if(listView)renderFullList();else render();\n   toast('순서대로 채점 기록을 초기화했습니다.');\n   return;\n }";
  const orderedRefreshTipBefore = "refreshButton.title=isBangjae?'정답·오답 기록을 유지하며 다음 문제 보기':'이 퀴즈의 진행 기록 초기화';";
  const orderedRefreshTipAfter = "refreshButton.title=active==='bangjae-herbs-ordered'?'순서대로 채점 표시 초기화':isBangjae?'정답·오답 기록을 유지하며 다음 문제 보기':'이 퀴즈의 진행 기록 초기화';";
  if(patchedQuizScript.split(orderedRefreshBefore).length!==2 || patchedQuizScript.split(orderedRefreshTipBefore).length!==2){
    throw new Error('순서대로 채점 기록 초기화 패치 버전이 일치하지 않습니다.');
  }
  patchedQuizScript = patchedQuizScript.replace(orderedRefreshBefore,orderedRefreshAfter)
    .replace(orderedRefreshTipBefore,orderedRefreshTipAfter);
  // 미응시 문항 먼저, 틀림·정답 보기 문항은 뒤에 재출제합니다. 데이터/누적 통계는 보존합니다.
  const unseenFirstPatches=[["function loadSession(key){","function prioritizeUnseenQueue(queue,wrong,pin=false){const hold=pin?queue.slice(0,1):[];const rest=pin?queue.slice(1):queue;const bad=new Set(wrong);return [...hold,...rest.filter(id=>!bad.has(id)),...rest.filter(id=>bad.has(id))];}\nfunction loadSession(key){"],["sessions[key]=s;return s;","if(key!=='bangjae-herbs-ordered')s.queue=prioritizeUnseenQueue(s.queue,s.wrong,s.done);\n sessions[key]=s;return s;"],["const s=loadSession(active);if(!s.done)return;const id=s.queue.shift();if(!s.lastOK)s.queue.push(id);s.done=false;s.reveal=false;s.lastOK=false;s.drafts=[];saveSession();","const s=loadSession(active);if(!s.done)return;const id=s.queue.shift();if(!s.lastOK)s.queue.push(id);s.queue=prioritizeUnseenQueue(s.queue,s.wrong);s.done=false;s.reveal=false;s.lastOK=false;s.drafts=[];saveSession();"],["dajaSession=s;return s;\n}","dajaSession=s;s.queue=prioritizeUnseenQueue(s.queue,s.wrong,s.checked);return s;\n}"],["const old=s.queue.shift();if(!s.lastOK)s.queue.push(old);\n s.current=null;s.drafts=[];s.checked=false;","const old=s.queue.shift();if(!s.lastOK)s.queue.push(old);\n s.queue=prioritizeUnseenQueue(s.queue,s.wrong);\n s.current=null;s.drafts=[];s.checked=false;"],["function stepBangjaeOrdered(delta){\n if(active!=='bangjae-herbs-ordered')return;\n navigateBangjaeTo(loadSession(active).cursor+delta);\n}","function stepBangjaeOrdered(delta){\n if(active!=='bangjae-herbs-ordered')return;\n const s=loadSession(active),a=CONFIG[active].data;\n if(delta<0){navigateBangjaeTo(s.cursor+delta);return;}\n const ordered=a.map((q,i)=>({q,i})).sort((x,y)=>Number(x.q.num)-Number(y.q.num)||x.i-y.i).map((x,rank)=>({...x,rank}));\n const currentRank=ordered.find(({i})=>i===s.cursor)?.rank??-1;\n const results=s.orderedResults||{};\n const unseen=ordered.filter(({q})=>!results[q.id]||results[q.id]==='unseen');\n if(unseen.length){\n  s.orderedPhase='first';\n  const next=unseen.find(({rank})=>rank>currentRank)||unseen[0];\n  navigateBangjaeTo(next.i);return;\n }\n const wrong=ordered.filter(({q})=>results[q.id]!=='correct');\n if(!wrong.length){\n  s.orderedFinished=true;s.orderedPhase='done';\n  saveSession();render();return;\n }\n if(s.orderedPhase!=='retry'){\n  s.orderedPhase='retry';s.orderedRetryRound=1;\n  saveSession();navigateBangjaeTo(wrong[0].i);return;\n }\n const next=wrong.find(({rank})=>rank>currentRank);\n if(!next)s.orderedRetryRound=(s.orderedRetryRound||1)+1;\n saveSession();navigateBangjaeTo((next||wrong[0]).i);\n}"]];
  for(const [before,after] of unseenFirstPatches){
    if(patchedQuizScript.split(before).length!==2){
      console.warn('미응시 우선 출제 패치를 적용하지 못한 코드 조각:',before.slice(0,60));continue;
    }
    patchedQuizScript=patchedQuizScript.replace(before,after);
  }
  // 순서대로: 모든 처방 정답 후 완료 표시, 26번부터 다시 시작.
  const orderedRenderStart='function render(){';
  if(patchedQuizScript.split(orderedRenderStart).length!==2)
    throw new Error('방제학 순서대로 완료 화면의 렌더 코드 버전 불일치');
  patchedQuizScript=patchedQuizScript.replace(orderedRenderStart,orderedRenderStart+"\n const orderedComplete=$('bangjae-ordered-complete');\n if(orderedComplete)orderedComplete.hidden=true;\n if(active==='bangjae-herbs-ordered'){\n  const orderedSession=loadSession(active),orderedQuestions=CONFIG[active].data;\n  if(orderedQuestions.length&&orderedQuestions.every(q=>orderedSession.orderedResults?.[q.id]==='correct')){\n   orderedSession.orderedFinished=true;orderedSession.orderedPhase='done';\n  }\n  if(orderedSession.orderedFinished){\n   $('quiz').hidden=true;$('finish').hidden=true;\n   if(orderedComplete)orderedComplete.hidden=false;\n   const label=$('bangjae-ordered-complete-summary');\n   if(label)label.textContent='26~60번 · 총 '+orderedQuestions.length+'개 처방을 모두 정답으로 맞혔습니다. 한 세트 완료!';\n   const button=$('bangjae-ordered-restart');\n   if(button)button.onclick=()=>{\n    orderedSession.orderedResults={};orderedSession.orderedFinished=false;\n    orderedSession.orderedPhase='first';orderedSession.orderedRetryRound=0;\n    orderedSession.cursor=orderedQuestions.reduce((best,q,i)=>Number(q.num)<Number(orderedQuestions[best].num)?i:best,0);orderedSession.done=false;orderedSession.reveal=false;\n    orderedSession.lastOK=false;orderedSession.drafts=[];\n    saveSession();render();\n    requestAnimationFrame(()=>{\n     const quiz=$('quiz');\n     if(quiz)quiz.scrollIntoView({block:'start',behavior:'smooth'});\n    });\n   };\n   return;\n  }\n  $('quiz').hidden=false;\n }\n");
  // 대자 빈칸 수는 후보 구절 수를 초과하지 않습니다. 원래 하나인 구절은 나누지 않습니다.
  const dajaDensityFixes=[
    [
      "if(!s.current||s.current.num!==num){\n   s.current={num,blanks:dajaPick(q,s.density,s.retryBlanks[num]||[])};",
      "if(!s.checked&&s.current?.num===num&&s.current.blanks?.length<Math.min(s.density,DAJA_CANDIDATES[num].length)){\n   s.current=null;s.drafts=[];\n }\n if(!s.current||s.current.num!==num){\n   s.current={num,blanks:dajaPick(q,s.density,s.retryBlanks[num]||[])};"
    ],
    [
      "if(!s.checked){s.current=null;s.drafts=[];}\n   dajaSave();dajaRender();\n };",
      "if(!s.checked){s.current=null;s.drafts=[];}\n   else toast('채점한 현재 조문은 유지하고, 다음 조문부터 '+s.density+'개 이내로 빈칸을 출제합니다.');\n   dajaSave();dajaRender();\n };"
    ],
    [
      "const q=DAJA_DATA.find(x=>x.num===num);\n if((num===65",
      // 이전 버전에서 원래 한 구절인 欲作奔豚을 분리하여 만든 저장 기록 복구.
      "const q=DAJA_DATA.find(x=>x.num===num);\n if(num===65&&Array.isArray(s.retryBlanks[num])){\n   const broken=s.retryBlanks[num].some(b=>b.text==='欲作'||b.text==='奔豚');\n   if(broken){\n     const start=q.original.indexOf('欲作奔豚');\n     s.retryBlanks[num]=s.retryBlanks[num].filter(b=>b.text!=='欲作'&&b.text!=='奔豚');\n     if(start>=0&&!s.retryBlanks[num].some(b=>b.text==='欲作奔豚'))s.retryBlanks[num].push({start,end:start+4,text:'欲作奔豚'});\n     dajaSave();\n   }\n }\n if(num===63&&Array.isArray(s.retryBlanks[num])){\n   const clean=s.retryBlanks[num].filter(b=>b.text!=='發汗後');\n   if(clean.length!==s.retryBlanks[num].length){s.retryBlanks[num]=clean;dajaSave();}\n }\n if(s.current?.num===num&&s.current.blanks?.some(b=>(num===65&&(b.text==='欲作'||b.text==='奔豚'))||(num===63&&b.text==='發汗後'))){\n   s.current=null;s.drafts=[];s.checked=false;s.revealed=false;s.lastOK=false;dajaSave();\n }\n if((num===65"
    ]
  ];
  for(const [before,after] of dajaDensityFixes){
    if(patchedQuizScript.split(before).length!==2){
      console.warn('상한론 대자 빈칸 수 개선을 적용하지 못했습니다:',before.slice(0,70));
      continue;
    }
    patchedQuizScript=patchedQuizScript.replace(before,after);
  }
  // 104조 선해외후공리: 순서와 치료 목적을 나타내는 구절을 독립된 빈칸 후보로 추가.
  // 기존 후보 구절은 분할하거나 제거하지 않습니다.
  const daja104Patches=[
    [
      "const DAJA_READINGS = ",
      "for(const phrase of ['先宜','解外','後以']){\n  if(!DAJA_CANDIDATES[104].includes(phrase))DAJA_CANDIDATES[104].push(phrase);\n}\nconst DAJA_READINGS = "
    ],
    [
      "const DAJA_TRANSLATIONS = ",
      "Object.assign(DAJA_READINGS,{'先宜':'선의','解外':'해외','後以':'후이'});\nconst DAJA_TRANSLATIONS = "
    ]
  ];
  for(const [before,after] of daja104Patches){
    if(patchedQuizScript.split(before).length!==2)
      throw new Error('104조 빈칸 후보 추가를 확인할 수 없습니다. 퀴즈 코드 버전을 확인해 주세요.');
    patchedQuizScript=patchedQuizScript.replace(before,after);
  }
  // 99조: 5개를 선택해도 기존 빈칸 후보가 적어 3개만 나오던 현상 보완.
  // 원문의 완결된 구절만 추가하고, 기존 빈칸 후보는 절대 분할하지 않습니다.
  const daja99PoolAnchor="const DAJA_READINGS = ";
  const daja99PoolCode=[
    "const source99=DAJA_DATA.find(q=>Number(q.num)===99)?.original||'';",
    "if(Array.isArray(DAJA_CANDIDATES[99])){",
    " for(const re of [/(?:傷|伤)寒四五日/,/身[熱热][惡恶]風/,/手足[溫温]而渴者/]){",
    "  const fullPhrase=source99.match(re)?.[0];",
    "  if(fullPhrase&&!DAJA_CANDIDATES[99].includes(fullPhrase))DAJA_CANDIDATES[99].push(fullPhrase);",
    " }",
    "}",
    "const DAJA_READINGS = "
  ].join('\n');
  if(patchedQuizScript.split(daja99PoolAnchor).length!==2)
    throw new Error('99조 빈칸 후보 확장 패치가 퀴즈 코드와 일치하지 않습니다.');
  patchedQuizScript=patchedQuizScript.replace(daja99PoolAnchor,daja99PoolCode);
  const daja99ReadingAnchor="const DAJA_TRANSLATIONS = ";
  const daja99ReadingCode=[
    "const source99ForRead=DAJA_DATA.find(q=>Number(q.num)===99)?.original||'';",
    "for(const [re,reading] of [[/(?:傷|伤)寒四五日/,'상한사오일'],[/身[熱热][惡恶]風/,'신열오풍'],[/手足[溫温]而渴者/,'수족온이갈자']]){",
    " const phrase=source99ForRead.match(re)?.[0];",
    " if(phrase&&!DAJA_READINGS[phrase])DAJA_READINGS[phrase]=reading;",
    "}",
    "const DAJA_TRANSLATIONS = "
  ].join('\n');
  if(patchedQuizScript.split(daja99ReadingAnchor).length!==2)
    throw new Error('99조 빈칸 독음 패치가 퀴즈 코드와 일치하지 않습니다.');
  patchedQuizScript=patchedQuizScript.replace(daja99ReadingAnchor,daja99ReadingCode);
  const script=document.createElement('script');script.textContent=patchedQuizScript;document.body.appendChild(script);
  // Bridge shares the original quiz grading logic; the question bank remains in protectedContent.
  await new Promise((resolve,reject)=>{
    const bridge=document.createElement('script');bridge.src='./review-bridge.js';
    bridge.onload=resolve;bridge.onerror=()=>reject(new Error('REVIEW_BRIDGE_LOAD_FAILED'));
    document.body.appendChild(bridge);
  });
  if(!window.__QUIZ_REVIEW_API)throw new Error('REVIEW_BRIDGE_INIT_FAILED');
  installLegacyGradeMarkers();
  appLoaded=true;
}

async function handleAuthenticated(user){
  try{
    const profile=await approveUser(user);
    showMessage('');
    await startQuiz(user);
    if(auth.currentUser?.uid!==user.uid)return;
    authenticatedUid=user.uid;
    setAuthenticatedUI(profile);
  }catch(error){
    console.error('로그인 후 확인 오류:',error);
    showGate();
    showMessage(error.message==='CONTENT_NOT_UPLOADED'?'문제 자료가 아직 등록되지 않았습니다. 관리자에게 문의해 주세요.':
      error.message==='NOT_APPROVED'?'이 계정은 등록 대기 중이거나 사용이 승인되지 않았습니다. 관리자에게 문의해 주세요.':
      '학습 자료를 열지 못했습니다. Firebase 설정과 보안 규칙을 확인해 주세요.');
    if(error.message==='NOT_APPROVED'||error.message==='INVALID_PROFILE')await signOut(auth);
  }
}

function metric(label,value){const item=document.createElement('div');item.className='analytics-metric';const count=document.createElement('b');count.textContent=String(value);const title=document.createElement('span');title.textContent=label;item.append(count,title);return item;}
function renderStats(){updateStatControls();}
// 공통 오답 통계에서 기존 신경정신과 progress 문서를 읽어 함께 표시합니다.
async function loadNeuroStatistics(){
 let records={};
 try{
   const snap=await getDoc(doc(db,'users',authenticatedUid,'progress','neuro-psy-midterm-v1'));
   const payload=snap.exists()?snap.data().payload:null;
   records=typeof payload==='string'?JSON.parse(payload):(payload&&typeof payload==='object'?payload:{});
 }catch(error){console.warn('신경정신과 기록 읽기 실패',error);}
 const live=window.__NEURO_LIVE_RECORDS;
 if(live?.uid===authenticatedUid && live.records && typeof live.records==='object')records=live.records;
 if(!records||typeof records!=='object'||Array.isArray(records))return [];
 const entries=Object.entries(records).filter(([id,r])=>/^\d{2}-\d{2}$/.test(id)&&r&&typeof r==='object'&&((r.attempts||0)>0||r.viewed));
 if(!entries.length)return [];
 let index=[];
 try{
   const response=await fetch('./neuro-stat-index.json?v=20261014-all-stats-v9');
   if(response.ok)index=await response.json();
 }catch(error){console.warn('신경정신과 문항 정보 읽기 실패',error);}
 const labels=new Map(index.map(x=>[x.id,x]));
 return entries.map(([id,r])=>{
   const q=labels.get(id),total=Math.max(0,Number(r.attempts)||0);
   return {id:'neuro:'+id,group:'신경정신과',
     label:q?String(q.label)+' · '+String(q.prompt).slice(0,90):'신경정신과 · '+id,
     total,wrong:Math.min(total,Math.max(0,Number(r.wrong)||0)),revealed:r.viewed?1:0,neuroId:id};
 });
}
async function showAnalytics(){
  if(!authenticatedUid)return;
  if(!quizRoot.hidden)lastQuizScroll=window.scrollY;
  statsOpen=true;quizRoot.hidden=true;$('review-panel').hidden=true;$('analytics-panel').hidden=false;
  syncStudyNav();
  const wrap=$('analytics-list');wrap.textContent='통계를 불러오는 중입니다…';
  $('analytics-message').textContent='';
  try{
    const snapshots=await getDocs(collection(db,'users',authenticatedUid,'errorStats'));
    const neuroStats=await loadNeuroStatistics();
    currentStats=[...snapshots.docs.map(x=>({id:x.id,...x.data()})),...neuroStats];
    const sel=$('analytics-filter');
    const last=sel.value;sel.replaceChildren();
    for(const v of ['all',...new Set(currentStats.map(x=>x.group))]){
      const o=document.createElement('option');o.value=v;o.textContent=v==='all'?'전체 과목·유형':v;sel.append(o);
    }
    if([...sel.options].some(o=>o.value===last))sel.value=last;
    renderStats();
  }catch(error){wrap.replaceChildren();$('analytics-message').textContent='오답 통계를 불러오지 못했습니다. 네트워크와 보안 규칙을 확인해 주세요.';console.error(error);}
}

// A separate review session: never touches the normal quiz queues or progress saves.
let reviewSession = null;
function statRows() {
  const filter = $('analytics-filter').value;
  const minThree = $('analytics-min-three').checked;
  const sorting = $('analytics-sort').value;
  const filtered = currentStats.filter(row => (filter === 'all' || row.group === filter) && (!minThree || row.total >= 3));
  filtered.sort((a,b) => {
    const primary = sorting === 'count' ? (b.wrong || 0) - (a.wrong || 0)
      : (b.wrong / Math.max(1,b.total)) - (a.wrong / Math.max(1,a.total));
    return primary || b.wrong - a.wrong || b.revealed - a.revealed || b.total - a.total || a.label.localeCompare(b.label,'ko');
  });
  return filtered;
}
function reviewCandidates() {
  const api = window.__QUIZ_REVIEW_API;
  if(!api)return [];
  return statRows().filter(x => x.wrong > 0 || x.revealed > 0)
    .map(stat => ({stat, item: api.resolve(stat)})).filter(x => x.item !== null);
}
function renderStatRows() {
  const area = $('analytics-list');area.replaceChildren();
  const rows = statRows();
  const items = reviewCandidates();
  $('analytics-review-count').textContent = `공통 복습 가능 ${items.length}문항 · 신경정신과는 개별 문항 풀기`;
  $('start-review').disabled = !items.length;
  if (!rows.length) {
    const empty = document.createElement('div');empty.className='analytics-empty';
    empty.textContent = currentStats.length ? '조건에 맞는 기록이 없습니다. 필터를 변경해 보세요.' : '아직 채점 기록이 없습니다. 퀴즈를 먼저 풀어 주세요.';
    area.append(empty);return;
  }
  for (const row of rows) {
    const card = document.createElement('div');card.className='analytics-item';
    const heading = document.createElement('div');heading.className='analytics-item-header';
    const name = document.createElement('span');name.textContent=row.label;
    const ratio = Math.round((row.wrong || 0) / Math.max(1,row.total) * 100);
    const count = document.createElement('span');count.className='counts';count.textContent=`오답률 ${ratio}%`;
    const detail = document.createElement('small');
    detail.textContent=row.neuroId?`${row.group} · ${row.total}회 중 오답 ${row.wrong}회 · 해설 ${row.revealed?'확인':'미확인'}`:`${row.group} · ${row.total}회 중 오답 ${row.wrong}회 · 정답 보기 ${row.revealed}회`;
    const bottom=document.createElement('div');bottom.className='analytics-row-bottom';
    bottom.append(detail);
    const candidate=items.find(entry=>entry.stat.id===row.id);
    if(candidate || row.neuroId || String(row.id).startsWith('obgyn-')){
      const action=document.createElement('button');action.type='button';
      action.className='analytics-practice';action.textContent='이 문제 풀기';
      action.setAttribute('aria-label',`${row.label} 다시 풀기`);
      action.onclick=()=>{
        if(row.neuroId){
          navigateToQuiz();
          requestAnimationFrame(()=>requestAnimationFrame(()=>window.__OPEN_NEURO_QUESTION?.(row.neuroId)));
        }else if(String(row.id).startsWith('obgyn-')){
          navigateToQuiz();
          requestAnimationFrame(()=>requestAnimationFrame(()=>window.__OPEN_OBGYN_QUESTION?.(row.id)));
        }else startReview(candidate);
      };
      bottom.append(action);
    }
    heading.append(name,count);card.append(heading,bottom);area.append(card);
  }
}
function statOverview() {
  const box = $('analytics-overview');box.replaceChildren();
  const filter = $('analytics-filter').value;
  const rows = currentStats.filter(x => filter === 'all' || x.group === filter);
  box.append(metric('누적 채점 수',rows.reduce((s,x)=>s+(x.total||0),0)),
    metric('오답 수',rows.reduce((s,x)=>s+(x.wrong||0),0)),
    metric('정답 보기',rows.reduce((s,x)=>s+(x.revealed||0),0)));
}
function updateStatControls() {statOverview();renderStatRows();}
function startReview(selected) {
  const candidates = selected?.item ? [selected] : reviewCandidates();
  if(!candidates.length) { $('analytics-message').textContent='복습할 오답 기록이 없습니다.';return; }
  reviewSession = {items: candidates, index:0, checked:false, revealed:false, result:null, correct:0, wrong:0, seen:0};
  statsOpen=false;
  lastStatsScroll=window.scrollY;
  $('analytics-panel').hidden=true;quizRoot.hidden=true;$('review-panel').hidden=false;
  syncStudyNav();
  renderReview();
  $('review-panel').scrollIntoView({block:'start',behavior:'instant'});
}
function addReviewText(parent, str, className) {
  const s=document.createElement('span');if(className)s.className=className;s.textContent=str;parent.append(s);
}
function renderReviewPassage(item) {
  const passage = $('review-passage');passage.replaceChildren();
  passage.hidden = !['name','daja'].includes(item.type);
  if(item.type==='name'){
    for(let i=0;i<item.parts.length;i++){
      passage.append(document.createTextNode(item.parts[i]));
      if(i<item.answers.length){
        const answer = item.answers[i];
        addReviewText(passage,i===item.target?'_ '.repeat([...answer].length).trim():answer,i===item.target?'review-hole':'review-other-answer');
      }
    }
  } else if(item.type==='daja') {
    passage.append(document.createTextNode(item.original.slice(0,item.start)));
    addReviewText(passage,'_ '.repeat([...item.answer.replace(/[\s,，、.。]/g,'')].length).trim(),'review-hole');
    passage.append(document.createTextNode(item.original.slice(item.end)));
  }
}
function renderReview() {
  const s=reviewSession;
  if(!s)return;
  const finished=s.index>=s.items.length;
  $('review-question').hidden=finished;
  $('review-finish').hidden=!finished;
  if(finished){
    $('review-summary').textContent=`${s.seen}문항 복습 · 정답 ${s.correct}문항 · 오답/정답보기 ${s.wrong}문항`;
    return;
  }
  const {stat,item}=s.items[s.index];
  $('review-position').textContent=`${s.index+1} / ${s.items.length} · 시작 당시 오답률 ${Math.round(stat.wrong/Math.max(1,stat.total)*100)}% (${stat.wrong}/${stat.total})`;
  $('review-progress').style.width=(s.index/s.items.length*100)+'%';
  $('review-category').textContent=item.group;
  $('review-title').replaceChildren();
  addReviewText($('review-title'),item.title);
  if(item.hanja)addReviewText($('review-title'),` (${item.hanja})`,'review-hanja');
  $('review-note').textContent=item.type==='herbs'?'약재를 쉼표 또는 공백으로 구분해 입력하세요. 순서는 무관합니다.':item.type==='daja'?'한자 또는 독음(한글)으로 입력하세요.':'한글 또는 한자로 입력하세요.';
  renderReviewPassage(item);
  const fieldWrap=$('review-input-wrap');fieldWrap.replaceChildren();
  const field=document.createElement(item.type==='herbs'?'textarea':'input');
  field.id='review-answer';field.spellcheck=false;field.autocomplete='off';
  field.setAttribute('aria-label','복습 정답 입력');
  if(item.type!=='herbs'){field.type='text';field.placeholder='정답을 입력하세요';field.className='review-input';}
  else{field.rows=3;field.placeholder='약재 구성 입력';}
  field.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.isComposing&&!e.shiftKey){e.preventDefault();reviewGrade(false);}
  });
  fieldWrap.append(field);
  $('review-feedback').replaceChildren();$('review-feedback').hidden=true;
  $('review-check').hidden=false;$('review-reveal').hidden=false;
  $('review-next').hidden=true;
  $('review-check').disabled=false;$('review-reveal').disabled=false;
  field.disabled=false;
  field.focus({preventScroll:true});
}
function reviewGrade(reveal) {
  const s=reviewSession;if(!s||s.checked||s.index>=s.items.length)return;
  const {item}=s.items[s.index];
  const input=$('review-answer');
  const result=window.__QUIZ_REVIEW_API.grade(item,input.value);
  const correct=!reveal&&result.ok;
  s.checked=true;s.revealed=!!reveal;s.result=result;
  s.seen++;if(correct)s.correct++;else s.wrong++;
  input.disabled=true;
  $('review-check').hidden=true;$('review-reveal').hidden=true;$('review-next').hidden=false;
  $('review-next').textContent=s.index===s.items.length-1?'복습 결과 보기 →':'다음 문제 →';
  const fb=$('review-feedback');fb.hidden=false;
  const banner=document.createElement('div');banner.className='universal-grade-head '+(correct?'grade-right':'grade-wrong');
  const mark=document.createElement('span');mark.className='universal-grade-mark';mark.textContent=correct?'O':'X';mark.setAttribute('aria-hidden','true');
  const status=document.createElement('strong');status.textContent=correct?'정답입니다!':reveal?'정답 확인':'오답입니다';
  banner.append(mark,status);fb.append(banner);
  const h=document.createElement('h4');h.className=correct?'correct':'wrong';
  h.textContent=correct?'정답입니다.':reveal?'정답을 확인했습니다.':'오답입니다.';fb.append(h);
  const ans=document.createElement('p');ans.textContent=`정답: ${item.accepted||item.answer}`;fb.append(ans);
  if(item.reading?.length){const reading=document.createElement('p');reading.className='review-reading';reading.textContent='독음: '+item.reading.join(' / ');fb.append(reading);}
  if(result.missing?.length){const missing=document.createElement('p');missing.textContent='빠뜨린 약재: '+result.missing.join(' · ');fb.append(missing);}
  if(result.extra?.length){const extra=document.createElement('p');extra.textContent='추가 입력: '+result.extra.join(' · ');fb.append(extra);}
  // Do not alter the original quiz's per-mode session. Only append to Firestore stat.
  window.__QUIZ_TRACK_ATTEMPT({key:item.key,label:item.label,group:item.group,correct,revealed:!!reveal});
  $('review-next').focus({preventScroll:true});
  requestAnimationFrame(()=>{
   const el=$('review-feedback');
   if(el&&!el.hidden){
    if(window.__QUIZ_SCROLL_GRADE)window.__QUIZ_SCROLL_GRADE({gradeNode:el,explanationNode:el.querySelector('p')||el});
    else window.scrollTo({top:Math.max(0,window.scrollY+el.getBoundingClientRect().top-100),behavior:'smooth'});
   }
  });
}
function reviewNext() {
  if(!reviewSession?.checked)return;
  reviewSession.index++;reviewSession.checked=false;reviewSession.revealed=false;
  renderReview();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const el=$('review-position');if(el&&!$('review-question').hidden){
      window.scrollTo({top:Math.max(0,window.scrollY+el.getBoundingClientRect().top-95),behavior:'smooth'});
    }
  }));
}
async function exitReview() {
  reviewSession=null;$('review-panel').hidden=true;
  // The client-side stat writes are in-flight; wait for them before refreshing the list.
  if(pendingStats.size)await Promise.allSettled([...pendingStats]);
  await showAnalytics();
  requestAnimationFrame(()=>window.scrollTo(0,lastStatsScroll));
}
$('start-review').onclick=startReview;
$('analytics-sort').onchange=updateStatControls;
$('analytics-min-three').onchange=updateStatControls;
$('analytics-filter').onchange=updateStatControls;
$('review-check').onclick=()=>reviewGrade(false);
$('review-reveal').onclick=()=>reviewGrade(true);
$('review-next').onclick=reviewNext;
$('review-exit').onclick=exitReview;
$('review-back').onclick=exitReview;
$('review-again').onclick=async()=>{await exitReview();startReview();};

$('open-register').onclick=()=>switchRegister(true);
$('open-login').onclick=()=>switchRegister(false);
// Both views stay mounted: switching tabs never rerenders quiz inputs or resets a queue.
function syncStudyNav(){
  const onQuiz=!quizRoot.hidden;
  for(const [id,active] of [['nav-quiz',onQuiz],['nav-stats',!onQuiz]]){
    const button=$(id);
    if(button){button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
  }
}
function navigateToQuiz(){
  if(!authenticatedUid||!quizRoot.hidden)return;
  lastStatsScroll=window.scrollY;
  statsOpen=false;
  $('analytics-panel').hidden=true;$('review-panel').hidden=true;
  quizRoot.hidden=false;syncStudyNav();
  requestAnimationFrame(()=>window.scrollTo(0,lastQuizScroll));
}
async function navigateToStats(){
  if(!authenticatedUid)return;
  if(!quizRoot.hidden)lastQuizScroll=window.scrollY;
  if(reviewSession){
    statsOpen=false;quizRoot.hidden=true;
    $('analytics-panel').hidden=true;$('review-panel').hidden=false;
    syncStudyNav();
    requestAnimationFrame(()=>window.scrollTo(0,lastStatsScroll));
  }else if($('analytics-panel').hidden){
    await showAnalytics();
    requestAnimationFrame(()=>window.scrollTo(0,lastStatsScroll));
  }
}
$('nav-quiz').onclick=navigateToQuiz;
$('nav-stats').onclick=navigateToStats;
$('close-analytics').onclick=navigateToQuiz;
$('open-analytics').onclick=navigateToStats;
$('account-signout').onclick=async()=>{try{await flushProgress();await Promise.all([...pendingStats]);await retryStats();await signOut(auth);location.reload();}catch{syncStatus('저장 실패 · 연결 후 다시 로그아웃해 주세요');}};

if(firebaseConfig.apiKey.startsWith('YOUR_')||firebaseConfig.projectId==='YOUR_PROJECT_ID'){
  showMessage('Firebase 설정 전입니다. firebase-config.js에 프로젝트 설정값을 먼저 입력해 주세요.');
  for(const form of [$('login-form'),$('register-form')])form.querySelector('button[type=submit]').disabled=true;
}else{
  try{
    const app=initializeApp(firebaseConfig);
    auth=getAuth(app);db=getFirestore(app);
    await setPersistence(auth,browserSessionPersistence);
    $('login-form').onsubmit=async e=>{
      e.preventDefault();showMessage('');const form=e.currentTarget;
      const name=normalizeName($('login-name').value);const password=$('login-pass').value;
      if(!approvedDisplayNames.includes(name)){showMessage('승인된 아이디가 아닙니다.');return;}
      setBusy(form,true);
      try{await signInWithEmailAndPassword(auth,nameEmail(name),password);}
      catch(err){showMessage(friendly(err));}
      finally{setBusy(form,false);}
    };
    $('register-form').onsubmit=async e=>{
      e.preventDefault();showMessage('');const form=e.currentTarget;
      const name=normalizeName($('register-name').value);
      const password=$('register-pass').value,confirm=$('register-confirm').value;
      if(!approvedDisplayNames.includes(name)){showMessage('승인된 아이디가 아닙니다.');return;}
      if(password.length<6){showMessage('Firebase 기본 조건에 따라 비밀번호는 6자 이상이어야 합니다.');return;}
      if(password!==confirm){showMessage('비밀번호 확인란이 일치하지 않습니다.');return;}
      setBusy(form,true);registering=true;let created=false;
      try{
        // Firebase Auth는 동일한 이메일의 중복 회원가입을 막습니다.
        // 기존 사전 생성 계정에는 손대지 않고 -first 이메일로 최초 가입합니다.
        const credential=await createUserWithEmailAndPassword(auth,nameEmail(name),password);
        created=true;
        $('register-pass').value='';$('register-confirm').value='';
        registering=false;
        await handleAuthenticated(credential.user);
      }catch(err){
        console.error('회원가입 처리 실패:',err);
        registering=false;
        if(created){
          switchRegister(false);$('login-name').value=name;
          showMessage('계정은 생성되었지만 학습 자료를 불러오지 못했습니다. 로그인 후 관리자에게 문의해 주세요.',true);
        }else showMessage(friendly(err));
      }finally{setBusy(form,false);}
    };
    onAuthStateChanged(auth,async user=>{
      if(registering)return;
      if(!user){if(appLoaded){location.reload();return;}authenticatedUid=null;showGate();return;}
      if(appLoaded&&authenticatedUid&&authenticatedUid!==user.uid){location.reload();return;}
      await handleAuthenticated(user);
    });
  }catch(error){console.error(error);showMessage('Firebase 초기화에 실패했습니다. firebase-config.js 설정을 확인해 주세요.');}
}
