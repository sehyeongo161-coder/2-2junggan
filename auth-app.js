import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, verifyPasswordResetCode, confirmPasswordReset, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const gate = $('account-gate'), quizRoot = $('quiz-root'), toolbar = $('account-toolbar');
let auth, db, authenticatedUid=null, appLoaded=false, registering=false, statsOpen=false;
let currentStats=[];
const approvedDisplayNames = ['고세현','석주형','홍대진','안선웅','박준영','김지원'];

// 사전 승인된 이름에 대응하는 UID/내부 로그인용 가상 이메일을 계산합니다.
// 이름 자체가 비밀번호가 아니며, 승인되지 않은 Firebase 계정은 보안 규칙으로 차단됩니다.
function normalizeName(name){return String(name||'').normalize('NFC').trim().replace(/\s/g,'');}
function nameUid(name){const hex=[...new TextEncoder().encode(normalizeName(name))].map(b=>b.toString(16).padStart(2,'0')).join('');return 'student-'+hex;}
function nameEmail(name){return `${nameUid(name)}@example.com`;}
function showMessage(msg,okay=false){$('auth-message').textContent=msg;$('auth-message').classList.toggle('ok',okay);}
function switchRegister(yes){$('auth-signin').hidden=yes;$('auth-register').hidden=!yes;showMessage('');}
function friendly(error){
  const code=String(error?.code||'');
  if(/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login-credentials/.test(code))return '아이디 또는 비밀번호가 올바르지 않습니다.';
  if(/too-many-requests|resource-exhausted/.test(code))return '잠시 후 다시 시도해 주세요.';
  if(/expired-action-code|invalid-action-code/.test(code))return '초대코드가 만료·사용되었거나 이름이 일치하지 않습니다. 관리자에게 새 코드를 요청해 주세요.';
  if(/weak-password/.test(code))return '비밀번호 보안 조건을 확인해 주세요.';
  if(/permission-denied/.test(code))return '승인되지 않은 사용자이거나 이용이 중지된 계정입니다.';
  return '요청을 처리하지 못했습니다. Firebase 설정 또는 네트워크를 확인해 주세요.';
}
function setBusy(form,busy){for(const b of form.querySelectorAll('button,input'))b.disabled=busy;}
function setAuthenticatedUI(profile){
  gate.hidden=true;toolbar.hidden=false;
  $('account-name').textContent=`${profile.name}님`;
  if(!statsOpen)quizRoot.hidden=false;
}
function showGate(){gate.hidden=false;quizRoot.hidden=true;toolbar.hidden=true;$('analytics-panel').hidden=true;statsOpen=false;}

async function approveUser(user){
  const snap=await getDoc(doc(db,'profiles',user.uid));
  const profile=snap.exists()?snap.data():null;
  if(!profile?.approved||!profile?.active){throw new Error('NOT_APPROVED');}
  if(!approvedDisplayNames.includes(profile.name)||nameUid(profile.name)!==user.uid)throw new Error('INVALID_PROFILE');
  return profile;
}

let saveTimer, saveChain=Promise.resolve(), pendingProgress=new Map();
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
        await setDoc(doc(db,'users',auth.currentUser.uid,'progress',encodeURIComponent(key)),{payload,updatedAt:serverTimestamp()});
      }catch(e){for(const [k,v] of items.slice(i))if(!pendingProgress.has(k))pendingProgress.set(k,v);syncStatus('저장 실패 · 다시 시도');throw e;}
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
  window.__QUIZ_STORAGE={
    getItem(key){return memory.get(key.slice(prefix.length))??null;},
    setItem(key,value){
      const short=key.slice(prefix.length);memory.set(short,value);pendingProgress.set(short,value);
      syncStatus('저장 중…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushProgress().catch(()=>{}),700);
    }
  };
  syncStatus('저장됨');
}
window.addEventListener('beforeunload',e=>{
  if(activeSaves||failedStats.size||pendingProgress.size||pendingStats.size||$('sync-status')?.textContent==='저장 중…'){
    e.preventDefault();e.returnValue='';
  }
});
window.addEventListener('online',()=>{if(pendingProgress.size)flushProgress().catch(()=>{});});
$('sync-status').onclick=async()=>{try{await retryStats();await flushProgress();}catch{syncStatus('저장 실패 · 다시 시도');}};

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
  const script=document.createElement('script');script.textContent=quizScript;document.body.appendChild(script);
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
function renderStats(){
  const area=$('analytics-list');area.replaceChildren();const over=$('analytics-overview');over.replaceChildren();
  const filter=$('analytics-filter')?.value||'all';
  const rows=currentStats.filter(row=>filter==='all'||row.group===filter);
  over.append(metric('누적 채점 수',rows.reduce((sum,x)=>sum+(x.total||0),0)),metric('오답 수',rows.reduce((sum,x)=>sum+(x.wrong||0),0)),metric('정답 보기',rows.reduce((sum,x)=>sum+(x.revealed||0),0)));
  const sorted=[...rows].sort((a,b)=>(b.wrong||0)-(a.wrong||0)||(b.revealed||0)-(a.revealed||0)||a.label.localeCompare(b.label,'ko'));
  if(!sorted.length){const empty=document.createElement('div');empty.className='analytics-empty';empty.textContent='아직 채점 기록이 없습니다.';area.append(empty);return;}
  for(const item of sorted){
    const card=document.createElement('div');card.className='analytics-item';
    const heading=document.createElement('div');heading.className='analytics-item-header';
    const name=document.createElement('span');name.textContent=item.label;
    const count=document.createElement('span');count.className='counts';count.textContent=`오답 ${item.wrong||0}회`;
    heading.append(name,count);
    const detail=document.createElement('small');detail.textContent=`${item.group} · 채점 ${item.total||0}회 · 정답 보기 ${item.revealed||0}회`;
    card.append(heading,detail);area.append(card);
  }
}
async function showAnalytics(){
  if(!authenticatedUid)return;
  statsOpen=true;quizRoot.hidden=true;$('analytics-panel').hidden=false;
  const wrap=$('analytics-list');wrap.textContent='통계를 불러오는 중입니다…';
  $('analytics-message').textContent='';
  try{
    const snapshots=await getDocs(collection(db,'users',authenticatedUid,'errorStats'));
    currentStats=snapshots.docs.map(x=>({id:x.id,...x.data()}));
    let sel=$('analytics-filter');
    if(!sel){sel=document.createElement('select');sel.id='analytics-filter';sel.className='analytics-filter';
      $('analytics-overview').before(sel);sel.onchange=renderStats;}
    const last=sel.value;sel.replaceChildren();
    for(const v of ['all',...new Set(currentStats.map(x=>x.group))]){
      const o=document.createElement('option');o.value=v;o.textContent=v==='all'?'전체 과목·유형':v;sel.append(o);
    }
    if([...sel.options].some(o=>o.value===last))sel.value=last;
    renderStats();
  }catch(error){wrap.replaceChildren();$('analytics-message').textContent='오답 통계를 불러오지 못했습니다. 네트워크와 보안 규칙을 확인해 주세요.';console.error(error);}
}

$('open-register').onclick=()=>switchRegister(true);
$('open-login').onclick=()=>switchRegister(false);
$('close-analytics').onclick=()=>{statsOpen=false;$('analytics-panel').hidden=true;quizRoot.hidden=false;};
$('open-analytics').onclick=showAnalytics;
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
      if(password.length<10||password!==confirm){showMessage('비밀번호를 10자 이상 입력하고 확인란과 일치시켜 주세요.');return;}
      setBusy(form,true);registering=true;let registered=false;
      try{
        let code=$('register-code').value.trim();
        if(code.startsWith('https://'))code=new URL(code).searchParams.get('oobCode')||'';
        const email=await verifyPasswordResetCode(auth,code);
        if(email!==nameEmail(name))throw {code:'auth/invalid-action-code'};
        await confirmPasswordReset(auth,code,password);
        $('register-code').value='';
        registered=true;registering=false;
        // 회원가입에 성공하면 곧바로 본인 이름+비밀번호로 로그인합니다.
        await signInWithEmailAndPassword(auth,nameEmail(name),password);
        $('register-pass').value='';$('register-confirm').value='';
      }catch(err){
        console.error('회원가입 또는 자동 로그인 실패:',err);
        registering=false;
        if(registered){
          switchRegister(false);$('login-name').value=name;
          showMessage('회원가입은 완료되었습니다. 로그인 탭에서 방금 설정한 비밀번호로 로그인해 주세요.',true);
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
