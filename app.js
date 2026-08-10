/* TravelNow — interactive passport / visa globe.
   Pure vanilla JS, no runtime dependencies. Renders a world globe on canvas
   with a hand-rolled orthographic projection (and a flat equirectangular map),
   coloured by the visa requirement for the selected passport. */
'use strict';

const COLORS = {
  'visa-free':'#22c55e', voa:'#14b8a6', eta:'#84cc16', evisa:'#f59e0b',
  required:'#ef4444', none:'#94a3b8', home:'#2563eb', nodata:'#d7dee8',
};
const CAT_LABEL = {
  'visa-free':'Visa-free', voa:'Visa on arrival', eta:'eTA',
  evisa:'e-Visa', required:'Visa required', none:'No admission',
};

const state = {
  view:'globe',            // 'globe' | 'map'
  lon:10, lat:25,          // globe centre (deg)
  zoom:1,                  // zoom factor
  panX:0, panY:0,          // map pan (px)
  passport:null,           // ISO3 of selected passport
  hover:null,              // ISO3 under cursor
  data:null, world:null,   // loaded datasets
  ranks:{},                // iso3 -> rank
  scores:{},               // iso3 -> score
  bbox:{}, centroid:{},    // per-feature geometry helpers
};

const $ = s => document.querySelector(s);
const canvas = $('#globe');
const ctx = canvas.getContext('2d');
const tooltip = $('#tooltip');

/* ---------------- data loading ---------------- */
Promise.all([
  fetch('data/world.json').then(r=>r.json()),
  fetch('data/passports.json').then(r=>r.json()),
]).then(([world, data])=>{
  state.world = world; state.data = data;
  prepGeometry();
  computeRanks();
  buildPassportList();
  $('#loading').hidden = true;
  setPassport(detectHomePassport());
  resize();
}).catch(err=>{
  $('#loading').textContent = 'Could not load data: ' + err.message;
});

function prepGeometry(){
  for (const f of state.world.features){
    let minx=180,miny=90,maxx=-180,maxy=-90, sx=0,sy=0,n=0;
    eachRing(f, ring=>{
      for (const [lo,la] of ring){
        if(lo<minx)minx=lo; if(lo>maxx)maxx=lo;
        if(la<miny)miny=la; if(la>maxy)maxy=la;
        sx+=lo; sy+=la; n++;
      }
    });
    state.bbox[f.id] = [minx,miny,maxx,maxy];
    state.centroid[f.id] = [ (minx+maxx)/2, (miny+maxy)/2 ];
  }
}

function eachRing(feature, cb){
  const g = feature.geometry; if(!g) return;
  if (g.type==='Polygon') g.coordinates.forEach(cb);
  else if (g.type==='MultiPolygon') g.coordinates.forEach(poly=>poly.forEach(cb));
}

/* ---------------- visa categorisation ---------------- */
function catOf(req){
  if (req==null) return 'nodata';
  if (req==='visa free' || /^\d+$/.test(req)) return 'visa-free';
  if (req==='visa on arrival') return 'voa';
  if (req==='eta') return 'eta';
  if (req==='e-visa') return 'evisa';
  if (req==='visa required') return 'required';
  if (req==='no admission') return 'none';
  return 'nodata';
}
function badgeText(req){
  const c = catOf(req);
  if (c==='visa-free') return /^\d+$/.test(req) ? req+' days' : 'Visa-free';
  return CAT_LABEL[c] || '—';
}
function reqFor(passport, dest){
  const row = state.data.matrix[passport];
  return row ? row[dest] : undefined;
}
function colorFor(dest){
  if (dest === state.passport) return COLORS.home;
  const r = reqFor(state.passport, dest);
  return COLORS[catOf(r)] || COLORS.nodata;
}

function computeRanks(){
  const arr = [];
  for (const p of Object.keys(state.data.matrix)){
    let s=0;
    const row = state.data.matrix[p];
    for (const d in row){ const c=catOf(row[d]); if(c==='visa-free'||c==='voa'||c==='eta') s++; }
    state.scores[p]=s; arr.push([p,s]);
  }
  arr.sort((a,b)=>b[1]-a[1]);
  let rank=0, prev=null;
  arr.forEach((x,i)=>{ if(x[1]!==prev){rank=i+1; prev=x[1];} state.ranks[x[0]]=rank; });
}

/* ---------------- projection ---------------- */
let R=300, cx=400, cy=300;       // globe radius & centre (set in resize/draw)
function geom(){
  const w=canvas.clientWidth, h=canvas.clientHeight;
  cx=w/2; cy=h/2;
  R = Math.min(w,h)*0.46*state.zoom;
  return {w,h};
}
const D2R = Math.PI/180;

// globe: returns {sx,sy,vis,ux,uy}
function projGlobe(lon,lat){
  const la=lat*D2R, lo=lon*D2R, la0=state.lat*D2R, lo0=state.lon*D2R;
  const dl=lo-lo0;
  const cosc = Math.sin(la0)*Math.sin(la) + Math.cos(la0)*Math.cos(la)*Math.cos(dl);
  const ux = Math.cos(la)*Math.sin(dl);
  const uy = Math.cos(la0)*Math.sin(la) - Math.sin(la0)*Math.cos(la)*Math.cos(dl);
  return { sx: cx+R*ux, sy: cy-R*uy, vis: cosc>=0, ux, uy };
}
function projMap(lon,lat){
  const k = Math.min(canvas.clientWidth/360, canvas.clientHeight/180)*state.zoom;
  return { sx: cx+(lon-state.lon)*k+state.panX, sy: cy-(lat)*k+state.panY, vis:true };
}
function project(lon,lat){ return state.view==='globe' ? projGlobe(lon,lat) : projMap(lon,lat); }

// inverse (screen -> lon/lat) for hit-testing; null if off-globe
function invert(px,py){
  if (state.view==='map'){
    const k = Math.min(canvas.clientWidth/360, canvas.clientHeight/180)*state.zoom;
    const lon = state.lon + (px-cx-state.panX)/k;
    const lat = (cy-py+state.panY)/k;
    if (lat<-90||lat>90) return null;
    return [((lon+540)%360)-180, lat];
  }
  const ux=(px-cx)/R, uy=-(py-cy)/R;
  const rho=Math.hypot(ux,uy); if(rho>1) return null;
  const c=Math.asin(rho), la0=state.lat*D2R;
  const lat = rho===0 ? state.lat : Math.asin(Math.cos(c)*Math.sin(la0)+uy*Math.sin(c)*Math.cos(la0)/rho)/D2R;
  const lon = state.lon + Math.atan2(ux*Math.sin(c), rho*Math.cos(c)*Math.cos(la0)-uy*Math.sin(c)*Math.sin(la0))/D2R;
  return [((lon+540)%360)-180, lat];
}

/* ---------------- drawing ---------------- */
function draw(){
  const {w,h}=geom();
  ctx.clearRect(0,0,w,h);
  if (state.view==='globe'){
    // ocean sphere
    const grd=ctx.createRadialGradient(cx-R*0.35,cy-R*0.35,R*0.2,cx,cy,R);
    grd.addColorStop(0,'#cfe9ff'); grd.addColorStop(1,'#8ec5f2');
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();
    drawGraticule();
    for (const f of state.world.features) drawFeatureGlobe(f);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
    ctx.strokeStyle='rgba(15,23,42,.18)'; ctx.lineWidth=1; ctx.stroke();
  } else {
    ctx.fillStyle='#bfe3ff'; ctx.fillRect(0,0,w,h);
    for (const f of state.world.features) drawFeatureMap(f);
  }
}

function drawGraticule(){
  ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1;
  for (let lat=-60; lat<=60; lat+=30){ ctx.beginPath(); let st=false;
    for (let lon=-180; lon<=180; lon+=4){ const p=projGlobe(lon,lat); if(!p.vis){st=false;continue;} if(!st){ctx.moveTo(p.sx,p.sy);st=true;}else ctx.lineTo(p.sx,p.sy);} ctx.stroke(); }
  for (let lon=-180; lon<180; lon+=30){ ctx.beginPath(); let st=false;
    for (let lat=-90; lat<=90; lat+=4){ const p=projGlobe(lon,lat); if(!p.vis){st=false;continue;} if(!st){ctx.moveTo(p.sx,p.sy);st=true;}else ctx.lineTo(p.sx,p.sy);} ctx.stroke(); }
}

function styleFor(f){
  const fill = colorFor(f.id);
  const hovered = f.id===state.hover;
  return { fill, stroke: hovered?'#0f172a':'rgba(255,255,255,.6)', lw: hovered?1.6:0.6 };
}

function drawFeatureGlobe(f){
  const s=styleFor(f);
  ctx.fillStyle=s.fill; ctx.strokeStyle=s.stroke; ctx.lineWidth=s.lw;
  eachRing(f, ring=>{
    const path = clipRingGlobe(ring);
    if (path.length<2) return;
    ctx.beginPath(); ctx.moveTo(path[0][0],path[0][1]);
    for (let i=1;i<path.length;i++) ctx.lineTo(path[i][0],path[i][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

function drawFeatureMap(f){
  const s=styleFor(f);
  ctx.fillStyle=s.fill; ctx.strokeStyle=s.stroke; ctx.lineWidth=s.lw;
  eachRing(f, ring=>{
    // split on antimeridian jumps
    let prev=null, started=false;
    ctx.beginPath();
    for (const [lo,la] of ring){
      const p=projMap(lo,la);
      if (prev && Math.abs(lo-prev)>180){ started=false; } // break path
      if (!started){ ctx.moveTo(p.sx,p.sy); started=true; } else ctx.lineTo(p.sx,p.sy);
      prev=lo;
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

// clip a polygon ring to the visible hemisphere, inserting limb arcs
function clipRingGlobe(ring){
  const pts = ring.map(([lo,la])=>projGlobe(lo,la));
  const n=pts.length, out=[]; let lastExit=null;
  const ang = p => Math.atan2(p.uy, p.ux);
  const push = p => out.push([p.sx,p.sy]);
  const arc = (a0,a1)=>{ // short-arc along the limb
    let d=a1-a0; while(d> Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    const steps=Math.max(1,Math.round(Math.abs(d)/0.12));
    for(let i=1;i<=steps;i++){ const a=a0+d*i/steps; out.push([cx+R*Math.cos(a), cy-R*Math.sin(a)]); }
  };
  const cross=(A,B)=>{ // find limb point between visible A and hidden B (lon/lat lerp)
    let t0=0,t1=1, Aa=ring[A], Bb=ring[B];
    for(let k=0;k<24;k++){ const t=(t0+t1)/2;
      const p=projGlobe(Aa[0]+(Bb[0]-Aa[0])*t, Aa[1]+(Bb[1]-Aa[1])*t);
      if(p.vis) t0=t; else t1=t; }
    const t=(t0+t1)/2;
    return projGlobe(Aa[0]+(Bb[0]-Aa[0])*t, Aa[1]+(Bb[1]-Aa[1])*t);
  };
  if (pts[0].vis) push(pts[0]);
  for (let i=0;i<n;i++){
    const ai=i, bi=(i+1)%n, A=pts[ai], B=pts[bi];
    if (A.vis && B.vis){ push(B); }
    else if (A.vis && !B.vis){ const I=cross(ai,bi); push(I); lastExit=ang(I); }
    else if (!A.vis && B.vis){ const I=cross(bi,ai);
      if (lastExit!=null){ arc(lastExit, ang(I)); lastExit=null; }
      push(I); push(B); }
  }
  return out;
}

/* ---------------- hit testing ---------------- */
function countryAt(px,py){
  const ll = invert(px,py); if(!ll) return null;
  const [lon,lat]=ll;
  for (const f of state.world.features){
    const b=state.bbox[f.id];
    if (lon<b[0]-0.5||lon>b[2]+0.5||lat<b[1]-0.5||lat>b[3]+0.5) continue;
    if (pointInFeature(f, lon, lat)) return f.id;
  }
  return null;
}
function pointInFeature(f, lon, lat){
  let inside=false;
  eachRing(f, ring=>{
    for (let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if (((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside;
    }
  });
  return inside;
}

/* ---------------- rendering scheduler ---------------- */
let pending=false;
function render(){ if(pending) return; pending=true; requestAnimationFrame(()=>{pending=false; draw();}); }

function resize(){
  const r=canvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1, 2);
  canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (state.world) draw();
}
window.addEventListener('resize', resize);

/* ---------------- interaction ---------------- */
let drag=null;
canvas.addEventListener('pointerdown', e=>{
  canvas.setPointerCapture(e.pointerId);
  drag={x:e.clientX,y:e.clientY,lon:state.lon,lat:state.lat,px:state.panX,py:state.panY,moved:false};
});
canvas.addEventListener('pointermove', e=>{
  if (drag){
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if (Math.abs(dx)+Math.abs(dy)>3) drag.moved=true;
    if (state.view==='globe'){
      state.lon = drag.lon - dx*0.4/state.zoom;
      state.lat = Math.max(-89, Math.min(89, drag.lat + dy*0.4/state.zoom));
      state.lon = ((state.lon+540)%360)-180;
    } else { state.panX=drag.px+dx; state.panY=drag.py+dy; }
    render();
  } else {
    const r=canvas.getBoundingClientRect();
    const id=countryAt(e.clientX-r.left, e.clientY-r.top);
    if (id!==state.hover){ state.hover=id; render(); }
    showTooltip(e, id);
  }
});
canvas.addEventListener('pointerup', e=>{
  if (drag && !drag.moved){
    const r=canvas.getBoundingClientRect();
    const id=countryAt(e.clientX-r.left, e.clientY-r.top);
    if (id) focusCountry(id);
  }
  drag=null;
});
canvas.addEventListener('pointerleave', ()=>{ state.hover=null; tooltip.hidden=true; render(); });
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  state.zoom = Math.max(0.6, Math.min(6, state.zoom * (e.deltaY<0?1.12:0.9)));
  render();
}, {passive:false});

function showTooltip(e, id){
  if (!id){ tooltip.hidden=true; return; }
  const name = state.data.names[id]||id;
  let html = `<strong>${flag(id)} ${name}</strong>`;
  if (id!==state.passport && state.passport){
    const r=reqFor(state.passport,id); const c=catOf(r);
    html += `<span class="tt-badge" style="background:${COLORS[c]||COLORS.nodata}">${badgeText(r)}</span>`;
  } else if (id===state.passport){ html += `<span class="tt-badge" style="background:${COLORS.home}">Your passport</span>`; }
  tooltip.innerHTML=html; tooltip.hidden=false;
  const wrap=canvas.parentElement.getBoundingClientRect();
  tooltip.style.left=(e.clientX-wrap.left+14)+'px';
  tooltip.style.top=(e.clientY-wrap.top+14)+'px';
}

function focusCountry(id){
  // spin globe to the country and surface it in the list
  const c=state.centroid[id];
  if (c && state.view==='globe'){ animateTo(c[0], c[1]); }
  highlightDest(id);
}
let anim=null;
function animateTo(lon,lat){
  if(anim) cancelAnimationFrame(anim);
  const sl=state.lon, sa=state.lat; let dl=lon-sl; while(dl>180)dl-=360; while(dl<-180)dl+=360;
  const da=lat-sa; const t0=performance.now(), dur=500;
  const step=now=>{ const k=Math.min(1,(now-t0)/dur), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    state.lon=sl+dl*e; state.lat=sa+da*e; draw();
    if(k<1) anim=requestAnimationFrame(step); };
  anim=requestAnimationFrame(step);
}

/* ---------------- passport picker ---------------- */
function flag(iso3){
  const a=state.data.iso2[iso3]; if(!a) return '🏳️';
  return [...a.toUpperCase()].map(ch=>String.fromCodePoint(0x1F1E6+ch.charCodeAt(0)-65)).join('');
}
function allPassports(){
  return Object.keys(state.data.matrix)
    .map(iso=>({iso, name:state.data.names[iso]||iso}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
function buildPassportList(filter=''){
  const ul=$('#passport-list'); ul.innerHTML='';
  const q=filter.trim().toLowerCase();
  for (const p of allPassports()){
    if (q && !p.name.toLowerCase().includes(q)) continue;
    const li=document.createElement('li'); li.setAttribute('role','option');
    li.innerHTML=`<span class="flag">${flag(p.iso)}</span><span>${p.name}</span>`;
    li.onclick=()=>{ setPassport(p.iso); closeDropdown(); };
    ul.appendChild(li);
  }
}
function detectHomePassport(){
  const inv={}; for(const k in state.data.iso2) inv[state.data.iso2[k]]=k;
  const reg=(navigator.language||'').split('-')[1];
  if (reg && inv[reg] && state.data.matrix[inv[reg]]) return inv[reg];
  return 'USA';
}

$('#passport-button').onclick=()=>{
  const dd=$('#passport-dropdown'); const open=dd.hidden;
  dd.hidden=!open; $('#passport-button').setAttribute('aria-expanded', String(open));
  if(open){ $('#passport-search').value=''; buildPassportList(); $('#passport-search').focus(); }
};
function closeDropdown(){ $('#passport-dropdown').hidden=true; $('#passport-button').setAttribute('aria-expanded','false'); }
$('#passport-search').addEventListener('input', e=>buildPassportList(e.target.value));
document.addEventListener('click', e=>{ if(!e.target.closest('.combo')) closeDropdown(); });

function setPassport(iso){
  state.passport=iso;
  $('#passport-flag').textContent=flag(iso);
  $('#passport-name').textContent=state.data.names[iso]||iso;
  updateSummary(); renderDestList();
  const c=state.centroid[iso]; if(c) animateTo(c[0],c[1]); else draw();
}

/* ---------------- summary + destination list ---------------- */
let catFilter='all';
function updateSummary(){
  $('#summary').hidden=false;
  const row=state.data.matrix[state.passport]||{};
  const cnt={'visa-free':0,voa:0,eta:0,evisa:0,required:0,none:0};
  for(const d in row){ const c=catOf(row[d]); if(c in cnt) cnt[c]++; }
  $('#c-free').textContent=cnt['visa-free'];
  $('#c-voa').textContent=cnt.voa;
  $('#c-eta').textContent=cnt.eta;
  $('#c-evisa').textContent=cnt.evisa;
  $('#c-req').textContent=cnt.required;
  $('#score-value').textContent=state.scores[state.passport]??(cnt['visa-free']+cnt.voa+cnt.eta);
  $('#rank-value').textContent='#'+(state.ranks[state.passport]||'–');
}

document.querySelectorAll('.brk').forEach(b=>b.onclick=()=>{
  const cat=b.dataset.cat;
  catFilter = catFilter===cat ? 'all' : cat;
  document.querySelectorAll('.brk').forEach(x=>x.classList.toggle('active', x.dataset.cat===catFilter && catFilter!=='all'));
  $('#dest-filter').value = catFilter;
  renderDestList();
});
$('#dest-filter').addEventListener('change', e=>{ catFilter=e.target.value;
  document.querySelectorAll('.brk').forEach(x=>x.classList.toggle('active', x.dataset.cat===catFilter && catFilter!=='all'));
  renderDestList(); });
$('#dest-search').addEventListener('input', renderDestList);

const CAT_ORDER={'visa-free':0,voa:1,eta:2,evisa:3,required:4,none:5,nodata:6};
function renderDestList(){
  const row=state.data.matrix[state.passport]||{};
  const q=$('#dest-search').value.trim().toLowerCase();
  const items=[];
  for (const d in row){
    if (d===state.passport) continue;
    const name=state.data.names[d]||d; const c=catOf(row[d]);
    if (catFilter!=='all' && c!==catFilter) continue;
    if (q && !name.toLowerCase().includes(q)) continue;
    items.push({iso:d,name,req:row[d],cat:c});
  }
  items.sort((a,b)=> (CAT_ORDER[a.cat]-CAT_ORDER[b.cat]) || a.name.localeCompare(b.name));
  const ul=$('#dest-list'); ul.innerHTML='';
  for (const it of items){
    const li=document.createElement('li'); li.className='dest-row'; li.dataset.iso=it.iso;
    li.innerHTML=`<span class="flag">${flag(it.iso)}</span>`+
      `<span class="dname">${it.name}</span>`+
      `<span class="badge" style="background:${COLORS[it.cat]}">${badgeText(it.req)}</span>`;
    li.onclick=()=>{ state.hover=it.iso; focusCountry(it.iso); render(); };
    ul.appendChild(li);
  }
  if(!items.length){ ul.innerHTML='<li style="padding:14px;color:var(--muted);font-size:13px">No destinations match.</li>'; }
}
function highlightDest(id){
  const el=$(`.dest-row[data-iso="${id}"]`);
  if (el){ el.scrollIntoView({block:'nearest'}); el.style.background='#eff6ff'; setTimeout(()=>el.style.background='',900); }
}

/* ---------------- view toggle ---------------- */
$('#view-globe').onclick=()=>switchView('globe');
$('#view-map').onclick=()=>switchView('map');
function switchView(v){
  state.view=v; state.zoom=1; state.panX=0; state.panY=0;
  $('#view-globe').classList.toggle('active', v==='globe');
  $('#view-map').classList.toggle('active', v==='map');
  $('#view-globe').setAttribute('aria-selected', String(v==='globe'));
  $('#view-map').setAttribute('aria-selected', String(v==='map'));
  draw();
}

/* ---------------- PWA ---------------- */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; $('#install-btn').hidden=false; });
$('#install-btn').onclick=async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#install-btn').hidden=true; };
if ('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }
