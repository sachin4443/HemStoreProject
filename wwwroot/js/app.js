/* Boot: who is logged in, then show the right page. */
'use strict';
function loadStatus() { return api('GET', '/api/auth/status').then(function (j) { S.status = j; }); }
function loadMe() {
  return api('GET', '/api/auth/me').then(function (j) {
    S.me = j.loggedIn ? { role: j.role, name: j.name, id: j.id } : null;
  });
}
Promise.all([loadStatus(), loadMe()]).catch(function () { }).then(function () {
  if (S.status && S.status.needsSetup && !S.me && location.hash.indexOf('setup') < 0 && location.hash.indexOf('login') < 0 && location.hash.indexOf('v-register') < 0)
    location.hash = 'setup';
  render();
});
