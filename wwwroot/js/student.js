/* Student store. Simple words, big buttons, Hindi help under the main actions. */
'use strict';

/* ---------------- data ---------------- */
function loadStudent(force) {
  var jobs = [];
  if (force || !S.store) jobs.push(api('GET', '/api/store/me').then(function (j) { S.store = j; }));
  if (force || !S.catalog || Date.now() - S.catalog.at > 5 * 60 * 1000)
    jobs.push(api('GET', '/api/store/catalog').then(function (j) { S.catalog = { at: Date.now(), categories: j.categories, products: j.products }; }));
  return Promise.all(jobs);
}
function pv() { return (S.store && S.store.settings.pointValue) || 0.5; }
function money() { return (S.store && Number(S.store.wallet.money)) || 0; }
function pointsAvail() { return (S.store && S.store.wallet.available) || 0; }
function toPts(rupees) { return Math.ceil(Number(rupees) / pv() - 1e-9); }
function prod(id) { return (S.catalog.products || []).filter(function (p) { return p.id === Number(id); })[0]; }
function cat(id) { return (S.catalog.categories || []).filter(function (c) { return c.id === Number(id); })[0] || { name: '', tint: '#F0EAFF', color: '#6B2FA8' }; }
function canBuy(p) { return p.stock > 0 && Number(p.price) <= money(); }
function needPts(p) { return Math.max(0, toPts(Number(p.price) - money())); }
function inWish(id) { return S.store.wishlist.indexOf(Number(id)) >= 0; }
function cartItems() {
  return Object.keys(S.store.cart || {}).map(function (id) { return { p: prod(id), qty: S.store.cart[id] }; }).filter(function (x) { return x.p && x.qty > 0; });
}
function cartTotal() { return cartItems().reduce(function (s, x) { return s + Number(x.p.price) * x.qty; }, 0); }
function cartCount() { return cartItems().reduce(function (s, x) { return s + x.qty; }, 0); }
function firstName() { return String((S.store.profile && S.store.profile.name) || (S.me && S.me.name) || 'Friend').split(' ')[0]; }
function hvUrl(path) { return (S.store && S.store.hemVirtuesUrl ? S.store.hemVirtuesUrl : '') + (path || '/Learn/Index'); }
function student(fn) { return function (arg, q) { return loadStudent(false).then(function () { return fn(arg, q); }); }; }

/* ---------------- shell ---------------- */
function studentShell(active, body) {
  var nav = [['s-home', 'home', 'Home'], ['s-products', 'bag', 'Shop'], ['s-wishlist', 'heart', 'Wishlist'], ['s-orders', 'box', 'My Orders'], ['s-wallet', 'wallet', 'My Points']];
  var tabs = [['s-home', 'home', 'Home'], ['s-products', 'bag', 'Shop'], ['s-wishlist', 'heart', 'Wishlist'], ['s-cart', 'cart', 'Cart'], ['s-orders', 'box', 'Orders']];
  var n = cartCount();
  var closed = S.store.settings.storeOpen ? '' : '<div class="warn-box" style="max-width:1240px;margin:12px auto 0">' + I('info') + '<span>The store is closed for a short time. You can look around; ordering and redeeming are paused.</span></div>';
  return '<header class="s-head"><div class="in">' + logo(false, '#s-home') +
    '<nav class="s-nav grow" aria-label="Store">' + nav.map(function (x) { return '<a href="#' + x[0] + '" class="' + (active === x[0] ? 'on' : '') + '">' + I(x[1]) + x[2] + '</a>'; }).join('') + '</nav>' +
    '<span class="grow" style="flex:1"></span>' +
    '<a class="wallet-pill" href="#s-wallet" title="Shopping money and points"><span class="coin">₹</span><span><b class="num">' + rs(money()) + '</b><span class="wl">' + num(pointsAvail()) + ' pts</span></span></a>' +
    '<a class="icon-btn" href="#s-cart" aria-label="Cart">' + I('cart') + (n ? '<span class="badge">' + n + '</span>' : '') + '</a>' +
    '<button class="icon-btn hide-sm" data-act="logout" aria-label="Log out" title="Log out">' + I('logout') + '</button>' +
    '</div></header>' + closed +
    '<main class="s-main">' + body + '</main>' +
    '<nav class="tabbar" aria-label="Store">' + tabs.map(function (x) {
      return '<a href="#' + x[0] + '" class="' + (active === x[0] ? 'on' : '') + '">' + I(x[1]) + x[2] + (x[0] === 's-cart' && n ? '<span class="badge">' + n + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
}

function pCard(p) {
  var ok = canBuy(p), wish = inWish(p.id), out = p.stock <= 0;
  var need = needPts(p), have = Math.min(100, Math.round(money() / Number(p.price) * 100));
  return '<article class="p-card' + (ok ? '' : ' locked') + '">' +
    '<button class="heart' + (wish ? ' on' : '') + '" data-act="wish" data-id="' + p.id + '" aria-label="' + (wish ? 'Remove from' : 'Add to') + ' wishlist">' + I('heart') + '</button>' +
    (ok ? '<span class="pill green can-buy">' + I('check') + ' You can buy</span>' : '') +
    '<a class="pic" href="#s-product/' + p.id + '">' + pic(p.imageUrl, p.art, p.name) +
    (ok ? '' : '<span class="lock-veil"><div>' + I('lock') + (out ? 'Out of stock<span class="hi" style="color:#fff;opacity:.85">अभी उपलब्ध नहीं</span>' : 'Need ' + need + ' more points<span class="hi" style="color:#fff;opacity:.85">और पॉइंट्स चाहिए</span>') + '</div></span>') + '</a>' +
    '<div class="body"><a class="name" href="#s-product/' + p.id + '">' + esc(p.name) + '</a>' +
    '<div class="price"><b>' + rs(p.price) + '</b><span>' + toPts(p.price) + ' points</span></div>' +
    (ok ? '<div class="acts"><button class="btn blue sm" data-act="addCart" data-id="' + p.id + '">' + I('cart') + ' Add to Cart</button></div>'
      : '<div class="progress" title="You have ' + have + '% of the price"><i style="width:' + (out ? 0 : have) + '%"></i></div>' +
        '<div class="acts"><button class="btn line sm" data-act="wish" data-id="' + p.id + '">' + I('heart') + (wish ? ' Saved' : ' Save for later') + '</button></div>') +
    '</div></article>';
}

function giftsArt() {
  function box(x, y, w, h, c, r) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="' + c + '"/>' +
      '<rect x="' + (x - 4) + '" y="' + (y - 14) + '" width="' + (w + 8) + '" height="16" rx="4" fill="' + c + '"/>' +
      '<rect x="' + (x + w / 2 - 6) + '" y="' + (y - 14) + '" width="12" height="' + (h + 14) + '" fill="' + r + '"/>' +
      '<path d="M' + (x + w / 2) + ' ' + (y - 14) + ' q-22 -22 -26 -6 q2 10 26 6 q22 -22 26 -6 q-2 10 -26 6Z" fill="' + r + '"/>';
  }
  return '<svg class="gifts" viewBox="0 0 220 150" aria-hidden="true">' +
    '<path d="M18 40 l8 -10 M200 30 l8 -12 M190 70 l14 -2 M30 80 l-12 -4" stroke="#FDB913" stroke-width="5" stroke-linecap="round"/>' +
    box(20, 76, 62, 62, '#FDB913', '#E5243B') + box(86, 60, 66, 78, '#13B0EA', '#fff') + box(156, 84, 54, 54, '#E3247F', '#FDB913') + '</svg>';
}
function confetti() {
  var cols = ['#E3247F', '#FDB913', '#13B0EA', '#2E9E4F', '#6B2FA8', '#F7941D'], s = '<div class="confetti" aria-hidden="true">';
  for (var i = 0; i < 22; i++) s += '<i style="left:' + (4 + i * 4.3) + '%;top:' + (i % 5) * 6 + 'px;background:' + cols[i % cols.length] + ';animation-delay:' + (i % 7) * 0.12 + 's"></i>';
  return s + '</div>';
}
function emptyCard(icon, title, text, link) {
  return '<div class="card empty">' + I(icon) + '<b>' + title + '</b><span>' + text + '</span>' + (link || '') + '</div>';
}

/* ---------------- home ---------------- */
VIEWS['s-home'] = student(function () {
  var w = S.store.wallet, set = S.store.settings, prods = S.catalog.products;
  var afford = prods.filter(canBuy), locked = prods.filter(function (p) { return !canBuy(p); });
  var banner = money() < 1
    ? '<div class="info-box">' + I('sparkle') + '<div><b>Turn your points into shopping money!</b><br>' + (w.available > 0
        ? 'You have ' + num(w.available) + ' points = ' + rs(w.available * pv()) + '. Redeem as many as you like. <a href="#s-redeem">Redeem now →</a>'
        : 'Earn points in HEM Virtues to start shopping. <a href="#s-earn">How to earn points →</a>') + '</div></div>' : '';
  var pr = S.store.profile || {};
  var cls = [pr.standard ? 'Class ' + pr.standard + (pr.division ? ' – ' + pr.division : '') : '', pr.school].filter(Boolean).join(' · ');
  return studentShell('s-home', logo(true) +
    '<section class="hello">' +
      '<div class="hero">' + giftsArt() + (cls ? '<p class="small" style="font-weight:800;opacity:.85">' + esc(cls) + '</p>' : '') +
        '<h1>Hi ' + esc(firstName()) + '! Ready to shop?</h1>' +
        '<p style="margin-top:6px">Good values give you points. Points become shopping money. <span class="hi" style="color:#fff;opacity:.85">अच्छे काम = पॉइंट्स = तोहफ़े</span></p>' +
        '<div class="row"><a class="btn sun lg" href="#s-products">' + I('bag') + ' Start Shopping</a><a class="btn lg" style="background:rgba(255,255,255,.16);color:#fff" href="#s-earn">' + I('star') + ' Earn Points</a></div></div>' +
      '<div class="balance-card"><div class="row between"><span class="label">My Wallet</span><a class="btn sm" href="#s-wallet">Open ' + I('chev') + '</a></div>' +
        '<div class="bal-split">' +
          '<div class="bal-box"><span>Points left</span><b class="num">' + num(w.available) + '</b><span class="hi">बचे पॉइंट्स</span></div>' +
          '<div class="bal-box money"><span>Shopping Money</span><b class="num">' + rs(money()) + '</b><span class="hi">खरीदारी के पैसे</span></div></div>' +
        '<div class="small muted" style="margin-top:10px">Earned in HEM Virtues: <b>' + num(w.earned) + '</b> · Redeemed: <b>' + num(w.redeemed) + '</b>' + (w.stale ? ' · <span class="need">' + I('info') + 'last known total</span>' : '') + '</div>' +
        (w.available > 0 ? '<a class="btn primary block" style="margin-top:12px" href="#s-redeem">' + I('gift') + ' Redeem points (worth ' + rs(w.available * pv()) + ')</a>' : '') +
      '</div></section>' + banner +
    '<section class="stack"><div class="sec-head"><h2>' + I('grid') + ' Shop by category</h2><a href="#s-categories" class="btn sm line">All categories ' + I('chev') + '</a></div>' +
      '<div class="cat-grid">' + S.catalog.categories.map(function (c) {
        return '<a class="cat" href="#s-products" data-act="cat" data-id="' + c.id + '" style="background:' + c.tint + ';color:' + c.color + '"><div class="pic">' + art(c.art) + '</div><b style="color:var(--ink)">' + esc(c.name) + '</b><span class="hi">' + esc(c.nameHi || '') + '</span></a>';
      }).join('') + '</div></section>' +
    (prods.length ? '' : emptyCard('bag', 'The shop is getting ready', 'New gifts are being added. Please come back soon!')) +
    (prods.length ? '<section class="stack"><div class="sec-head"><div><h2>' + I('check') + ' You can buy these now</h2><span class="hi">ये आप अभी ले सकते हैं</span></div><a href="#s-products" data-act="only" data-id="afford" class="btn sm line">See all ' + I('chev') + '</a></div>' +
      (afford.length ? '<div class="p-grid">' + afford.slice(0, 4).map(pCard).join('') + '</div>' : '<div class="card flat empty">' + I('lock') + '<b>Nothing yet</b><span>Redeem your points to get shopping money.</span></div>') + '</section>' : '') +
    (locked.length ? '<section class="stack"><div class="sec-head"><div><h2>' + I('lock') + ' Save points for these</h2><span class="hi">इनके लिए और पॉइंट्स जमा करें</span></div><a href="#s-products" data-act="only" data-id="locked" class="btn sm line">See all ' + I('chev') + '</a></div>' +
      '<div class="p-grid">' + locked.slice(-4).map(pCard).join('') + '</div></section>' : ''));
});

/* ---------------- earn (points come from HEM Virtues) ---------------- */
VIEWS['s-earn'] = student(function () {
  var w = S.store.wallet;
  var ways = [['ui', 'MCQ tests', 'Answer the weekly MCQs of your value courses.'], ['tools', 'Practicals', 'Do the practical activity of each topic.'], ['home', 'Family project', 'Do the project with your family and upload it.'], ['users', 'Group project', 'Work with your friends on the group project.']];
  return studentShell('s-home',
    '<div class="page-title"><div><h1>How to earn points</h1><p>Your points come from <b>HEM Virtues</b>. Every good activity you finish there adds points here. <span class="hi">HEM Virtues में अच्छे काम करें, पॉइंट्स पाएँ</span></p></div>' +
    '<a class="btn primary lg" href="' + esc(hvUrl('/Learn/Index')) + '">' + I('star') + ' Open HEM Virtues</a></div>' +
    '<div class="value-grid">' + ways.map(function (x) {
      return '<div class="value"><div class="row between"><span class="ic plum" style="width:46px;height:46px;border-radius:14px;display:grid;place-items:center">' + I(x[0] === 'ui' ? 'clip' : x[0] === 'tools' ? 'sliders' : x[0]) + '</span></div><b style="font-family:var(--display);font-size:1.15rem">' + x[1] + '</b><span class="small muted">' + x[2] + '</span></div>';
    }).join('') + '</div>' +
    '<div class="card"><div class="card-head"><h3>' + I('wallet') + ' Your points so far</h3></div><div class="bal-split" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="bal-box"><span>Earned in HEM Virtues</span><b class="num">' + num(w.earned) + '</b></div>' +
      '<div class="bal-box" style="background:var(--plum-soft)"><span>Already redeemed</span><b class="num">' + num(w.redeemed) + '</b></div>' +
      '<div class="bal-box money"><span>Points left</span><b class="num">' + num(w.available) + '</b></div></div>' +
      '<p class="small muted" style="margin-top:10px">New points can take a few minutes to show here. Open <a href="#s-wallet">My Points</a> to refresh.</p></div>');
});

/* ---------------- wallet ---------------- */
VIEWS['s-wallet'] = function () {
  return Promise.all([loadStudent(false), api('GET', '/api/store/wallet')]).then(function (r) {
    var j = r[1], w = j.wallet; S.store.wallet = w;
    var label = { redeem: 'Points changed to shopping money', order: 'Order', refund: 'Order cancelled – money back', adjust: 'Points change by HEM' };
    return studentShell('s-wallet',
      '<div class="page-title"><div><h1>My Points Wallet</h1><p>Points you earned and money you can spend. <span class="hi">मेरा पॉइंट्स वॉलेट</span></p></div></div>' +
      (w.stale ? '<div class="warn-box">' + I('info') + '<span>HEM Virtues could not be reached just now, so this shows your last known points.</span></div>' : '') +
      '<div class="hello">' +
        '<div class="balance-card"><span class="label">My Points · पॉइंट्स</span><div class="row" style="align-items:flex-end;margin-top:6px"><span class="big num">' + num(w.available) + '</span><span class="muted" style="font-weight:800;padding-bottom:6px">points left</span></div>' +
          '<div class="pts-split"><div><span>Earned in HEM Virtues</span><b class="num">' + num(w.earned) + '</b></div><div><span>Redeemed in the store</span><b class="num">− ' + num(w.redeemed) + '</b></div>' +
          (w.adjusted ? '<div><span>Changes by HEM</span><b class="num">' + (w.adjusted > 0 ? '+ ' : '− ') + num(Math.abs(w.adjusted)) + '</b></div>' : '') + '</div>' +
          '<div class="muted small" style="margin-top:6px">1 point = ' + rs(w.pointValue) + ' · Your ' + num(w.available) + ' points are worth <b>' + rs(w.available * w.pointValue) + '</b>. Redeem any number of points.</div>' +
          '<div class="row" style="margin-top:14px"><a class="btn primary" href="#s-redeem">' + I('gift') + ' Redeem points</a><a class="btn line" href="#s-earn">' + I('star') + ' Earn more</a></div></div>' +
        '<div class="balance-card" style="border-color:#BDE7C9"><span class="label" style="color:#1D7339">Shopping Money · खरीदारी के पैसे</span><div class="big num" style="margin-top:6px">' + rs(w.money) + '</div>' +
          '<div class="muted small" style="margin-top:6px">Use it in HEM-Store. It never goes to cash.</div>' +
          '<a class="btn green" style="margin-top:14px" href="#s-products">' + I('bag') + ' Go shopping</a></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>' + I('list') + ' History</h3><span class="muted small">Latest first</span></div>' +
      (j.ledger.length ? '<table class="ledger">' + j.ledger.map(function (l) {
        var text = l.kind === 'order' ? (l.note || 'Order') : (l.note || label[l.kind]);
        return '<tr><td class="small muted" style="width:120px">' + when(l.at) + '</td><td><b>' + esc(text) + '</b>' + (l.order_id ? ' <a class="small" href="#s-track/' + l.order_id + '">Track</a>' : '') + '</td><td class="num" style="text-align:right">' +
          (l.points ? '<span class="' + (l.points > 0 ? 'plus' : 'minus') + '">' + (l.points > 0 ? '+' : '') + l.points + ' pts</span>' : '') +
          (Number(l.money) ? '<div class="' + (l.money > 0 ? 'plus' : 'minus') + '">' + (l.money > 0 ? '+' : '−') + rs(Math.abs(l.money)) + '</div>' : '') + '</td></tr>';
      }).join('') + '</table>' : '<p class="muted small">Nothing yet. When you redeem points or order something, it shows here.</p>') + '</div>');
  });
};

/* ---------------- redeem ---------------- */
VIEWS['s-redeem'] = student(function (arg) {
  var w = S.store.wallet, leftMonth = Math.max(0, w.maxRedeemPerMonth - w.redeemedThisMonth);
  if (arg === 'done') {
    return studentShell('s-wallet', '<div class="celebrate pop">' + confetti() + '<div class="tick">' + I('check') + '</div><h1>' + esc(S.lastRedeem || 'Shopping money added!') + '</h1>' +
      '<p style="font-size:1.05rem;margin-top:6px">Your points are now shopping money. <span class="hi">पॉइंट्स अब खरीदारी के पैसे हैं</span></p>' +
      '<div class="bal-split" style="max-width:460px;margin:18px auto 0"><div class="bal-box"><span>Points left</span><b class="num">' + num(w.available) + '</b></div><div class="bal-box money"><span>Shopping money</span><b class="num">' + rs(w.money) + '</b></div></div>' +
      '<div class="row" style="justify-content:center;margin-top:18px"><a class="btn primary lg" href="#s-products">' + I('bag') + ' Go shopping</a></div></div>');
  }
  var max = Math.min(w.available, leftMonth);
  if (!S.redeemPick || S.redeemPick > max) S.redeemPick = max;
  var pick = S.redeemPick;
  var can = max > 0 && S.store.settings.storeOpen;
  return studentShell('s-wallet',
    '<div class="page-title"><div><a href="#s-wallet" class="btn sm line">' + I('back') + ' Wallet</a><h1 style="margin-top:8px">Redeem points</h1><p>Slide to choose how many points become shopping money. <span class="hi">स्लाइड करके पॉइंट्स चुनें</span></p></div></div>' +
    (max < 1 ? '<div class="warn-box">' + I('lock') + '<span>' + (w.available < 1 ? 'You have no points to redeem yet. <a href="#s-earn">Earn points</a>' : 'You have reached this month\'s limit of ' + num(w.maxRedeemPerMonth) + ' points. You can redeem again next month.') + '</span></div>' : '') +
    '<div class="card stack"><h3>1. How many points?</h3>' +
      '<div class="redeem-slider"><input type="range" id="rdRange" min="' + (max > 0 ? 1 : 0) + '" max="' + max + '" step="1" value="' + pick + '" aria-label="Points to redeem"' + (can ? '' : ' disabled') + ' style="--fill:' + (max ? pick / max * 100 : 0) + '%">' +
      '<div class="row between small muted"><span>' + (max > 0 ? 1 : 0) + '</span><span>' + num(max) + ' points</span></div></div>' +
      '<div class="row"><label class="small" for="rdNum" style="font-weight:800">Points</label><input class="input num" id="rdNum" type="number" inputmode="numeric" min="1" max="' + max + '" value="' + pick + '" style="max-width:140px"' + (can ? '' : ' disabled') + '>' +
      [25, 50, 75, 100].map(function (pc) { return '<button type="button" class="chip" data-act="rdPct" data-id="' + pc + '"' + (can ? '' : ' disabled') + '>' + (pc === 100 ? 'All' : pc + '%') + '</button>'; }).join('') + '</div>' +
      '<p class="small muted">You have <b>' + num(w.available) + ' points</b>.' + (w.maxRedeemPerMonth < 1e9 ? ' This month you can still redeem ' + num(leftMonth) + ' points.' : '') + '</p>' +
      '<h3>2. You will get</h3><div class="convert"><div class="cv"><b class="num" style="color:#8A5A00" id="rdPts">' + num(pick) + '</b><span class="small"><b>points</b></span></div><div class="arrow">' + I('arrow') + '</div>' +
      '<div class="cv"><b class="num" style="color:var(--leaf)" id="rdMoney">' + rs(pick * pv()) + '</b><span class="small"><b>shopping money</b></span></div></div>' +
      '<div class="info-box">' + I('info') + '<span>1 point = ' + rs(pv()) + '. Shopping money can only be used in HEM-Store. Redeemed points cannot be changed back.</span></div>' +
      '<button class="btn primary lg block" data-act="redeem" id="rdBtn" ' + (can && pick >= 1 ? '' : 'disabled') + '>' + I('gift') + ' Redeem <span id="rdBtnPts">' + num(pick) + '</span> points <span class="sub">पॉइंट्स बदलें</span></button></div>');
});
function rdSet(n) {
  var r = document.getElementById('rdRange'); if (!r) return;
  var max = Number(r.max); n = Math.max(max > 0 ? 1 : 0, Math.min(max, Math.round(Number(n) || 0)));
  S.redeemPick = n;
  r.value = n; r.style.setProperty('--fill', (max ? n / max * 100 : 0) + '%');
  var box = document.getElementById('rdNum'); if (document.activeElement !== box) box.value = n;
  document.getElementById('rdPts').textContent = num(n);
  document.getElementById('rdMoney').textContent = rs(n * pv());
  document.getElementById('rdBtnPts').textContent = num(n);
  document.getElementById('rdBtn').disabled = !(n >= 1 && S.store.settings.storeOpen);
}
document.addEventListener('input', function (e) {
  if (e.target.id === 'rdRange') rdSet(e.target.value);
  if (e.target.id === 'rdNum' && e.target.value !== '') rdSet(e.target.value);
});
document.addEventListener('change', function (e) { if (e.target.id === 'rdNum') { rdSet(e.target.value); e.target.value = S.redeemPick; } });
ACT.rdPct = function (el, pc) { var max = Number(document.getElementById('rdRange').max); rdSet(Math.max(1, Math.round(max * Number(pc) / 100))); };
ACT.redeem = function (btn) {
  busy(btn, api('POST', '/api/store/redeem', { points: S.redeemPick }).then(function (j) {
    S.store.wallet = j.wallet; S.lastRedeem = j.message; S.redeemPick = 0; go('s-redeem/done');
  })).catch(function () { });
};

/* ---------------- catalogue ---------------- */
ACT.cat = function (el, id) { S.filter.cat = id ? Number(id) : ''; S.filter.only = 'all'; if (route().name !== 's-products') go('s-products'); else render(); };
ACT.only = function (el, id) { S.filter.only = id; if (route().name !== 's-products') go('s-products'); else render(); };
ACT.search = function (el) { S.filter.q = el.value; clearTimeout(S.searchT); S.searchT = setTimeout(function () { var pos = el.selectionStart; render(); setTimeout(function () { var i = document.getElementById('shopSearch'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 30); }, 250); };
document.addEventListener('input', function (e) { if (e.target.id === 'shopSearch') ACT.search(e.target); });

VIEWS['s-categories'] = student(function () {
  return studentShell('s-products',
    '<div class="page-title"><div><h1>Categories</h1><p>Pick what you like. <span class="hi">अपनी पसंद चुनें</span></p></div></div>' +
    '<div class="cat-grid big">' + S.catalog.categories.map(function (c) {
      var list = S.catalog.products.filter(function (p) { return p.categoryId === c.id; }), ok = list.filter(canBuy).length;
      return '<a class="cat" href="#s-products" data-act="cat" data-id="' + c.id + '" style="background:' + c.tint + ';color:' + c.color + ';padding:16px"><div class="pic">' + art(c.art) + '</div>' +
        '<b style="color:var(--ink);font-size:1.25rem">' + esc(c.name) + '</b><span class="hi">' + esc(c.nameHi || '') + '</span>' +
        '<span class="row small" style="color:var(--ink);font-weight:800">' + list.length + ' items · <span class="pill green">' + ok + ' you can buy</span></span></a>';
    }).join('') + '</div>');
});

VIEWS['s-products'] = student(function () {
  var f = S.filter, q = String(f.q || '').toLowerCase();
  var list = S.catalog.products.filter(function (p) {
    if (f.cat && p.categoryId !== f.cat) return false;
    if (q && (p.name + ' ' + (p.nameHi || '')).toLowerCase().indexOf(q) < 0) return false;
    if (f.only === 'afford') return canBuy(p);
    if (f.only === 'locked') return !canBuy(p);
    return true;
  }).sort(function (a, b) { return (canBuy(b) - canBuy(a)) || a.price - b.price; });
  var c = f.cat ? cat(f.cat) : null, all = S.catalog.products;
  return studentShell('s-products',
    '<div class="page-title"><div><span class="crumb">HEM-Store' + (c ? ' › ' + esc(c.name) : '') + '</span><h1>' + (c ? esc(c.name) : 'All products') + '</h1>' +
    '<p>You have <b>' + rs(money()) + '</b> to spend. Green ones you can buy now. <span class="hi">हरे वाले अभी खरीद सकते हैं</span></p></div>' +
    '<div class="row"><span class="pill green">' + I('check') + ' ' + all.filter(canBuy).length + ' you can buy</span><span class="pill gray">' + I('lock') + ' ' + all.filter(function (p) { return !canBuy(p); }).length + ' need more points</span></div></div>' +
    '<div class="toolbar"><input class="input" id="shopSearch" type="search" placeholder="Search gifts" aria-label="Search gifts" value="' + esc(f.q || '') + '"></div>' +
    '<div class="filters">' + [['all', 'All'], ['afford', 'I can buy'], ['locked', 'Need more points']].map(function (o) {
      return '<button class="chip' + (f.only === o[0] ? ' on' : '') + '" data-act="only" data-id="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '<span style="width:10px"></span>' +
    '<button class="chip' + (!f.cat ? ' on' : '') + '" data-act="cat" data-id="">All categories</button>' +
    S.catalog.categories.map(function (k) { return '<button class="chip' + (f.cat === k.id ? ' on' : '') + '" data-act="cat" data-id="' + k.id + '">' + esc(k.name) + '</button>'; }).join('') + '</div>' +
    (list.length ? '<div class="p-grid">' + list.map(pCard).join('') + '</div>' : emptyCard('search', 'No products here', 'Try another filter.')));
});

VIEWS['s-product'] = student(function (id) {
  var p = prod(id);
  if (!p) return studentShell('s-products', emptyCard('search', 'This product is not available', 'It may be sold out or removed.', '<a class="btn primary" href="#s-products">Back to shop</a>'));
  var ok = canBuy(p), c = cat(p.categoryId), wish = inWish(p.id), out = p.stock <= 0;
  var have = Math.min(100, Math.round(money() / Number(p.price) * 100));
  return studentShell('s-products',
    '<a href="#s-products" class="btn sm line" style="align-self:flex-start">' + I('back') + ' Back to shop</a>' +
    '<div class="pd"><div class="gallery" style="position:relative">' + pic(p.imageUrl, p.art, p.name) + '</div>' +
    '<div class="stack"><span class="pill" style="background:' + c.tint + ';color:' + c.color + ';align-self:flex-start">' + esc(c.name) + '</span>' +
      '<h1>' + esc(p.name) + '</h1>' + (p.nameHi ? '<span class="hi" style="font-size:1.1rem;margin-top:-8px">' + esc(p.nameHi) + '</span>' : '') +
      '<div class="row"><span class="price-big num">' + rs(p.price) + '</span><span class="pill sun" style="font-size:.9rem">' + toPts(p.price) + ' points</span>' +
      (p.mrp && Number(p.mrp) > Number(p.price) ? '<span class="small muted"><s>MRP ' + rs(p.mrp) + '</s></span>' : '') +
      '<span class="pill green">' + I('truck') + ' Free delivery</span></div>' +
      (out ? '<div class="warn-box">' + I('lock') + '<span>Out of stock right now. Save it in your wishlist and check again soon.</span></div>'
        : ok ? '<div class="ok-box">' + I('check') + '<span>Yes! You can buy this. You will have ' + rs(money() - Number(p.price)) + ' left.</span></div>'
        : '<div class="warn-box">' + I('lock') + '<span>Need more points: ' + (pointsAvail() >= needPts(p) ? 'redeem ' + needPts(p) + ' more points to buy this. <a href="#s-redeem">Redeem now</a>' : 'earn ' + needPts(p) + ' more points to buy this.') + ' <span class="hi" style="color:inherit">और ' + needPts(p) + ' पॉइंट्स चाहिए</span></span></div>' +
          '<div><div class="row between small"><b>You have ' + rs(money()) + ' of ' + rs(p.price) + '</b><span class="muted">' + have + '%</span></div><div class="progress" style="margin-top:6px"><i style="width:' + have + '%"></i></div></div>') +
      '<div class="row">' + (ok
        ? '<button class="btn blue lg grow" data-act="addCart" data-id="' + p.id + '">' + I('cart') + ' Add to Cart <span class="sub">कार्ट में डालें</span></button><button class="btn sun lg" data-act="buyNow" data-id="' + p.id + '">Buy now</button>' +
          '<button class="btn line lg" data-act="wish" data-id="' + p.id + '" aria-label="Wishlist" style="color:var(--magenta)">' + I('heart') + '</button>'
        : '<button class="btn pink lg grow" data-act="wish" data-id="' + p.id + '">' + I('heart') + (wish ? ' Saved in Wishlist' : ' Add to Wishlist') + '</button><a class="btn line lg" href="#s-earn">' + I('star') + ' Earn points</a>') + '</div>' +
      '<div class="facts"><div class="fact"><b>' + esc(p.ageGroup) + '</b><span>Age</span></div><div class="fact"><b>' + (out ? '0' : p.stock < 10 ? p.stock : '10+') + '</b><span>In stock</span></div><div class="fact"><b>' + esc(S.store.settings.deliveryDays) + '</b><span>Delivery</span></div></div>' +
      (p.about || p.points.length ? '<div class="card flat"><h3>About this</h3>' + (p.about ? '<p style="margin:6px 0 10px">' + esc(p.about) + '</p>' : '') +
        (p.points.length ? '<ul class="ticks">' + p.points.map(function (x) { return '<li>' + I('check') + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>' : '') +
      '<p class="small muted">' + I('store') + ' Sold and delivered by a HEM-approved shop near you' + (p.vendorCity ? ' (' + esc(p.vendorCity) + ')' : '') + '.</p>' +
    '</div></div>');
});

ACT.wish = function (el, id) {
  busy(el, api('POST', '/api/store/wishlist/' + id).then(function (j) { S.store.wishlist = j.wishlist; toast(j.message); render(); })).catch(function () { });
};
ACT.addCart = function (el, id) {
  busy(el, api('POST', '/api/store/cart/' + id, { add: true }).then(function (j) { S.store.cart = j.cart; toast(j.message); render(); })).catch(function () { });
};
ACT.buyNow = function (el, id) {
  busy(el, api('POST', '/api/store/cart/' + id, { add: true }).then(function (j) { S.store.cart = j.cart; go('s-cart'); })).catch(function () { });
};

/* ---------------- wishlist ---------------- */
VIEWS['s-wishlist'] = student(function () {
  var list = S.store.wishlist.map(prod).filter(Boolean);
  return studentShell('s-wishlist',
    '<div class="page-title"><div><h1>My Wishlist</h1><p>Things you want to get. Keep earning points! <span class="hi">मेरी पसंद की चीज़ें</span></p></div><span class="pill pink">' + I('heart') + ' ' + list.length + ' saved</span></div>' +
    (list.length ? '<div class="stack">' + list.map(function (p) {
      var ok = canBuy(p), have = Math.min(100, Math.round(money() / Number(p.price) * 100));
      return '<div class="card order-card"><a class="pic" href="#s-product/' + p.id + '">' + pic(p.imageUrl, p.art, p.name) + '</a><div class="stack" style="gap:6px;min-width:0"><b style="font-size:1.05rem">' + esc(p.name) + '</b>' +
        '<div class="row"><b class="num" style="font-family:var(--display);font-size:1.3rem">' + rs(p.price) + '</b><span class="pill sun">' + toPts(p.price) + ' points</span>' + (ok ? '<span class="pill green">' + I('check') + ' You can buy now</span>' : p.stock <= 0 ? '<span class="need">' + I('lock') + 'Out of stock</span>' : '<span class="need">' + I('lock') + 'Need ' + needPts(p) + ' more points</span>') + '</div>' +
        '<div class="progress' + (ok ? ' green' : '') + '"><i style="width:' + have + '%"></i></div><span class="small muted">You have ' + rs(Math.min(money(), Number(p.price))) + ' of ' + rs(p.price) + '</span></div>' +
        '<div class="row">' + (ok ? '<button class="btn blue" data-act="addCart" data-id="' + p.id + '">' + I('cart') + ' Add to Cart</button>' : '<a class="btn line" href="#s-earn">' + I('star') + ' Earn points</a>') +
        '<button class="btn danger sm" data-act="wish" data-id="' + p.id + '" aria-label="Remove">' + I('trash') + '</button></div></div>';
    }).join('') + '</div>' : emptyCard('heart', 'Your wishlist is empty', 'Tap the heart on a product to save it here.', '<a class="btn primary" href="#s-products">Go to shop</a>')));
});

/* ---------------- cart and checkout ---------------- */
VIEWS['s-cart'] = student(function () {
  var items = cartItems(), total = cartTotal(), ok = total <= money();
  return studentShell('s-cart',
    '<div class="page-title"><div><h1>My Cart</h1><p>Check your things before you order. <span class="hi">मेरी कार्ट</span></p></div></div>' +
    (items.length ? '<div class="cart-layout"><div class="card">' + items.map(function (x) {
      return '<div class="line-item"><a class="pic" href="#s-product/' + x.p.id + '">' + pic(x.p.imageUrl, x.p.art, x.p.name) + '</a><div style="min-width:0"><b>' + esc(x.p.name) + '</b><div class="muted small">' + rs(x.p.price) + ' each · ' + toPts(x.p.price) + ' points</div>' +
        '<div class="row" style="margin-top:8px"><span class="qty"><button data-act="qty" data-id="' + x.p.id + '" data-d="-1" aria-label="Less" ' + (x.qty <= 1 ? 'disabled' : '') + '>−</button><span>' + x.qty + '</span><button data-act="qty" data-id="' + x.p.id + '" data-d="1" aria-label="More" ' + (x.qty >= Math.min(10, x.p.stock) ? 'disabled' : '') + '>+</button></span>' +
        '<button class="btn danger sm" data-act="remove" data-id="' + x.p.id + '">' + I('trash') + ' Remove</button></div></div><b class="num" style="font-family:var(--display);font-size:1.3rem">' + rs(Number(x.p.price) * x.qty) + '</b></div>';
    }).join('') + '</div>' +
    '<div class="card stack"><h3>Bill</h3><div><div class="sum-row"><span>Items (' + cartCount() + ')</span><span class="num">' + rs(total) + '</span></div>' +
      '<div class="sum-row"><span>Delivery</span><span class="pill green">FREE</span></div>' +
      '<div class="sum-row total"><span>To pay</span><span class="num">' + rs(total) + '</span></div>' +
      '<div class="sum-row"><span class="muted">My shopping money</span><span class="num">' + rs(money()) + '</span></div>' +
      '<div class="sum-row"><span class="muted">Left after order</span><span class="num">' + rs(Math.max(0, money() - total)) + '</span></div></div>' +
      (ok ? '<div class="ok-box">' + I('check') + 'You have enough money!</div>' : '<div class="warn-box">' + I('lock') + '<span>You need ' + rs(total - money()) + ' more. ' + (pointsAvail() >= toPts(total - money()) ? '<a href="#s-redeem">Redeem points</a> or remove an item.' : 'Remove an item or earn points.') + '</span></div>') +
      '<a class="btn primary lg block' + (ok ? '' : ' disabled') + '" href="#s-checkout" ' + (ok ? '' : 'aria-disabled="true" tabindex="-1"') + '>Next: Delivery address ' + I('arrow') + '</a></div></div>'
    : emptyCard('cart', 'Your cart is empty', 'Find something you like in the shop.', '<a class="btn primary" href="#s-products">Go to shop</a>')));
});
ACT.qty = function (el, id) {
  var q = (S.store.cart[id] || 1) + Number(el.getAttribute('data-d'));
  busy(el, api('POST', '/api/store/cart/' + id, { qty: q }).then(function (j) { S.store.cart = j.cart; render(); })).catch(function () { });
};
ACT.remove = function (el, id) {
  busy(el, api('DELETE', '/api/store/cart/' + id).then(function (j) { S.store.cart = j.cart; render(); })).catch(function () { });
};

VIEWS['s-checkout'] = student(function () {
  var items = cartItems(), total = cartTotal();
  if (!items.length) { go('s-cart'); return ''; }
  var pr = S.store.profile || {}, a = S.address || {};
  function v(k, d) { return esc(a[k] != null ? a[k] : (d || '')); }
  var steps = '<div class="steps"><span class="st done"><i>' + I('check') + '</i>Cart</span><span class="bar"></span><span class="st on"><i>2</i>Address</span><span class="bar"></span><span class="st"><i>3</i>Done</span></div>';
  return studentShell('s-cart',
    '<div class="page-title"><div><a href="#s-cart" class="btn sm line">' + I('back') + ' Cart</a><h1 style="margin-top:8px">Where should we deliver?</h1><p>Ask your parent to check this. <span class="hi">पता माता-पिता से जाँच करवाएँ</span></p></div>' + steps + '</div>' +
    '<form class="cart-layout" data-submit="placeOrder" novalidate><div class="card stack">' +
      '<div class="grid2"><div class="field"><label for="aName">Parent / receiver name</label><input class="input" id="aName" maxlength="100" value="' + v('receiverName') + '" required></div>' +
      '<div class="field"><label for="aMobile">Mobile number</label><input class="input" id="aMobile" value="' + v('mobile', pr.mobile) + '" inputmode="tel" maxlength="13" required></div></div>' +
      '<div class="field"><label for="aAddr">House, street and area</label><input class="input" id="aAddr" maxlength="300" value="' + v('address', pr.address) + '" required></div>' +
      '<div class="grid3"><div class="field"><label for="aCity">City</label><input class="input" id="aCity" maxlength="80" value="' + v('city', pr.city) + '" required></div>' +
      '<div class="field"><label for="aState">State</label><input class="input" id="aState" maxlength="80" value="' + v('state', pr.state) + '" required></div>' +
      '<div class="field"><label for="aPin">PIN code</label><input class="input" id="aPin" value="' + v('pincode', pr.pincode) + '" inputmode="numeric" maxlength="6" required></div></div>' +
      '<div class="field"><label for="aNote">Note for delivery (optional)</label><input class="input" id="aNote" maxlength="200" value="' + v('note') + '" placeholder="e.g. Call before coming"></div>' +
      '<label class="row small" style="font-weight:800"><input type="checkbox" id="aParent" style="width:18px;height:18px;accent-color:var(--plum)"> My parent has checked this address</label>' +
      '<div class="form-error" id="aError" hidden></div>' +
    '</div>' +
    '<div class="card stack"><h3>Your order</h3>' + items.map(function (x) {
      return '<div class="row" style="flex-wrap:nowrap"><div style="width:64px;border-radius:10px;overflow:hidden;flex:0 0 auto">' + pic(x.p.imageUrl, x.p.art, x.p.name) + '</div><div class="grow small"><b>' + esc(x.p.name) + '</b><div class="muted">Qty ' + x.qty + '</div></div><b class="num">' + rs(Number(x.p.price) * x.qty) + '</b></div>';
    }).join('') +
      '<div><div class="sum-row"><span>Pay from HEM shopping money</span><span class="num">' + rs(total) + '</span></div><div class="sum-row"><span class="muted">Money left after order</span><span class="num">' + rs(money() - total) + '</span></div></div>' +
      '<div class="info-box">' + I('truck') + '<span>Free delivery in ' + esc(S.store.settings.deliveryDays) + ' by a HEM-approved shop near your PIN code.</span></div>' +
      '<button class="btn green lg block" type="submit" ' + (S.store.settings.storeOpen ? '' : 'disabled') + '>' + I('check') + ' Place Order <span class="sub">ऑर्डर करें</span></button></div></form>');
});
ACT.placeOrder = function (btn) {
  var err = document.getElementById('aError'); err.hidden = true;
  var a = { receiverName: val('aName'), mobile: val('aMobile'), address: val('aAddr'), city: val('aCity'), state: val('aState'), pincode: val('aPin'), note: val('aNote'), parentChecked: document.getElementById('aParent').checked };
  S.address = a;
  busy(btn, api('POST', '/api/store/orders', a).then(function (j) {
    S.address = null; S.catalog = null;
    return loadStudent(true).then(function () { go('s-confirm/' + j.id); });
  }).catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

/* ---------------- orders ---------------- */
function kidStatus(st) {
  return {
    Placed: 'We got your order. HEM team is checking it.', Verified: 'HEM team checked your order.', Assigned: 'A shop near you will send it.',
    Accepted: 'The shop is getting your order ready.', Packed: 'Your order is packed in a box!', Shipped: 'Your order is on the way.',
    'Out for delivery': 'It will reach you today!', Delivered: 'Delivered! Enjoy your gift.', Cancelled: 'This order was cancelled. The money is back in your wallet.'
  }[st] || st;
}
function loadOrder(id) { return Promise.all([loadStudent(false), api('GET', '/api/store/orders/' + id)]).then(function (r) { return r[1]; }); }

VIEWS['s-confirm'] = function (id) {
  return loadOrder(id).then(function (j) {
    var o = j.order;
    return studentShell('s-orders',
      '<div class="celebrate pop">' + confetti() + '<div class="tick">' + I('check') + '</div><h1>Yay! Your order is placed</h1>' +
      '<p style="font-size:1.05rem;margin-top:4px">Order number <b class="num">' + esc(o.orderNo) + '</b> · <span class="hi">आपका ऑर्डर हो गया</span></p>' +
      '<div class="stack" style="max-width:520px;margin:18px auto 0;text-align:left">' + j.items.map(function (x) {
        return '<div class="card flat row" style="flex-wrap:nowrap"><div style="width:84px;border-radius:12px;overflow:hidden;flex:0 0 auto">' + pic(x.imageUrl, x.art, x.name) + '</div><div class="grow"><b>' + esc(x.name) + '</b><div class="muted small">Qty ' + x.qty + '</div></div><b class="num">' + rs(x.total) + '</b></div>';
      }).join('') +
      '<div class="bal-split"><div class="bal-box money"><span>Paid from shopping money</span><b class="num">' + rs(o.amount) + '</b></div><div class="bal-box"><span>Money left</span><b class="num">' + rs(money()) + '</b></div></div>' +
      '<div class="info-box">' + I('truck') + '<span>Delivery in ' + esc(S.store.settings.deliveryDays) + ' to ' + esc(o.address) + ', ' + esc(o.city) + ' ' + esc(o.pincode) + '</span></div></div>' +
      '<div class="row" style="justify-content:center;margin-top:18px"><a class="btn primary lg" href="#s-track/' + o.id + '">' + I('truck') + ' Track my order</a><a class="btn line lg" href="#s-products">Keep shopping</a></div></div>');
  });
};

VIEWS['s-orders'] = function () {
  return Promise.all([loadStudent(false), api('GET', '/api/store/orders')]).then(function (r) {
    var rows = r[1].orders;
    return studentShell('s-orders',
      '<div class="page-title"><div><h1>My Orders</h1><p>See where your things are. <span class="hi">मेरे ऑर्डर</span></p></div></div>' +
      (rows.length ? '<div class="stack">' + rows.map(function (o) {
        var idx = statusIndex(o.status), seg = ORDER_FLOW.map(function (s, i) { return '<i class="' + (i <= idx ? 'on' : '') + '"></i>'; }).join('');
        return '<div class="card order-card"><div class="pic">' + pic(o.firstImageUrl, o.firstArt, '') + '</div><div style="min-width:0"><div class="row"><b>' + esc(o.items) + '</b>' + statusPill(o.status) + '</div>' +
          '<div class="muted small">Order ' + esc(o.orderNo) + ' · ' + when(o.placedAt) + ' · ' + rs(o.amount) + '</div>' + (o.status === 'Cancelled' ? '' : '<div class="mini-track">' + seg + '</div>') +
          '<div class="small" style="margin-top:6px;font-weight:800">' + kidStatus(o.status) + '</div></div>' +
          '<div class="row"><a class="btn primary" href="#s-track/' + o.id + '">' + I('truck') + ' Track</a>' +
          (o.status === 'Delivered' && !o.studentReceivedAt ? '<a class="btn green" href="#s-delivered/' + o.id + '">' + I('check') + ' I got it</a>' : o.studentReceivedAt ? '<span class="pill green">' + I('check') + ' Received</span>' : '') + '</div></div>';
      }).join('') + '</div>' : emptyCard('box', 'No orders yet', 'When you buy something, you can follow it here.', '<a class="btn primary" href="#s-products">Go to shop</a>')));
  });
};

VIEWS['s-track'] = function (id) {
  return loadOrder(id).then(function (j) {
    var o = j.order, idx = statusIndex(o.status), cancelled = o.status === 'Cancelled';
    var labels = { Placed: 'Order placed', Verified: 'Checked by HEM team', Assigned: 'Given to a shop near you', Accepted: 'Shop accepted your order', Packed: 'Packed', Shipped: 'On the way', 'Out for delivery': 'Out for delivery', Delivered: 'Delivered' };
    var icons = { Placed: 'check', Verified: 'shield', Assigned: 'store', Accepted: 'clip', Packed: 'box', Shipped: 'truck', 'Out for delivery': 'pin', Delivered: 'gift' };
    var at = {}; j.events.forEach(function (e) { at[e.status] = e; });
    var first = j.items[0] || {};
    return studentShell('s-orders',
      '<div class="page-title"><div><a href="#s-orders" class="btn sm line">' + I('back') + ' My Orders</a><h1 style="margin-top:8px">Track order</h1><p>Order ' + esc(o.orderNo) + ' · <span class="hi">ऑर्डर कहाँ है</span></p></div>' + statusPill(o.status) + '</div>' +
      '<div class="cart-layout"><div class="card"><div class="ok-box" style="margin-bottom:16px;' + (cancelled ? '' : 'background:var(--blue-soft);color:#173F86') + '">' + I(cancelled ? 'info' : icons[o.status]) + '<span style="font-size:1.05rem">' + kidStatus(o.status) + (cancelled && o.cancelReason ? '<br><span class="small">' + esc(o.cancelReason) + '</span>' : '') + '</span></div>' +
        (cancelled ? '' : '<ol class="timeline">' + ORDER_FLOW.map(function (s, i) {
          var cls = i < idx || (i === idx && s === 'Delivered') ? 'done' : i === idx ? 'now' : '';
          return '<li class="' + cls + '"><span class="dot">' + I(icons[s]) + '</span><div><b>' + labels[s] + '</b><span class="when">' + (at[s] ? whenTime(at[s].at) : 'Waiting') + '</span>' +
            (s === 'Assigned' && at[s] && o.vendorName ? '<div class="small muted">' + esc(o.vendorName) + (o.vendorCity ? ', ' + esc(o.vendorCity) : '') + '</div>' : '') +
            (at[s] && at[s].note && s !== 'Placed' && s !== 'Verified' && s !== 'Assigned' ? '<div class="small muted">' + esc(at[s].note) + '</div>' : '') + '</div></li>';
        }).join('') + '</ol>') + '</div>' +
      '<div class="stack"><div class="card row" style="flex-wrap:nowrap"><div style="width:96px;border-radius:12px;overflow:hidden;flex:0 0 auto">' + pic(first.imageUrl, first.art, first.name) + '</div><div><b>' + esc(o.items) + '</b><div class="muted small">' + rs(o.amount) + ' · paid from shopping money</div></div></div>' +
        (o.deliveryCode ? '<div class="card stack" style="gap:8px"><b>' + I('shield') + ' Delivery code</b><span class="small muted">Tell this code to the delivery person only when you get your parcel.</span><span class="otp num">' + esc(o.deliveryCode) + '</span><span class="hi small">पार्सल मिलने पर यह कोड बताएँ</span></div>' : '') +
        (o.status === 'Delivered' ? '<div class="card stack" style="gap:10px"><b>' + I('camera') + ' Delivery photo</b>' + (o.hasProof ? '<div class="proof-photo"><img src="/api/store/orders/' + o.id + '/proof" alt="Delivery photo from the shop" style="width:100%;display:block"></div>' : '') +
          (o.receivedBy ? '<span class="small muted">Received by <b>' + esc(o.receivedBy) + '</b></span>' : '') +
          (o.studentReceivedAt ? '<span class="pill green">' + I('check') + ' You confirmed you got it</span>' : '<a class="btn green lg block" href="#s-delivered/' + o.id + '">' + I('check') + ' Yes, I got it</a>') + '</div>' : '') +
        '<div class="card small"><b>Delivery address</b><div class="muted">' + esc(o.receiverName) + ', ' + esc(o.address) + ', ' + esc(o.city) + ' – ' + esc(o.pincode) + '</div></div>' +
        (o.status === 'Placed' ? '<button class="btn line block" data-act="cancelOrder" data-id="' + o.id + '">' + I('x') + ' Cancel this order</button>' : '') + '</div></div>');
  });
};
ACT.cancelOrder = function (btn, id) {
  if (!confirm('Cancel this order? The money goes back to your wallet.')) return;
  busy(btn, api('POST', '/api/store/orders/' + id + '/cancel', { reason: 'Cancelled by the student' }).then(function (j) {
    toast(j.message); S.catalog = null; return loadStudent(true).then(render);
  })).catch(function () { });
};

VIEWS['s-delivered'] = function (id) {
  return loadOrder(id).then(function (j) {
    var o = j.order, first = j.items[0] || {};
    if (o.status !== 'Delivered') { go('s-track/' + id); return ''; }
    if (o.studentReceivedAt) {
      return studentShell('s-orders', '<div class="celebrate pop">' + confetti() + '<div class="tick">' + I('smile') + '</div><h1>Thank you, ' + esc(firstName()) + '!</h1>' +
        '<p style="font-size:1.05rem">Enjoy your gift. Keep doing good things and earn more points! <span class="hi">अच्छे काम करते रहो!</span></p>' +
        '<div class="row" style="justify-content:center;margin-top:18px"><a class="btn primary lg" href="#s-earn">' + I('star') + ' Earn more points</a><a class="btn line lg" href="#s-wishlist">' + I('heart') + ' My Wishlist</a></div></div>');
    }
    S.rating = S.rating || 'Love it';
    return studentShell('s-orders',
      '<div class="page-title"><div><h1>Your parcel is delivered!</h1><p>Did you get it? <span class="hi">क्या आपको सामान मिल गया?</span></p></div>' + statusPill('Delivered') + '</div>' +
      '<div class="cart-layout"><div class="card stack"><div class="row" style="flex-wrap:nowrap"><div style="width:120px;border-radius:14px;overflow:hidden;flex:0 0 auto">' + pic(first.imageUrl, first.art, first.name) + '</div><div><b style="font-size:1.1rem">' + esc(o.items) + '</b><div class="muted small">Order ' + esc(o.orderNo) + ' · delivered ' + whenTime(o.deliveredAt) + '</div></div></div>' +
        '<b>How do you like it?</b><div class="row">' + ['Love it', 'Good', 'Okay'].map(function (t, i) {
          return '<button class="chip' + (S.rating === t ? ' on' : '') + '" data-act="rate" data-id="' + t + '" style="font-size:1rem;padding:10px 16px"><span>' + ['😍', '🙂', '😐'][i] + '</span> ' + t + '</button>';
        }).join('') + '</div>' +
        '<button class="btn green lg block" data-act="received" data-id="' + o.id + '">' + I('check') + ' Yes, I got it <span class="sub">हाँ, मिल गया</span></button>' +
        '<p class="small muted">There is a problem? Please tell your teacher or the HEM team, with order number ' + esc(o.orderNo) + '.</p></div>' +
      '<div class="card stack"><b>' + I('camera') + ' Photo from the shop</b>' + (o.hasProof ? '<div class="proof-photo"><img src="/api/store/orders/' + o.id + '/proof" alt="Delivery photo" style="width:100%;display:block"></div>' : '') +
        '<div class="small muted">Received by: <b>' + esc(o.receivedBy || '—') + '</b> · Code matched ✓</div></div></div>');
  });
};
ACT.rate = function (el, t) { S.rating = t; document.querySelectorAll('[data-act="rate"]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-id') === t); }); };
ACT.received = function (btn, id) {
  busy(btn, api('POST', '/api/store/orders/' + id + '/received', { rating: S.rating || 'Love it' }).then(function () { S.rating = null; render(); })).catch(function () { });
};
