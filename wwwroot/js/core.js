/* HEM-Store core: helpers, API calls, router, charts. */
'use strict';

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function rs(n) { var v = Number(n || 0), frac = Math.round(v * 100) % 100 !== 0; return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }); }
function num(n) { return Number(n || 0).toLocaleString('en-IN'); }
function art(name) { return (ART[name] || ART.badge)(); }
function pic(imageUrl, artName, alt) {
  return imageUrl ? '<img class="photo" src="' + esc(imageUrl) + '" alt="' + esc(alt || '') + '" loading="lazy">' : art(artName);
}
function initials(name) { return String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join(''); }
function when(d) {
  if (!d) return '';
  var t = new Date(d); if (isNaN(t)) return '';
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function whenTime(d) {
  if (!d) return '';
  var t = new Date(d); if (isNaN(t)) return '';
  return t.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }

/* ---------------- fit to the window ----------------
   On a wide window (or when the browser is zoomed out) the whole page is scaled up so it always
   fills the width the same way as on a normal laptop screen (1440 px wide). Narrow windows and
   zoom-in use the normal responsive layout. */
var FIT_BASE = 1440;
function fitToWindow() {
  var w = window.innerWidth || document.documentElement.clientWidth;
  var z = w > FIT_BASE ? Math.min(w / FIT_BASE, 3) : 1;
  document.body.style.zoom = z === 1 ? '' : String(Math.round(z * 1000) / 1000);
}
window.addEventListener('resize', fitToWindow);
document.addEventListener('DOMContentLoaded', fitToWindow);
if (document.body) fitToWindow();

/* ---------------- API ---------------- */
function api(method, path, body) {
  var opts = { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch(path, opts).then(function (r) {
    if (r.status === 401 && path.indexOf('/api/auth/') !== 0) {
      var role = (S.me && S.me.role) || '';
      S.me = null;
      go(role === 'Vendor' ? 'vendor-login' : role === 'Admin' ? 'admin-login' : 'login');
      throw new Error('Please log in again.');
    }
    if (r.status === 429) throw new Error('Too many tries. Please wait a minute and try again.');
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok || j.success === false) { var e = new Error(j.message || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
      return j;
    });
  });
}

/* ---------------- toast ---------------- */
var toastTimer;
function toast(msg, bad) {
  var t = document.getElementById('toast');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.innerHTML = I(bad ? 'info' : 'check') + '<span>' + esc(msg) + '</span>';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 4200 : 2800);
}
function fail(e) { toast(e && e.message ? e.message : String(e), true); }

/* Runs an action from a button: disables it while waiting, shows errors. */
function busy(btn, promise) {
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  return Promise.resolve(promise).catch(function (e) { fail(e); throw e; }).finally(function () {
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  });
}

/* ---------------- logo ---------------- */
function logo(big, href) {
  if (big) return '<div class="brand-banner"><img src="/img/hem-store-banner-web.jpg" alt="HEM-Store – Student Rewards &amp; Gift Store"></div>';
  // Emblem + wordmark in text: always complete and sharp at any size or zoom.
  return '<a class="logo" href="' + (href || '#') + '" aria-label="HEM-Store – Student Rewards &amp; Gift Store"><img class="emb" src="/img/emblem.png" alt="">' +
    '<span class="word"><span class="wm"><span class="a">HEM-</span><span class="b">Store</span></span><span class="tagline">Student Rewards &amp; Gift Store</span></span></a>';
}

/* ---------------- charts ---------------- */
function niceMax(max) {
  if (!(max > 0)) return { nice: 4, step: 1 };
  var step = Math.pow(10, Math.floor(Math.log10(max))); var nice = Math.ceil(max / step) * step;
  if (nice / step < 4) { step = step / 2; nice = Math.ceil(max / step) * step; }
  return { nice: nice, step: step };
}
function barChart(labels, series, opts) {
  opts = opts || {};
  var W = 560, H = 230, L = 46, B = 28, T = 12, R = 8;
  var m = niceMax(Math.max.apply(null, series.reduce(function (a, s) { return a.concat(s.values); }, [0])));
  var plotW = W - L - R, plotH = H - T - B, gw = plotW / Math.max(1, labels.length), bw = Math.min(22, (gw - 14) / series.length);
  var g = '';
  for (var v = 0; v <= m.nice + 1e-9; v += m.step) {
    var y = T + plotH - (v / m.nice) * plotH;
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#EAE6F2"/>' +
      '<text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (opts.fmt ? opts.fmt(v) : Math.round(v).toLocaleString('en-IN')) + '</text>';
  }
  labels.forEach(function (lab, i) {
    var x0 = L + i * gw + (gw - bw * series.length - 4 * (series.length - 1)) / 2;
    series.forEach(function (s, j) {
      var h = (s.values[i] / m.nice) * plotH, x = x0 + j * (bw + 4);
      g += '<rect x="' + x + '" y="' + (T + plotH - h) + '" width="' + bw + '" height="' + Math.max(0, h) + '" rx="4" fill="' + s.color + '"><title>' + esc(s.name + ' ' + lab + ': ' + s.values[i]) + '</title></rect>';
    });
    g += '<text x="' + (L + i * gw + gw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lab) + '</text>';
  });
  return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label || 'Chart') + '">' + g + '</svg></div>' +
    (series.length > 1 ? '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '');
}
function lineChart(labels, values, color) {
  var W = 560, H = 200, L = 40, B = 26, T = 18, R = 18;
  var m = niceMax(Math.max.apply(null, values.concat([0])));
  var plotW = W - L - R, plotH = H - T - B, n = Math.max(1, values.length - 1);
  var pt = values.map(function (v, i) { return [L + i * plotW / n, T + plotH - v / m.nice * plotH]; });
  var g = '';
  for (var v = 0; v <= m.nice + 1e-9; v += m.step) { var y = T + plotH - v / m.nice * plotH; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#EAE6F2"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(v) + '</text>'; }
  if (pt.length) {
    var d = pt.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    g += '<path d="' + d + ' L' + pt[pt.length - 1][0] + ' ' + (T + plotH) + ' L' + L + ' ' + (T + plotH) + 'Z" fill="' + color + '" opacity=".12"/>';
    g += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round"/>';
    pt.forEach(function (p, i) { g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i === pt.length - 1 ? 6 : 4) + '" fill="#fff" stroke="' + color + '" stroke-width="3"/>'; });
    labels.forEach(function (lab, i) { g += '<text x="' + pt[i][0] + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(lab) + '</text>'; });
  }
  return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Line chart">' + g + '</svg></div>';
}
function donut(parts, centre, centreLabel) {
  var total = parts.reduce(function (s, p) { return s + p.v; }, 0), a = -Math.PI / 2, g = '';
  if (!total) return '<div class="muted small">No data yet.</div>';
  parts.forEach(function (p) {
    var frac = p.v / total;
    if (frac >= 0.9999) { g += '<circle cx="80" cy="80" r="60" stroke="' + p.c + '" stroke-width="26" fill="none"/>'; return; }
    var a2 = a + frac * Math.PI * 2, large = a2 - a > Math.PI ? 1 : 0;
    var x1 = 80 + 60 * Math.cos(a), y1 = 80 + 60 * Math.sin(a), x2 = 80 + 60 * Math.cos(a2), y2 = 80 + 60 * Math.sin(a2);
    g += '<path d="M' + x1 + ' ' + y1 + ' A60 60 0 ' + large + ' 1 ' + x2 + ' ' + y2 + '" stroke="' + p.c + '" stroke-width="26" fill="none"/>';
    a = a2;
  });
  return '<div class="row" style="gap:18px;align-items:center"><svg viewBox="0 0 160 160" style="width:150px;max-width:100%" role="img" aria-label="Donut chart">' + g +
    '<text x="80" y="78" text-anchor="middle" style="font-family:Baloo 2;font-size:24px;font-weight:800;fill:#231942">' + esc(centre) + '</text><text x="80" y="98" text-anchor="middle" style="font-size:10px;fill:#6B6585;font-weight:800">' + esc(centreLabel) + '</text></svg>' +
    '<div class="stack" style="gap:6px">' + parts.map(function (p) { return '<div class="legend"><span><i style="background:' + p.c + '"></i>' + esc(p.n) + ' – ' + Math.round(p.v / total * 100) + '%</span></div>'; }).join('') + '</div></div>';
}
function barList(rows, color) {
  if (!rows.length) return '<div class="muted small">No data yet.</div>';
  var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
  return '<div class="bar-list" style="margin-top:12px">' + rows.map(function (r) {
    return '<div class="bl"><span>' + esc(r[0]) + '</span><span class="tr"><i style="width:' + (r[1] / max * 100) + '%;background:' + color + '"></i></span><span class="num" style="text-align:right">' + esc(r[2] != null ? r[2] : num(r[1])) + '</span></div>';
  }).join('') + '</div>';
}

/* ---------------- order status ---------------- */
var ORDER_FLOW = ['Placed', 'Verified', 'Assigned', 'Accepted', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'];
function statusIndex(st) { return ORDER_FLOW.indexOf(st); }
function statusPill(st) {
  var c = { Placed: 'gray', Verified: 'blue', Assigned: 'plum', Accepted: 'plum', Packed: 'sun', Shipped: 'orange', 'Out for delivery': 'orange', Delivered: 'green', Cancelled: 'red',
    Pending: 'sun', Live: 'green', Rejected: 'red', Hidden: 'gray', Active: 'green', Suspended: 'gray', Submitted: 'blue', Approved: 'sun', Paid: 'green' }[st] || 'gray';
  return '<span class="pill ' + c + '">' + esc(st) + '</span>';
}

/* ---------------- router ----------------
   #name or #name/arg. Each view is a function(arg) that returns HTML or a Promise of HTML. */
var VIEWS = {};
var S = { me: null, filter: { only: 'all', cat: '' } };
function route() {
  var h = (location.hash || '').slice(1), q = '';
  var qi = h.indexOf('?'); if (qi >= 0) { q = h.slice(qi + 1); h = h.slice(0, qi); }
  var parts = h.split('/');
  return { name: parts[0] || '', arg: parts.slice(1).join('/'), query: new URLSearchParams(q) };
}
function go(name) { if (location.hash.slice(1) === name) render(); else location.hash = name; }

function homeFor(role) { return role === 'Admin' ? 'a-dash' : role === 'Vendor' ? 'v-dash' : role === 'Student' ? 's-home' : 'login'; }
var PUBLIC = { 'login': 1, 'vendor-login': 1, 'admin-login': 1, 'v-register': 1, 'setup': 1 };

var renderSeq = 0, lastRoute = null;
function render() {
  var r = route(), name = r.name;
  var role = S.me && S.me.role;
  if (!name) { go(homeFor(role)); return; }
  if (!VIEWS[name]) { go(homeFor(role)); return; }
  if (!PUBLIC[name]) {
    var need = { s: 'Student', v: 'Vendor', a: 'Admin' }[name.charAt(0)];
    if (!role) { go(need === 'Vendor' ? 'vendor-login' : need === 'Admin' ? 'admin-login' : 'login'); return; }
    if (need && role !== need) { go(homeFor(role)); return; }
  }
  var seq = ++renderSeq, app = document.getElementById('app');
  var key = name + '/' + r.arg;
  if (lastRoute !== key) app.setAttribute('aria-busy', 'true');
  Promise.resolve().then(function () { return VIEWS[name](r.arg, r.query); }).then(function (html) {
    if (seq !== renderSeq) return;
    app.innerHTML = html;
    app.removeAttribute('aria-busy');
    if (lastRoute !== key) { window.scrollTo(0, 0); lastRoute = key; }
    document.title = (document.querySelector('#app h1') ? document.querySelector('#app h1').textContent + ' · ' : '') + 'HEM-Store';
    var auto = app.querySelector('[autofocus]'); if (auto) auto.focus();
  }).catch(function (e) {
    if (seq !== renderSeq) return;
    app.removeAttribute('aria-busy');
    if (e && e.message === 'Please log in again.') return;
    app.innerHTML = '<div class="card empty" style="max-width:560px;margin:60px auto">' + I('info') + '<b>This page could not be opened</b><span>' + esc(e && e.message) + '</span><button class="btn primary" data-act="reload">' + I('refresh') + ' Try again</button></div>';
  });
}

/* ---------------- events: data-act buttons ---------------- */
var ACT = {
  reload: function () { render(); },
  logout: function (el) {
    var role = S.me && S.me.role;
    busy(el, api('POST', '/api/auth/logout').then(function () {
      S = { me: null, filter: { only: 'all', cat: '' } };
      go(role === 'Vendor' ? 'vendor-login' : role === 'Admin' ? 'admin-login' : 'login');
    }));
  }
};
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  var name = el.getAttribute('data-act');
  if (!ACT[name]) return;
  e.preventDefault();
  e.stopPropagation();
  ACT[name](el, el.getAttribute('data-id'));
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.matches('[data-nav]')) { go(t.value); return; }
  if (t.matches('[data-change]') && ACT[t.getAttribute('data-change')]) ACT[t.getAttribute('data-change')](t, t.getAttribute('data-id'));
});
document.addEventListener('submit', function (e) {
  var f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault();
  var act = ACT[f.getAttribute('data-submit')];
  if (act) act(f.querySelector('[type=submit]') || f, f.getAttribute('data-id'), f);
});
window.addEventListener('hashchange', render);
/* A link to the page already open reloads its data (e.g. the menu item of the current page). */
document.addEventListener('click', function (e) {
  var a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (a.getAttribute('href') === location.hash) { e.preventDefault(); render(); }
});

/* Image preview for file inputs marked data-preview="#target". */
document.addEventListener('change', function (e) {
  var t = e.target;
  if (!t.matches('input[type=file][data-preview]') || !t.files || !t.files[0]) return;
  var target = document.querySelector(t.getAttribute('data-preview'));
  if (!target) return;
  if (!/^image\//.test(t.files[0].type)) { target.innerHTML = '<div class="doc">' + I('file') + esc(t.files[0].name) + '</div>'; return; }
  var rd = new FileReader();
  rd.onload = function () { target.innerHTML = '<img class="photo" src="' + rd.result + '" alt="">'; };
  rd.readAsDataURL(t.files[0]);
});
