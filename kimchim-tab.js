/* 김침: 기존 로그인 화면 내 독립 과목 탭으로 연결합니다. */
(()=>{const root=document.getElementById('quiz-root'),tab=document.getElementById('tab-kimchim'),panel=document.getElementById('kimchim-panel'),frame=document.getElementById('kimchim-frame');
if(!root||!tab||!panel||!frame)return;
function open(){if(root.hidden)return;for(const s of root.querySelectorAll(':scope > section[role="tabpanel"]'))s.hidden=s!==panel;document.body.dataset.subject='kimchim';
for(const b of root.querySelectorAll('.subject-tabs button')){const on=b===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1}
if(!frame.src||frame.getAttribute('src')===null)frame.src='./kimchim-quiz.html?v=20261026-terms-v1';}
document.addEventListener('click',e=>{const b=e.target.closest?.('.subject-tabs button');if(!b)return;if(b===tab){e.stopImmediatePropagation();open();return;}panel.hidden=true;tab.setAttribute('aria-selected','false');tab.tabIndex=-1},true);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;const d=e.data;if(!d)return;if(d.type==='kimchim-size'){const h=Number(d.height);if(Number.isFinite(h)&&h>200&&h<150000)frame.style.height=(h+20)+'px'}if(panel.hidden||root.hidden)return;if(d.type==='kimchim-focus-grade')window.__QUIZ_SCROLL_GRADE?.({frame,top:Number(d.top),explanationTop:Number(d.explanationTop)});});
document.addEventListener('keydown',e=>{if(root.hidden||panel.hidden||e.repeat||e.isComposing||!['Enter','1','2','3','4'].includes(e.key))return;if(e.target.closest?.('button,input,textarea,select,a'))return;e.preventDefault();frame.contentWindow?.postMessage({type:'kimchim-key',key:e.key},location.origin)});
})();