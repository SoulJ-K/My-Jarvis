(() => {
  'use strict';
  const data = window.JARVIS_SLIDES;
  const stage = document.getElementById('stage');
  const jump = document.getElementById('jump');
  let index = 0;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = 0;
  let timerStart = null;
  let total = 0;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mmss = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  data.forEach((slide, i) => {
    slide.start = total; total += slide.seconds;
    const section = document.createElement('section');
    section.className = `slide ${i === 0 ? 'hero' : ''}`;
    section.dataset.theme = slide.theme;
    section.id = `slide-${i + 1}`;
    section.setAttribute('aria-labelledby', `title-${i + 1}`);
    section.innerHTML = `<header class="slide-header"><h2 id="title-${i+1}">${escape(slide.title)}</h2><span class="chapter">JARVIS PET</span></header><div class="slide-body">${slide.body}</div><footer class="slide-footer"><span class="foot-caption">${escape(slide.caption || 'Jarvis Pet · 개발 중인 개인용 macOS 프로젝트')}</span><span class="page-no">${String(i+1).padStart(2,'0')} / 09</span></footer><div class="slide-progress" style="width:${(i+1)/data.length*100}%"></div>`;
    section.querySelectorAll('img[data-poster]').forEach(img => { img.dataset.animation = img.getAttribute('src'); img.src = img.dataset.poster; });
    const printedSources=document.createElement('span');
    printedSources.className='print-sources';
    const sourceLabels={'Jarvis_Pet_PRD.md':'PRD','Jarvis_Pet_Technical_Design.md':'기술 설계','Jarvis_Pet_Development_Log.md':'개발 기록','Jarvis_Pet_Character_and_Growth_Design.md':'생활 규칙','Jarvis_Pet_Decision_Log.md':'결정 기록'};
    slide.sources.forEach(source=>{
      const a=document.createElement('a'); a.href=source.href;
      a.textContent=sourceLabels[source.href.split('/').pop()] || (source.href.includes('claude.com')?'Claude':source.href.includes('geminicli.com')?'Gemini':source.href.includes('openai.com')?'OpenAI':source.title);
      a.title=source.title; printedSources.append(a);
    });
    section.querySelector('.slide-footer').insertBefore(printedSources,section.querySelector('.page-no'));
    section.querySelectorAll('img[data-poster]').forEach(img=>{
      const label=document.createElement('span');label.className='print-still-label';label.textContent=' · PDF 정지 화면';
      img.closest('figure').querySelector('figcaption').append(label);
    });
    stage.append(section);
    const option = document.createElement('option'); option.value=i; option.textContent=`${i+1} / ${data.length}`; option.setAttribute('aria-label',`${i+1}번 ${slide.title.replace('\n',' ')}`); jump.append(option);
  });
  const slides = [...stage.querySelectorAll('.slide')];
  const motion = document.getElementById('motion');
  function updateMedia() {
    slides.forEach((slide, i) => slide.querySelectorAll('img[data-poster]').forEach(img => {
      const desired = i === index && !paused ? img.dataset.animation : img.dataset.poster;
      if(img.getAttribute('src') !== desired) img.src = desired;
    }));
    const hasMedia = Boolean(slides[index].querySelector('img[data-poster]'));
    motion.hidden = !hasMedia;
    document.getElementById('replay').hidden = !hasMedia || paused;
    motion.textContent = paused ? '시연 재생' : '시연 멈춤';
    motion.setAttribute('aria-pressed',String(paused));
  }
  function show(value, updateHash=true) {
    const parsed = Number(value);
    index = Number.isFinite(parsed) ? Math.min(data.length-1,Math.max(0,Math.trunc(parsed))) : 0;
    slides.forEach((slide,i) => { slide.classList.toggle('active',i===index); slide.setAttribute('aria-hidden',String(i!==index)); slide.inert=i!==index; });
    jump.value=String(index);
    document.getElementById('prev').disabled=index===0;
    document.getElementById('next').disabled=index===data.length-1;
    document.title=`${index+1}. ${data[index].title.replace('\n',' ')} · Jarvis Pet`;
    document.getElementById('announcement').textContent=`${index+1} / ${data.length}: ${data[index].title}`;
    if(updateHash && location.hash!==`#${index+1}`) history.replaceState(null,'',`#${index+1}`);
    updateMedia();
    if(window.innerWidth<=760) window.scrollTo({top:0,behavior:'instant'});
  }
  function resize() {
    const view=document.getElementById('viewport');
    document.documentElement.style.setProperty('--scale',String(Math.min(view.clientWidth/1280,view.clientHeight/720)));
  }
  const notes=document.getElementById('notes');
  function showNotes() {
    const slide=data[index];
    document.getElementById('notes-title').textContent=`${index+1}. ${slide.title}`;
    document.getElementById('notes-time').textContent=`권장 ${slide.seconds}초 · 전체 계획 ${mmss(slide.start)} ~ ${mmss(slide.start+slide.seconds)} / 10:00`;
    document.getElementById('notes-content').textContent=slide.notes;
    const details=document.getElementById('notes-details');
    details.hidden=!slide.referenceNotes; details.open=false;
    document.getElementById('notes-reference').textContent=slide.referenceNotes || '';
    const list=document.getElementById('sources'); list.replaceChildren();
    slide.sources.forEach(source=>{ const li=document.createElement('li'), a=document.createElement('a'); a.href=source.href;a.textContent=source.title;a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li); });
    notes.showModal();
  }
  async function fullscreen() {
    try { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { document.getElementById('announcement').textContent='전체 화면 전환을 지원하지 않는 환경입니다. 브라우저의 전체 화면 기능을 이용해 주세요.'; }
  }
  function toggleTimer() {
    if(timerStart!==null) { elapsed+=performance.now()-timerStart;timerStart=null; }
    else timerStart=performance.now();
    updateTimer();
  }
  function updateTimer() {
    const seconds=Math.floor((elapsed+(timerStart===null?0:performance.now()-timerStart))/1000);
    const timer=document.getElementById('timer');
    timer.innerHTML=`${timerStart===null?(seconds?'계속':'시작'):'정지'} <span id="elapsed">${mmss(seconds)}</span>`;
    timer.setAttribute('aria-label',`발표 타이머 ${timerStart===null?'시작':'일시정지'}, ${mmss(seconds)} 경과`);
    document.body.classList.toggle('over-time',seconds>=600);
  }
  document.getElementById('prev').addEventListener('click',()=>show(index-1));
  document.getElementById('next').addEventListener('click',()=>show(index+1));
  jump.addEventListener('change',()=>show(jump.value));
  document.getElementById('notes-button').addEventListener('click',showNotes);
  document.getElementById('close-notes').addEventListener('click',()=>notes.close());
  document.getElementById('fullscreen').addEventListener('click',fullscreen);
  document.getElementById('timer').addEventListener('click',toggleTimer);
  document.getElementById('reset').addEventListener('click',()=>{elapsed=0;timerStart=null;updateTimer();});
  motion.addEventListener('click',()=>{paused=!paused;updateMedia();});
  document.getElementById('replay').addEventListener('click',()=>{
    slides[index].querySelectorAll('img[data-animation]').forEach(img=>{img.src=img.dataset.poster;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!paused)img.src=img.dataset.animation;}));});
  });
  document.addEventListener('fullscreenchange',()=>{document.getElementById('fullscreen').textContent=document.fullscreenElement?'전체 화면 종료':'전체 화면';resize();});
  window.addEventListener('hashchange',()=>show(Number(location.hash.slice(1))-1,false));
  window.addEventListener('resize',resize);
  window.addEventListener('beforeprint',()=>{
    document.title='Jarvis Pet · 10분 발표';
    slides.forEach(slide=>{
      slide.inert=false;slide.setAttribute('aria-hidden','false');
      slide.querySelectorAll('img[data-poster]').forEach(img=>{img.src=img.dataset.poster;});
    });
  });
  window.addEventListener('afterprint',()=>show(index,false));
  document.addEventListener('keydown',event=>{
    if(notes.open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
    if(event.target.tagName==='BUTTON' && [' ','Enter'].includes(event.key)) return;
    if(['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)){event.preventDefault();show(index+1);}
    else if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)){event.preventDefault();show(index-1);}
    else if(event.key==='Home'){event.preventDefault();show(0);}
    else if(event.key==='End'){event.preventDefault();show(data.length-1);}
    else if(event.key.toLowerCase()==='n'){event.preventDefault();showNotes();}
    else if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}
    else if(event.key.toLowerCase()==='t'){event.preventDefault();toggleTimer();}
  });
  setInterval(updateTimer,1000);
  show(Number(location.hash.slice(1)||'1')-1);
  resize();
})();
