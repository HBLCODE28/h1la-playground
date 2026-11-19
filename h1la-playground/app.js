(() => {
  'use strict';
  const projects = Array.isArray(window.PROJECTS) ? window.PROJECTS : [];
  const stage = document.getElementById('playground');
  const layer = document.getElementById('blobs-layer');
  const list = document.getElementById('projects-list');
  const overlay = document.getElementById('project-overlay');
  const bg = document.getElementById('overlay-blob');
  const inner = document.getElementById('overlay-inner');
  const closeButton = document.getElementById('overlay-close');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shapes = [];
  const colors = ['#D88180', '#CAD182', '#F7B1B0', '#FEEAC7', '#C9A17C'];
  const radii = [
    '52% 48% 39% 61% / 53% 35% 65% 47%',
    '39% 61% 54% 46% / 61% 43% 57% 39%',
    '58% 42% 62% 38% / 44% 55% 45% 56%',
    '46% 54% 36% 64% / 63% 42% 58% 37%',
    '61% 39% 47% 53% / 52% 62% 38% 48%'
  ];
  let active = null, lastFocus = null, closing = false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isSafeUrl = value => {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol); }
    catch { return false; }
  };
  const escapeAttr = value => String(value).replace(/[&"'<>]/g, c => ({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[c]));

  // Tabler Icons names are sourced from project.icon or fixed UI controls.
  // Only lowercase, hyphenated names are accepted before class creation.
  function makeIcon(name) {
    const icon = document.createElement('i');
    const safeName = /^[a-z0-9-]+$/.test(name) ? name : 'sparkles';
    icon.className = `ti ti-${safeName}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function addAboutCatAnimation() {
    const blob = document.querySelector('.about-blob');
    if (!blob || blob.querySelector('.about-cat-animation')) return;
    blob.querySelector('.about-cat-icon')?.classList.add('about-cat-source');
    const animation = document.createElement('span');
    animation.className = 'about-cat-animation';
    animation.setAttribute('aria-hidden', 'true');
    // Keep the cat's face and body still; animate only the separate tail layer.
    [
      ['assets/images/cat-body.png', 'about-cat-body'],
      ['assets/images/cat-tail.png', 'about-cat-tail']
    ].forEach(([src, className]) => {
      const image = document.createElement('img');
      image.className = className;
      image.src = `${src}?v=20261107-tail`;
      image.alt = '';
      animation.append(image);
    });
    blob.append(animation);
  }

  function blobTextColor(color) {
    const hex = String(color).match(/^#([\da-f]{6})$/i)?.[1];
    if (!hex) return '#33291f';
    const channels = hex.match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    const darkLuminance = .023;
    const darkContrast = (Math.max(luminance, darkLuminance) + .05) / (Math.min(luminance, darkLuminance) + .05);
    const lightContrast = 1.05 / (luminance + .05);
    return lightContrast > darkContrast ? '#fff' : '#33291f';
  }

  function updateBlobTextColors() {
    shapes.forEach(({el}) => {
      const backgroundColor = getComputedStyle(el).backgroundColor;
      const values = backgroundColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
      const channels = backgroundColor.startsWith('color(') ? values : values?.map(value => value / 255);
      if (!channels || channels.length !== 3) return;
      const linear = channels.map(value => {
        return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      el.style.setProperty('--blob-ink', 1.05 / (luminance + .05) > (luminance + .05) / .05 ? '#fff' : '#000');
    });
  }

  const customCursor = document.getElementById('custom-cursor');
  const customCursorIcon = customCursor?.querySelector('.cursor-action-icon');
  const fineHoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let customCursorEnabled = false;
  let cursorFrame;
  let cursorTargetX = 0;
  let cursorTargetY = 0;
  let cursorX = 0;
  let cursorY = 0;
  let cursorHasPosition = false;
  let collisionAudioContext;
  let collisionResumePromise;
  let pendingCollisionForces=[];
  let nextCollisionSoundAt=0;

  const cursorIcons = {
    link: 'hand-click',
    button: 'hand-click',
    grab: 'grip-vertical',
    grabbing: 'arrows-move'
  };

  function setCursorMode(target) {
    if (!customCursor || !customCursorIcon) return;
    const element = target instanceof Element ? target : null;
    const blob = element?.closest('.project-blob');
    const player = element?.closest('.floating-mp3-player');
    const playerControl = element?.closest('.floating-mp3-player button, .floating-mp3-player input');
    const mode = blob ? (blob.dataset.dragging === 'true' ? 'grabbing' : 'grab') :
      player && !playerControl ? (player.classList.contains('is-dragging') ? 'grabbing' : 'grab') :
      element?.closest('a[href]') ? 'link' :
      element?.closest('button') ? 'button' : 'default';
    customCursor.dataset.mode = mode;
    customCursor.dataset.interactive = String(mode !== 'default');
    if (mode !== 'default') customCursorIcon.className = `cursor-action-icon ti ti-${cursorIcons[mode]}`;
  }

  function paintCursor() {
    cursorFrame = undefined;
    cursorX += (cursorTargetX - cursorX) * .24;
    cursorY += (cursorTargetY - cursorY) * .24;
    customCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`;
    if (Math.abs(cursorTargetX - cursorX) > .15 || Math.abs(cursorTargetY - cursorY) > .15) {
      cursorFrame = requestAnimationFrame(paintCursor);
    } else {
      cursorX = cursorTargetX;
      cursorY = cursorTargetY;
      customCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`;
    }
  }

  function updateCursorAvailability() {
    customCursorEnabled = Boolean(customCursor && fineHoverPointer.matches && !reduceMotion.matches);
    document.body.classList.toggle('has-custom-cursor', customCursorEnabled);
    if (!customCursorEnabled) {
      customCursor?.setAttribute('data-visible', 'false');
      customCursor?.removeAttribute('data-pressed');
      cancelAnimationFrame(cursorFrame);
      cursorFrame = undefined;
      cursorHasPosition = false;
    }
  }

  if (customCursor) {
    updateCursorAvailability();
    fineHoverPointer.addEventListener('change', updateCursorAvailability);
    reduceMotion.addEventListener('change', updateCursorAvailability);

    document.addEventListener('pointermove', event => {
      if (!customCursorEnabled || event.pointerType !== 'mouse') return;
      cursorTargetX = event.clientX;
      cursorTargetY = event.clientY;
      if (!cursorHasPosition) {
        cursorX = cursorTargetX;
        cursorY = cursorTargetY;
        cursorHasPosition = true;
      }
      customCursor.setAttribute('data-visible', 'true');
      setCursorMode(event.target);
      if (!cursorFrame) cursorFrame = requestAnimationFrame(paintCursor);
    }, {passive: true});
    document.addEventListener('pointerdown', event => {
      if (customCursorEnabled && event.pointerType === 'mouse' && event.button === 0) customCursor.dataset.pressed = 'true';
    }, true);
    document.addEventListener('pointerup', event => {
      if (event.pointerType === 'mouse') customCursor.removeAttribute('data-pressed');
    }, true);
    document.addEventListener('pointercancel', () => customCursor.removeAttribute('data-pressed'), true);
    document.addEventListener('mouseout', event => {
      if (!event.relatedTarget) customCursor.setAttribute('data-visible', 'false');
    });
    window.addEventListener('blur', () => customCursor.setAttribute('data-visible', 'false'));
  }

  addAboutCatAnimation();


  function setupStage() {
    const w = stage.clientWidth;
    const cols = Math.max(1, Math.floor(w / (w < 550 ? 200 : 260)));
    const rows = Math.ceil(projects.length / cols);
    const rowHeight = w < 550 ? 205 : 250;
    const height = Math.max(w < 550 ? 380 : 580, rows * rowHeight + (w < 550 ? 95 : 150));
    stage.style.height = `${height}px`;
    return {w, h: height, cols, rowHeight};
  }

  function positionShapes() {
    const {w, h, cols, rowHeight} = setupStage();
    shapes.forEach((s, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const itemsThisRow = Math.min(cols, projects.length - row * cols);
      const cellWidth = w / itemsThisRow;
      const stagger = (i % 3 - 1) * Math.min(35, w * .04);
      s.size = w < 550 ? Math.min(180, Math.max(108, cellWidth * .66)) : Math.min(220, Math.max(145, cellWidth * .72));
      s.x = clamp((col + .5) * cellWidth - s.size / 2 + stagger, 12, w - s.size - 12);
      s.y = clamp((w < 550 ? 55 : 78) + row * rowHeight + (i % 2) * 24, 12, h - s.size - 12);
      s.baseX = s.x; s.baseY = s.y;
      s.el.style.setProperty('--size', `${s.size}px`);
      s.el.style.setProperty('--x', `${s.x}px`);
      s.el.style.setProperty('--y', `${s.y}px`);
    });
  }

  function addShape(project, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-blob';
    button.setAttribute('aria-label', `פתיחת הפרויקט ${project.title}`);
    const blobColor = project.color || colors[index % colors.length];
    button.style.setProperty('--blob-color', blobColor);
    button.style.setProperty('--blob-ink', blobTextColor(blobColor));
    button.style.setProperty('--radius', radii[index % radii.length]);
    button.style.setProperty('--rotate', `${(index % 5 - 2) * 5}deg`);
    const symbol = document.createElement('span');symbol.className = 'blob-symbol';symbol.setAttribute('aria-hidden','true');symbol.append(makeIcon(project.icon || 'sparkles'));
    const title = document.createElement('span');title.className = 'blob-title';title.textContent = project.title || 'פרויקט';
    const subtitle = document.createElement('span');subtitle.className = 'blob-subtitle';subtitle.textContent = project.subtitle || '';
    const open = document.createElement('span');open.className = 'blob-open';open.append(document.createTextNode('לגלות'), makeIcon('arrow-up-right'));
    button.append(symbol,title,subtitle,open); layer.append(button);
    const state = {el:button,project,x:0,y:0,baseX:0,baseY:0,size:0,vx:0,vy:0,dragging:false,hold:false,collisions:new Map()};
    shapes.push(state);
    let drag = null, dragFrame = 0;
    const paintDrag = () => {
      dragFrame = 0;
      if (!drag || !drag.moved) return;
      state.vx = (drag.nextX - state.x) * .4;state.vy = (drag.nextY - state.y) * .4;
      state.x = drag.nextX;state.y = drag.nextY;
      updateShape(state);
      if (!reduceMotion.matches) repelNearbyShapes(state);
    };
    button.addEventListener('pointerdown', e => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || active) return;
      drag = {id:e.pointerId,startX:e.clientX,startY:e.clientY,x:state.x,y:state.y,nextX:state.x,nextY:state.y,moved:false,t:performance.now()};
      button.setPointerCapture(e.pointerId);state.hold=true;state.collisions.clear();prepareCollisionSound();
    });
    button.addEventListener('pointermove',e=>{
      if (!drag || e.pointerId !== drag.id) return;
      const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
      if(Math.hypot(dx,dy)>7)drag.moved=true;
      if(!drag.moved)return;
      e.preventDefault();
      state.dragging=true;button.dataset.dragging='true';
      const rect=stage.getBoundingClientRect();
      const nx=clamp(drag.x+dx,0,rect.width-state.size),ny=clamp(drag.y+dy,0,rect.height-state.size);
      drag.nextX=nx;drag.nextY=ny;
      if(!dragFrame)dragFrame=requestAnimationFrame(paintDrag);
    });
    const finish = e => {
      if(!drag || e.pointerId!==drag.id)return;
      if(dragFrame){cancelAnimationFrame(dragFrame);paintDrag();}
      const moved=drag.moved;
      drag=null;state.dragging=false;state.hold=false;state.collisions.clear();delete button.dataset.dragging;
      if(!moved && e.type==='pointerup'){button.dataset.justClicked='true';openProject(project,button);}
    };
    button.addEventListener('pointerup',finish);
    button.addEventListener('pointercancel',finish);
    button.addEventListener('lostpointercapture',finish);
    button.addEventListener('click',()=>{if(button.dataset.justClicked){delete button.dataset.justClicked;return;}openProject(project,button);});
    const item=document.createElement('button');item.type='button';item.append(document.createTextNode(project.title || 'פרויקט'), makeIcon('arrow-up-right'));item.addEventListener('click',()=>openProject(project,button));list.append(item);
  }
  function updateShape(s){s.el.style.setProperty('--x',`${s.x}px`);s.el.style.setProperty('--y',`${s.y}px`);}

  function prepareCollisionSound(){
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return null;
    try{
      collisionAudioContext??=new AudioContextClass();
      if(collisionAudioContext.state!=='running'&&!collisionResumePromise){
        collisionResumePromise=collisionAudioContext.resume()
          .catch(()=>null)
          .then(()=>{
            collisionResumePromise=null;
            if(collisionAudioContext?.state==='running'&&pendingCollisionForces.length){
              const queuedForces=pendingCollisionForces;
              pendingCollisionForces=[];
              queuedForces.forEach(force=>playCollisionTone(collisionAudioContext,force));
            }
          });
      }
      return collisionAudioContext;
    }catch{return null;}
  }

  function playCollisionTone(context,force){
    try{
      const oscillator=context.createOscillator(),gain=context.createGain();
      const volume=.055+Math.min(force,42)/42*.045;
      const startAt=Math.max(context.currentTime,nextCollisionSoundAt);
      nextCollisionSoundAt=startAt+.06;
      oscillator.type='triangle';
      oscillator.frequency.setValueAtTime(300+Math.min(force,42)*3,startAt);
      gain.gain.setValueAtTime(.0001,startAt);
      gain.gain.exponentialRampToValueAtTime(volume,startAt+.008);
      gain.gain.exponentialRampToValueAtTime(.0001,startAt+.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startAt);oscillator.stop(startAt+.17);
    }catch{}
  }

  function playCollisionSound(force){
    const context=prepareCollisionSound();
    if(!context)return;
    if(context.state!=='running'){
      pendingCollisionForces.push(force);
      return;
    }
    playCollisionTone(context,force);
  }

  function repelNearbyShapes(dragged){
    const w=stage.clientWidth,h=stage.clientHeight;
    const collisionNow=performance.now();
    const dragCenterX=dragged.x+dragged.size/2,dragCenterY=dragged.y+dragged.size/2;
    shapes.forEach(other=>{
      if(other===dragged||other.hold)return;
      const dx=(other.x+other.size/2)-dragCenterX,dy=(other.y+other.size/2)-dragCenterY;
      const distance=Math.hypot(dx,dy);
      const minDistance=(dragged.size+other.size)*.43;
      if(distance>=minDistance){dragged.collisions.delete(other);return;}
      const dirX=distance?dx/distance:1,dirY=distance?dy/distance:0;
      const push=Math.min(minDistance-distance,42)*.78;
      const previousCollision=dragged.collisions.get(other);
      if(previousCollision==null||collisionNow-previousCollision>=90){
        dragged.collisions.set(other,collisionNow);
        playCollisionSound(push);
      }
      other.x=clamp(other.x+dirX*push,0,w-other.size);
      other.y=clamp(other.y+dirY*push,0,h-other.size);
      other.vx+=dirX*push*.18;other.vy+=dirY*push*.18;
      updateShape(other);
    });
  }

  function physics(){
    if(!reduceMotion.matches && !active){
      const w=stage.clientWidth,h=stage.clientHeight,t=performance.now()/1000;
      shapes.forEach((s,i)=>{
        if(s.hold)return;
        const dx=(s.baseX+Math.sin(t*.45+i*1.9)*17)-s.x;
        const dy=(s.baseY+Math.cos(t*.5+i*2.2)*15)-s.y;
        s.vx=(s.vx+dx*.003)*.95;s.vy=(s.vy+dy*.003)*.95;
        s.x=clamp(s.x+s.vx,0,w-s.size);s.y=clamp(s.y+s.vy,0,h-s.size);
        updateShape(s);
      });
    }
    requestAnimationFrame(physics);
  }

  function makeLink(label, url, iconName = 'arrow-up-right'){
    if(!isSafeUrl(url))return;
    const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    a.append(document.createTextNode(label), makeIcon(iconName));
    document.getElementById('overlay-links').append(a);
  }
  function openProject(project, trigger){
    if(active||closing)return;
    active={project,trigger};lastFocus=document.activeElement;
    const overlayTitle=document.getElementById('overlay-title');
    overlayTitle.textContent=project.title||'';
    overlayTitle.classList.toggle('overlay-title-compact',project.id==='dpsac');
    document.getElementById('overlay-description').textContent=project.description||'';
    const tags=document.getElementById('overlay-tags');tags.replaceChildren();
    (project.technologies||[]).forEach(tag=>{const span=document.createElement('span');span.textContent=tag;tags.append(span);});
    document.getElementById('overlay-links').replaceChildren();
    makeLink('לצפייה באתר',project.website,'external-link');makeLink('פתיחת המחקר',project.research,'book-2');makeLink('GitHub',project.github,'brand-github');
    const overlayColor = project.color || colors[0];
    overlay.style.setProperty('--overlay-color', overlayColor);
    overlay.style.setProperty('--overlay-ink', blobTextColor(overlayColor));
    overlay.classList.add('is-visible');overlay.setAttribute('aria-hidden','false');document.body.classList.add('is-overlay-open');
    const rect=trigger.getBoundingClientRect();
    const start={left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,borderRadius:getComputedStyle(trigger).borderRadius};
    const end={left:'0px',top:'0px',width:`${inner.clientWidth}px`,height:`${inner.clientHeight}px`,borderRadius:'0px'};
    bg.style.opacity='1';
    if(reduceMotion.matches){Object.assign(bg.style,end);inner.style.opacity='1';}
    else{
      bg.animate([start,end],{duration:730,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
      inner.animate([{opacity:0,transform:'translateY(23px)'},{opacity:1,transform:'translateY(0)'}],{duration:380,delay:380,easing:'ease-out',fill:'forwards'});
    }
    setTimeout(()=>{inner.style.opacity='1';closeButton.focus();},reduceMotion.matches?0:710);
  }
  function closeProject(){
    if(!active||closing)return;closing=true;
    const trigger=active.trigger;
    const done=()=>{
      overlay.classList.remove('is-visible');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('is-overlay-open');
      bg.getAnimations().forEach(a=>a.cancel());inner.getAnimations().forEach(a=>a.cancel());
      bg.removeAttribute('style');inner.style.opacity='0';
      active=null;closing=false;
      if(lastFocus&&lastFocus.isConnected)lastFocus.focus();else trigger.focus();
    };
    if(reduceMotion.matches){done();return;}
    const rect=trigger.getBoundingClientRect();
    const to={left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,borderRadius:getComputedStyle(trigger).borderRadius};
    bg.getAnimations().forEach(a=>a.cancel());inner.getAnimations().forEach(a=>a.cancel());
    bg.animate([{left:'0px',top:'0px',width:'100%',height:'100%',borderRadius:'0px'},to],{duration:490,easing:'cubic-bezier(.65,0,.75,.25)',fill:'forwards'}).onfinish=done;
    inner.animate([{opacity:1},{opacity:0}],{duration:140,fill:'forwards'});
  }
  closeButton.addEventListener('click',closeProject);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProject();if(e.key==='Tab'&&active){const targets=[closeButton,...inner.querySelectorAll('a[href]')];const first=targets[0],last=targets[targets.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  document.getElementById('year').textContent=new Date().getFullYear();
  if(!projects.length){layer.innerHTML='<p class="empty-message">עוד מעט יהיו כאן פרויקטים...</p>';}
  else{projects.forEach(addShape);}
  positionShapes();
  window.addEventListener('resize',()=>{if(!active)positionShapes();});
  requestAnimationFrame(physics);

  const themeToggle = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const applyTheme = theme => {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    themeMeta?.setAttribute('content', isDark ? '#121212' : '#faf9f5');
    if (!themeToggle) return;
    const label = isDark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה';
    themeToggle.setAttribute('aria-label', label);
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.querySelector('.sr-only').textContent = label;
    themeToggle.querySelector('.ti').className = `ti ti-${isDark ? 'sun' : 'moon'}`;
    updateBlobTextColors();
  };

  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('hila-theme', nextTheme); } catch {}
    applyTheme(nextTheme);
  });

  const mp3Player = document.getElementById('floating-mp3-player');
  const mp3Audio = document.getElementById('mp3-audio');
  const mp3FileInput = document.getElementById('mp3-file-input');
  const mp3Upload = document.getElementById('mp3-upload');
  const mp3UploadHint = document.getElementById('mp3-upload-hint');
  const mp3Status = document.getElementById('mp3-status');
  const mp3Duration = document.getElementById('mp3-duration');
  const mp3Expand = document.getElementById('mp3-expand');
  const mp3Menu = document.getElementById('mp3-menu');
  const mp3Remove = document.getElementById('mp3-remove');
  const mp3Play = document.getElementById('mp3-play');
  const mp3SkipBack = document.getElementById('mp3-skip-back');
  const mp3SkipForward = document.getElementById('mp3-skip-forward');
  const mp3Volume = document.getElementById('mp3-volume');
  const mp3VolumeValue = document.getElementById('mp3-volume-value');
  const mp3SongTitle = document.getElementById('mp3-song-title');
  const mp3AlbumName = document.getElementById('mp3-album-name');
  const mp3SingerName = document.getElementById('mp3-singer-name');
  const mp3Cover = mp3Player?.querySelector('.mp3-cover');
  const mp3MetadataInputs = [mp3SongTitle, mp3AlbumName, mp3SingerName];
  const mp3Controls = [mp3Play, mp3SkipBack, mp3SkipForward];

  if (mp3Player && mp3Audio && mp3FileInput && mp3Upload && mp3UploadHint && mp3Status && mp3Duration && mp3Expand && mp3Menu && mp3Play && mp3SkipBack && mp3SkipForward && mp3Volume && mp3VolumeValue && mp3SongTitle && mp3AlbumName && mp3SingerName && mp3Cover) {
    const volumeSteps = [.25, .5, .75, 1];
    let volumeIndex = 1;
    let objectUrl = '';
    let coverObjectUrl = '';
    const defaultCoverSrc = mp3Cover.getAttribute('src');
    let hasTrack = false;
    let metadataRequest = 0;

    // Persist uploaded tracks in IndexedDB (object URLs cannot survive navigation).
    // Restore the position and settings when a page on this origin is reopened.
    const playbackKey = 'hila-mp3-playback-v1';
    const audioChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('hila-mp3-playback') : null;
    const tabId = Math.random().toString(36).slice(2);
    let restoringTrack = false;
    let restoredPosition = null;
    let restorePlayRequested = false;
    let lastSavedSecond = -1;

    const openTrackStore = () => new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open('hila-mp3-player', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tracks');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const saveTrackFile = async file => {
      const db = await openTrackStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('tracks', 'readwrite');
        transaction.objectStore('tracks').put(file, 'current');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      });
    };
    const readTrackFile = async () => {
      const db = await openTrackStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('tracks', 'readonly');
        const request = transaction.objectStore('tracks').get('current');
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      });
    };
    const readPlayback = () => {
      try { return JSON.parse(localStorage.getItem(playbackKey)) || {}; }
      catch { return {}; }
    };
    const savePlayback = () => {
      if (!mp3Audio.src) return;
      try {
        localStorage.setItem(playbackKey, JSON.stringify({
          position: mp3Audio.currentTime || 0,
          playing: !mp3Audio.paused && !mp3Audio.ended,
          volumeIndex,
          title: mp3SongTitle.value,
          album: mp3AlbumName.value,
          singer: mp3SingerName.value
        }));
      } catch {}
    };
    audioChannel?.addEventListener('message', event => {
      if (event.data?.type === 'playing' && event.data.tabId !== tabId && !mp3Audio.paused) {
        mp3Audio.pause();
      }
    });

    const formatTime = seconds => {
      if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const setStatus = (message, isError = false, showInPlayer = true) => {
      mp3Status.textContent = message;
      mp3UploadHint.textContent = showInPlayer ? message : 'Drop an MP3 file here';
      mp3UploadHint.classList.toggle('is-error', isError);
    };

    const updateDuration = () => {
      mp3Duration.textContent = `${formatTime(mp3Audio.currentTime)} / ${formatTime(mp3Audio.duration)}`;
    };

    const syncMetadataMarquee = input => {
      const field = input.closest('.mp3-field');
      const marquee = field?.querySelector('.mp3-marquee');
      if (!field || !marquee) return;
      marquee.textContent = input.value;
      requestAnimationFrame(() => {
        const distance = Math.ceil(marquee.scrollWidth - field.clientWidth);
        field.classList.toggle('is-overflowing', distance > 2);
        field.style.setProperty('--marquee-offset', `-${Math.max(0, distance)}px`);
      });
    };

    const setMetadataValue = (input, value) => {
      input.value = value;
      syncMetadataMarquee(input);
    };

    const setControlsEnabled = enabled => {
      hasTrack = enabled;
      mp3Controls.forEach(control => { control.disabled = !enabled; });
    };

    const setPlaybackState = isPlaying => {
      mp3Play.setAttribute('aria-pressed', String(isPlaying));
      mp3Play.setAttribute('aria-label', isPlaying ? 'Pause song' : 'Play song');
      mp3Play.classList.toggle('is-playing', isPlaying);
    };

    const updateVolume = () => {
      const volume = volumeSteps[volumeIndex];
      const percentage = Math.round(volume * 100);
      mp3Audio.volume = volume;
      mp3VolumeValue.textContent = `${percentage}%`;
      mp3Volume.setAttribute('aria-label', `Volume ${percentage} percent. Change volume`);
    };

    const isMp3File = file => Boolean(file) && (file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name));

    const cleanMetadataText = value => String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();

    const decodeId3Text = bytes => {
      if (!bytes?.length) return '';
      const encoding = bytes[0];
      const textBytes = bytes.slice(1);
      const encodingName = ({0: 'iso-8859-1', 1: 'utf-16', 2: 'utf-16be', 3: 'utf-8'})[encoding] || 'utf-8';
      try { return cleanMetadataText(new TextDecoder(encodingName).decode(textBytes)); } catch { return ''; }
    };

    // Read the cover embedded in an MP3's ID3 APIC (v2.3/2.4) or PIC (v2.2) frame.
    const getCoverMimeType = bytes => {
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
      if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
      if (bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 6)).match(/^GIF8[79]a$/)) return 'image/gif';
      if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
      if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
      return '';
    };

    const readPictureFrame = (frameId, bytes) => {
      if (bytes.length < 8 || bytes[0] > 3) return null;
      let pictureType, descriptionStart;
      if (frameId === 'PIC') {
        pictureType = bytes[4];
        descriptionStart = 5;
      } else {
        const mimeEnd = bytes.indexOf(0, 1);
        if (mimeEnd < 0 || mimeEnd + 1 >= bytes.length) return null;
        pictureType = bytes[mimeEnd + 1];
        descriptionStart = mimeEnd + 2;
      }
      const unicodeDescription = bytes[0] === 1 || bytes[0] === 2;
      let imageStart = -1;
      if (unicodeDescription) {
        for (let index = descriptionStart; index + 1 < bytes.length; index += 2) {
          if (bytes[index] === 0 && bytes[index + 1] === 0) {
            imageStart = index + 2;
            break;
          }
        }
      } else {
        const end = bytes.indexOf(0, descriptionStart);
        if (end >= 0) imageStart = end + 1;
      }
      if (imageStart < 0) return null;
      const imageBytes = bytes.subarray(imageStart);
      // Allow only supported image formats, and avoid allocating huge embedded images.
      if (imageBytes.length < 8 || imageBytes.length > 16 * 1024 * 1024) return null;
      const mimeType = getCoverMimeType(imageBytes);
      return mimeType ? {bytes: imageBytes, mimeType, pictureType} : null;
    };

    const removeId3Unsynchronisation = bytes => {
      const output = new Uint8Array(bytes.length);
      let length = 0;
      for (let index = 0; index < bytes.length; index++) {
        output[length++] = bytes[index];
        if (bytes[index] === 0xff && bytes[index + 1] === 0x00) index++;
      }
      return output.subarray(0, length);
    };

    const readId3v2 = async file => {
      if (file.size < 10) return {};
      const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
      if (String.fromCharCode(...header.slice(0, 3)) !== 'ID3' || ![2, 3, 4].includes(header[3])) return {};
      const version = header[3];
      const tagSize = ((header[6] & 0x7f) << 21) | ((header[7] & 0x7f) << 14) | ((header[8] & 0x7f) << 7) | (header[9] & 0x7f);
      const data = new Uint8Array(await file.slice(10, Math.min(file.size, 10 + tagSize)).arrayBuffer());
      const metadata = {};
      const frameNames = version === 2 ? {TT2: 'title', TP1: 'artist', TAL: 'album'} : {TIT2: 'title', TPE1: 'artist', TALB: 'album'};
      let offset = 0;

      // Skip the optional extended tag header before reading frames.
      if (version >= 3 && (header[5] & 0x40)) {
        if (data.length < 4) return metadata;
        const extendedSize = version === 4
          ? ((data[0] & 0x7f) << 21) | ((data[1] & 0x7f) << 14) | ((data[2] & 0x7f) << 7) | (data[3] & 0x7f)
          : data[0] * 0x1000000 + (data[1] << 16) + (data[2] << 8) + data[3];
        offset = version === 3 ? extendedSize + 4 : extendedSize;
        if (offset > data.length || offset < 4) return metadata;
      }

      while (offset < data.length) {
        const headerLength = version === 2 ? 6 : 10;
        if (offset + headerLength > data.length) break;
        const frameId = String.fromCharCode(...data.subarray(offset, offset + (version === 2 ? 3 : 4)));
        if (!/^[A-Z0-9]{3,4}$/.test(frameId)) break;
        const sizeStart = offset + (version === 2 ? 3 : 4);
        const frameSize = version === 2
          ? (data[sizeStart] << 16) | (data[sizeStart + 1] << 8) | data[sizeStart + 2]
          : version === 4
            ? ((data[sizeStart] & 0x7f) << 21) | ((data[sizeStart + 1] & 0x7f) << 14) | ((data[sizeStart + 2] & 0x7f) << 7) | (data[sizeStart + 3] & 0x7f)
            : (data[sizeStart] * 0x1000000) + (data[sizeStart + 1] << 16) + (data[sizeStart + 2] << 8) + data[sizeStart + 3];
        const frameStart = offset + headerLength;
        if (!frameSize || frameStart + frameSize > data.length) break;
        let frameData = data.subarray(frameStart, frameStart + frameSize);
        const formatFlags = version === 2 ? 0 : data[offset + 9];
        offset = frameStart + frameSize;

        // Compressed and encrypted frames need special decoders and cannot be read here.
        if (version === 3 && (formatFlags & 0xc0)) continue;
        if (version === 4 && (formatFlags & 0x0c)) continue;
        if (version === 3 && (formatFlags & 0x20)) frameData = frameData.subarray(1);
        if (version === 4) {
          if (formatFlags & 0x40) frameData = frameData.subarray(1);
          if (formatFlags & 0x01) frameData = frameData.subarray(4);
        }
        if ((header[5] & 0x80) || (version === 4 && (formatFlags & 0x02))) {
          frameData = removeId3Unsynchronisation(frameData);
        }

        const metadataKey = frameNames[frameId];
        if (metadataKey && !metadata[metadataKey]) metadata[metadataKey] = decodeId3Text(frameData);
        if (frameId === 'APIC' || frameId === 'PIC') {
          const picture = readPictureFrame(frameId, frameData);
          // Prefer the front cover (picture type 3) over other embedded images.
          if (picture && (!metadata.cover || (picture.pictureType === 3 && metadata.cover.pictureType !== 3))) {
            metadata.cover = picture;
          }
        }
      }
      return metadata;
    };

    const readId3v1 = async file => {
      if (file.size < 128) return {};
      const data = new Uint8Array(await file.slice(-128).arrayBuffer());
      if (String.fromCharCode(...data.slice(0, 3)) !== 'TAG') return {};
      const decoder = new TextDecoder('iso-8859-1');
      return {
        title: cleanMetadataText(decoder.decode(data.slice(3, 33))),
        artist: cleanMetadataText(decoder.decode(data.slice(33, 63))),
        album: cleanMetadataText(decoder.decode(data.slice(63, 93)))
      };
    };

    const parseFilenameMetadata = name => {
      const baseName = cleanMetadataText(name.replace(/\.mp3$/i, ''));
      const parts = baseName.split(/\s[-–—]\s/).map(cleanMetadataText).filter(Boolean);
      return parts.length > 1 ? {title: parts.slice(1).join(' - '), artist: parts[0]} : {title: baseName};
    };

    const resetCover = () => {
      mp3Cover.src = defaultCoverSrc;
      mp3Cover.alt = 'Default song cover';
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = '';
    };

    const showEmbeddedCover = cover => {
      if (!cover) return;
      const nextUrl = URL.createObjectURL(new Blob([cover.bytes], {type: cover.mimeType}));
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = nextUrl;
      mp3Cover.src = nextUrl;
      mp3Cover.alt = 'Cover art embedded in the MP3';
    };

    mp3Cover.addEventListener('error', () => {
      // A damaged embedded image should never replace the default artwork.
      if (coverObjectUrl && mp3Cover.src === coverObjectUrl) resetCover();
    });

    const applyMetadata = async (file, requestId) => {
      const filenameMetadata = parseFilenameMetadata(file.name);
      setMetadataValue(mp3SongTitle, filenameMetadata.title || 'Song name');
      setMetadataValue(mp3SingerName, filenameMetadata.artist || 'Singer name');
      setMetadataValue(mp3AlbumName, 'Album name');
      try {
        const [id3v2, id3v1] = await Promise.all([readId3v2(file), readId3v1(file)]);
        if (requestId !== metadataRequest) return;
        const metadata = {...filenameMetadata, ...id3v1, ...id3v2};
        if (metadata.title) setMetadataValue(mp3SongTitle, metadata.title);
        if (metadata.artist) setMetadataValue(mp3SingerName, metadata.artist);
        if (metadata.album) setMetadataValue(mp3AlbumName, metadata.album);
        if (id3v2.cover) showEmbeddedCover(id3v2.cover);
      } catch {
        // The filename fallback above remains available when a file has unreadable tags.
      }
    };

    const loadAudioFile = (file, fromStorage = false) => {
      if (!file) return;
      if (!isMp3File(file)) {
        mp3Upload.hidden = false;
        setStatus('Please choose an MP3 file.', true);
        return;
      }

      // Hide the upload prompt immediately after selecting a valid MP3.
      // An audio error will reveal it again so the user can retry.
      mp3Upload.hidden = true;
      mp3Audio.pause();
      resetCover();
      setPlaybackState(false);
      setControlsEnabled(false);
      updateDuration();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      mp3Audio.src = objectUrl;
      mp3Audio.load();
      applyMetadata(file, ++metadataRequest);
      setStatus('Loading song…');
      if (!fromStorage) {
        // Local files must be explicitly selected once; keep a copy for later pages.
        saveTrackFile(file).catch(() => setStatus('Track loaded, but the browser could not save it for other pages.', true));
      }
    };

    // Restore the last chosen file after a full navigation/reload.
    // Some browsers block autoplay after navigation; in that case Play remains available.
    (async () => {
      const previous = readPlayback();
      if (Number.isInteger(previous.volumeIndex) && previous.volumeIndex >= 0 && previous.volumeIndex < volumeSteps.length) {
        volumeIndex = previous.volumeIndex;
        updateVolume();
      }
      try {
        const file = await readTrackFile();
        if (!file || !isMp3File(file) || mp3Audio.src) return;
        restoringTrack = true;
        restoredPosition = Number.isFinite(previous.position) ? Math.max(0, previous.position) : 0;
        restorePlayRequested = previous.playing === true;
        loadAudioFile(file, true);
      } catch { /* Storage can be disabled in private browsing. */ }
    })();
    updateVolume();
    updateDuration();
    mp3MetadataInputs.forEach(input => {
      input.addEventListener('input', () => { syncMetadataMarquee(input); savePlayback(); });
      syncMetadataMarquee(input);
    });
    document.fonts?.ready.then(() => mp3MetadataInputs.forEach(syncMetadataMarquee));

    const playerPositionKey = 'hila-mp3-player-position';
    let playerDrag;
    let volumeFeedbackTimer;
    let suppressExpandClick = false;

    const showVolumeFeedback = () => {
      mp3Volume.classList.add('is-showing-volume');
      clearTimeout(volumeFeedbackTimer);
      volumeFeedbackTimer = setTimeout(() => mp3Volume.classList.remove('is-showing-volume'), 1050);
    };

    const resizePlayer = expanded => {
      if (mp3Player.classList.contains('is-expanded') === expanded) return;
      const bounds = mp3Player.getBoundingClientRect();
      const gapRight = Math.max(0, window.innerWidth - bounds.right);
      const gapBottom = Math.max(0, window.innerHeight - bounds.bottom);
      const hasCustomPosition = Boolean(mp3Player.style.left);
      mp3Player.classList.toggle('is-expanded', expanded);
      mp3Expand.setAttribute('aria-expanded', String(expanded));
      mp3Player.setAttribute('aria-label', expanded
        ? 'MP3 player. Use MENU to minimize or drag an empty area to move it.'
        : 'MP3 player. Click to expand or drag to move.');
      // For dragged players, preserve the distance to the right/bottom edges on resize.
      if (hasCustomPosition) {
        const newWidth = Math.min(expanded ? 210 : 142, window.innerWidth - 28);
        const newHeight = newWidth * 1468 / 1051;
        placePlayer(window.innerWidth - gapRight - newWidth, window.innerHeight - gapBottom - newHeight);
      }
      if (expanded) {
        mp3MetadataInputs.forEach(syncMetadataMarquee);
      }
    };

    mp3Expand.addEventListener('click', event => {
      if (suppressExpandClick) {
        event.preventDefault();
        suppressExpandClick = false;
        return;
      }
      resizePlayer(true);
    });
    mp3Menu.addEventListener('click', () => resizePlayer(false));

    // The audio element remains in the original tab. The native PiP window
    // presents a synchronized controller above other browser tabs.
    const pipToggle = document.getElementById('mp3-pip-toggle');
    let pipWindow = null;
    mp3Remove?.addEventListener('click', () => {
      mp3Audio.pause();
      pipWindow?.close();
      mp3Player.hidden = true;
    });
    if (pipToggle) {
      pipToggle.hidden = false;
      pipToggle.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (pipWindow && !pipWindow.closed) return;

        if (!window.isSecureContext || !window.documentPictureInPicture?.requestWindow) {
          const message = 'POP OUT requires desktop Chrome or Edge with Document Picture-in-Picture support and HTTPS.';
          setStatus(message, true);
          window.alert(message);
          return;
        }

        let nextWindow;
        try {
          // Call requestWindow synchronously within the user's click gesture.
          nextWindow = await window.documentPictureInPicture.requestWindow({width: 252, height: 352});
        } catch (error) {
          const message = 'The browser blocked POP OUT. Check Picture-in-Picture permissions for this site.';
          setStatus(message, true);
          window.alert(message);
          return;
        }
        pipWindow = nextWindow;
        pipToggle.hidden = true; // Close only with the native window X.
        const pipDoc = nextWindow.document;
        pipDoc.title = 'Hila MP3 Player';
        pipDoc.documentElement.lang = document.documentElement.lang;
        pipDoc.documentElement.dir = document.documentElement.dir;

        // Link styles in their original order to keep the exact website fonts.
        for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
          const link = pipDoc.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          pipDoc.head.append(link);
        }
        const styles = pipDoc.createElement('style');
        styles.textContent = `
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            background: #fff !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          body { display: block !important; }
          .floating-mp3-player, .floating-mp3-player.is-expanded {
            position: absolute !important;
            inset: 0 !important;
            left: 0 !important; top: 0 !important;
            right: 0 !important; bottom: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            touch-action: auto !important;
            filter: none !important;
          }
          .mp3-device { width: 100% !important; height: 100% !important; }
          *, *::before, *::after { box-sizing: border-box; }
          .mp3-pip-toggle, .mp3-expand, .mp3-menu, .mp3-remove { display: none !important; }
          .mp3-device { cursor: default !important; }
        `;
        pipDoc.head.append(styles);
        const clone = mp3Player.cloneNode(true);
        clone.classList.add('is-expanded');
        clone.classList.remove('is-dragging');
        clone.removeAttribute('style');
        clone.querySelector('#mp3-audio')?.remove();
        clone.querySelector('#mp3-file-input')?.remove();
        clone.querySelector('#mp3-pip-toggle')?.remove();
        clone.querySelector('#mp3-expand')?.remove();
        clone.querySelector('#mp3-menu')?.remove();
        clone.querySelector('#mp3-remove')?.remove();
        clone.querySelector('.mp3-cover')?.setAttribute('src', mp3Cover.src);
        pipDoc.body.append(clone);

        const mirrorTheme = () => {
          const theme = document.documentElement.dataset.theme;
          if (theme) pipDoc.documentElement.dataset.theme = theme;
          else delete pipDoc.documentElement.dataset.theme;
        };
        mirrorTheme();
        const themeObserver = new MutationObserver(mirrorTheme);
        themeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

        for (const id of ['mp3-play', 'mp3-skip-back', 'mp3-skip-forward', 'mp3-volume']) {
          const copy = clone.querySelector(`#${id}`);
          const original = document.getElementById(id);
          copy?.addEventListener('click', () => original?.click());
        }
        // The player in Document PiP is a clone, so the original tab's
        // drag-and-drop handlers do not receive drops inside this window.
        // Keep the file picker in the PiP document to preserve user activation.
        const pipFileInput = pipDoc.createElement('input');
        pipFileInput.type = 'file';
        pipFileInput.accept = '.mp3,audio/mpeg,audio/mp3';
        pipFileInput.hidden = true;
        pipDoc.body.append(pipFileInput);
        pipFileInput.addEventListener('change', event => {
          loadAudioFile(event.target.files?.[0]);
          pipFileInput.value = '';
        });
        clone.querySelector('#mp3-upload')?.addEventListener('click', () => pipFileInput.click());

        // Prevent the browser from navigating to a dragged MP3, and forward
        // the dropped File to the audio element in the original tab.
        let pipDragDepth = 0;
        const pipUpload = clone.querySelector('#mp3-upload');
        pipDoc.addEventListener('dragenter', event => {
          if (!event.dataTransfer?.types?.includes('Files')) return;
          event.preventDefault();
          pipDragDepth++;
          pipUpload?.classList.add('is-dragging');
        });
        pipDoc.addEventListener('dragover', event => {
          if (!event.dataTransfer?.types?.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          pipUpload?.classList.add('is-dragging');
        });
        pipDoc.addEventListener('dragleave', event => {
          event.preventDefault();
          pipDragDepth = Math.max(0, pipDragDepth - 1);
          if (pipDragDepth === 0) pipUpload?.classList.remove('is-dragging');
        });
        pipDoc.addEventListener('drop', event => {
          event.preventDefault();
          pipDragDepth = 0;
          pipUpload?.classList.remove('is-dragging');
          const file = Array.from(event.dataTransfer?.files || []).find(isMp3File);
          if (file) loadAudioFile(file);
          else setStatus('Please drop an MP3 file.', true);
        });
        for (const id of ['mp3-song-title', 'mp3-album-name', 'mp3-singer-name']) {
          const copy = clone.querySelector(`#${id}`);
          const original = document.getElementById(id);
          copy?.addEventListener('input', () => {
            original.value = copy.value;
            original.dispatchEvent(new Event('input', {bubbles: true}));
          });
        }

        // The visible labels are separate .mp3-marquee elements, not the
        // inputs themselves. Cloning the player does not clone input listeners.
        const syncPipMetadata = input => {
          const field = input?.closest('.mp3-field');
          const marquee = field?.querySelector('.mp3-marquee');
          if (!field || !marquee) return;
          if (marquee.textContent !== input.value) marquee.textContent = input.value;
          nextWindow.requestAnimationFrame(() => {
            if (nextWindow.closed) return;
            const distance = Math.ceil(marquee.scrollWidth - field.clientWidth);
            field.classList.toggle('is-overflowing', distance > 2);
            field.style.setProperty('--marquee-offset', `-${Math.max(0, distance)}px`);
          });
        };
        for (const id of ['mp3-song-title', 'mp3-album-name', 'mp3-singer-name']) {
          clone.querySelector(`#${id}`)?.addEventListener('input', event => syncPipMetadata(event.currentTarget));
        }
        pipDoc.fonts?.ready.then(() => {
          if (!nextWindow.closed) {
            for (const id of ['mp3-song-title', 'mp3-album-name', 'mp3-singer-name']) {
              syncPipMetadata(clone.querySelector(`#${id}`));
            }
          }
        });

        const syncPip = () => {
          if (nextWindow.closed) return;
          for (const id of ['mp3-song-title', 'mp3-album-name', 'mp3-singer-name']) {
            const copy = clone.querySelector(`#${id}`);
            const original = document.getElementById(id);
            if (copy && original && pipDoc.activeElement !== copy) copy.value = original.value;
            if (copy) syncPipMetadata(copy);
          }
          const cover = clone.querySelector('.mp3-cover');
          if (cover && cover.src !== mp3Cover.src) cover.src = mp3Cover.src;
          const duration = clone.querySelector('#mp3-duration');
          if (duration) duration.textContent = mp3Duration.textContent;
          const upload = clone.querySelector('#mp3-upload');
          if (upload) upload.hidden = mp3Upload.hidden;
          const playing = clone.querySelector('#mp3-play');
          if (playing) {
            playing.disabled = mp3Play.disabled;
            playing.classList.toggle('is-playing', mp3Play.classList.contains('is-playing'));
            playing.setAttribute('aria-label', mp3Play.getAttribute('aria-label'));
            playing.setAttribute('aria-pressed', mp3Play.getAttribute('aria-pressed'));
          }
          for (const id of ['mp3-skip-back', 'mp3-skip-forward']) {
            const copy = clone.querySelector(`#${id}`);
            const original = document.getElementById(id);
            if (copy && original) copy.disabled = original.disabled;
          }
          const volume = clone.querySelector('#mp3-volume-value');
          if (volume) volume.textContent = mp3VolumeValue.textContent;
          const volumeControl = clone.querySelector('#mp3-volume');
          if (volumeControl) {
            volumeControl.setAttribute('aria-label', mp3Volume.getAttribute('aria-label'));
            // The volume percentage is hidden by default and revealed by this class.
            // Mirror the feedback state from the main player into the POP OUT.
            volumeControl.classList.toggle('is-showing-volume', mp3Volume.classList.contains('is-showing-volume'));
          }
          const hint = clone.querySelector('#mp3-upload-hint');
          if (hint) hint.textContent = mp3UploadHint.textContent;
        };
        syncPip();
        const timer = window.setInterval(syncPip, 200);
        const cleanup = () => {
          window.clearInterval(timer);
          themeObserver.disconnect();
          if (pipWindow === nextWindow) pipWindow = null;
          pipToggle.hidden = false;
        };
        nextWindow.addEventListener('pagehide', cleanup, {once: true});
      });
    }


    const constrainPlayerPosition = (left, top) => {
      const rect = mp3Player.getBoundingClientRect();
      return {
        left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - rect.width)),
        top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - rect.height))
      };
    };

    const placePlayer = (left, top) => {
      const position = constrainPlayerPosition(left, top);
      mp3Player.style.left = `${position.left}px`;
      mp3Player.style.top = `${position.top}px`;
      mp3Player.style.right = 'auto';
      mp3Player.style.bottom = 'auto';
      mp3Player.style.transform = 'none';
      return position;
    };

    try {
      const savedPosition = JSON.parse(localStorage.getItem(playerPositionKey));
      if (Number.isFinite(savedPosition?.left) && Number.isFinite(savedPosition?.top)) {
        requestAnimationFrame(() => placePlayer(savedPosition.left, savedPosition.top));
      }
    } catch {}

    mp3Player.addEventListener('pointerdown', event => {
      if ((event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('button:not(.mp3-expand), input, label')) return;
      const rect = mp3Player.getBoundingClientRect();
      playerDrag = {id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false};
      mp3Player.setPointerCapture(event.pointerId);
    });

    mp3Player.addEventListener('pointermove', event => {
      if (!playerDrag || event.pointerId !== playerDrag.id) return;
      const deltaX = event.clientX - playerDrag.startX;
      const deltaY = event.clientY - playerDrag.startY;
      if (!playerDrag.moved && Math.hypot(deltaX, deltaY) < 7) return;
      playerDrag.moved = true;
      mp3Player.classList.add('is-dragging');
      placePlayer(playerDrag.left + deltaX, playerDrag.top + deltaY);
      event.preventDefault();
    });

    const finishPlayerDrag = event => {
      if (!playerDrag || event.pointerId !== playerDrag.id) return;
      const moved = playerDrag.moved;
      playerDrag = undefined;
      mp3Player.classList.remove('is-dragging');
      if (!moved) {
        // Pointer capture retargets the click to the player, so expand here.
        if (!mp3Player.classList.contains('is-expanded')) resizePlayer(true);
        return;
      }
      suppressExpandClick = true;
      setTimeout(() => { suppressExpandClick = false; }, 0);
      const rect = mp3Player.getBoundingClientRect();
      try { localStorage.setItem(playerPositionKey, JSON.stringify({left: rect.left, top: rect.top})); } catch {}
    };
    mp3Player.addEventListener('pointerup', finishPlayerDrag);
    mp3Player.addEventListener('pointercancel', finishPlayerDrag);
    mp3Player.addEventListener('lostpointercapture', finishPlayerDrag);
    window.addEventListener('resize', () => {
      if (mp3Player.style.left) placePlayer(parseFloat(mp3Player.style.left), parseFloat(mp3Player.style.top));
      mp3MetadataInputs.forEach(syncMetadataMarquee);
    });

    mp3Upload.addEventListener('click', () => mp3FileInput.click());
    mp3FileInput.addEventListener('change', event => {
      loadAudioFile(event.target.files?.[0]);
      event.target.value = '';
    });

    ['dragenter', 'dragover'].forEach(type => mp3Player.addEventListener(type, event => {
      event.preventDefault();
      mp3Upload.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach(type => mp3Player.addEventListener(type, event => {
      event.preventDefault();
      mp3Upload.classList.remove('is-dragging');
    }));
    mp3Player.addEventListener('drop', event => loadAudioFile(event.dataTransfer?.files?.[0]));

    mp3Audio.addEventListener('loadedmetadata', () => {
      if (restoringTrack) {
        restoringTrack = false;
        if (restoredPosition !== null) {
          mp3Audio.currentTime = Math.min(restoredPosition, Number.isFinite(mp3Audio.duration) ? mp3Audio.duration : restoredPosition);
          restoredPosition = null;
        }
        if (restorePlayRequested) {
          restorePlayRequested = false;
          mp3Audio.play().catch(() => {
            setStatus('Press Play to continue listening after navigating.');
          });
        }
      }
      setControlsEnabled(true);
      updateDuration();
      savePlayback();
      setStatus('', false, false);
    });
    mp3Audio.addEventListener('timeupdate', () => {
      updateDuration();
      const second = Math.floor(mp3Audio.currentTime);
      if (second !== lastSavedSecond) { lastSavedSecond = second; savePlayback(); }
    });
    mp3Audio.addEventListener('play', () => {
      setPlaybackState(true);
      savePlayback();
      audioChannel?.postMessage({type: 'playing', tabId});
    });
    mp3Audio.addEventListener('pause', () => { setPlaybackState(false); savePlayback(); });
    mp3Audio.addEventListener('ended', () => {
      setPlaybackState(false);
      updateDuration();
      savePlayback();
    });
    mp3Audio.addEventListener('error', () => {
      setControlsEnabled(false);
      updateDuration();
      mp3Upload.hidden = false;
      setStatus('This file could not be played. Choose another MP3.', true);
    });

    mp3Play.addEventListener('click', async () => {
      if (!hasTrack) return;
      if (mp3Audio.paused) {
        try {
          await mp3Audio.play();
        } catch {
          setStatus('Playback could not start. Try again.', true);
        }
      } else {
        mp3Audio.pause();
      }
    });

    const seekBy = seconds => {
      if (!hasTrack || !Number.isFinite(mp3Audio.duration)) return;
      mp3Audio.currentTime = Math.min(mp3Audio.duration, Math.max(0, mp3Audio.currentTime + seconds));
      updateDuration();
      savePlayback();
    };
    mp3SkipBack.addEventListener('click', () => seekBy(-10));
    mp3SkipForward.addEventListener('click', () => seekBy(10));
    mp3Volume.addEventListener('click', () => {
      volumeIndex = (volumeIndex + 1) % volumeSteps.length;
      updateVolume();
      savePlayback();
      showVolumeFeedback();
      setStatus(`Volume ${mp3VolumeValue.textContent}`);
    });
    window.addEventListener('pagehide', savePlayback);
    window.addEventListener('beforeunload', () => {
      savePlayback();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    });
  }
})();
// Hero Typing Animation

function startTypingAnimation() {
    const textElement = document.getElementById("typing-text");
    const cursor = document.querySelector(".typing-cursor");

    if (!textElement || !cursor) return;

    const text = "Hila.";
    const typingSpeed = 180;
    const startDelay = 500;

    let index = 0;

    // Accessibility: skip animation if reduced motion is enabled
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        textElement.innerHTML = 'Hila<span class="typed-dot">.</span>';
        cursor.classList.add("finished");
        return;
    }

    function typeNextCharacter() {
        if (index < text.length) {
            const char = text[index];

            if (char === ".") {
                const dot = document.createElement("span");
                dot.className = "typed-dot";
                dot.textContent = ".";
                textElement.appendChild(dot);
            } else {
                textElement.appendChild(document.createTextNode(char));
            }

            index++;

            setTimeout(typeNextCharacter, typingSpeed);
        } else {
            // Hide cursor after typing finishes
            setTimeout(() => {
                cursor.classList.add("finished");
            }, 1000);
        }
    }

    setTimeout(typeNextCharacter, startDelay);
}

startTypingAnimation();
