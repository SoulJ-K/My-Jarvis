(async function () {
  'use strict';
  const G = window.AppearanceGeometry;
  const families = window.AppearanceAssets;
  const poseNames = { stand: '기본', sit: '앉기', sleep: '수면' };
  const area = { width: 420, height: 300 };
  const status = document.querySelector('#status');
  const sizeInput = document.querySelector('#size');
  const backgroundInput = document.querySelector('#background');
  const boundsInput = document.querySelector('#bounds');
  const states = [];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const facingNames = { front: '정면', left: '왼쪽', right: '오른쪽' };
  const loaded = new Map();
  try {
    // Decode everything before enabling pose changes: no flicker or partial image swaps.
    const assets = families.flatMap(f => [...Object.values(f.poses), ...Object.values(f.views || {}).flatMap(Object.values)]);
    await Promise.all([...new Map(assets.map(a => [a.file, a])).values()].map(async asset => {
      const img = new Image(); img.src = asset.file; await img.decode();
      const buffer = document.createElement('canvas');
      buffer.width = img.naturalWidth; buffer.height = img.naturalHeight;
      const ctx = buffer.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      loaded.set(asset.file, { img, pixels: ctx.getImageData(0, 0, buffer.width, buffer.height).data });
    }));
  } catch {
    status.textContent = '이미지를 읽지 못했습니다. README의 로컬 시험 주소로 열어 주세요. 실제 펫에는 영향이 없습니다.';
    return;
  }
  function paintAsset(ctx, family, pose, rect, facing = 'right') {
    const asset = G.assetFor(family, pose, facing);
    ctx.drawImage(loaded.get(asset.file).img, ...asset.bounds, rect.x, rect.y, rect.width, rect.height);
  }
  function render(state) {
    const ctx = state.canvas.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const dark = backgroundInput.value === 'dark';
    ctx.fillStyle = dark ? '#292d37' : '#eeede7'; ctx.fillRect(0, 0, 420, 300);
    const direction = state.facing.direction;
    const facing = state.facing.phase === 'head' && state.pose === 'stand' ? `head-${direction}` : direction;
    const size = G.dimensions(state.family, state.pose, Number(sizeInput.value), facing);
    // Preserve an edge contact as perspective changes silhouette width.
    if (state.body && Math.abs(state.body.x) < .001) state.foot.x = size.width / 2;
    else if (state.body && Math.abs(state.body.x + state.body.width - 420) < .001) state.foot.x = 420 - size.width / 2;
    const body = G.bodyAt(state.foot, size, area);
    state.foot = { x: body.x + body.width / 2, y: body.y + body.height };
    state.body = body;
    ctx.font = '12px -apple-system, sans-serif';
    const { orb, label } = G.accessories(body, area, ctx.measureText(state.family.name).width + 16);
    state.orb = orb; state.label = label;
    if (state.focusKind === 'food') {
      const candidates = [
        { x: body.x - 34, y: body.y + body.height - 20 },
        { x: body.x + body.width + 12, y: body.y + body.height - 20 },
        { x: body.x + body.width / 2 - 9, y: body.y - 30 },
        { x: body.x + body.width / 2 - 9, y: body.y + body.height + 34 }
      ].map(p => G.contain({ ...p, width: 18, height: 18 }, area));
      state.food = candidates.find(r => ![body, orb, label].some(o => G.intersects(r, o, 4)));
      if (state.food) {
        ctx.fillStyle = '#e5bf79'; ctx.strokeStyle = '#876831'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(state.food.x, state.food.y, 18, 18, 5); ctx.fill(); ctx.stroke();
      }
    } else state.food = null;
    // Shadows remain inside the visible body's footprint, including at screen edges.
    ctx.fillStyle = dark ? '#1e202966' : '#57604722';
    ctx.beginPath(); ctx.ellipse(body.x + body.width / 2, body.y + body.height - 2, body.width * .35, 2, 0, 0, Math.PI * 2); ctx.fill();
    paintAsset(ctx, state.family, state.pose, body, facing);
    const gradient = ctx.createRadialGradient(orb.x + 7, orb.y + 6, 1, orb.x + 11, orb.y + 11, 11);
    gradient.addColorStop(0, '#fffde9'); gradient.addColorStop(.5, '#f1dba0'); gradient.addColorStop(1, '#bcaa76');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(orb.x + 11, orb.y + 11, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark ? '#444b58' : '#ffffff';
    ctx.beginPath(); ctx.roundRect(label.x, label.y, label.width, label.height, 8); ctx.fill();
    ctx.fillStyle = dark ? '#ffffff' : '#414a3b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(state.family.name, label.x + label.width / 2, label.y + label.height / 2);
    if (boundsInput.checked) {
      ctx.strokeStyle = dark ? '#90befb' : '#3e6a9d'; ctx.lineWidth = .7; ctx.setLineDash([3, 2]);
      ctx.strokeRect(body.x, body.y, body.width, body.height); ctx.setLineDash([]);
    }
    state.canvas.setAttribute('aria-label', `${state.family.name}, ${poseNames[state.pose]}, ${facingNames[direction]}. 방향키로 이동, Enter로 클릭 확인.`);
    state.article.querySelectorAll('button[data-facing]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.facing === direction));
      button.disabled = state.pose === 'sleep';
    });
    state.article.querySelector('.measurement').textContent = `보이는 외형 ${body.width.toFixed(1)} × ${body.height.toFixed(1)}px · 시험 영역 420 × 300px`;
    state.canvas.dataset.pose = state.pose;
    state.canvas.dataset.facing = direction;
    state.canvas.dataset.phase = state.facing.phase;
    state.canvas.dataset.activity = state.facing.activity;
    state.canvas.dataset.moving = String(Boolean(state.moving));
    state.canvas.dataset.food = JSON.stringify(state.food);
    const activityNames = { rest: '쉬는 중 · 가끔 주변을 살펴요', manual: '방향 비교 중', sleep: '수면 · 방향 유지', travel: '고개 → 몸 → 이동 순서 시험', food: '먹이를 바라보는 중 · 섭취 동작은 미연결', orb: '구슬을 바라보는 중 · 놀이 동작은 미연결' };
    state.article.querySelector('.activity-status').textContent = activityNames[state.facing.activity];
    state.article.querySelectorAll('[data-action]').forEach(b => b.disabled = state.pose === 'sleep');
    state.canvas.dataset.asset = G.assetFor(state.family, state.pose, facing).file;
    state.canvas.dataset.foot = JSON.stringify(state.foot);
    state.canvas.dataset.family = state.family.id;
    state.canvas.dataset.body = JSON.stringify(body);
    state.canvas.dataset.orb = JSON.stringify(orb);
    state.canvas.dataset.label = JSON.stringify(label);
  }
  function point(event, canvas) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * 420 / r.width, y: (event.clientY - r.top) * 300 / r.height };
  }
  function cancelMotion(state) {
    state.motionToken = (state.motionToken || 0) + 1;
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = null; state.moving = false;
  }
  function focusTarget(state) {
    if (!state.focusKind || state.pose === 'sleep') return;
    render(state);
    const target = state.focusKind === 'food' ? state.food : state.orb;
    if (target) state.facing.focus(state.focusKind, target.x + target.width / 2 - state.foot.x);
  }
  function finishGesture(state) { state.facing.stop(); if (state.focusKind) focusTarget(state); render(state); }
  function travel(state) {
    if (state.pose === 'sleep' || state.drag || state.focusKind) return;
    cancelMotion(state);
    state.pose = 'stand';
    state.article.querySelectorAll('button[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === 'stand')));
    const token = state.motionToken, from = { ...state.foot };
    const toX = from.x >= 210 ? 110 : 310;
    state.facing.travel(toX - from.x, () => {
      if (token !== state.motionToken) return;
      if (motion.matches) { state.body = null; state.foot.x = toX; render(state); finishGesture(state); return; }
      state.moving = true;
      const start = performance.now(), duration = Math.max(1200, Math.abs(toX - from.x) * 22);
      const step = now => {
        if (token !== state.motionToken) return;
        const t = Math.min(1, (now - start) / duration), smooth = t * t * (3 - 2 * t);
        state.body = null; state.foot.x = from.x + (toX - from.x) * smooth; render(state);
        if (t < 1) state.frame = requestAnimationFrame(step);
        else { state.frame = null; state.moving = false; finishGesture(state); render(state); }
      };
      state.frame = requestAnimationFrame(step);
    });
  }
  for (const family of families) {
    const article = document.querySelector('#trial-template').content.firstElementChild.cloneNode(true);
    article.querySelector('h2').textContent = family.name;
    const canvas = article.querySelector('canvas');
    const state = { family, article, canvas, pose: 'stand', foot: { x: 210, y: 210 }, drag: null };
    state.facing = new window.AppearanceFacing(() => render(state), {
      reduced: () => motion.matches, idleLooks: () => !document.hidden,
      canAnticipate: () => state.pose === 'stand'
    });
    states.push(state);
    article.querySelectorAll('button[data-pose]').forEach(button => button.addEventListener('click', () => {
      cancelMotion(state); state.focusKind = null;
      state.pose = button.dataset.pose;
      state.facing.pose(state.pose === 'sleep');
      article.querySelectorAll('button[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      render(state); status.textContent = `${family.name} · ${poseNames[state.pose]}`;
    }));
    article.querySelectorAll('button[data-facing]').forEach(button => button.addEventListener('click', () => {
      cancelMotion(state); state.focusKind = null; state.facing.select(button.dataset.facing); render(state);
    }));
    article.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      if (state.pose === 'sleep' || state.drag) return;
      const action = button.dataset.action;
      if (action === 'travel') {
        if (state.focusKind) { status.textContent = '대상을 보고 있어요. 쉬기를 누른 뒤 이동을 확인해 주세요.'; return; }
        travel(state); return;
      }
      cancelMotion(state);
      state.focusKind = action === 'food' || action === 'orb' ? action : null;
      if (state.focusKind) focusTarget(state); else state.facing.rest();
      render(state);
    }));
    article.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => {
      const [x, y] = button.dataset.place.split(',').map(Number);
      cancelMotion(state);
      state.facing.begin(); state.facing.move(x * 420 - state.foot.x);
      const size = G.dimensions(family, state.pose, Number(sizeInput.value), state.facing.direction);
      state.body = null;
      state.foot = { x: size.width / 2 + (420 - size.width) * x, y: size.height + (300 - size.height) * y };
      render(state); finishGesture(state);
    }));
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || state.drag) return;
      const p = point(event, canvas), key = state.facing.phase === 'head' && state.pose === 'stand' ? `head-${state.facing.direction}` : state.facing.direction;
      const asset = G.assetFor(family, state.pose, key), data = loaded.get(asset.file);
      if (!G.alphaHit(p.x, p.y, state.body, asset.bounds, data.pixels, data.img.naturalWidth)) return;
      cancelMotion(state);
      state.facing.begin();
      state.drag = { id: event.pointerId, start: p, lastX: p.x, foot: { ...state.foot }, moved: false };
      canvas.setPointerCapture(event.pointerId); canvas.focus(); event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      const drag = state.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const p = point(event, canvas);
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      state.facing.move(p.x - drag.lastX); drag.lastX = p.x;
      state.body = null;
      state.foot = { x: drag.foot.x + dx, y: drag.foot.y + dy }; render(state);
    });
    const cancelDrag = () => { if (state.drag) { state.drag = null; finishGesture(state); } };
    canvas.addEventListener('pointerup', event => {
      const drag = state.drag;
      if (!drag || drag.id !== event.pointerId) return;
      state.drag = null;
      finishGesture(state);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      status.textContent = drag.moved ? `${family.name} 이동 완료` : `${family.name} 몸 클릭 확인`;
    });
    canvas.addEventListener('pointercancel', cancelDrag);
    canvas.addEventListener('lostpointercapture', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    canvas.addEventListener('keydown', event => {
      const steps = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
      if (steps[event.key]) {
        cancelMotion(state);
        event.preventDefault(); state.facing.begin(); state.facing.move(steps[event.key][0]);
        state.body = null;
        state.foot.x += steps[event.key][0]; state.foot.y += steps[event.key][1]; render(state); finishGesture(state);
      } else if (event.key === 'Enter') { status.textContent = `${family.name} 몸 클릭 확인`; }
    });
    document.querySelector('#trials').append(article); render(state); state.facing.rest();
    for (const facing of ['left', 'front', 'right']) {
      const pose = 'stand';
      const card = document.createElement('div'); card.className = 'pose-card';
      const preview = document.createElement('canvas'); preview.width = 360; preview.height = 280;
      preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', `${family.name} ${facingNames[facing]} 확대 비교`);
      const ctx = preview.getContext('2d'); ctx.scale(2, 2);
      const size = G.dimensions(family, pose, 96, facing);
      paintAsset(ctx, family, pose, { x: (180 - size.width) / 2, y: 125 - size.height, ...size }, facing);
      const caption = document.createElement('p'); caption.textContent = `${family.name} · ${facingNames[facing]}`;
      card.append(preview, caption); document.querySelector('#contact-sheet').append(card);
    }
  }
  for (const input of [sizeInput, backgroundInput, boundsInput]) input.addEventListener('change', () => states.forEach(render));
  motion.addEventListener('change', () => { if (motion.matches) states.forEach(s => { cancelMotion(s); if (!s.drag) finishGesture(s); }); });
  document.addEventListener('visibilitychange', () => states.forEach(s => {
    if (document.hidden) { cancelMotion(s); s.facing.cancel(); }
    else if (s.focusKind) focusTarget(s); else if (!s.drag) s.facing.stop();
  }));
  window.addEventListener('pagehide', () => states.forEach(s => { cancelMotion(s); s.facing.dispose(); }), { once: true });
  status.textContent = '두 시험 아기가 준비됐습니다. 자세를 골라 비교해 보세요.';
  document.documentElement.dataset.ready = 'true';
})();
