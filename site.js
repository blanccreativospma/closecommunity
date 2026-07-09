/* Resolve paths relative to this script's own location, not the page's —
   site.js is shared by index.html (site root) and product/*.html (one level
   down), so a plain relative path would break on one or the other. */
const CC_SCRIPT_URL = document.currentScript && document.currentScript.src;

/* ── CURSOR ── */
const dot = document.getElementById('cDot');
const ring = document.getElementById('cRing');
let mx=0,my=0,rx=0,ry=0;
document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
(function loop(){
  rx += (mx-rx)*.4; ry += (my-ry)*.4;
  dot.style.transform  = `translate3d(${mx-11}px,${my-11}px,0)`;
  ring.style.transform = `translate3d(${rx-19}px,${ry-19}px,0)`;
  requestAnimationFrame(loop);
})();
document.querySelectorAll('button,a').forEach(el=>{
  el.addEventListener('mouseenter',()=>ring.classList.add('hov'));
  el.addEventListener('mouseleave',()=>ring.classList.remove('hov'));
});
document.querySelectorAll('.gv').forEach(el=>{
  el.addEventListener('mouseenter',()=>{ring.classList.remove('hov');ring.classList.add('gon');});
  el.addEventListener('mouseleave',()=>ring.classList.remove('gon'));
});

/* ── LOBBY + JOIN MODAL ── */
/* Only present on index.html — product pages skip straight to content */
const lobby = document.getElementById('lobby');
if (lobby) {
function exitLobby(cb) {
  lobby.classList.add('exit');
  sessionStorage.setItem('cc_entered','1');
  setTimeout(() => {
    lobby.style.display = 'none';
    document.body.style.overflow = '';
    if(cb) cb();
  }, 920);
}
if (sessionStorage.getItem('cc_entered')) {
  lobby.style.display = 'none';
} else {
  document.body.style.overflow = 'hidden';
}
// Menu button: exit lobby → open hamburger menu
document.getElementById('lobbyMenu').addEventListener('click', () => {
  exitLobby(() => openMenu());
});
// Buy button: open email capture modal (stays on lobby)
// — but skip if user dismissed less than 15 min ago
document.getElementById('lobbyBuy').addEventListener('click', () => {
  const skipUntil = localStorage.getItem('cc_skip_until');
  if(skipUntil && Date.now() < parseInt(skipUntil)){
    exitLobby(); // just enter the site
  } else {
    openJoin();
  }
});

/* ── JOIN MODAL ── */
const joinOv    = document.getElementById('joinOv');
const joinModal = document.getElementById('joinModal');
const joinForm  = document.getElementById('joinForm');
const joinDone  = document.getElementById('joinDone');

function openJoin() {
  joinOv.classList.add('open');
  joinModal.classList.add('open');
}
function closeJoin() {
  joinOv.classList.remove('open');
  joinModal.classList.remove('open');
}
function skipJoin() {
  // Store skip timestamp — popup comes back in 15 min
  localStorage.setItem('cc_skip_until', Date.now() + 15 * 60 * 1000);
  closeJoin();
  exitLobby();
  // Schedule repopup after 15 min while user is on the page
  setTimeout(() => {
    if(!localStorage.getItem('cc_joined')) openJoin();
  }, 15 * 60 * 1000);
}

document.getElementById('joinClose').addEventListener('click', skipJoin);
document.getElementById('joinSkip').addEventListener('click', skipJoin);
joinOv.addEventListener('click', skipJoin);

joinForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email   = document.getElementById('joinEmail').value.trim();
  const btn     = document.getElementById('joinSubmit');
  btn.disabled  = true;
  btn.textContent = 'Sending…';

  try {
    /* ─────────────────────────────────────────────────────────
       EMAILJS SETUP — fill in your credentials from emailjs.com
       1. Create free account at emailjs.com
       2. Add Gmail service → copy Service ID below
       3. Create template with variables {{to_email}} {{to_name}}
          (template should send a welcome email TO {{to_email}})
       4. Copy Template ID and Public Key below
    ───────────────────────────────────────────────────────── */
    const SERVICE_ID  = 'service_af1g3c8';
    const TEMPLATE_ID = 'template_l5m9f89';
    const PUBLIC_KEY  = 'm6q09Lyh3NZ_0-zId';

    await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      to_email:     email,
      to_name:      email.split('@')[0],
      from_name:    'Close Community',
      reply_to:     'blanc.creativos@gmail.com',
      discount_code:'CC10FIRST',
      confirm_link: 'https://blanccreativospma.github.io/closecommunity/?welcome=1',
    }, PUBLIC_KEY);

    localStorage.setItem('cc_joined', '1');
    joinForm.classList.add('hide');
    joinDone.classList.add('show');
    setTimeout(() => { closeJoin(); exitLobby(); }, 3000);

  } catch(err) {
    btn.disabled    = false;
    btn.textContent = 'Belong →';
    if (SERVICE_ID === 'YOUR_SERVICE_ID') {
      localStorage.setItem('cc_joined', '1');
      joinForm.classList.add('hide');
      joinDone.classList.add('show');
      setTimeout(() => { closeJoin(); exitLobby(); }, 3000);
    } else {
      toast('Something went wrong. Try again.');
    }
  }
});
} // end if (lobby)

/* ── HAMBURGER MENU ── */
const menuBtn     = document.getElementById('menuBtn');
const menuOverlay = document.getElementById('menuOverlay');

function openMenu() {
  menuOverlay.classList.add('open');
  menuBtn.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  menuOverlay.classList.remove('open');
  menuBtn.classList.remove('open');
  document.body.style.overflow = '';
}
menuBtn.addEventListener('click', () => {
  menuOverlay.classList.contains('open') ? closeMenu() : openMenu();
});
// Close on Escape
document.addEventListener('keydown', e => { if(e.key==='Escape') closeMenu(); });

/* ── COLLECTIONS PANEL ── */
const colOv    = document.getElementById('colOv');
const colPanel = document.getElementById('colPanel');

function openCollections() {
  closeMenu();
  colOv.classList.add('open');
  colPanel.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCollections() {
  colOv.classList.remove('open');
  colPanel.classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('collectionsLink').addEventListener('click', e => {
  e.preventDefault(); openCollections();
});
document.getElementById('colClose').addEventListener('click', closeCollections);
colOv.addEventListener('click', closeCollections);
document.addEventListener('keydown', e => { if(e.key==='Escape') closeCollections(); });

/* ── NAV scroll ── */
const navEl = document.getElementById('nav');
window.addEventListener('scroll', () => {
  navEl.classList.toggle('bg', window.scrollY > 40);
}, {passive:true});

/* ── REVEAL ── */
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('in'); });
}, {threshold:.07});
document.querySelectorAll('.rv').forEach(el => obs.observe(el));

/* ── CART ── */
let cart = JSON.parse(localStorage.getItem('cc_cart') || '[]');
function saveCart() { localStorage.setItem('cc_cart', JSON.stringify(cart)); }
function renderCart() {
  saveCart();
  const n = cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById('cartN').textContent = n;
  const body = document.getElementById('cdBody');
  const foot = document.getElementById('cdFoot');
  if (!cart.length) {
    body.innerHTML = '<div class="cd-empty"><span>Empty.</span></div>';
    foot.style.display = 'none'; return;
  }
  foot.style.display = 'block';
  body.innerHTML = cart.map((item,i)=>`
    <div class="cd-item">
      <div class="cd-thumb"><img src="${item.img}" alt="${item.name}"/></div>
      <div class="cd-info">
        <div>
          <div class="cd-name">${item.name}</div>
          <div class="cd-sub">${item.color ? item.color+' · ' : ''}Size: ${item.size||'OS'} · Qty: ${item.qty}</div>
        </div>
        <div class="cd-price">$${(item.price*item.qty).toFixed(2)}</div>
      </div>
      <button class="cd-rm" onclick="rm(${i})">✕</button>
    </div>`).join('');
  const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('cdTotal').textContent='$'+total.toFixed(2)+' USD';
}
function addCart(btn,name,price,img){
  const pc = btn.closest('.pc-info');
  const card = btn.closest('.pc');
  const carousel = card?.querySelector('.pc-img.carousel');

  let color = null;
  if (carousel) {
    const dotOn = carousel.querySelector('.pc-dot.on');
    if (!dotOn) {
      const dots = carousel.querySelector('.pc-dots');
      if (dots) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
      toast('Select a color first.');
      return;
    }
    color = dotOn.dataset.color;
    img = dotOn.dataset.cartImg || img; // reflect the chosen colorway in the cart thumbnail
  }

  const szEl = pc?.querySelector('.sz.on');
  if(!szEl){
    const szs = pc?.querySelector('.szs');
    if(szs){ szs.classList.remove('shake'); void szs.offsetWidth; szs.classList.add('shake'); }
    toast('Select a size first.');
    return;
  }
  const sz = szEl.textContent;
  const ex = cart.find(i=>i.name===name&&i.size===sz&&(i.color||null)===color);
  if(ex) ex.qty++; else cart.push({name,price,img,size:sz,color,qty:1});
  renderCart(); openCart(); toast('Added.');
}
function rm(i){ cart.splice(i,1); renderCart(); }
function selSz(btn){
  btn.closest('.szs').querySelectorAll('.sz').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}
/* Product card carousel — click a dot to preview a color variant without leaving the grid */
function pcDot(e, dotEl, idx){
  e.preventDefault(); e.stopPropagation();
  const wrap = dotEl.closest('.pc-img.carousel');
  wrap.querySelectorAll('.pc-slide').forEach((s,i)=> s.classList.toggle('on', i===idx));
  wrap.querySelectorAll('.pc-dot').forEach((d,i)=> d.classList.toggle('on', i===idx));
}
function openCart(){
  document.getElementById('cd').classList.add('open');
  document.getElementById('cv').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeCart(){
  document.getElementById('cd').classList.remove('open');
  document.getElementById('cv').classList.remove('open');
  document.body.style.overflow='';
}
document.getElementById('cartBtn').addEventListener('click',openCart);
document.getElementById('cdClose').addEventListener('click',closeCart);
document.getElementById('cv').addEventListener('click',closeCart);

/* ── TOAST ── */
let tt;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('on');
  clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('on'),2000);
}

/* ── TICKER loop ── */
const tk = document.getElementById('tickerT');
tk.innerHTML += tk.innerHTML;

/* ── SERVICE WORKER ── */
if('serviceWorker' in navigator && CC_SCRIPT_URL){
  navigator.serviceWorker.register(new URL('sw.js', CC_SCRIPT_URL).href).catch(()=>{});
}

/* ── INIT — sync cart badge/drawer with anything persisted from a previous page ── */
renderCart();
