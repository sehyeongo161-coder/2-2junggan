/* 희침 두침요법: 기존 과목·로그인·학습 저장 브리지를 재사용합니다. */
(()=>{
 const root=document.getElementById('quiz-root'),tab=document.getElementById('tab-heechim');
 const panel=document.getElementById('heechim-panel'),frame=document.getElementById('heechim-frame');
 if(!root||!tab||!panel||!frame)return;
 function open(){
  if(root.hidden)return;
  for(const section of root.querySelectorAll(':scope > section[role="tabpanel"]'))section.hidden=section!==panel;
  document.body.dataset.subject='heechim';
  for(const b of root.querySelectorAll('.subject-tabs button')){const on=b===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  if(!frame.getAttribute('src'))frame.src='./heechim-quiz.html?v=20261026-mcq-shuffle-v2';
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('.subject-tabs button');if(!b)return;
  if(b===tab){e.stopImmediatePropagation();open();return;}
  panel.hidden=true;tab.setAttribute('aria-selected','false');tab.tabIndex=-1;
 },true);
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
  const d=e.data;if(!d)return;
  if(d.type==='heechim-size'){const h=Number(d.height);if(Number.isFinite(h)&&h>=200&&h<100000)frame.style.height=(h+28)+'px';}
  if(panel.hidden||root.hidden)return;
  if(d.type==='heechim-focus-question'){const top=Number(d.top);if(Number.isFinite(top)&&top>=0&&top<100000)window.scrollTo({top:Math.max(0,frame.getBoundingClientRect().top+scrollY+top-85),behavior:'smooth'});}
  if(d.type==='heechim-focus-grade')window.__QUIZ_SCROLL_GRADE?.({frame,top:Number(d.top),explanationTop:Number(d.explanationTop)});
 });
 document.addEventListener('keydown',e=>{
  if(root.hidden||panel.hidden||e.repeat||e.isComposing||!['Enter','1','2','3','4'].includes(e.key))return;
  if(e.target.closest?.('button,input,textarea,select,a'))return;
  e.preventDefault();frame.contentWindow?.postMessage({type:'heechim-key',key:e.key},location.origin);
 });
 window.__OPEN_HEECHIM_QUESTION=id=>{if(!/^heechim-scalp-\d{2}$/.test(id)||root.hidden)return;open();const send=()=>frame.contentWindow?.postMessage({type:'heechim-open-question',id},location.origin);if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.URL!=='about:blank')send();else frame.addEventListener('load',send,{once:true});};
})();
