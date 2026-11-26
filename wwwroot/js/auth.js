/* Login pages, first-admin setup and vendor registration. */
'use strict';

function authPage(inner, wide) {
  return '<div class="auth-bg"><div class="auth-wrap' + (wide ? ' wide' : '') + '">' + inner + '</div></div>';
}
function authLinks(current) {
  var links = [['login', 'smile', 'Student login'], ['vendor-login', 'store', 'Vendor login'], ['admin-login', 'shield', 'HEM admin'], ['v-register', 'plus', 'Register your shop']];
  return '<div class="auth-links">' + links.filter(function (l) { return l[0] !== current; }).map(function (l) {
    return '<a href="#' + l[0] + '">' + I(l[1]) + l[2] + '</a>';
  }).join('') + '</div>';
}
function pwField(id, label, auto) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><div class="pw"><input class="input" id="' + id + '" type="password" autocomplete="' + (auto || 'current-password') + '" required>' +
    '<button type="button" class="pw-eye" data-act="showPw" data-id="' + id + '" aria-label="Show password">' + I('eye') + '</button></div></div>';
}
ACT.showPw = function (el, id) { var i = document.getElementById(id); i.type = i.type === 'password' ? 'text' : 'password'; };

/* ---------------- student ---------------- */
VIEWS['login'] = function (arg, q) {
  var note = q.get('expired') ? 'That link has expired or was already used. Please open HEM-Store again from your HEM Virtues dashboard, or log in below.'
    : q.get('offline') ? 'HEM Virtues could not be reached. Please try again in a minute.'
    : q.get('inactive') ? 'Your HEM Virtues account is not active. Please contact your school.' : '';
  var hv = (S.status && S.status.hemVirtuesUrl) || '';
  return authPage(logo(true) +
    '<form class="card stack auth-card" data-submit="studentLogin" autocomplete="on">' +
      '<div><span class="crumb">For students</span><h1>Log in to HEM-Store</h1><p class="muted">Use the same ID and password as <b>HEM Virtues</b>. <span class="hi">वही आईडी और पासवर्ड जो HEM Virtues में है</span></p></div>' +
      (note ? '<div class="warn-box">' + I('info') + '<span>' + esc(note) + '</span></div>' : '') +
      (S.status && !S.status.hemVirtuesConnected ? '<div class="warn-box">' + I('info') + '<span>The store is not connected to HEM Virtues yet. Please try again later.</span></div>' : '') +
      '<div class="field"><label for="lgUser">HEM Virtues ID (mobile number or username)</label><input class="input" id="lgUser" autocomplete="username" required autofocus></div>' +
      pwField('lgPass', 'Password') +
      '<label class="row small" style="font-weight:800"><input type="checkbox" id="lgRemember" style="width:18px;height:18px;accent-color:var(--plum)"> Keep me logged in on this device</label>' +
      '<div class="form-error" id="lgError" hidden></div>' +
      '<button class="btn primary lg block" type="submit">' + I('arrow') + ' Log in <span class="sub">लॉग इन करें</span></button>' +
      (hv ? '<p class="small muted" style="text-align:center">Already logged in to HEM Virtues? Open your dashboard and tap <b>Redeem in HEM Store</b> on your points card. <a href="' + esc(hv) + '/Learn/Index">Open HEM Virtues</a></p>' : '') +
    '</form>' + authLinks('login'));
};
ACT.studentLogin = function (btn) {
  var err = document.getElementById('lgError'); err.hidden = true;
  busy(btn, api('POST', '/api/auth/student', { username: val('lgUser'), password: document.getElementById('lgPass').value, remember: document.getElementById('lgRemember').checked })
    .then(function (j) { S.me = { role: j.role, name: j.name }; go('s-home'); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

/* ---------------- vendor and admin ---------------- */
function emailLogin(kind) {
  var vendor = kind === 'Vendor';
  return authPage(logo(true) +
    '<form class="card stack auth-card" data-submit="emailLogin" data-id="' + kind + '" autocomplete="on">' +
      '<div><span class="crumb">' + (vendor ? 'For shops' : 'For the HEM team') + '</span><h1>' + (vendor ? 'Vendor login' : 'Admin login') + '</h1>' +
      '<p class="muted">' + (vendor ? 'Log in with the email and password you used to register your shop.' : 'Manage points, products, vendors, orders and payments.') + '</p></div>' +
      '<div class="field"><label for="emEmail">Email</label><input class="input" id="emEmail" type="email" autocomplete="username" required autofocus></div>' +
      pwField('emPass', 'Password') +
      '<div class="form-error" id="emError" hidden></div>' +
      '<button class="btn ' + (vendor ? 'blue' : 'primary') + ' lg block" type="submit">' + I('arrow') + ' Log in</button>' +
      (vendor ? '<p class="small muted" style="text-align:center">New shop? <a href="#v-register">Register your shop</a></p>' : '') +
    '</form>' + authLinks(vendor ? 'vendor-login' : 'admin-login'));
}
VIEWS['vendor-login'] = function () { return emailLogin('Vendor'); };
VIEWS['admin-login'] = function () {
  if (S.status && S.status.needsSetup) { go('setup'); return ''; }
  return emailLogin('Admin');
};
ACT.emailLogin = function (btn, kind) {
  var err = document.getElementById('emError'); err.hidden = true;
  busy(btn, api('POST', kind === 'Vendor' ? '/api/auth/vendor' : '/api/auth/admin', { email: val('emEmail'), password: document.getElementById('emPass').value })
    .then(function (j) { S.me = { role: j.role, name: j.name }; go(homeFor(j.role)); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

/* ---------------- first admin ---------------- */
VIEWS['setup'] = function () {
  if (!S.status || !S.status.databaseReady) {
    return authPage(logo(true) + '<div class="card stack auth-card"><h1>Database not ready</h1><div class="warn-box">' + I('info') +
      '<span>Create the <b>HemStore</b> database and run <code>Database/HemStore_Create.sql</code> once, then reload this page.</span></div><button class="btn primary" data-act="reloadStatus">' + I('refresh') + ' Check again</button></div>');
  }
  if (!S.status.needsSetup) { go('admin-login'); return ''; }
  return authPage(logo(true) +
    '<form class="card stack auth-card" data-submit="setupAdmin">' +
      '<div><span class="crumb">First start</span><h1>Create the first admin</h1><p class="muted">This page works only once, while there is no admin. More admins can be added later from the admin portal.</p></div>' +
      '<div class="field"><label for="suName">Your name</label><input class="input" id="suName" required autofocus></div>' +
      '<div class="field"><label for="suEmail">Email (used to log in)</label><input class="input" id="suEmail" type="email" autocomplete="username" required></div>' +
      pwField('suPass', 'Password (8+ characters, letters and numbers)', 'new-password') +
      '<div class="form-error" id="suError" hidden></div>' +
      '<button class="btn primary lg block" type="submit">' + I('check') + ' Create admin and log in</button></form>');
};
ACT.reloadStatus = function (btn) { busy(btn, loadStatus().then(render)); };
ACT.setupAdmin = function (btn) {
  var err = document.getElementById('suError'); err.hidden = true;
  busy(btn, api('POST', '/api/auth/setup', { name: val('suName'), email: val('suEmail'), password: document.getElementById('suPass').value })
    .then(function () { S.status.needsSetup = false; return loadMe(); }).then(function () { go('a-dash'); })
    .catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};

/* ---------------- vendor registration (4 steps, one form) ---------------- */
var REG_STEPS = ['Business', 'Service area & bank', 'Documents', 'Review'];
var REG_CATS = ['Stationery', 'Story Books', 'Art & Craft', 'Sports & Play', 'Learning Toys', 'School Essentials'];
VIEWS['v-register'] = function () {
  S.reg = S.reg || { step: 1 };
  var step = S.reg.step;
  var bar = '<div class="reg-steps">' + REG_STEPS.map(function (n, i) {
    return '<div class="' + (i + 1 < step ? 'done' : i + 1 === step ? 'on' : '') + '"><i>' + (i + 1 < step ? '✓' : i + 1) + '</i>' + n + '</div>';
  }).join('') + '</div>';
  function f(id, label, type, extra) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + '></div>';
  }
  var docs = [['rgGst', 'GST certificate', 'image/*,application/pdf'], ['rgPan', 'PAN card', 'image/*,application/pdf'], ['rgCheque', 'Cancelled cheque', 'image/*,application/pdf'], ['rgShop', 'Shop photo (outside)', 'image/*']];
  var body =
    '<section data-step="1"' + (step === 1 ? '' : ' hidden') + '>' +
      '<div class="grid2">' + f('rgBiz', 'Shop / business name', 'text', 'maxlength="150" required') + f('rgOwner', 'Owner name', 'text', 'maxlength="100" required') +
      f('rgPhone', 'Mobile', 'tel', 'inputmode="numeric" maxlength="10" required') + f('rgEmail', 'Email (used to log in)', 'email', 'required') +
      f('rgGstin', 'GSTIN', 'text', 'maxlength="15" style="text-transform:uppercase" required') + f('rgPanNo', 'PAN', 'text', 'maxlength="10" style="text-transform:uppercase" required') + '</div>' +
      f('rgAddr', 'Shop address', 'text', 'maxlength="300" required') +
      '<div class="grid2">' + f('rgCity', 'City', 'text', 'maxlength="80" required') + '<div></div></div>' +
      '<div class="field"><label>What will you sell?</label><div class="filters" id="rgCats">' + REG_CATS.map(function (c) { return '<label class="chip"><input type="checkbox" value="' + esc(c) + '" hidden>' + esc(c) + '</label>'; }).join('') + '</div></div>' +
      '<div class="grid2">' + pwField('rgPass', 'Password for your shop login', 'new-password') + '<div class="field"><label>&nbsp;</label><span class="help">8+ characters, with letters and numbers.</span></div></div>' +
    '</section>' +
    '<section data-step="2"' + (step === 2 ? '' : ' hidden') + '>' +
      '<div class="grid2">' + f('rgPinFrom', 'Deliver from PIN code', 'text', 'inputmode="numeric" maxlength="6" required') + f('rgPinTo', 'Deliver to PIN code', 'text', 'inputmode="numeric" maxlength="6" required') + '</div>' +
      '<span class="help">Orders from students in this PIN range come to you.</span>' +
      '<div class="field"><label>Delivery time</label><div class="filters" id="rgDays">' + ['1-2 days', '3-5 days', '5-7 days'].map(function (d, i) { return '<label class="chip' + (i === 1 ? ' on' : '') + '"><input type="radio" name="rgDays" value="' + d + '"' + (i === 1 ? ' checked' : '') + ' hidden>' + d + '</label>'; }).join('') + '</div></div>' +
      '<div class="grid3">' + f('rgBank', 'Bank account name', 'text', 'maxlength="150" required') + f('rgAcc', 'Account number', 'text', 'inputmode="numeric" maxlength="18" required') + f('rgIfsc', 'IFSC', 'text', 'maxlength="11" style="text-transform:uppercase" required') + '</div>' +
      '<div class="info-box">' + I('info') + '<span>Payments are sent to this account after HEM approves your invoice, usually within 3 working days.</span></div>' +
    '</section>' +
    '<section data-step="3"' + (step === 3 ? '' : ' hidden') + '><div class="grid2">' + docs.map(function (d) {
      return '<label class="drop" for="' + d[0] + '">' + I('upload') + '<b>' + d[1] + '</b><span class="small muted" id="' + d[0] + 'Name">JPG, PNG or PDF, up to 5 MB</span><input type="file" id="' + d[0] + '" accept="' + d[2] + '" hidden data-change="regFile"></label>';
    }).join('') + '</div></section>' +
    '<section data-step="4"' + (step === 4 ? '' : ' hidden') + '><dl class="kv" id="rgReview"></dl>' +
      '<label class="row small" style="font-weight:800"><input type="checkbox" id="rgAgree" style="width:18px;height:18px;accent-color:var(--blue)"> I agree to the HEM-Store vendor terms (child-safe products, honest pricing, delivery proof for every order).</label></section>';
  return '<div class="reg-bg"><div style="max-width:880px;margin:0 auto" class="stack"><div class="row between">' + logo(false, '#vendor-login') + '<a class="btn line sm" href="#vendor-login">Already registered? Log in</a></div>' +
    '<form class="card stack" style="padding:24px" id="regForm" data-submit="regNext" novalidate><div><span class="crumb">Become a HEM-Store vendor</span><h1>Register your shop</h1><p class="muted">Sell child-safe learning products to students near you. HEM checks every shop before it goes live.</p></div>' +
    bar + '<h3 id="rgTitle">' + step + '. ' + REG_STEPS[step - 1] + '</h3>' + body +
    '<div class="form-error" id="rgError" hidden></div>' +
    '<div class="row between"><button type="button" class="btn line" data-act="regBack" ' + (step === 1 ? 'disabled' : '') + '>' + I('back') + ' Back</button>' +
    (step < 4 ? '<button type="submit" class="btn blue">Next ' + I('arrow') + '</button>' : '<button type="submit" class="btn green">' + I('send') + ' Submit for approval</button>') + '</div></form>' +
    '<div class="grid3">' + [['shield', 'Verified by HEM', 'Documents checked before you go live'], ['pin', 'Orders near you', 'Only students in your PIN range'], ['rupee', 'Paid on time', 'Invoice approved → paid by NEFT']].map(function (x) {
      return '<div class="card flat row" style="flex-wrap:nowrap"><span class="ic blue" style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;flex:0 0 auto">' + I(x[0]) + '</span><div class="small"><b>' + x[1] + '</b><div class="muted">' + x[2] + '</div></div></div>';
    }).join('') + '</div></div></div>';
};
/* The form stays in the page between steps, so typed values and chosen files are kept. */
function regShow(step) {
  S.reg.step = step;
  var form = document.getElementById('regForm');
  form.querySelectorAll('section[data-step]').forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== step; });
  form.querySelectorAll('.reg-steps > div').forEach(function (d, i) { d.className = i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''; d.querySelector('i').textContent = i + 1 < step ? '✓' : i + 1; });
  document.getElementById('rgTitle').textContent = step + '. ' + REG_STEPS[step - 1];
  form.querySelector('[data-act="regBack"]').disabled = step === 1;
  var submit = form.querySelector('[type=submit]');
  submit.className = 'btn ' + (step < 4 ? 'blue' : 'green');
  submit.innerHTML = step < 4 ? 'Next ' + I('arrow') : I('send') + ' Submit for approval';
  document.getElementById('rgError').hidden = true;
  if (step === 4) regReview();
  window.scrollTo(0, 0);
}
function regCats() { return Array.prototype.map.call(document.querySelectorAll('#rgCats input:checked'), function (i) { return i.value; }); }
function regDays() { var r = document.querySelector('input[name=rgDays]:checked'); return r ? r.value : '3-5 days'; }
function regReview() {
  var acc = val('rgAcc');
  var files = ['rgGst', 'rgPan', 'rgCheque', 'rgShop'].filter(function (id) { var f = document.getElementById(id); return f.files && f.files[0]; }).length;
  document.getElementById('rgReview').innerHTML = '<dt>Business</dt><dd>' + esc(val('rgBiz')) + ' · ' + esc(val('rgOwner')) + '</dd><dt>Contact</dt><dd>' + esc(val('rgPhone')) + ' · ' + esc(val('rgEmail')) + '</dd>' +
    '<dt>GSTIN / PAN</dt><dd>' + esc(val('rgGstin').toUpperCase()) + ' · ' + esc(val('rgPanNo').toUpperCase()) + '</dd><dt>Sells</dt><dd>' + esc(regCats().join(', ')) + '</dd>' +
    '<dt>Delivers to</dt><dd>PIN ' + esc(val('rgPinFrom')) + ' – ' + esc(val('rgPinTo')) + ' · ' + esc(regDays()) + '</dd>' +
    '<dt>Bank</dt><dd>' + esc(val('rgBank')) + ' •••• ' + esc(acc.slice(-4)) + ' (IFSC ' + esc(val('rgIfsc').toUpperCase()) + ')</dd><dt>Documents</dt><dd>' + files + ' of 4 added</dd>';
}
function regCheck(step) {
  var e = function (m) { throw new Error(m); };
  if (step === 1) {
    if (val('rgBiz').length < 2) e('Please enter the shop / business name.');
    if (val('rgOwner').length < 2) e('Please enter the owner name.');
    if (!/^\d{10}$/.test(val('rgPhone'))) e('Please enter a 10-digit mobile number.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val('rgEmail'))) e('Please enter a valid email.');
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(val('rgGstin').toUpperCase())) e('Please enter a valid 15-character GSTIN.');
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(val('rgPanNo').toUpperCase())) e('Please enter a valid 10-character PAN.');
    if (val('rgAddr').length < 5) e('Please enter the shop address.');
    if (val('rgCity').length < 2) e('Please enter the city.');
    if (!regCats().length) e('Choose what you will sell.');
    var pw = document.getElementById('rgPass').value;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) e('The password must be 8+ characters with letters and numbers.');
  }
  if (step === 2) {
    var a = Number(val('rgPinFrom')), b = Number(val('rgPinTo'));
    if (!/^\d{6}$/.test(val('rgPinFrom')) || !/^\d{6}$/.test(val('rgPinTo'))) e('Please enter 6-digit PIN codes.');
    if (a > b) e('The first PIN code must not be bigger than the last one.');
    if (val('rgBank').length < 2) e('Please enter the bank account name.');
    if (!/^\d{9,18}$/.test(val('rgAcc'))) e('Please enter a valid account number.');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(val('rgIfsc').toUpperCase())) e('Please enter a valid IFSC code.');
  }
  if (step === 3) {
    ['rgGst', 'rgPan', 'rgCheque', 'rgShop'].forEach(function (id, i) {
      var f = document.getElementById(id).files[0];
      if (!f) e('Please add the ' + ['GST certificate', 'PAN card', 'cancelled cheque', 'shop photo'][i] + '.');
      if (f.size > 5 * 1024 * 1024) e('Each file must be 5 MB or smaller.');
    });
  }
  if (step === 4 && !document.getElementById('rgAgree').checked) e('Please accept the vendor terms.');
}
ACT.regBack = function () { regShow(Math.max(1, S.reg.step - 1)); };
ACT.regFile = function (input) { var n = document.getElementById(input.id + 'Name'); if (n && input.files[0]) { n.textContent = '✓ ' + input.files[0].name; input.closest('.drop').classList.add('ok'); } };
document.addEventListener('change', function (e) {
  var chip = e.target.closest('#rgCats label, #rgDays label');
  if (!chip) return;
  if (chip.parentNode.id === 'rgDays') chip.parentNode.querySelectorAll('label').forEach(function (l) { l.classList.remove('on'); });
  chip.classList.toggle('on', e.target.checked);
});
ACT.regNext = function (btn) {
  var err = document.getElementById('rgError'); err.hidden = true;
  try { regCheck(S.reg.step); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
  if (S.reg.step < 4) { regShow(S.reg.step + 1); return; }
  var fd = new FormData();
  var map = { BusinessName: 'rgBiz', OwnerName: 'rgOwner', Email: 'rgEmail', Phone: 'rgPhone', Gstin: 'rgGstin', Pan: 'rgPanNo', Address: 'rgAddr', City: 'rgCity',
    PinFrom: 'rgPinFrom', PinTo: 'rgPinTo', BankName: 'rgBank', BankAccount: 'rgAcc', BankIfsc: 'rgIfsc' };
  Object.keys(map).forEach(function (k) { fd.append(k, val(map[k])); });
  fd.append('Password', document.getElementById('rgPass').value);
  fd.append('Categories', regCats().join(', '));
  fd.append('DeliveryDays', regDays());
  fd.append('Agree', 'true');
  fd.append('GstFile', document.getElementById('rgGst').files[0]);
  fd.append('PanFile', document.getElementById('rgPan').files[0]);
  fd.append('ChequeFile', document.getElementById('rgCheque').files[0]);
  fd.append('ShopPhoto', document.getElementById('rgShop').files[0]);
  busy(btn, api('POST', '/api/vendor/register', fd).then(function (j) {
    S.reg = { step: 1 };
    document.getElementById('app').innerHTML = authPage(logo(true) + '<div class="card stack auth-card celebrate pop"><div class="tick">' + I('check') + '</div><h1>Application sent!</h1><p>' + esc(j.message) + '</p><a class="btn blue lg" href="#vendor-login">Go to vendor login</a></div>');
  }).catch(function (e) { err.textContent = e.message; err.hidden = false; throw e; })).catch(function () { });
};
