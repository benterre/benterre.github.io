/* Presentation only. Data access stays in app.js and the original readers. */
(() => {
  'use strict';
  const icons = {
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    sliders:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="17" r="2" fill="currentColor"/>',
    draw:'<path d="m4 17 5-11 10 5M4 17h8"/><circle cx="4" cy="17" r="1.8"/><circle cx="9" cy="6" r="1.8"/><path d="m13 18 6.7-6.7 2 2L15 20l-3 1Z"/>',
    star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h11"/><path d="m19 15 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>', chevron:'<path d="m7 9 5 5 5-5"/>',
    arrowRight:'<path d="M4 12h16m-6-6 6 6-6 6"/>', reset:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    grid:'<path d="M4 4h16v16H4ZM4 12h16M12 4v16"/>', nodes:'<path d="m6 17 6-10 6 10Z"/><circle cx="6" cy="17" r="3"/><circle cx="12" cy="7" r="3"/><circle cx="18" cy="17" r="3"/>',
    zigzag:'<path d="m3 16 5-8 5 8 5-8 3 4"/>', download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    moon:'<path d="M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10Z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    python:'<path d="M12 2c-5 0-5 2-5 5v3h6v1H5c-3 0-3 8 0 8h2v-3c0-2 1-3 3-3h5c2 0 3-1 3-3V5c0-2-2-3-6-3Z" fill="currentColor" stroke="none"/><path d="M12 22c5 0 5-2 5-5v-3h-6v-1h8c3 0 3-8 0-8h-2v3c0 2-1 3-3 3H9c-2 0-3 1-3 3v5c0 2 2 3 6 3Z" fill="currentColor" opacity=".48" stroke="none"/>',
    mathematica:'<path d="m12 1 2 5 4-3-.5 5 5 .5-4 3 4 3-5 .5.5 5-4-3-2 5-2-5-4 3 .5-5-5-.5 4-3-4-3 5-.5-.5-5 4 3Z"/><path d="m12 6 5 6-5 6-5-6Zm0 0v12M7 12h10"/>'
  };
  const icon = name => `<svg class="mist-icon icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.star}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
  const byId = id => document.getElementById(id), key = 'brane-mist-favorites-v1';
  let saved = [], renderer = null, hydrate = null;
  const registry = new Map();
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(value)) saved = value.filter(e => e && typeof e.id === 'string').slice(0, 500); } catch {}
  const isSaved = id => saved.some(e => e.id === id);
  function toast(message) {
    document.querySelector('.mist-toast')?.remove();
    const el = document.createElement('div'); el.className = 'mist-toast'; el.role = 'status'; el.textContent = message;
    document.body.append(el); setTimeout(() => el.remove(), 2600);
  }
  function sync() {
    document.querySelectorAll('[data-favorite-id]').forEach(b => {
      const yes = isSaved(b.dataset.favoriteId); b.classList.toggle('is-saved', yes); b.setAttribute('aria-pressed', String(yes));
      b.setAttribute('aria-label', `${yes ? 'Remove' : 'Add'} ${b.dataset.favoriteName} ${yes ? 'from' : 'to'} favourites`);
      b.title = b.getAttribute('aria-label');
    });
    document.querySelectorAll('.favorites-count').forEach(e => {e.hidden = !saved.length; e.textContent = saved.length;});
  }
  function button(entry) {
    registry.set(entry.id, entry);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-button favorite-button';
    b.dataset.favoriteId = entry.id; b.dataset.favoriteName = entry.names?.[0] || entry.name || entry.id;
    b.innerHTML = icon('star'); const yes = isSaved(entry.id); b.classList.toggle('is-saved', yes); b.setAttribute('aria-pressed', String(yes));
    b.setAttribute('aria-label', `${yes ? 'Remove' : 'Add'} ${b.dataset.favoriteName} ${yes ? 'from' : 'to'} favourites`);
    b.title = b.getAttribute('aria-label');
    b.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (isSaved(entry.id)) saved = saved.filter(e => e.id !== entry.id);
      else {saved.push(entry); b.classList.add('favorite-pop'); for(let i=0;i<9;i++){const p=document.createElement('span');p.className='favorite-particle';p.setAttribute('aria-hidden','true');p.style.setProperty('--px',Math.cos(i*7)*27+'px');p.style.setProperty('--py',Math.sin(i*7)*27+'px');p.style.setProperty('--pr',i*40+'deg');b.append(p);setTimeout(()=>p.remove(),650);}setTimeout(()=>b.classList.remove('favorite-pop'),650);}
      try {localStorage.setItem(key, JSON.stringify(saved));} catch {toast('Saved for this visit. Browser storage is unavailable.');}
      sync(); if (byId('favorites-drawer').open) {renderDrawer();(byId('favorites-drawer').querySelector('.favorite-button')||byId('favorites-drawer').querySelector('[data-close-dialog]')).focus();}
    });
    return b;
  }
  function renderDrawer() {
    const host = document.querySelector('.favorites-body'); host.replaceChildren();
    if (!saved.length) {const el = document.createElement('div'); el.className='favorites-empty'; el.innerHTML=`<span class="favorites-empty-icon">${icon('star')}</span><h3>Your saved theories</h3><p>Use the star on a theory to keep it here for your next visit.</p>`;host.append(el);return;}
    const list = document.createElement('div'); list.className='favorites-list'; host.append(list);
    for (const entry of saved) {
      if (renderer && entry.points?.length) list.append(renderer(entry));
      else {const row=document.createElement('div');row.className='favorite-row';const a=document.createElement('a');a.href='#/theory/'+encodeURIComponent(entry.id);a.textContent=entry.names?.[0]||entry.name||entry.id;row.append(a,button(entry));list.append(row);if(hydrate)hydrate(entry.id).then(full=>{const i=saved.findIndex(e=>e.id===entry.id);if(i<0)return;saved[i]=full;try{localStorage.setItem(key,JSON.stringify(saved));}catch{}if(row.isConnected&&renderer)row.replaceWith(renderer(full));}).catch(()=>{});}
    }
  }
  const drawer=byId('favorites-drawer'), resource=byId('resourceDialog');
  function close(dialog) {dialog.close();}
  for (const d of [drawer,resource]) {
    d.querySelector('[data-close-dialog]').addEventListener('click',()=>close(d));
    d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close(d);}});
    d.addEventListener('close',()=>{d.classList.remove('is-visible');document.body.style.overflow='';if(d===drawer)byId('favoritesToggle').setAttribute('aria-expanded','false');else{const child=byId('resourceBody').firstElementChild;if(child)byId('resourceStorage').append(child);window.dispatchEvent(new Event('brane:resource-closed'));} });
  }
  byId('favoritesToggle').addEventListener('click',()=>{renderDrawer();drawer.showModal();drawer.classList.add('is-visible');document.body.style.overflow='hidden';byId('favoritesToggle').setAttribute('aria-expanded','true');});
  drawer.addEventListener('click',e=>{if(e.target.closest('.card-link,.favorite-row a'))close(drawer);});
  document.querySelectorAll('[data-resource]').forEach(b=>b.addEventListener('click',()=>{
    const section=byId(b.dataset.resource);byId('resourceTitle').textContent=b.querySelector('strong').textContent;
    if(section.tagName==='DETAILS')section.open=true;
    section.classList.remove('hidden');byId('resourceBody').append(section);resource.showModal();resource.classList.add('is-visible');document.body.style.overflow='hidden';window.dispatchEvent(new CustomEvent('brane:resource-opened',{detail:b.dataset.resource}));
  }));
  const plotColors=new Map();
  function syncTheme() {
    plotColors.clear();
    const dark=document.documentElement.dataset.theme==='dark', b=byId('themeToggle');
    b.innerHTML=icon(dark?'sun':'moon');b.setAttribute('aria-label',`Switch to ${dark?'light':'dark'} mode`);b.title=b.getAttribute('aria-label');
    byId('themeColor').content=dark?'#171d1c':'#f7f8f8';
  }
  byId('themeToggle').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('brane-theme',document.documentElement.dataset.theme);}catch{}syncTheme();window.dispatchEvent(new Event('brane:theme-changed'));});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',event=>{try{if(localStorage.getItem('brane-theme'))return;}catch{}document.documentElement.dataset.theme=event.matches?'dark':'light';syncTheme();window.dispatchEvent(new Event('brane:theme-changed'));});
  document.querySelectorAll('[data-citation-link]').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();const pre=byId('paperCitation');pre.closest('details').open=true;pre.closest('.citation-entry').scrollIntoView({block:'center',behavior:'smooth'});}));
  syncTheme(); sync();
  window.addEventListener('storage',event=>{if(event.key!==key)return;try{const data=JSON.parse(event.newValue||'[]');if(Array.isArray(data)){saved=data.filter(e=>e&&typeof e.id==='string').slice(0,500);sync();if(drawer.open)renderDrawer();}}catch{}});
  window.BraneUI = {icon,button,toast,sync,configure(card,load){renderer=card;hydrate=load;if(drawer.open)renderDrawer();},setTheory(entry){const h=byId('current-favorite');h.replaceChildren();if(entry)h.append(button(entry));sync();},closeResource(){if(resource.open)close(resource);},color(name,fallback){if(!plotColors.has(name))plotColors.set(name,getComputedStyle(document.documentElement).getPropertyValue('--plot-'+name).trim());return plotColors.get(name)||fallback;}};
})();
