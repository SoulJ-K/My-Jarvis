(async function () {
  'use strict';
  const config = await window.appearanceTrial.read();
  const family = window.AppearanceAssets.find(f => f.id === config.family);
  if (!family) throw new Error('UNKNOWN_TRIAL_FAMILY');
  const G = window.AppearanceGeometry, egg = document.querySelector('#egg');
  const orb = document.querySelector('#emotion-orb'), label = document.querySelector('#pet-name');
  const food = document.querySelector('#food'), motion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas'); canvas.className = 'shell'; canvas.setAttribute('aria-hidden','true');
  egg.querySelector('.shell').replaceWith(canvas);
  const images = new Map();
  for (const a of [...Object.values(family.poses), ...Object.values(family.views).flatMap(Object.values)]) {
    const img = new Image(); img.src = 'appearance/' + a.file; await img.decode();
    const c = document.createElement('canvas'); c.width=img.width; c.height=img.height;
    const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
    images.set(a.file,{img,pixels:ctx.getImageData(0,0,c.width,c.height).data});
  }
  let state, pose='stand', asset, rect, frameKey='', pointer, lastScreenX=0, mode='', level=-1;
  const facing = new window.AppearanceFacing(draw, {reduced:()=>motion.matches,
    idleLooks:()=>!document.hidden && !state?.attention.level, canAnticipate:()=>pose==='stand'});
  async function draw() {
    const view=pose==='sleep'?'right':facing.phase==='head'?`head-${facing.direction}`:facing.direction;
    const next=G.assetFor(family,pose,view), size=G.dimensions(family,pose,73.6,view);
    const key=pose+':'+view;
    asset=next; rect={x:52-size.width/2,y:92-size.height,...size};
    canvas.width=Math.ceil(size.width*4); canvas.height=Math.ceil(size.height*4);
    Object.assign(canvas.style,{left:rect.x+'px',top:rect.y+'px',width:size.width+'px',height:size.height+'px'});
    const ctx=canvas.getContext('2d');ctx.drawImage(images.get(next.file).img,...next.bounds,0,0,canvas.width,canvas.height);
    const urgency=Number(egg.dataset.attention||0);
    if(urgency){ctx.globalCompositeOperation='source-atop';ctx.fillStyle=urgency===2?'rgba(245,42,28,.68)':'rgba(231,110,87,.28)';ctx.fillRect(0,0,canvas.width,canvas.height);}
    egg.dataset.appearance=config.family;egg.dataset.appearancePose=pose;egg.dataset.facing=facing.direction;egg.dataset.facingPhase=facing.phase;
    egg.dataset.appearanceAsset=next.file;
    if(frameKey!==key){frameKey=key;await window.appearanceTrial.frame(pose,view);}
    document.documentElement.dataset.appearanceReady='true';
  }
  function update(s) {
    if(!s || state && s.revision<state.revision)return;state=s;
    const nextPose=s.behavior==='sleeping'?'sleep':s.behavior==='drowsy'?'sit':'stand';
    if(nextPose!==pose){pose=nextPose;facing.pose(pose==='sleep');draw();}
    if(level!==s.attention.level){level=s.attention.level;draw();}
    const nextMode=s.behavior==='sleeping'?'sleep':pointer!==undefined||s.dragging?'drag':s.meal?'food':s.social.motion==='play-orb'?'orb':s.attentionAct||s.social.motion==='chase'?'moving':'rest';
    if(nextMode!==mode){
      mode=nextMode;
      if(mode==='sleep')facing.pose(true);
      else if(mode==='drag')facing.begin();
      else if(mode==='food')facing.focus('food',(s.meal?.x??220)-s.position.x-52);
      else if(mode==='orb'){const b=orb.getBoundingClientRect(),e=egg.getBoundingClientRect();facing.focus('orb',b.x+b.width/2-e.x-52);}
      else if(mode==='moving'){facing.cancel();facing.turn(egg.dataset.direction==='left'?'left':'right');}
      else if(mode==='rest'){facing.sleeping=false;facing.stop();}
    }
  }
  function opaque(event) {
    if(!asset)return false;
    const b=canvas.getBoundingClientRect();
    return G.alphaHit(event.clientX,event.clientY,{x:b.x,y:b.y,width:b.width,height:b.height},asset.bounds,images.get(asset.file).pixels,images.get(asset.file).img.width);
  }
  // Capture before the ordinary renderer: transparent sprite pixels never start a gesture.
  window.addEventListener('pointerdown',e=>{
    if(!e.target.closest('#egg'))return;
    if(!opaque(e)){e.stopImmediatePropagation();window.petWindow.hover(false);return;}
    if(e.button===0){pointer=e.pointerId;lastScreenX=e.screenX;facing.begin();}
  },true);
  window.addEventListener('pointermove',e=>{
    if(pointer===e.pointerId){facing.move(e.screenX-lastScreenX);lastScreenX=e.screenX;return;}
    if(e.target.closest('#egg')&&!opaque(e)){e.stopImmediatePropagation();window.petWindow.hover(false);}
  },true);
  const released=()=>{if(pointer!==undefined){pointer=undefined;facing.stop();mode='';if(state)update({...state,dragging:false});}};
  window.addEventListener('pointerup',released);window.addEventListener('pointercancel',released);window.addEventListener('blur',released);
  const unsubscribe=window.babyLife.subscribe(update);
  const direction=window.babyLife.onDirection(d=>{
    if(mode==='moving' && !facing.sleeping && facing.direction!==d){facing.cancel();facing.turn(d);}
  });
  await window.babyLife.read().then(update);await draw();if(mode==='rest')facing.rest();
  let raf;
  function layout(){
    const b=canvas.getBoundingClientRect(),e=egg.getBoundingClientRect();
    const placed=G.accessories({x:b.x,y:b.y,width:b.width,height:b.height},{width:420,height:300},Math.min(120,label.offsetWidth||72));
    Object.assign(orb.style,{left:placed.orb.x-e.x+'px',top:placed.orb.y-e.y+'px'});
    Object.assign(label.style,{left:placed.label.x+placed.label.width/2-e.x+'px',top:placed.label.y-e.y+'px'});
    orb.style.setProperty('--trial-orb-lift',placed.orb.y>=4?'-3px':'0px');
    const sleep=document.querySelector('#sleep-symbol');
    sleep.style.left=Math.min(396,Math.max(4,b.x+b.width-10))-e.x+'px';
    sleep.style.top=Math.max(4,b.y-24)-e.y+'px';
    if(!food.hidden && state?.meal && state.behavior==='eating'){
      // Lower face without drawing a mouth. Visual position only; the saved meal stays intact.
      food.style.left=(b.x+b.width*(facing.direction==='left'?.30:facing.direction==='right'?.80:.55)-22)+'px';
      food.style.top=(b.y+b.height*.80-22)+'px';
    }
    raf=requestAnimationFrame(layout);
  }layout();
  motion.addEventListener('change',()=>{if(motion.matches){facing.cancel();if(mode==='rest')facing.rest();else if(state){mode='';update(state);}}});
  window.addEventListener('unload',()=>{unsubscribe();direction();facing.dispose();cancelAnimationFrame(raf);},{once:true});
})().catch(()=>{document.querySelector('#save-status').textContent='시험 외형을 읽지 못했습니다. 시험 앱을 종료하고 다시 실행해 주세요.';});
