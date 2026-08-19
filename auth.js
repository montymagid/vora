// ============================================================
// VORA — Auth helpers (classic script). Exposes window.VORA.auth
// ============================================================
window.VORA = window.VORA || {};

(function () {
  var sb = function () { return window.VORA.supabase; };

  async function getSessionUser() {
    var res = await sb().auth.getSession();
    var session = res.data && res.data.session;
    return (session && session.user) || null;
  }

  async function getProfile() {
    var user = await getSessionUser();
    if (!user) return null;
    var res = await sb().from('profiles').select('*').eq('id', user.id).single();
    if (res.error || !res.data) return { id: user.id, email: user.email, role: 'customer' };
    var profile = res.data;
    profile.email = user.email;
    return profile;
  }

  async function signOut() {
    await sb().auth.signOut();
    var isNested = window.location.pathname.indexOf('/merchant/') !== -1 || window.location.pathname.indexOf('/admin/') !== -1;
    window.location.href = isNested ? '../index.html' : 'index.html';
  }

  async function requireAuth(redirectBase) {
    redirectBase = redirectBase || '';
    var user = await getSessionUser();
    if (!user) {
      window.location.href = redirectBase + 'login.html';
      return null;
    }
    return user;
  }

  async function requireRole(roles, redirectBase) {
    redirectBase = redirectBase || '';
    var profile = await getProfile();
    if (!profile) {
      window.location.href = redirectBase + 'login.html';
      return null;
    }
    if (roles.indexOf(profile.role) === -1) {
      window.location.href = redirectBase + 'index.html';
      return null;
    }
    return profile;
  }

  async function renderAuthState(pathPrefix) {
    pathPrefix = pathPrefix || '';
    var slot = document.getElementById('authSlot');
    var slotMobile = document.getElementById('authSlotMobile');
    if (!slot && !slotMobile) return;

    var profile = await getProfile();
    var html;

    if (!profile) {
      html = '<a class="btn btn-ghost" href="' + pathPrefix + 'login.html">تسجيل الدخول</a>' +
             '<a class="btn btn-primary" href="' + pathPrefix + 'register.html">حساب جديد</a>';
    } else {
      var dash, dashLabel;
      if (profile.role === 'admin' || profile.role === 'super_admin') {
        dash = pathPrefix + 'admin/dashboard.html'; dashLabel = 'لوحة الأدمن';
      } else if (profile.role === 'merchant') {
        dash = pathPrefix + 'merchant/dashboard.html'; dashLabel = 'لوحة المتجر';
      } else {
        dash = pathPrefix + 'wishlist.html'; dashLabel = 'قائمتي';
      }
      html = '<a class="btn btn-ghost" href="' + dash + '">' + dashLabel + '</a>' +
             '<button class="btn btn-ghost" id="signOutBtn">خروج</button>';
    }

    if (slot) slot.innerHTML = html;
    if (slotMobile) slotMobile.innerHTML = html;

    var btns = document.querySelectorAll('#signOutBtn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { signOut(); });
    }
  }

  window.VORA.auth = {
    getSessionUser: getSessionUser,
    getProfile: getProfile,
    signOut: signOut,
    requireAuth: requireAuth,
    requireRole: requireRole,
    renderAuthState: renderAuthState,
  };

  function wireMobileDrawer() {
    var drawer = document.getElementById('mobileDrawer');
    var toggle = document.getElementById('menuToggle');
    if (!drawer || !toggle) return;
    toggle.addEventListener('click', function () { drawer.classList.toggle('open'); });
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { drawer.classList.remove('open'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireMobileDrawer);
  } else {
    wireMobileDrawer();
  }
})();
