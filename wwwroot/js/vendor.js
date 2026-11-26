/* Vendor portal and the work-screen shell shared with the admin portal. */
'use strict';

var VENDOR_MENU = [
  ['My shop', [['v-dash', 'grid', 'Dashboard'], ['v-products', 'bag', 'Products'], ['v-product-edit', 'plus', 'Add Product']]],
  ['Orders', [['v-orders', 'box', 'Assigned Orders', 'newOrders']]],
  ['Money', [['v-invoice', 'upload', 'Submit Invoice', 'toInvoice'], ['v-payments', 'rupee', 'Payment History']]]
];
var ADMIN_MENU = [
  ['Overview', [['a-dash', 'grid', 'Store Dashboard'], ['a-reports', 'chart', 'Reports & Analytics']]],
  ['Points', [['a-points', 'sliders', 'Points Configuration'], ['a-wallets', 'wallet', 'Student Wallets']]],
  ['Catalogue', [['a-products', 'bag', 'Products', 'products_pending'], ['a-vendor-approval', 'shield', 'Vendor Approval', 'vendors_pending'], ['a-vendors', 'store', 'Vendors']]],
  ['Orders', [['a-verify', 'clip', 'Order Verification', 'to_verify'], ['a-assign', 'pin', 'Vendor Assignment', 'to_assign'], ['a-tracking', 'truck', 'Order Tracking']]],
  ['Payments', [['a-invoices', 'file', 'Invoices', 'invoices_submitted'], ['a-payments', 'bank', 'Vendor Payments', 'invoices_to_pay']]],
  ['Team', [['a-admins', 'users', 'Admins']]]
];

function workShell(kind, active, title, sub, body, actions) {
  var menu = kind === 'v' ? VENDOR_MENU : ADMIN_MENU, counts = (kind === 'v' ? S.vCounts : S.aCounts) || {};
  var name = (S.me && S.me.name) || '';
  var who = '<div class="who"><div class="avatar' + (kind === 'v' ? ' blue' : '') + '">' + esc(initials(name)) + '</div><div class="small"><b>' + esc(name) + '</b><div class="muted">' + (kind === 'v' ? 'Vendor' : 'HEM-Store Admin') + '</div></div></div>';
  var flat = [];
  var side = '<aside class="side ' + (kind === 'v' ? 'vendor' : '') + '">' + logo(false, '#' + (kind === 'v' ? 'v-dash' : 'a-dash')) + menu.map(function (g) {
    return '<div class="grp">' + g[0] + '</div>' + g[1].map(function (m) {
      flat.push(m);
      var n = m[3] ? counts[m[3]] : 0;
      return '<a href="#' + m[0] + '" class="' + (active === m[0] ? 'on' : '') + '">' + I(m[1]) + m[2] + (n ? '<span class="n">' + n + '</span>' : '') + '</a>';
    }).join('');
  }).join('') + '<div class="grow"></div><button class="btn line sm" data-act="logout" style="margin-top:12px">' + I('logout') + ' Log out</button></aside>';
  var pick = '<select class="input side-pick" aria-label="Go to screen" data-nav="1">' + flat.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === active ? ' selected' : '') + '>' + m[2] + '</option>'; }).join('') + '</select>';
  var total = Object.keys(counts).reduce(function (s, k) { return s + (Number(counts[k]) || 0); }, 0);
  return '<div class="w-shell">' + side + '<div class="w-main"><div class="w-top"><div class="row" style="gap:10px">' +
    '<span class="pill ' + (kind === 'v' ? 'blue' : 'plum') + '">' + I(kind === 'v' ? 'store' : 'shield') + (kind === 'v' ? ' Vendor Portal' : ' Admin Portal') + '</span>' + pick + '</div>' +
    '<div class="row"><a class="icon-btn" href="#' + (kind === 'v' ? 'v-orders' : 'a-dash') + '" aria-label="Things to do">' + I('bell') + (total ? '<span class="badge">' + total + '</span>' : '') + '</a>' + who +
    '<button class="icon-btn show-sm" data-act="logout" aria-label="Log out">' + I('logout') + '</button></div></div>' +
    '<div class="w-body"><div class="page-title"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="row">' + actions + '</div>' : '') + '</div>' + body + '</div></div></div>';
}
function kpi(ic, color, value, label, note) {
  return '<div class="kpi"><div class="top"><span>' + label + '</span><span class="ic ' + color + '">' + I(ic) + '</span></div><b class="num">' + value + '</b>' + (note ? '<span class="delta">' + note + '</span>' : '') + '</div>';
}
function cellProd(p) {
  return '<div class="cell-prod"><div class="pic">' + pic(p.imageUrl || (p.image_file ? '/media/products/' + p.image_file : null), p.art, p.name) + '</div><div><b>' + esc(p.name) + '</b><div class="muted tiny">#' + p.id + (p.category ? ' · ' + esc(p.category) : '') + '</div></div></div>';
}
function timeline(events) {
  return '<ol class="timeline" style="margin-top:12px">' + events.slice().reverse().map(function (h) {
    return '<li class="done"><span class="dot">' + I(h.status === 'Cancelled' ? 'x' : 'check') + '</span><div><b>' + esc(h.status) + '</b><span class="when">' + whenTime(h.at) + ' · ' + esc(h.byName || h.byRole) + '</span>' + (h.note ? '<div class="small muted">' + esc(h.note) + '</div>' : '') + '</div></li>';
  }).join('') + '</ol>';
}
function addressKv(o) {
  return '<dl class="kv" style="margin-top:10px"><dt>Receiver</dt><dd>' + esc(o.receiverName) + '</dd><dt>Mobile</dt><dd><a href="tel:' + esc(o.mobile) + '">' + esc(o.mobile) + '</a></dd><dt>Address</dt><dd>' + esc(o.address) + ', ' + esc(o.city) + ', ' + esc(o.state) + '</dd><dt>PIN code</dt><dd>' + esc(o.pincode) + '</dd><dt>Note</dt><dd>' + esc(o.deliveryNote || '—') + '</dd></dl>';
}
function vendorDash(fn) { return function (arg, q) { return api('GET', '/api/vendor/dashboard').then(function (d) { S.vDash = d; S.vCounts = { newOrders: d.kpi.new_orders, toInvoice: d.kpi.to_invoice }; return fn(arg, q, d); }); }; }

/* ======================== VENDOR ======================== */
VIEWS['v-dash'] = vendorDash(function (arg, q, d) {
  var k = d.kpi, me = d.me;
  var banner = k.new_orders ? '<div class="card row between" style="border:2px solid var(--blue);background:var(--blue-soft)"><div class="row" style="flex-wrap:nowrap"><span class="ic blue" style="width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#fff">' + I('bell') + '</span><div><b>' + k.new_orders + ' new order' + (k.new_orders > 1 ? 's' : '') + ' assigned to you</b><div class="small muted">Accept within 4 hours, or HEM gives it to another shop.</div></div></div><a class="btn blue" href="#v-orders">Open orders ' + I('arrow') + '</a></div>' : '';
  var hour = new Date().getHours(), hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return workShell('v', 'v-dash', hello + ', ' + esc(String(me.owner_name || '').split(' ')[0]), esc(me.business_name) + ' · delivers to PIN ' + me.pin_from + ' – ' + me.pin_to, banner +
    '<div class="kpis">' + kpi('box', 'blue', k.new_orders, 'New orders') + kpi('truck', 'orange', k.to_deliver, 'To deliver') + kpi('check', 'green', k.delivered_month, 'Delivered this month', k.delivered_all + ' in all') + kpi('rupee', 'sun', rs(d.paymentDue), 'Payment due') + '</div>' +
    '<div class="cols"><div class="card"><div class="card-head"><h3>Recent orders</h3><a class="btn sm line" href="#v-orders">All orders</a></div>' +
      (d.recent.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Order</th><th>Student</th><th>Item</th><th>PIN</th><th>Status</th></tr></thead><tbody>' +
      d.recent.map(function (r) { return '<tr><td><a href="#v-order/' + r.id + '"><b>' + esc(r.orderNo) + '</b></a><div class="tiny muted">' + when(r.placedAt) + '</div></td><td>' + esc(r.studentName) + '</td><td class="small">' + esc(r.items) + '</td><td>' + esc(r.pincode) + '</td><td>' + statusPill(r.status) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="empty">' + I('box') + '<b>No orders yet</b><span>HEM gives you orders from students in your PIN range.</span></div>') + '</div>' +
    '<div class="stack"><div class="card"><h3>Orders this week</h3>' + barChart(d.week.map(function (w) { return w.day; }), [{ name: 'Orders', color: '#1F6FE0', values: d.week.map(function (w) { return w.orders; }) }]) + '</div>' +
      '<div class="card small"><h3>Payments go to</h3><dl class="kv" style="margin-top:8px"><dt>Account</dt><dd>' + esc(me.bank_name) + ' •••• ' + esc(me.account_last4) + '</dd><dt>IFSC</dt><dd>' + esc(me.bank_ifsc) + '</dd></dl></div></div></div>');
});

/* ---------------- products ---------------- */
VIEWS['v-products'] = function () {
  return Promise.all([api('GET', '/api/vendor/products'), api('GET', '/api/vendor/dashboard')]).then(function (r) {
    var j = r[0]; S.vProducts = j; S.vCounts = { newOrders: r[1].kpi.new_orders, toInvoice: r[1].kpi.to_invoice };
    var pvv = j.pointValue;
    return workShell('v', 'v-products', 'My products', j.products.length + ' products · students see the price in ₹ and in points (1 point = ' + rs(pvv) + ')',
      (j.products.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Product</th><th class="r">Price</th><th class="r">Points</th><th class="r">Stock</th><th class="r">Sold</th><th>Status</th><th></th></tr></thead><tbody>' +
      j.products.map(function (p) {
        var st = p.status === 'Live' && p.stock < 10 ? '<span class="pill orange">Low stock</span>' : p.status === 'Pending' ? '<span class="pill sun">Waiting for HEM approval</span>' : statusPill(p.status);
        return '<tr><td>' + cellProd(p) + (p.status === 'Rejected' && p.review_note ? '<div class="tiny" style="color:var(--red)">HEM: ' + esc(p.review_note) + '</div>' : '') + '</td><td class="r num"><b>' + rs(p.price) + '</b></td><td class="r num">' + Math.ceil(p.price / pvv - 1e-9) + '</td><td class="r num">' + p.stock + '</td><td class="r num">' + p.sold + '</td><td>' + st + '</td><td class="r"><a class="btn sm line" href="#v-product-edit/' + p.id + '">' + I('edit') + ' Edit</a></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + I('bag') + '<b>No products yet</b><span>Add your first product. HEM checks it before students can see it.</span><a class="btn blue" href="#v-product-edit">' + I('plus') + ' Add product</a></div>'),
      '<a class="btn blue" href="#v-product-edit">' + I('plus') + ' Add product</a>');
  });
};

var ART_NAMES = ['badge', 'bottle', 'chessboard', 'clay', 'crayons', 'football', 'geometry', 'globe', 'headphones', 'lunchbox', 'notebooks', 'paints', 'pencils', 'puzzle', 'rope', 'schoolbag', 'sciencekit', 'storybook'];
function productForm(p, cats, pointValue, opts) {
  opts = opts || {};
  p = p || { category_id: (cats[0] || {}).id, name: '', name_hi: '', about: '', highlights: '', age_group: 'All', mrp: '', price: '', stock: 0, hsn: '', art: 'badge' };
  var preview = p.image_file ? '<img class="photo" src="/media/products/' + esc(p.image_file) + '" alt="">' : art(p.art);
  return '<form class="card stack" data-submit="' + (opts.submit || 'saveProduct') + '" data-id="' + (p.id || '') + '" novalidate>' +
    '<div class="field"><label>Photo</label><div class="row" style="flex-wrap:nowrap;align-items:stretch"><div id="pPreview" style="width:140px;border-radius:12px;overflow:hidden;border:2px solid var(--blue);flex:0 0 auto">' + preview + '</div>' +
    '<label class="drop grow" for="pImg" style="padding:14px">' + I('camera') + '<b>' + (p.image_file ? 'Change photo' : 'Add a photo') + '</b><span class="small muted">Clear photo on a plain background · JPG, PNG or WEBP, up to 5 MB</span><input type="file" id="pImg" accept="image/jpeg,image/png,image/webp" hidden data-preview="#pPreview"></label></div></div>' +
    '<div class="field"><label for="pName">Product name</label><input class="input" id="pName" maxlength="150" value="' + esc(p.name) + '" required></div>' +
    '<div class="grid2"><div class="field"><label for="pHi">Name in Hindi (optional)</label><input class="input" id="pHi" maxlength="150" value="' + esc(p.name_hi || '') + '"></div>' +
    '<div class="field"><label for="pArt">Drawing when there is no photo</label><select class="input" id="pArt">' + ART_NAMES.map(function (a) { return '<option' + (a === p.art ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="grid2"><div class="field"><label for="pCat">Category</label><select class="input" id="pCat">' + cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === p.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label for="pAge">Age group</label><select class="input" id="pAge">' + ['All', '3+', '4+', '5+', '6+', '7+', '8+', '10+', '12+'].map(function (a) { return '<option' + (a === p.age_group ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></div></div>' +
    (opts.vendors ? '<div class="field"><label for="pVendor">Supplied by</label><select class="input" id="pVendor"><option value="">HEM (no vendor)</option>' + opts.vendors.map(function (v) { return '<option value="' + v.id + '"' + (v.id === p.vendor_id ? ' selected' : '') + '>' + esc(v.business_name) + '</option>'; }).join('') + '</select></div>' : '') +
    '<div class="grid3"><div class="field"><label for="pMrp">MRP (₹)</label><input class="input" id="pMrp" inputmode="decimal" value="' + esc(p.mrp == null ? '' : p.mrp) + '"></div>' +
    '<div class="field"><label for="pPrice">HEM price (₹)</label><input class="input" id="pPrice" inputmode="decimal" value="' + esc(p.price) + '" data-points="' + pointValue + '" required></div>' +
    '<div class="field"><label>Points (auto)</label><div class="input" style="background:var(--sun-soft);font-weight:900" id="pPts">' + (p.price ? Math.ceil(p.price / pointValue - 1e-9) : 0) + ' points</div></div></div>' +
    '<div class="grid2"><div class="field"><label for="pStock">Stock</label><input class="input" id="pStock" inputmode="numeric" value="' + esc(p.stock) + '"></div><div class="field"><label for="pHsn">HSN code</label><input class="input" id="pHsn" maxlength="20" value="' + esc(p.hsn || '') + '"></div></div>' +
    '<div class="field"><label for="pAbout">Description (simple words for children)</label><textarea class="input" id="pAbout" maxlength="1000">' + esc(p.about || '') + '</textarea></div>' +
    '<div class="field"><label for="pHigh">Highlights (one per line, up to 6)</label><textarea class="input" id="pHigh" rows="4">' + esc(p.highlights || '') + '</textarea></div>' +
    (opts.note ? '<div class="info-box">' + I('shield') + '<span>' + opts.note + '</span></div>' : '') +
    '<div class="form-error" id="pError" hidden></div>' +
    '<div class="row"><button class="btn ' + (opts.admin ? 'primary' : 'blue') + '" type="submit">' + I('check') + ' ' + (opts.saveLabel || 'Save') + '</button><a class="btn line" href="#' + (opts.back || 'v-products') + '">Cancel</a></div></form>';
}
document.addEventListener('input', function (e) {
  if (e.target.id !== 'pPrice') return;
  var v = Number(e.target.value) || 0, out = document.getElementById('pPts');
  if (out) out.textContent = Math.ceil(v / Number(e.target.getAttribute('data-points')) - 1e-9) + ' points';
});
function productData() {
  var fd = new FormData();
  fd.append('CategoryId', val('pCat')); fd.append('Name', val('pName')); fd.append('NameHi', val('pHi')); fd.append('About', val('pAbout'));
  fd.append('Highlights', document.getElementById('pHigh').value); fd.append('AgeGroup', val('pAge'));
  if (val('pMrp')) fd.append('Mrp', val('pMrp'));
  fd.append('Price', val('pPrice') || '0'); fd.append('Stock', val('pStock') || '0'); fd.append('Hsn', val('pHsn')); fd.append('Art', val('pArt'));
  var img = document.getElementById('pImg'); if (img.files[0]) fd.append('Image', img.files[0]);
  var v = document.getElementById('pVendor'); if (v && v.value) fd.append('VendorId', v.value);
  return fd;
}

VIEWS['v-product-edit'] = function (id) {
  return api('GET', '/api/vendor/products').then(function (j) {
    var p = id ? j.products.filter(function (x) { return x.id === Number(id); })[0] : null;
    if (id && !p) return workShell('v', 'v-products', 'Product not found', '', '<a class="btn line" href="#v-products">Back</a>');
    var prev = p || { name: 'Your product', price: 0, art: 'badge' };
    return workShell('v', id ? 'v-products' : 'v-product-edit', id ? 'Edit product' : 'Add product', 'Students see the price in ₹ and in points (1 point = ' + rs(j.pointValue) + ')',
      '<div class="cols">' + productForm(p, j.categories, j.pointValue, { note: 'New products and changes to the name, price or details go live after HEM approval. A stock change alone goes live at once.', saveLabel: 'Save & send for approval' }) +
      '<div class="stack"><div class="card"><h3>How students will see it</h3><div style="max-width:280px;margin-top:12px">' +
        '<article class="p-card"><span class="pill green can-buy">' + I('check') + ' You can buy</span><div class="pic">' + (prev.image_file ? '<img class="photo" src="/media/products/' + esc(prev.image_file) + '" alt="">' : art(prev.art)) + '</div><div class="body"><div class="name">' + esc(prev.name) + '</div><div class="price"><b>' + rs(prev.price) + '</b><span>' + Math.ceil(prev.price / j.pointValue - 1e-9) + ' points</span></div><div class="acts"><span class="btn blue sm">' + I('cart') + ' Add to Cart</span></div></div></article></div></div>' +
        (p && p.review_note ? '<div class="warn-box">' + I('info') + '<span>HEM note: ' + esc(p.review_note) + '</span></div>' : '') +
        '<div class="card small"><h3>Checklist</h3><ul class="ticks" style="margin-top:8px"><li>' + I('check') + 'Child-safe, non-toxic material</li><li>' + I('check') + 'Clear photo and simple name</li><li>' + I('check') + 'HEM price below MRP</li><li>' + I('check') + 'Stock updated</li></ul></div></div></div>');
  });
};
ACT.saveProduct = function (btn, id) {
  var err = document.getElementById('pError'); err.hidden = true;
  busy(btn, api('POST', '/api/vendor/products' + (id ? '/' + id : ''), productData()).then(function (j) { toast(j.message); go('v-products'); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

/* ---------------- orders ---------------- */
VIEWS['v-orders'] = vendorDash(function (arg, q) {
  return api('GET', '/api/vendor/orders').then(function (j) {
    var tab = S.vTab || 'Open';
    var groups = { New: ['Assigned'], Open: ['Assigned', 'Accepted', 'Packed', 'Shipped', 'Out for delivery'], Delivered: ['Delivered'], All: null };
    var rows = j.orders.filter(function (o) { return !groups[tab] || groups[tab].indexOf(o.status) >= 0; });
    return workShell('v', 'v-orders', 'Assigned orders', 'Orders HEM has given to your shop',
      '<div class="filters">' + Object.keys(groups).map(function (t) {
        var n = j.orders.filter(function (o) { return !groups[t] || groups[t].indexOf(o.status) >= 0; }).length;
        return '<button class="chip' + (tab === t ? ' on' : '') + '" data-act="vTab" data-id="' + t + '">' + (t === 'Open' ? 'In progress' : t) + ' <span class="pill gray">' + n + '</span></button>';
      }).join('') + '</div>' +
      (rows.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Order</th><th>Student & school</th><th>Items</th><th>PIN</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr class="' + (r.status === 'Assigned' ? 'hl' : '') + '"><td><b>' + esc(r.orderNo) + '</b><div class="tiny muted">' + when(r.placedAt) + '</div></td><td><b>' + esc(r.studentName) + '</b><div class="tiny muted">' + esc(r.school || '') + '</div></td><td class="small">' + esc(r.items) + '</td><td>' + esc(r.pincode) + '</td><td class="r num">' + rs(r.amount) + '</td><td>' + statusPill(r.status) + '</td>' +
          '<td class="r"><a class="btn sm ' + (r.status === 'Assigned' ? 'blue' : 'line') + '" href="#v-order/' + r.id + '">Open</a></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + I('box') + '<b>No orders here</b><span>New orders appear here when HEM assigns them to your shop.</span></div>'));
  });
});
ACT.vTab = function (el, t) { S.vTab = t; render(); };

var V_STEPS = [['Accepted', 'clip'], ['Packed', 'box'], ['Shipped', 'truck'], ['Out for delivery', 'pin'], ['Delivered', 'gift']];
VIEWS['v-order'] = vendorDash(function (id) {
  return api('GET', '/api/vendor/orders/' + id).then(function (j) {
    var o = j.order, st = o.status, idx = statusIndex(st), next = ORDER_FLOW[idx + 1];
    var at = {}; j.events.forEach(function (e) { at[e.status] = e; });
    var action;
    if (st === 'Assigned') {
      action = '<p class="small muted">Accept within 4 hours, or HEM gives it to another shop.</p><div class="row"><button class="btn line" data-act="vReject" data-id="' + o.id + '">' + I('x') + ' Cannot fulfil</button><button class="btn green" data-act="vStatus" data-id="' + o.id + '" data-to="Accepted">' + I('check') + ' Accept order</button></div>';
    } else if (st === 'Delivered') {
      action = '<div class="ok-box">' + I('check') + '<span>Delivered with proof' + (o.receivedBy ? ' · received by ' + esc(o.receivedBy) : '') + '.</span></div>' +
        (o.invoiceId ? '<span class="small muted">Invoiced in ' + esc(o.invoiceNo) + ' (' + esc(o.invoiceStatus) + ')</span>' : '<a class="btn blue" href="#v-invoice">' + I('upload') + ' Submit invoice</a>');
    } else if (st === 'Cancelled') {
      action = '<div class="warn-box">' + I('info') + '<span>HEM cancelled this order. Do not deliver it.</span></div>';
    } else if (next === 'Delivered') {
      action = '<form class="stack" data-submit="vProof" data-id="' + o.id + '" novalidate><div class="info-box">' + I('camera') + '<span>Take a photo of the parcel with the receiver, and ask for the student\'s 4-digit code.</span></div>' +
        '<label class="drop" for="pfPhoto" id="pfPreview">' + I('camera') + '<b>Take or upload the delivery photo</b><span class="small muted">JPG, PNG or WEBP</span></label><input type="file" id="pfPhoto" accept="image/*" capture="environment" hidden data-preview="#pfPreview">' +
        '<div class="grid2"><div class="field"><label for="pfName">Received by</label><input class="input" id="pfName" value="' + esc(o.receiverName) + '" maxlength="100"></div><div class="field"><label for="pfRel">Relation to student</label><select class="input" id="pfRel"><option>Father</option><option>Mother</option><option>Student</option><option>Guardian</option></select></div></div>' +
        '<div class="field"><label for="pfCode">Student\'s delivery code</label><input class="input num" id="pfCode" maxlength="4" inputmode="numeric" placeholder="4 digits" style="font-size:1.4rem;letter-spacing:.4em;font-weight:900;max-width:200px"><span class="help">Ask the student or parent for the code shown in their app.</span></div>' +
        '<div class="form-error" id="pfError" hidden></div><button class="btn green lg" type="submit">' + I('check') + ' Confirm delivery</button></form>';
    } else {
      action = '<div class="field"><label for="sNote">Note for the student (optional)</label><input class="input" id="sNote" maxlength="200" placeholder="' + (next === 'Shipped' ? 'e.g. Sent with our delivery boy, Ramesh' : '') + '"></div>' +
        '<button class="btn blue lg" data-act="vStatus" data-id="' + o.id + '" data-to="' + esc(next) + '">' + I('check') + ' Mark as “' + esc(next) + '”</button>';
    }
    var steps = st === 'Cancelled' ? '' : '<div class="status-steps" style="grid-template-columns:repeat(5,1fr)">' + V_STEPS.map(function (s) {
      var i = statusIndex(s[0]), cls = i <= idx ? 'done' : s[0] === next ? 'next' : '';
      return '<div class="ss ' + cls + '">' + I(s[1]) + s[0] + (at[s[0]] ? '<span class="tiny">' + whenTime(at[s[0]].at).split(' · ')[1] + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    return workShell('v', 'v-orders', 'Order ' + esc(o.orderNo), 'Placed ' + whenTime(o.placedAt) + ' · ' + statusPill(st),
      '<div class="cols"><div class="stack"><div class="card"><div class="card-head"><h3>Items</h3>' + statusPill(st) + '</div><div class="table-wrap"><table class="t"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Price</th></tr></thead><tbody>' +
        j.items.map(function (x) { return '<tr><td>' + cellProd({ id: x.productId, name: x.name, art: x.art, imageUrl: x.imageUrl }) + '</td><td class="r num">' + x.qty + '</td><td class="r num">' + rs(x.total) + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="sum-row" style="margin-top:8px"><span>Amount payable to you by HEM</span><b class="num">' + rs(o.amount) + '</b></div><p class="small muted">The student paid with HEM points. Do not collect any money at delivery.</p></div>' +
        '<div class="card stack"><h3>Next step</h3>' + steps + action + '</div>' +
        (o.hasProof ? '<div class="card"><h3>Delivery photo</h3><div class="proof-photo" style="margin-top:10px"><img src="/api/vendor/orders/' + o.id + '/proof" alt="Delivery photo" style="width:100%;display:block"></div></div>' : '') + '</div>' +
      '<div class="stack"><div class="card"><h3>Deliver to</h3>' + addressKv(o) + '</div>' +
        '<div class="card"><h3>Student</h3><div class="row" style="margin-top:10px;flex-wrap:nowrap"><div class="avatar pink">' + esc(initials(o.studentName)) + '</div><div class="small"><b>' + esc(o.studentName) + '</b><div class="muted">' + esc([o.studentClass ? 'Class ' + o.studentClass : '', o.school].filter(Boolean).join(' · ')) + '</div></div></div></div>' +
        '<div class="card"><h3>History</h3>' + timeline(j.events) + '</div></div></div>',
      '<a class="btn line" href="#v-orders">' + I('back') + ' All orders</a>');
  });
});
ACT.vStatus = function (btn, id) {
  var to = btn.getAttribute('data-to');
  busy(btn, api('POST', '/api/vendor/orders/' + id + '/status', { status: to, note: val('sNote') }).then(function (j) { toast(j.message); render(); })).catch(function () { });
};
ACT.vReject = function (btn, id) {
  var reason = prompt('Why can you not fulfil this order? (HEM sees this)');
  if (reason == null) return;
  busy(btn, api('POST', '/api/vendor/orders/' + id + '/reject', { note: reason }).then(function (j) { toast(j.message); go('v-orders'); })).catch(function () { });
};
ACT.vProof = function (btn, id) {
  var err = document.getElementById('pfError'); err.hidden = true;
  var f = document.getElementById('pfPhoto').files[0];
  if (!f) { err.textContent = 'Add the delivery photo first.'; err.hidden = false; return; }
  var fd = new FormData(); fd.append('Photo', f); fd.append('Code', val('pfCode')); fd.append('ReceivedBy', val('pfName')); fd.append('Relation', val('pfRel'));
  busy(btn, api('POST', '/api/vendor/orders/' + id + '/proof', fd).then(function (j) { toast(j.message); render(); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

/* ---------------- invoices and payments ---------------- */
VIEWS['v-invoice'] = vendorDash(function () {
  return api('GET', '/api/vendor/invoices').then(function (j) {
    S.vInvoice = j;
    var list = j.ready.length ? '<div class="table-wrap"><table class="t"><thead><tr><th><input type="checkbox" id="invAll" checked aria-label="Choose all" style="width:18px;height:18px;accent-color:var(--blue)"></th><th>Order</th><th>Delivered</th><th>Proof</th><th class="r">Amount</th></tr></thead><tbody>' +
      j.ready.map(function (o) {
        return '<tr><td><input type="checkbox" class="inv-pick" value="' + o.id + '" data-amount="' + o.amount + '" checked aria-label="Include ' + esc(o.orderNo) + '" style="width:18px;height:18px;accent-color:var(--blue)"></td><td><b>' + esc(o.orderNo) + '</b><div class="tiny muted">' + esc(o.items) + '</div></td><td>' + when(o.deliveredAt) + '</td><td><span class="pill green">' + I('check') + ' Photo + code</span></td><td class="r num">' + rs(o.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + I('file') + '<b>No delivered order waiting for an invoice</b><span>After you deliver an order with proof, you can bill HEM for it here.</span></div>';
    var total = j.ready.reduce(function (s, o) { return s + Number(o.amount); }, 0);
    var form = j.ready.length ? '<div class="cols"><form class="card stack" data-submit="submitInvoice" novalidate><h3>Invoice details</h3>' +
      '<div class="grid2"><div class="field"><label for="iNo">Invoice number</label><input class="input" id="iNo" maxlength="50" required></div><div class="field"><label for="iDate">Invoice date</label><input class="input" id="iDate" type="date" value="' + today() + '" max="' + today() + '"></div></div>' +
      '<div class="field"><label>Total of chosen orders</label><div class="input num" style="font-weight:900" id="iTotal">' + rs(total) + '</div></div>' +
      '<label class="drop" for="iFile" id="iFileBox">' + I('upload') + '<b>Upload invoice PDF</b><span class="small muted">PDF up to 5 MB</span></label><input type="file" id="iFile" accept="application/pdf" hidden data-preview="#iFileBox">' +
      '<div class="form-error" id="iError" hidden></div><button class="btn blue lg" type="submit">' + I('send') + ' Submit invoice to HEM</button></form>' +
      '<div class="card small"><h3>HEM checks</h3><ul class="ticks" style="margin-top:8px"><li>' + I('check') + 'Order delivered with photo and code</li><li>' + I('check') + 'Amount matches the orders</li><li>' + I('check') + 'GSTIN matches your registration</li></ul><p class="muted" style="margin-top:10px">Approved invoices are paid by NEFT within 3 working days to ' + esc(j.bank.bank_name) + ' •••• ' + esc(j.bank.account_last4) + '.</p></div></div>' : '';
    return workShell('v', 'v-invoice', 'Submit invoice', 'Bill HEM for delivered orders', list + form);
  });
});
document.addEventListener('change', function (e) {
  if (e.target.id === 'invAll') document.querySelectorAll('.inv-pick').forEach(function (c) { c.checked = e.target.checked; });
  if (e.target.id === 'invAll' || e.target.classList.contains('inv-pick')) {
    var t = 0; document.querySelectorAll('.inv-pick:checked').forEach(function (c) { t += Number(c.getAttribute('data-amount')); });
    var out = document.getElementById('iTotal'); if (out) out.textContent = rs(t);
  }
});
ACT.submitInvoice = function (btn) {
  var err = document.getElementById('iError'); err.hidden = true;
  var ids = Array.prototype.map.call(document.querySelectorAll('.inv-pick:checked'), function (c) { return c.value; });
  var f = document.getElementById('iFile').files[0];
  if (!ids.length) { err.textContent = 'Choose at least one order.'; err.hidden = false; return; }
  if (!f) { err.textContent = 'Upload the invoice PDF.'; err.hidden = false; return; }
  var fd = new FormData(); fd.append('InvoiceNo', val('iNo')); fd.append('InvoiceDate', val('iDate')); fd.append('OrderIds', ids.join(',')); fd.append('File', f);
  busy(btn, api('POST', '/api/vendor/invoices', fd).then(function (j) { toast(j.message); go('v-payments'); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

VIEWS['v-payments'] = vendorDash(function () {
  return api('GET', '/api/vendor/invoices').then(function (j) {
    var rows = j.invoices, paid = 0, due = 0;
    rows.forEach(function (r) { if (r.status === 'Paid') paid += Number(r.amount); else if (r.status !== 'Rejected') due += Number(r.amount); });
    return workShell('v', 'v-payments', 'Payment history', 'Money paid by HEM · ' + esc(j.bank.bank_name) + ' •••• ' + esc(j.bank.account_last4),
      '<div class="kpis">' + kpi('check', 'green', rs(paid), 'Paid to you') + kpi('clock', 'sun', rs(due), 'Waiting for payment') + kpi('file', 'blue', rows.length, 'Invoices sent') + kpi('box', 'plum', j.ready.length, 'Orders to invoice') + '</div>' +
      (rows.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Invoice</th><th>Orders</th><th>Submitted</th><th class="r">Amount</th><th>Status</th><th>UTR / reference</th><th>Paid on</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><a href="/api/vendor/invoices/' + r.id + '/file" target="_blank" rel="noopener"><b>' + esc(r.invoice_no) + '</b></a>' + (r.status === 'Rejected' && r.review_note ? '<div class="tiny" style="color:var(--red)">HEM: ' + esc(r.review_note) + '</div>' : '') + '</td><td class="small">' + esc(r.orders || '—') + '</td><td>' + when(r.submitted_at) + '</td><td class="r num"><b>' + rs(r.amount) + '</b></td><td>' + statusPill(r.status) + '</td><td class="small num">' + esc(r.utr || '—') + '</td><td>' + (r.paid_at ? when(r.paid_at) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + I('rupee') + '<b>No invoices yet</b><span>Deliver orders, then submit an invoice to get paid.</span></div>'));
  });
});
