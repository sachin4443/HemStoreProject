/* Admin portal (HEM team). */
'use strict';

function adminView(fn) {
  return function (arg, q) {
    return api('GET', '/api/admin/dashboard').then(function (d) { S.aDash = d; S.aCounts = d.todo; return fn(arg, q, d); });
  };
}
function ordersTable(rows, link) {
  if (!rows.length) return '<div class="card empty">' + I('box') + '<b>No orders here</b></div>';
  return '<div class="table-wrap"><table class="t"><thead><tr><th>Order</th><th>Student</th><th>Items</th><th>PIN</th><th class="r">Amount</th><th>Vendor</th><th>Status</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr class="' + (S.aPick === r.id ? 'hl' : '') + '"><td><a href="#' + (link || 'a-tracking') + '/' + r.id + '"><b>' + esc(r.orderNo) + '</b></a><div class="tiny muted">' + when(r.placedAt) + '</div></td>' +
        '<td><b>' + esc(r.studentName) + '</b><div class="tiny muted">' + esc([r.studentClass, r.school].filter(Boolean).join(' · ')) + '</div></td><td class="small">' + esc(r.items) + '</td><td>' + esc(r.pincode) + '</td>' +
        '<td class="r num">' + rs(r.amount) + '</td><td class="small">' + (r.vendorName ? esc(r.vendorName) : '<span class="muted">—</span>') + '</td><td>' + statusPill(r.status) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
function kfmt(v) { return v >= 1000 ? (v / 1000) + 'k' : v; }
/* json_agg columns can arrive as text; turn them into lists. */
function arr(x) { if (!x) return []; if (typeof x === 'string') { try { return JSON.parse(x) || []; } catch (e) { return []; } } return x; }
function fixLists(rows, key) { rows.forEach(function (r) { r[key] = arr(r[key]); }); return rows; }

/* ---------------- dashboard ---------------- */
VIEWS['a-dash'] = adminView(function (arg, q, d) {
  var k = d.kpi, t = d.todo, todo = [];
  if (t.to_verify) todo.push(['clip', t.to_verify + ' new order' + (t.to_verify > 1 ? 's' : '') + ' to verify', 'Check student, payment, stock and address', '#a-verify', 'Verify']);
  if (t.to_assign) todo.push(['pin', t.to_assign + ' order' + (t.to_assign > 1 ? 's' : '') + ' to give to a vendor', 'Match by PIN code', '#a-assign', 'Assign']);
  if (t.vendors_pending) todo.push(['shield', t.vendors_pending + ' vendor' + (t.vendors_pending > 1 ? 's' : '') + ' waiting for approval', 'Check documents and service area', '#a-vendor-approval', 'Review']);
  if (t.products_pending) todo.push(['bag', t.products_pending + ' product' + (t.products_pending > 1 ? 's' : '') + ' waiting for approval', 'New products and price changes', '#a-products', 'Review']);
  if (t.invoices_submitted) todo.push(['file', t.invoices_submitted + ' invoice' + (t.invoices_submitted > 1 ? 's' : '') + ' to check', 'From vendors, for delivered orders', '#a-invoices', 'Check']);
  if (t.invoices_to_pay) todo.push(['bank', t.invoices_to_pay + ' approved invoice' + (t.invoices_to_pay > 1 ? 's' : '') + ' to pay', 'Record the bank payment', '#a-payments', 'Pay']);
  var m = d.months;
  return workShell('a', 'a-dash', 'Store dashboard', new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) + ' · all schools',
    '<div class="kpis">' + kpi('gift', 'plum', num(k.redeemed_month), 'Points redeemed this month', '= ' + rs(k.redeemed_month * d.pointValue)) + kpi('box', 'blue', num(k.orders_month), 'Orders this month') +
      kpi('users', 'sun', num(k.students), 'Students using the store', num(k.points_earned_known) + ' pts earned (last seen)') + kpi('rupee', 'green', rs(Number(k.payable) + Number(k.not_invoiced)), 'Payable to vendors', rs(k.not_invoiced) + ' not invoiced yet') + '</div>' +
    '<div class="cols"><div class="card"><div class="card-head"><div><h3>Points redeemed and orders</h3><p class="small muted">Last 6 months</p></div><a class="btn sm line" href="#a-reports">Reports ' + I('chev') + '</a></div>' +
      barChart(m.map(function (x) { return x.label; }), [{ name: 'Points redeemed', color: '#6B2FA8', values: m.map(function (x) { return x.redeemed; }) }], { fmt: kfmt, label: 'Points redeemed per month' }) + '</div>' +
    '<div class="card"><div class="card-head"><h3>Needs your action</h3><span class="pill pink">' + todo.length + '</span></div>' +
      (todo.length ? '<div class="stack" style="gap:10px">' + todo.map(function (x) {
        return '<div class="row" style="flex-wrap:nowrap;padding:10px;border:1px solid var(--line);border-radius:12px"><span class="ic plum" style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto">' + I(x[0]) + '</span><div class="grow small"><b>' + x[1] + '</b><div class="muted">' + x[2] + '</div></div><a class="btn sm primary" href="' + x[3] + '">' + x[4] + '</a></div>';
      }).join('') + '</div>' : '<div class="ok-box">' + I('check') + 'All done. Nothing is waiting.</div>') + '</div></div>' +
    '<div class="card"><div class="card-head"><h3>Latest orders</h3><a class="btn sm line" href="#a-tracking">All orders</a></div>' + ordersTable(d.latest) + '</div>');
});

/* ---------------- points configuration ---------------- */
VIEWS['a-points'] = adminView(function () {
  return api('GET', '/api/admin/settings').then(function (j) {
    var s = j.settings;
    var names = { point_value: 'Value of 1 point', min_redeem: 'Minimum points to redeem', max_redeem_per_month: 'Maximum redeem per month', store_open: 'Store open', delivery_days: 'Delivery time' };
    return workShell('a', 'a-points', 'Points configuration', 'Rules for redeeming and spending points. Students earn points in HEM Virtues and can redeem any number of them.',
      '<div class="cols"><form class="card" data-submit="saveCfg" novalidate><h3>Redeeming and spending</h3>' +
        '<div class="setting"><div><b>Value of 1 point (₹)</b><div class="small muted">Shopping money a student gets for one point</div></div><input class="input num" id="cfgPv" inputmode="decimal" value="' + s.pointValue + '"></div>' +
        '<input type="hidden" id="cfgMin" value="' + s.minRedeem + '">' +
        '<div class="setting"><div><b>Maximum redeem per month</b><div class="small muted">Per student, to keep spending steady</div></div><input class="input num" id="cfgMax" inputmode="numeric" value="' + s.maxRedeemPerMonth + '"></div>' +
        '<div class="setting"><div><b>Delivery time shown to students</b><div class="small muted">Free delivery, paid by HEM</div></div><input class="input" id="cfgDays" value="' + esc(s.deliveryDays) + '"></div>' +
        '<div class="setting"><div><b>Store open for students</b><div class="small muted">When off, students can look but not redeem or order</div></div><label class="switch-box"><input type="checkbox" id="cfgOpen"' + (s.storeOpen ? ' checked' : '') + '><span class="switch' + (s.storeOpen ? '' : ' off') + '"></span></label></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" type="submit">' + I('check') + ' Save changes</button><span class="small muted">Changes apply from the next redemption. Every change is logged.</span></div></form>' +
      '<div class="stack"><div class="card"><h3>Example</h3><div class="convert" style="margin-top:12px"><div class="cv"><b class="num" style="color:#8A5A00">100</b><span class="small"><b>points</b></span></div><div class="arrow">' + I('arrow') + '</div><div class="cv"><b class="num" style="color:var(--leaf)">' + rs(100 * s.pointValue) + '</b><span class="small"><b>to shop</b></span></div></div></div>' +
        '<div class="card small"><h3>Change log</h3>' + (j.log.length ? '<ul class="ticks" style="margin-top:8px">' + j.log.map(function (l) {
          return '<li>' + I('clock') + when(l.changed_at) + ' · ' + esc(names[l.key] || l.key) + ' ' + esc(l.old_value || '—') + ' → ' + esc(l.new_value) + ' (' + esc(l.changed_by || '') + ')</li>';
        }).join('') + '</ul>' : '<p class="muted" style="margin-top:8px">No changes yet.</p>') + '</div></div></div>');
  });
});
document.addEventListener('change', function (e) { if (e.target.id === 'cfgOpen') e.target.nextElementSibling.classList.toggle('off', !e.target.checked); });
ACT.saveCfg = function (btn) {
  busy(btn, api('POST', '/api/admin/settings', { pointValue: Number(val('cfgPv')), minRedeem: Number(val('cfgMin')), maxRedeemPerMonth: Number(val('cfgMax')), deliveryDays: val('cfgDays'), storeOpen: document.getElementById('cfgOpen').checked })
    .then(function (j) { toast(j.message); render(); })).catch(function () { });
};

/* ---------------- student wallets ---------------- */
VIEWS['a-wallets'] = adminView(function (id) {
  var q = S.walletQ || '';
  return Promise.all([api('GET', '/api/admin/wallets?q=' + encodeURIComponent(q)), id ? api('GET', '/api/admin/wallets/' + id) : null]).then(function (r) {
    var j = r[0], one = r[1], t = j.totals;
    var detail = one ? '<div class="card stack"><div class="row" style="flex-wrap:nowrap"><div class="avatar pink">' + esc(initials(one.student.name)) + '</div><div><b>' + esc(one.student.name) + '</b><div class="small muted">ID ' + one.student.student_id + ' · ' + esc([one.student.standard ? 'Class ' + one.student.standard + (one.student.division ? ' – ' + one.student.division : '') : '', one.student.school].filter(Boolean).join(' · ')) + '</div></div></div>' +
      '<div class="bal-split" style="margin-top:0;grid-template-columns:repeat(3,1fr)"><div class="bal-box"><span>Earned (HEM Virtues)</span><b class="num">' + num(one.wallet.earned) + '</b></div><div class="bal-box" style="background:var(--plum-soft)"><span>Points left</span><b class="num">' + num(one.wallet.available) + '</b></div><div class="bal-box money"><span>Shopping money</span><b class="num">' + rs(one.wallet.money) + '</b></div></div>' +
      '<b class="small">Recent activity</b>' + (one.ledger.length ? '<table class="ledger small">' + one.ledger.slice(0, 8).map(function (l) {
        return '<tr><td class="muted">' + when(l.at) + '</td><td>' + esc(l.note || l.kind) + '</td><td class="num" style="text-align:right">' + (l.points ? '<span class="' + (l.points > 0 ? 'plus' : 'minus') + '">' + (l.points > 0 ? '+' : '') + l.points + ' pts</span>' : '') + (Number(l.money) ? '<div class="' + (l.money > 0 ? 'plus' : 'minus') + '">' + (l.money > 0 ? '+' : '−') + rs(Math.abs(l.money)) + '</div>' : '') + '</td></tr>';
      }).join('') + '</table>' : '<span class="small muted">Nothing yet.</span>') +
      '<form class="stack" data-submit="adjust" data-id="' + one.student.student_id + '" novalidate><b class="small">Adjust points</b><div class="grid2"><select class="input" id="adjSign" aria-label="Add or take away"><option value="1">Add points</option><option value="-1">Take away points</option></select><input class="input" id="adjPts" inputmode="numeric" placeholder="Points" aria-label="Points"></div>' +
      '<input class="input" id="adjReason" maxlength="200" placeholder="Reason (shown in the student\'s history)" aria-label="Reason"><button class="btn primary" type="submit">' + I('check') + ' Save adjustment</button></form></div>'
      : '<div class="card empty">' + I('wallet') + '<b>Choose a student</b><span>See their points, shopping money and history.</span></div>';
    return workShell('a', 'a-wallets', 'Student wallets', num(t.students) + ' students · ' + num(t.redeemed) + ' points redeemed · ' + rs(t.money) + ' shopping money not spent yet',
      '<form class="toolbar" data-submit="walletSearch"><input class="input" id="wq" type="search" placeholder="Search name, ID, username or school" aria-label="Search students" value="' + esc(q) + '"><button class="btn line" type="submit">' + I('search') + ' Search</button></form>' +
      '<div class="cols"><div class="table-wrap"><table class="t"><thead><tr><th>Student</th><th class="r">Earned</th><th class="r">Redeemed</th><th class="r">Shopping money</th><th>Last activity</th></tr></thead><tbody>' +
      (j.students.length ? j.students.map(function (s) {
        return '<tr class="' + (one && one.student.student_id === s.student_id ? 'hl' : '') + '"><td><a href="#a-wallets/' + s.student_id + '"><b>' + esc(s.name) + '</b></a><div class="tiny muted">ID ' + s.student_id + ' · ' + esc([s.standard ? s.standard + (s.division ? ' – ' + s.division : '') : '', s.school].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td class="r num"><b>' + num(s.earned) + '</b></td><td class="r num">' + num(s.redeemed) + ' pts</td><td class="r num">' + rs(s.money) + '</td><td class="small">' + when(s.last_at || s.last_seen_at) + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">No students found. Students appear here after they open the store once.</td></tr>') + '</tbody></table></div>' + detail + '</div>');
  });
});
ACT.walletSearch = function () { S.walletQ = val('wq'); render(); };
ACT.adjust = function (btn, id) {
  var pts = Number(val('adjPts')) * Number(val('adjSign'));
  busy(btn, api('POST', '/api/admin/wallets/' + id + '/adjust', { points: pts, reason: val('adjReason') }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};

/* ---------------- products ---------------- */
VIEWS['a-products'] = adminView(function (arg) {
  return api('GET', '/api/admin/products').then(function (j) {
    S.aProducts = j;
    if (arg === 'new' || (arg && arg !== 'categories')) {
      var p = arg === 'new' ? null : j.products.filter(function (x) { return x.id === Number(arg); })[0];
      return workShell('a', 'a-products', p ? 'Edit product' : 'Add product', 'Products added or changed by HEM go live at once',
        '<div class="cols">' + productForm(p, j.categories, j.pointValue, { submit: 'aSaveProduct', admin: true, vendors: j.vendors, back: 'a-products', saveLabel: p ? 'Save' : 'Add product' }) +
        (p ? '<div class="stack"><div class="card small"><h3>Status</h3><div style="margin-top:8px">' + statusPill(p.status) + '</div>' + (p.vendor ? '<p class="muted" style="margin-top:8px">From ' + esc(p.vendor) + '</p>' : '') + '</div></div>' : '<div></div>') + '</div>');
    }
    var pend = j.products.filter(function (p) { return p.status === 'Pending'; });
    var f = S.aProdFilter || 'all';
    var list = j.products.filter(function (p) { return f === 'all' || p.status === f; });
    return workShell('a', 'a-products', 'Products', j.products.filter(function (p) { return p.status === 'Live'; }).length + ' live · ' + pend.length + ' waiting for approval',
      (pend.length ? '<div class="card" style="border:2px solid var(--sun)"><div class="card-head"><h3>' + I('clock') + ' Waiting for approval</h3><span class="pill sun">' + pend.length + '</span></div><div class="stack" style="gap:10px">' +
        pend.map(function (p) {
          return '<div class="row between" style="flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;padding:10px">' + cellProd(p) +
            '<div class="small"><b>' + esc(p.vendor || 'HEM') + '</b><div class="muted">' + rs(p.price) + ' · ' + Math.ceil(p.price / j.pointValue - 1e-9) + ' points' + (p.mrp ? ' · MRP ' + rs(p.mrp) : '') + ' · Age ' + esc(p.age_group) + ' · stock ' + p.stock + '</div>' + (p.about ? '<div class="muted">' + esc(p.about) + '</div>' : '') + '</div>' +
            '<div class="row"><a class="btn line sm" href="#a-products/' + p.id + '">' + I('edit') + ' Edit</a><button class="btn danger sm" data-act="reviewProduct" data-id="' + p.id + '" data-action="reject">' + I('x') + ' Reject</button><button class="btn green sm" data-act="reviewProduct" data-id="' + p.id + '" data-action="approve">' + I('check') + ' Approve</button></div></div>';
        }).join('') + '</div></div>' : '') +
      '<div class="filters">' + [['all', 'All'], ['Live', 'Live'], ['Pending', 'Waiting'], ['Hidden', 'Hidden'], ['Rejected', 'Rejected']].map(function (x) { return '<button class="chip' + (f === x[0] ? ' on' : '') + '" data-act="aProdFilter" data-id="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      (list.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Product</th><th>Vendor</th><th class="r">Price</th><th class="r">Points</th><th class="r">Stock</th><th class="r">Sold this month</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (p) {
        return '<tr><td>' + cellProd(p) + '</td><td class="small">' + esc(p.vendor || 'HEM') + '</td><td class="r num"><b>' + rs(p.price) + '</b></td><td class="r num">' + Math.ceil(p.price / j.pointValue - 1e-9) + '</td><td class="r num">' + p.stock + '</td><td class="r num">' + p.sold_month + '</td>' +
          '<td>' + (p.status === 'Live' && p.stock < 10 ? '<span class="pill orange">Low stock</span>' : statusPill(p.status)) + '</td><td class="r" style="white-space:nowrap"><a class="btn sm line" href="#a-products/' + p.id + '">' + I('edit') + '</a> ' +
          (p.status === 'Live' ? '<button class="btn sm line" data-act="reviewProduct" data-id="' + p.id + '" data-action="hide" title="Hide from students">' + I('eye') + '</button>' : p.status === 'Hidden' ? '<button class="btn sm line" data-act="reviewProduct" data-id="' + p.id + '" data-action="show">Show</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + I('bag') + '<b>No products here</b></div>') +
      '<div class="card"><div class="card-head"><h3>Categories</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Category</th><th class="r">Products</th><th>Active</th></tr></thead><tbody>' +
        j.categories.map(function (c) { return '<tr><td><span class="pill" style="background:' + c.tint + ';color:' + c.color + '">' + esc(c.name) + '</span> <span class="hi small">' + esc(c.name_hi || '') + '</span></td><td class="r num">' + c.products + '</td><td>' + (c.is_active ? '<span class="pill green">Yes</span>' : '<span class="pill gray">No</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div><form class="row" data-submit="addCategory" style="margin-top:12px" novalidate><input class="input" id="catName" placeholder="New category name" maxlength="60" style="max-width:240px"><input class="input" id="catHi" placeholder="Hindi name (optional)" style="max-width:220px"><input class="input" id="catColor" type="color" value="#6B2FA8" aria-label="Colour" style="width:56px;padding:4px"><select class="input" id="catArt" style="max-width:160px">' + ART_NAMES.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select><button class="btn primary" type="submit">' + I('plus') + ' Add category</button></form></div>',
      '<a class="btn primary" href="#a-products/new">' + I('plus') + ' Add product</a>');
  });
});
ACT.aProdFilter = function (el, f) { S.aProdFilter = f; render(); };
ACT.aSaveProduct = function (btn, id) {
  var err = document.getElementById('pError'); err.hidden = true;
  busy(btn, api('POST', '/api/admin/products' + (id ? '/' + id : ''), productData()).then(function (j) { toast(j.message); go('a-products'); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};
ACT.reviewProduct = function (btn, id) {
  var action = btn.getAttribute('data-action'), note = null;
  if (action === 'reject') { note = prompt('Why is it rejected? (the vendor sees this)'); if (note == null) return; }
  busy(btn, api('POST', '/api/admin/products/' + id + '/review', { action: action, note: note }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};
ACT.addCategory = function (btn) {
  busy(btn, api('POST', '/api/admin/categories', { name: val('catName'), nameHi: val('catHi'), color: val('catColor'), art: val('catArt'), isActive: true }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};

/* ---------------- vendors ---------------- */
function vendorDocs(v) {
  var have = {}; (v.documents || []).forEach(function (d) { have[d.type] = d.id; });
  return '<div class="grid2">' + ['GST certificate', 'PAN card', 'Cancelled cheque', 'Shop photo'].map(function (d) {
    return '<div class="doc">' + (have[d] ? I('check') : '<span style="color:var(--red)">' + I('x') + '</span>') + esc(d) + '<span class="grow"></span>' +
      (have[d] ? '<a class="btn sm line" href="/api/admin/vendors/' + v.id + '/documents/' + have[d] + '" target="_blank" rel="noopener" aria-label="Open ' + esc(d) + '">' + I('eye') + '</a>' : '<span class="pill red">Missing</span>') + '</div>';
  }).join('') + '</div>';
}
VIEWS['a-vendor-approval'] = adminView(function () {
  return api('GET', '/api/admin/vendors').then(function (j) {
    fixLists(j.vendors, 'documents');
    var list = j.vendors.filter(function (v) { return v.status === 'Pending'; });
    return workShell('a', 'a-vendor-approval', 'Vendor approval', 'Check documents and service area before a shop goes live',
      list.length ? '<div class="cols even">' + list.map(function (v) {
        return '<div class="card stack"><div class="row between"><div class="row" style="flex-wrap:nowrap"><div class="avatar green">' + esc(initials(v.business_name)) + '</div><div><b>' + esc(v.business_name) + '</b><div class="small muted">' + esc(v.owner_name) + ' · ' + esc(v.city) + '</div></div></div><span class="pill sun">Applied ' + when(v.applied_at) + '</span></div>' +
          '<dl class="kv"><dt>Contact</dt><dd>' + esc(v.phone) + ' · ' + esc(v.email) + '</dd><dt>GSTIN</dt><dd>' + esc(v.gstin) + '</dd><dt>PAN</dt><dd>' + esc(v.pan) + '</dd><dt>Address</dt><dd>' + esc(v.address) + '</dd><dt>Sells</dt><dd>' + esc(v.categories) + '</dd>' +
          '<dt>Delivers to</dt><dd>PIN ' + v.pin_from + ' – ' + v.pin_to + ' · ' + esc(v.delivery_days) + '</dd><dt>Bank</dt><dd>' + esc(v.bank_name) + ' •••• ' + esc(v.account_last4) + ' · ' + esc(v.bank_ifsc) + '</dd></dl>' +
          vendorDocs(v) +
          '<div class="row"><button class="btn danger" data-act="reviewVendor" data-id="' + v.id + '" data-action="reject">' + I('x') + ' Reject</button><button class="btn green" data-act="reviewVendor" data-id="' + v.id + '" data-action="approve" ' + ((v.documents || []).length < 4 ? 'disabled title="Documents missing"' : '') + '>' + I('check') + ' Approve</button></div></div>';
      }).join('') + '</div>' : '<div class="card empty">' + I('shield') + '<b>No applications waiting</b><span>New shops appear here after they register.</span></div>');
  });
});
ACT.reviewVendor = function (btn, id) {
  var action = btn.getAttribute('data-action'), note = null;
  if (action === 'reject' || action === 'suspend') { note = prompt(action === 'reject' ? 'Why is the application rejected?' : 'Why is the shop paused?'); if (note == null) return; }
  busy(btn, api('POST', '/api/admin/vendors/' + id + '/review', { action: action, note: note }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};

VIEWS['a-vendors'] = adminView(function () {
  return api('GET', '/api/admin/vendors').then(function (j) {
    var list = j.vendors.filter(function (v) { return v.status !== 'Pending'; });
    return workShell('a', 'a-vendors', 'Vendors', list.filter(function (v) { return v.status === 'Active'; }).length + ' active shops',
      list.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Shop</th><th>Delivers to PIN</th><th class="r">Orders</th><th class="r">Delivered</th><th class="r">Avg days</th><th class="r">Live products</th><th class="r">Payable</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (v) {
        return '<tr><td><div class="row" style="flex-wrap:nowrap"><div class="avatar blue">' + esc(initials(v.business_name)) + '</div><div><b>' + esc(v.business_name) + '</b><div class="tiny muted">' + esc(v.owner_name) + ' · ' + esc(v.city) + ' · ' + esc(v.phone) + '</div></div></div></td>' +
          '<td class="num">' + v.pin_from + ' – ' + v.pin_to + '</td><td class="r num">' + v.orders + '</td><td class="r num">' + v.delivered + '</td><td class="r num">' + (v.avg_days == null ? '—' : v.avg_days) + '</td><td class="r num">' + v.live_products + '</td><td class="r num">' + rs(v.payable) + '</td><td>' + statusPill(v.status) + '</td>' +
          '<td class="r">' + (v.status === 'Active' ? '<button class="btn sm line" data-act="reviewVendor" data-id="' + v.id + '" data-action="suspend">Pause</button>' : '<button class="btn sm green" data-act="reviewVendor" data-id="' + v.id + '" data-action="activate">Activate</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + I('store') + '<b>No vendors yet</b><span>Approve applications in Vendor Approval.</span></div>');
  });
});

/* ---------------- orders ---------------- */
function adminOrderDetail(o, j, actions) {
  return '<div class="card stack"><div class="row between"><div><span class="crumb">Order</span><h2>' + esc(o.orderNo) + '</h2></div>' + statusPill(o.status) + '</div>' +
    j.items.map(function (x) { return '<div class="row" style="flex-wrap:nowrap"><div style="width:72px;border-radius:12px;overflow:hidden;flex:0 0 auto">' + pic(x.imageUrl, x.art, x.name) + '</div><div class="small grow"><b>' + esc(x.name) + '</b><div class="muted">Qty ' + x.qty + ' · ' + rs(x.total) + '</div></div></div>'; }).join('') +
    actions + '<details><summary class="small"><b>Delivery address</b></summary>' + addressKv(o) + '</details><details><summary class="small"><b>History</b></summary>' + timeline(j.events) + '</details></div>';
}
VIEWS['a-verify'] = adminView(function (id) {
  return api('GET', '/api/admin/orders?status=Placed').then(function (list) {
    var pick = Number(id) || (list.orders[0] && list.orders[0].id);
    S.aPick = pick;
    return (pick ? api('GET', '/api/admin/orders/' + pick) : Promise.resolve(null)).then(function (j) {
      var detail = '<div class="card empty">' + I('check') + '<b>No new orders to verify</b></div>';
      if (j) {
        var o = j.order, stockMap = {}; j.stock.forEach(function (s) { stockMap[s.id] = s.stock; });
        var checks = [['Student is real', esc(o.studentName) + ' · ID ' + o.studentId + (o.school ? ' · ' + esc(o.school) : '')],
          ['Paid from shopping money', rs(o.amount) + ' taken · ' + rs(j.walletMoney) + ' left in the wallet'],
          ['Items set aside from stock', j.items.map(function (x) { return esc(x.name) + ' (' + (stockMap[x.productId] || 0) + ' left)'; }).join(', ')],
          ['Address and PIN code', esc(o.city) + ' ' + esc(o.pincode)], ['Parent checked the address', 'Yes, at checkout']];
        var act = o.status === 'Placed'
          ? '<h3>Checks</h3><div class="stack" style="gap:8px">' + checks.map(function (c) { return '<div class="doc">' + I('check') + '<div class="grow"><b>' + c[0] + '</b><div class="tiny muted">' + c[1] + '</div></div></div>'; }).join('') + '</div>' +
            '<div class="row"><button class="btn danger" data-act="aCancel" data-id="' + o.id + '">' + I('x') + ' Cancel & refund</button><button class="btn green" data-act="aVerify" data-id="' + o.id + '">' + I('check') + ' Verify order</button></div>'
          : '<div class="ok-box">' + I('check') + 'This order is ' + esc(o.status) + '.</div>';
        detail = adminOrderDetail(o, j, act);
      }
      return workShell('a', 'a-verify', 'Order verification', 'Check every new order before it goes to a vendor',
        '<div class="cols"><div class="stack">' + ordersTable(list.orders, 'a-verify') + '</div>' + detail + '</div>');
    });
  });
});
ACT.aVerify = function (btn, id) { busy(btn, api('POST', '/api/admin/orders/' + id + '/verify').then(function (j) { toast(j.message); go('a-assign/' + id); })).catch(function () { }); };
ACT.aCancel = function (btn, id) {
  var reason = prompt('Why is this order cancelled? The student sees this, and gets the money back.');
  if (reason == null) return;
  busy(btn, api('POST', '/api/admin/orders/' + id + '/cancel', { reason: reason }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};

VIEWS['a-assign'] = adminView(function (id) {
  return api('GET', '/api/admin/orders?status=Verified').then(function (list) {
    var pick = Number(id) || (list.orders[0] && list.orders[0].id);
    S.aPick = pick;
    if (!pick) return workShell('a', 'a-assign', 'Vendor assignment', 'Give verified orders to a shop near the student', '<div class="card empty">' + I('check') + '<b>No orders waiting for a vendor</b></div>');
    return Promise.all([api('GET', '/api/admin/orders/' + pick), api('GET', '/api/admin/orders/' + pick + '/vendors')]).then(function (r) {
      var j = r[0], c = r[1], o = j.order;
      var choices = c.vendors;
      if (!S.assignPick || !choices.some(function (v) { return v.id === S.assignPick; })) S.assignPick = choices.length ? choices[0].id : null;
      var opts = choices.length ? choices.map(function (v, i) {
        var best = i === 0 && v.serves;
        return '<div class="vendor-opt' + (best ? ' best' : '') + (!v.serves ? ' off' : '') + (S.assignPick === v.id ? ' on' : '') + '" data-act="pickVendor" data-id="' + v.id + '" role="radio" aria-checked="' + (S.assignPick === v.id) + '" tabindex="0" style="cursor:pointer"><span class="radio"></span><div style="min-width:0"><div class="row"><b>' + esc(v.business_name) + '</b>' + (best ? '<span class="pill green">' + I('star') + ' Best match</span>' : '') + (!v.serves ? '<span class="pill gray">Outside area</span>' : '') + '</div>' +
          '<div class="small muted">PIN ' + v.pin_from + ' – ' + v.pin_to + ' · ' + esc(v.city) + ' · ' + v.open_orders + ' open orders · ' + v.delivered + ' delivered' + (v.avg_days != null ? ' · avg ' + v.avg_days + ' days' : '') + '</div></div>' +
          '<div class="row">' + (v.own_items ? '<span class="pill green">Sells ' + v.own_items + ' of ' + v.all_items + ' items</span>' : '') + '<span class="pill blue">' + (v.serves ? 'Serves ' + esc(c.pincode) : '—') + '</span></div></div>';
      }).join('') : '<div class="card empty">' + I('store') + '<b>No active vendors</b><span>Approve a vendor first.</span></div>';
      var chosen = choices.filter(function (v) { return v.id === S.assignPick; })[0];
      var act = o.status === 'Verified'
        ? '<div class="info-box">' + I('info') + '<span>Best match = serves this PIN code, sells these items, and has fewer open orders.</span></div>' + (chosen ? '<button class="btn primary lg" data-act="aAssign" data-id="' + o.id + '">' + I('send') + ' Assign to ' + esc(chosen.business_name) + '</button>' : '')
        : '<div class="ok-box">' + I('check') + 'Assigned to ' + esc(o.vendorName || '') + '.</div>';
      return workShell('a', 'a-assign', 'Vendor assignment · ' + esc(o.orderNo), 'Shops are matched by the delivery PIN code ' + esc(o.pincode),
        (list.orders.length > 1 ? '<div class="filters">' + list.orders.map(function (x) { return '<a class="chip' + (x.id === pick ? ' on' : '') + '" href="#a-assign/' + x.id + '">' + esc(x.orderNo) + '</a>'; }).join('') + '</div>' : '') +
        '<div class="cols"><div class="stack">' + opts + '</div>' + adminOrderDetail(o, j, act) + '</div>');
    });
  });
});
ACT.pickVendor = function (el, id) { S.assignPick = Number(id); render(); };
ACT.aAssign = function (btn, id) { busy(btn, api('POST', '/api/admin/orders/' + id + '/assign', { vendorId: S.assignPick }).then(function (j) { toast(j.message); S.assignPick = null; go('a-tracking/' + id); })).catch(function () { }); };

VIEWS['a-tracking'] = adminView(function (id) {
  var f = S.trackFilter || '', q = S.trackQ || '';
  return api('GET', '/api/admin/orders?status=' + encodeURIComponent(f) + '&q=' + encodeURIComponent(q)).then(function (list) {
    S.aPick = Number(id) || null;
    return (id ? api('GET', '/api/admin/orders/' + id) : Promise.resolve(null)).then(function (j) {
      var total = Object.keys(list.counts).reduce(function (s, k) { return s + list.counts[k]; }, 0);
      var detail = '';
      if (j) {
        var o = j.order;
        var act = (o.hasProof ? '<div class="proof-photo"><img src="/api/admin/orders/' + o.id + '/proof" alt="Delivery photo" style="width:100%;display:block"></div>' + (o.receivedBy ? '<span class="small muted">Received by ' + esc(o.receivedBy) + '</span>' : '') : '') +
          (o.status === 'Placed' ? '<a class="btn green" href="#a-verify/' + o.id + '">' + I('check') + ' Verify</a>' : o.status === 'Verified' ? '<a class="btn primary" href="#a-assign/' + o.id + '">' + I('pin') + ' Assign vendor</a>' : '') +
          (o.status !== 'Delivered' && o.status !== 'Cancelled' ? '<button class="btn danger sm" data-act="aCancel" data-id="' + o.id + '">' + I('x') + ' Cancel & refund</button>' : '') +
          (o.cancelReason ? '<div class="warn-box">' + I('info') + '<span>Cancelled: ' + esc(o.cancelReason) + '</span></div>' : '') +
          (o.studentReceivedAt ? '<div class="ok-box">' + I('smile') + 'Student confirmed: ' + esc(o.studentRating || 'received') + '</div>' : '');
        detail = adminOrderDetail(o, j, act);
      }
      return workShell('a', 'a-tracking', 'Order tracking', 'Every order from placed to delivered',
        '<div class="filters">' + [['', 'All', total]].concat(ORDER_FLOW.concat(['Cancelled']).map(function (s) { return [s, s, list.counts[s] || 0]; })).map(function (s) {
          return '<button class="chip' + (f === s[0] ? ' on' : '') + '" data-act="trackFilter" data-id="' + esc(s[0]) + '">' + esc(s[1]) + ' <span class="pill gray">' + s[2] + '</span></button>';
        }).join('') + '</div>' +
        '<form class="toolbar" data-submit="trackSearch"><input class="input" id="tq" type="search" placeholder="Search order number, student, school or PIN" aria-label="Search orders" value="' + esc(q) + '"><button class="btn line" type="submit">' + I('search') + ' Search</button>' +
        '<a class="btn line" href="/api/admin/reports/orders.csv?months=6">' + I('download') + ' Export</a></form>' +
        '<div class="cols">' + ordersTable(list.orders) + (detail || '<div class="card empty">' + I('truck') + '<b>Choose an order</b><span>See its full history.</span></div>') + '</div>');
    });
  });
});
ACT.trackFilter = function (el, s) { S.trackFilter = s; render(); };
ACT.trackSearch = function () { S.trackQ = val('tq'); render(); };

/* ---------------- invoices and payments ---------------- */
VIEWS['a-invoices'] = adminView(function (id) {
  return api('GET', '/api/admin/invoices').then(function (j) {
    fixLists(j.invoices, 'orders');
    var pick = Number(id) || ((j.invoices.filter(function (i) { return i.status === 'Submitted'; })[0] || j.invoices[0] || {}).id);
    var inv = j.invoices.filter(function (i) { return i.id === pick; })[0];
    var detail = inv ? '<div class="card stack"><div class="row between"><div><span class="crumb">Invoice</span><h2>' + esc(inv.invoice_no) + '</h2></div>' + statusPill(inv.status) + '</div>' +
      '<dl class="kv"><dt>Vendor</dt><dd>' + esc(inv.vendor) + ' · GSTIN ' + esc(inv.gstin) + '</dd><dt>Date</dt><dd>' + when(inv.invoice_date) + '</dd><dt>Amount</dt><dd><b>' + rs(inv.amount) + '</b></dd>' +
      '<dt>File</dt><dd>' + (inv.has_file ? '<a href="/api/admin/invoices/' + inv.id + '/file" target="_blank" rel="noopener">' + I('file') + ' Open PDF</a>' : '—') + '</dd></dl>' +
      '<h3>Orders</h3>' + (inv.orders || []).map(function (o) { return '<div class="doc">' + I(o.proof ? 'check' : 'x') + '<div class="grow"><b>' + esc(o.no) + '</b> · ' + rs(o.amount) + '<div class="tiny muted">Delivered ' + when(o.deliveredAt) + (o.receivedBy ? ' · received by ' + esc(o.receivedBy) : '') + (o.proof ? ' · photo + code' : '') + '</div></div><a class="btn sm line" href="#a-tracking/' + o.id + '">' + I('eye') + '</a></div>'; }).join('') +
      '<div class="doc">' + I('check') + '<div class="grow"><b>Amount matches the orders</b><div class="tiny muted">' + rs((inv.orders || []).reduce(function (s, o) { return s + Number(o.amount); }, 0)) + ' = ' + rs(inv.amount) + '</div></div></div>' +
      (inv.status === 'Submitted' ? '<div class="row"><button class="btn danger" data-act="reviewInvoice" data-id="' + inv.id + '" data-action="reject">' + I('x') + ' Reject</button><button class="btn green" data-act="reviewInvoice" data-id="' + inv.id + '" data-action="approve">' + I('check') + ' Approve invoice</button></div>'
        : inv.status === 'Approved' ? '<div class="ok-box">' + I('check') + 'Approved by ' + esc(inv.approved_by || '') + '. Ready for payment.</div><a class="btn primary" href="#a-payments/' + inv.id + '">' + I('bank') + ' Go to payment</a>'
        : inv.status === 'Paid' ? '<div class="ok-box">' + I('check') + 'Paid ' + when(inv.paid_at) + ' · ' + esc(inv.pay_mode) + ' · UTR ' + esc(inv.utr) + '</div>'
        : '<div class="warn-box">' + I('info') + '<span>Rejected: ' + esc(inv.review_note || '') + '</span></div>') + '</div>'
      : '<div class="card empty">' + I('file') + '<b>No invoices yet</b><span>Vendors send invoices after delivering orders.</span></div>';
    return workShell('a', 'a-invoices', 'Invoice management', 'Invoices sent by vendors for delivered orders',
      '<div class="cols">' + (j.invoices.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Invoice</th><th>Vendor</th><th>Orders</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>' +
        j.invoices.map(function (r) { return '<tr class="' + (r.id === pick ? 'hl' : '') + '"><td><a href="#a-invoices/' + r.id + '"><b>' + esc(r.invoice_no) + '</b></a><div class="tiny muted">' + when(r.submitted_at) + '</div></td><td class="small">' + esc(r.vendor) + '</td><td class="small">' + (r.orders || []).length + '</td><td class="r num"><b>' + rs(r.amount) + '</b></td><td>' + statusPill(r.status) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div></div>') + detail + '</div>');
  });
});
ACT.reviewInvoice = function (btn, id) {
  var action = btn.getAttribute('data-action'), note = null;
  if (action === 'reject') { note = prompt('Why is it rejected? (the vendor sees this)'); if (note == null) return; }
  busy(btn, api('POST', '/api/admin/invoices/' + id + '/review', { action: action, note: note }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};

VIEWS['a-payments'] = adminView(function (id) {
  return api('GET', '/api/admin/invoices').then(function (j) {
    var due = j.invoices.filter(function (i) { return i.status === 'Approved'; }), paid = j.invoices.filter(function (i) { return i.status === 'Paid'; });
    var pick = due.filter(function (i) { return i.id === Number(id); })[0] || due[0], k = j.kpi;
    var form = pick ? '<form class="card stack" style="border:2px solid var(--leaf)" data-submit="pay" data-id="' + pick.id + '" novalidate><h3>Pay ' + esc(pick.vendor) + '</h3><dl class="kv"><dt>Invoice</dt><dd>' + esc(pick.invoice_no) + '</dd><dt>Amount</dt><dd><b>' + rs(pick.amount) + '</b></dd><dt>Bank</dt><dd>' + esc(pick.bank_name) + ' •••• ' + esc(pick.account_last4) + ' · IFSC ' + esc(pick.bank_ifsc) + '</dd></dl>' +
      '<div class="grid2"><div class="field"><label for="payMode">Mode</label><select class="input" id="payMode"><option>NEFT</option><option>IMPS</option><option>RTGS</option><option>UPI</option></select></div><div class="field"><label for="payUtr">UTR / bank reference</label><input class="input" id="payUtr" maxlength="30" style="text-transform:uppercase"></div></div>' +
      '<p class="small muted">Pay from the bank first, then record it here with the bank reference.</p><button class="btn green lg" type="submit">' + I('check') + ' Mark as paid</button></form>' : '';
    return workShell('a', 'a-payments', 'Vendor payments', 'Pay approved invoices and keep the record',
      '<div class="kpis">' + kpi('clock', 'sun', rs(k.to_pay), 'Approved, not paid') + kpi('file', 'blue', rs(k.to_check), 'Waiting to be checked') + kpi('check', 'green', rs(k.paid_month), 'Paid this month') + kpi('cal', 'plum', k.avg_days == null ? '—' : k.avg_days + ' days', 'Average time to pay') + '</div>' + form +
      '<div class="cols even"><div class="card"><h3>To pay</h3>' + (due.length ? '<div class="table-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>Vendor</th><th>Invoice</th><th class="r">Amount</th></tr></thead><tbody>' + due.map(function (d) { return '<tr class="' + (pick && d.id === pick.id ? 'hl' : '') + '"><td><a href="#a-payments/' + d.id + '">' + esc(d.vendor) + '</a></td><td>' + esc(d.invoice_no) + '</td><td class="r num">' + rs(d.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small" style="margin-top:8px">Nothing to pay.</p>') + '</div>' +
      '<div class="card"><h3>Payment history</h3>' + (paid.length ? '<div class="table-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>Date</th><th>Vendor</th><th class="r">Amount</th><th>UTR</th></tr></thead><tbody>' + paid.map(function (h) { return '<tr><td>' + when(h.paid_at) + '</td><td class="small">' + esc(h.vendor) + '<div class="tiny muted">' + esc(h.invoice_no) + '</div></td><td class="r num">' + rs(h.amount) + '</td><td class="small num">' + esc(h.utr) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small" style="margin-top:8px">No payments yet.</p>') + '</div></div>');
  });
});
ACT.pay = function (btn, id) { busy(btn, api('POST', '/api/admin/invoices/' + id + '/pay', { mode: val('payMode'), utr: val('payUtr') }).then(function (j) { toast(j.message); go('a-payments'); })).catch(function () { }); };

/* ---------------- reports ---------------- */
VIEWS['a-reports'] = adminView(function () {
  var months = S.reportMonths || 6;
  return api('GET', '/api/admin/reports?months=' + months).then(function (j) {
    var k = j.kpi, m = j.months;
    var palette = ['#1F6FE0', '#E3247F', '#13B0EA', '#F7941D', '#6B2FA8', '#2E9E4F', '#FDB913', '#D93A3A'];
    var catTotal = j.byCategory.reduce(function (s, c) { return s + c.qty; }, 0);
    return workShell('a', 'a-reports', 'Reports & analytics', 'Since ' + when(j.from),
      '<div class="toolbar"><select class="input" aria-label="Period" data-change="reportMonths">' + [3, 6, 12].map(function (n) { return '<option value="' + n + '"' + (n === months ? ' selected' : '') + '>Last ' + n + ' months</option>'; }).join('') + '</select><a class="btn line" href="/api/admin/reports/orders.csv?months=' + months + '">' + I('download') + ' Download orders (Excel)</a></div>' +
      '<div class="kpis">' + kpi('gift', 'plum', num(k.redeemed), 'Points redeemed', '= ' + rs(k.money_given)) + kpi('box', 'blue', num(k.orders), 'Orders', k.cancelled + ' cancelled') + kpi('truck', 'green', num(k.delivered), 'Delivered') + kpi('clock', 'sun', k.avg_days == null ? '—' : k.avg_days + ' days', 'Average time to deliver') + '</div>' +
      '<div class="cols even"><div class="card"><h3>Points redeemed per month</h3>' + barChart(m.map(function (x) { return x.label; }), [{ name: 'Points redeemed', color: '#6B2FA8', values: m.map(function (x) { return x.redeemed; }) }], { fmt: kfmt }) + '</div>' +
        '<div class="card"><h3>Orders per month</h3>' + lineChart(m.map(function (x) { return x.label; }), m.map(function (x) { return x.orders; }), '#1F6FE0') + '</div></div>' +
      '<div class="cols even"><div class="card"><h3>Top products</h3>' + barList(j.top.map(function (t) { return [t.name, t.qty]; }), '#E3247F') + '</div>' +
        '<div class="card"><h3>Orders by category</h3><div style="margin-top:10px">' + donut(j.byCategory.map(function (c, i) { return { n: c.name, v: c.qty, c: c.color || palette[i % palette.length] }; }), num(catTotal), 'items') + '</div></div></div>' +
      '<div class="cols even"><div class="card"><h3>Points redeemed by school</h3>' + barList(j.bySchool.map(function (s) { return [s.school, s.points]; }), '#6B2FA8') + '</div>' +
        '<div class="card"><h3>Vendor performance</h3>' + (j.vendors.length ? '<div class="table-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>Vendor</th><th class="r">Orders</th><th class="r">Delivered</th><th class="r">Avg days</th></tr></thead><tbody>' + j.vendors.map(function (v) { return '<tr><td class="small"><b>' + esc(v.name) + '</b></td><td class="r num">' + v.orders + '</td><td class="r num">' + v.delivered + '</td><td class="r num">' + (v.avg_days == null ? '—' : v.avg_days) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">No vendors yet.</p>') + '</div></div>');
  });
});
ACT.reportMonths = function (el) { S.reportMonths = Number(el.value); render(); };

/* ---------------- admins ---------------- */
VIEWS['a-admins'] = adminView(function () {
  return api('GET', '/api/admin/admins').then(function (j) {
    return workShell('a', 'a-admins', 'Admins', 'People who manage HEM-Store',
      '<div class="cols"><div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Email</th><th>Last login</th><th>Active</th></tr></thead><tbody>' +
        j.admins.map(function (a) { return '<tr><td><b>' + esc(a.name) + '</b>' + (a.id === j.meId ? ' <span class="pill sun">You</span>' : '') + '</td><td>' + esc(a.email) + '</td><td class="small">' + (a.last_login_at ? whenTime(a.last_login_at) : '—') + '</td><td>' +
          (a.id === j.meId ? '<span class="pill green">Yes</span>' : '<button class="btn sm ' + (a.is_active ? 'line' : 'green') + '" data-act="toggleAdmin" data-id="' + a.id + '" data-on="' + (!a.is_active) + '">' + (a.is_active ? 'Switch off' : 'Switch on') + '</button>') + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="stack"><form class="card stack" data-submit="addAdmin" novalidate><h3>Add an admin</h3><div class="field"><label for="adName">Name</label><input class="input" id="adName" maxlength="100"></div><div class="field"><label for="adEmail">Email</label><input class="input" id="adEmail" type="email"></div>' +
        pwField('adPass', 'Password (8+ characters, letters and numbers)', 'new-password') + '<button class="btn primary" type="submit">' + I('plus') + ' Add admin</button></form>' +
      '<form class="card stack" data-submit="changePw" novalidate><h3>Change my password</h3>' + pwField('cpOld', 'Current password') + pwField('cpNew', 'New password', 'new-password') + '<button class="btn line" type="submit">' + I('lock') + ' Change password</button></form></div></div>');
  });
});
ACT.addAdmin = function (btn) { busy(btn, api('POST', '/api/admin/admins', { name: val('adName'), email: val('adEmail'), password: document.getElementById('adPass').value }).then(function (j) { toast(j.message); render(); })).catch(function () { }); };
ACT.changePw = function (btn) { busy(btn, api('POST', '/api/admin/admins/me/password', { current: document.getElementById('cpOld').value, new: document.getElementById('cpNew').value }).then(function (j) { toast(j.message); render(); })).catch(function () { }); };
ACT.toggleAdmin = function (btn, id) { busy(btn, api('POST', '/api/admin/admins/' + id + '/active', { active: btn.getAttribute('data-on') === 'true' }).then(function (j) { toast(j.message); render(); })).catch(function () { }); };
