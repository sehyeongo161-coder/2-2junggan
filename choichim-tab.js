/* 최침 1차: 기존 로그인·계정 저장 브리지를 공유합니다. */
(()=>{
 'use strict';
 const root=document.getElementById('quiz-root'),tab=document.getElementById('tab-choichim');
 const panel=document.getElementById('choichim-panel'),frame=document.getElementById('choichim-frame');
 if(!root||!tab||!panel||!frame)return;
 const style=document.createElement('style');
 style.textContent='body[data-subject="choichim"]{--accent:#8b5545;--tint:#f7eee8;--line:#e7d4c8;--muted:#876f64}';
 document.head.append(style);
 function open(){
  if(root.hidden)return;
  for(const section of root.querySelectorAll(':scope > section[role="tabpanel"]'))section.hidden=section!==panel;
  document.body.dataset.subject='choichim';
  for(const b of root.querySelectorAll('.subject-tabs button')){const on=b===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  if(!frame.getAttribute('src'))frame.src='./choichim-quiz.html?v=20261029-written-self-grade-v2';
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('.subject-tabs button');if(!b)return;
  if(b===tab){e.stopImmediatePropagation();open();return;}
  panel.hidden=true;tab.setAttribute('aria-selected','false');tab.tabIndex=-1;
 },true);
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
  const d=e.data;if(!d)return;
  if(d.type==='choichim-size'){const h=Number(d.height);if(Number.isFinite(h)&&h>=200&&h<150000)frame.style.height=(h+28)+'px';}
  if(panel.hidden||root.hidden)return;
  if(d.type==='choichim-focus-question'){const top=Number(d.top);if(Number.isFinite(top)&&top>=0&&top<150000)window.scrollTo({top:Math.max(0,frame.getBoundingClientRect().top+scrollY+top-85),behavior:'smooth'});}
  if(d.type==='choichim-focus-grade')window.__QUIZ_SCROLL_GRADE?.({frame,top:Number(d.top),explanationTop:Number(d.explanationTop)});
 });
 document.addEventListener('keydown',e=>{
  if(root.hidden||panel.hidden||e.repeat||e.isComposing||!['Enter','1','2','3','4','5','o','O','x','X'].includes(e.key))return;
  if(e.target.closest?.('button,input,textarea,select,a'))return;
  e.preventDefault();frame.contentWindow?.postMessage({type:'choichim-key',key:e.key},location.origin);
 });
 window.__OPEN_CHOICHIM_QUESTION=id=>{
  if(!/^CC-\d{3}$/.test(id)||root.hidden)return;
  open();
  const send=()=>frame.contentWindow?.postMessage({type:'choichim-open-question',id},location.origin);
  if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.URL!=='about:blank')send();else frame.addEventListener('load',send,{once:true});
 };
})();
