import { supabase } from './supabase-client.js';

/* ---------------- Session / profile ---------------- */
export async function getSessionUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function getProfile() {
  const user = await getSessionUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) return { id: user.id, email: user.email, role: 'customer' };
  return { ...data, email: user.email };
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

/* ---------------- Guards (use on protected pages) ---------------- */
// redirectBase lets pages under /merchant or /admin point back to the root correctly
export async function requireAuth(redirectBase = '') {
  const user = await getSessionUser();
  if (!user) {
    window.location.href = `${redirectBase}login.html`;
    return null;
  }
  return user;
}

export async function requireRole(roles, redirectBase = '') {
  const profile = await getProfile();
  if (!profile) {
    window.location.href = `${redirectBase}login.html`;
    return null;
  }
  if (!roles.includes(profile.role)) {
    window.location.href = `${redirectBase}index.html`;
    return null;
  }
  return profile;
}

/* ---------------- Header auth-state rendering ---------------- */
// pathPrefix: '' when called from a root page (index/product/login...),
// '../' when called from a page inside /merchant or /admin.
export async function renderAuthState(pathPrefix = '') {
  const slot = document.getElementById('authSlot');
  const slotMobile = document.getElementById('authSlotMobile');
  if (!slot && !slotMobile) return;

  const profile = await getProfile();

  let html;
  if (!profile) {
    html = `<a class="btn btn-ghost" href="${pathPrefix}login.html">تسجيل الدخول</a>`;
  } else {
    const dash =
      profile.role === 'admin' || profile.role === 'super_admin'
        ? `${pathPrefix}admin/dashboard.html`
        : profile.role === 'merchant'
        ? `${pathPrefix}merchant/dashboard.html`
        : `${pathPrefix}wishlist.html`;
    const dashLabel =
      profile.role === 'admin' || profile.role === 'super_admin'
        ? 'لوحة الأدمن'
        : profile.role === 'merchant'
        ? 'لوحة المتجر'
        : 'قائمتي';
    html = `
      <a class="btn btn-ghost" href="${dash}">${dashLabel}</a>
      <button class="btn btn-ghost" id="signOutBtn">خروج</button>
    `;
  }

  if (slot) slot.innerHTML = html;
  if (slotMobile) slotMobile.innerHTML = html;

  document.querySelectorAll('#signOutBtn').forEach((btn) =>
    btn.addEventListener('click', () => signOut())
  );
}
