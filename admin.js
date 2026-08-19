import { supabase } from './supabase-client.js';
import { requireRole, renderAuthState } from './auth.js';

const fmt = new Intl.NumberFormat('ar-SA');
const money = (n) => `${fmt.format(Math.round(n))} ر.س`;

let profile = null;

window.showSection = (name) => {
  document.querySelectorAll('.dash-section').forEach((s) => (s.style.display = 'none'));
  document.getElementById(`sec-${name}`).style.display = 'block';
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.section === name));
};
document.querySelectorAll('.nav-link').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showSection(a.dataset.section);
    loadSection(a.dataset.section);
  })
);

(async function init() {
  profile = await requireRole(['admin', 'super_admin'], '../');
  if (!profile) return;

  renderAuthState('../');
  document.getElementById('dashUser').innerHTML = `<b>${profile.full_name || 'أدمن'}</b>${profile.email}`;

  await loadOverview();
  wireCategoryForm();
})();

const loaded = {};
function loadSection(name) {
  if (loaded[name]) return;
  loaded[name] = true;
  if (name === 'merchants') loadMerchants();
  if (name === 'products') loadProducts();
  if (name === 'categories') loadCategories();
  if (name === 'sources') loadSources();
}

/* ---------------- Overview ---------------- */
async function loadOverview() {
  const cards = document.querySelectorAll('#overviewStats .stat-card .num');

  const [
    { count: usersCount },
    { data: stores },
    { count: productsCount },
    { count: offersCount },
    { data: clicks },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('id, status, subscription_status, subscription_plan_id, subscription_plans ( price_monthly )'),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('product_offers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('affiliate_clicks').select('*', { count: 'exact', head: true }),
  ]);

  const pendingStores = (stores || []).filter((s) => s.status === 'pending').length;
  const paidStores = (stores || []).filter((s) => s.subscription_status === 'active').length;
  const mrr = (stores || [])
    .filter((s) => s.subscription_status === 'active')
    .reduce((sum, s) => sum + (s.subscription_plans?.price_monthly || 0), 0);

  cards[0].textContent = fmt.format(usersCount || 0);
  cards[1].textContent = fmt.format((stores || []).length);
  cards[2].textContent = fmt.format(productsCount || 0);
  cards[3].textContent = fmt.format(offersCount || 0);
  cards[4].textContent = fmt.format(paidStores);
  cards[5].textContent = money(mrr);
  cards[6].textContent = fmt.format(clicks?.length || 0);
  cards[7].textContent = fmt.format(pendingStores);
}

/* ---------------- Merchants ---------------- */
async function loadMerchants() {
  const tbody = document.getElementById('merchantsTableBody');
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, location_city, status, subscription_status, subscription_plans ( name )')
    .order('created_at', { ascending: false });

  if (error || !data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="price-hint">لا توجد متاجر مسجلة بعد.</td></tr>';
    return;
  }

  const statusPill = { pending: 'pill-gray', approved: 'pill-green', suspended: 'pill-orange' };
  const statusLabel = { pending: 'قيد المراجعة', approved: 'معتمد', suspended: 'موقوف' };

  tbody.innerHTML = data.map((s) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.location_city || '—'}</td>
      <td><span class="pill ${statusPill[s.status] || 'pill-gray'}">${statusLabel[s.status] || s.status}</span></td>
      <td>${s.subscription_plans?.name || 'مجانية'} · ${s.subscription_status || 'inactive'}</td>
      <td style="display:flex; gap:6px;">
        ${s.status !== 'approved' ? `<button class="btn btn-ghost btn-sm" data-approve="${s.id}">اعتماد</button>` : ''}
        ${s.status !== 'suspended' ? `<button class="btn btn-danger btn-sm" data-suspend="${s.id}">إيقاف</button>` : `<button class="btn btn-ghost btn-sm" data-approve="${s.id}">تفعيل</button>`}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-approve]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await supabase.from('stores').update({ status: 'approved' }).eq('id', btn.dataset.approve);
      loaded.merchants = false; loadMerchants();
    })
  );
  tbody.querySelectorAll('[data-suspend]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await supabase.from('stores').update({ status: 'suspended' }).eq('id', btn.dataset.suspend);
      loaded.merchants = false; loadMerchants();
    })
  );
}

/* ---------------- Products ---------------- */
async function loadProducts() {
  const tbody = document.getElementById('productsTableBody');
  const { data, error } = await supabase
    .from('products')
    .select('id, name_ar, is_active, categories ( name_ar ), product_offers ( id )')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="price-hint">لا توجد منتجات بعد.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((p) => `
    <tr>
      <td>${p.name_ar}</td>
      <td>${p.categories?.name_ar || '—'}</td>
      <td>${(p.product_offers || []).length}</td>
      <td>${p.is_active ? '<span class="pill pill-green">نشط</span>' : '<span class="pill pill-gray">موقوف</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-toggle="${p.id}" data-active="${p.is_active}">${p.is_active ? 'إيقاف' : 'تفعيل'}</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const nowActive = btn.dataset.active === 'true';
      await supabase.from('products').update({ is_active: !nowActive }).eq('id', btn.dataset.toggle);
      loaded.products = false; loadProducts();
    })
  );
}

/* ---------------- Categories ---------------- */
function wireCategoryForm() {
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name_ar = document.getElementById('catName').value.trim();
    const icon = document.getElementById('catIcon').value.trim() || '🏷️';
    const slug = name_ar.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
    await supabase.from('categories').insert({ name_ar, icon, slug });
    document.getElementById('categoryForm').reset();
    loaded.categories = false;
    loadCategories();
  });
}

async function loadCategories() {
  const tbody = document.getElementById('categoriesTableBody');
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error || !data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="price-hint">لا توجد تصنيفات.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((c) => `
    <tr>
      <td>${c.icon || ''} ${c.name_ar}</td>
      <td>${c.is_active ? '<span class="pill pill-green">مفعّل</span>' : '<span class="pill pill-gray">موقوف</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-toggle="${c.id}" data-active="${c.is_active}">${c.is_active ? 'إيقاف' : 'تفعيل'}</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const nowActive = btn.dataset.active === 'true';
      await supabase.from('categories').update({ is_active: !nowActive }).eq('id', btn.dataset.toggle);
      loaded.categories = false; loadCategories();
    })
  );
}

/* ---------------- Sources ---------------- */
async function loadSources() {
  const tbody = document.getElementById('sourcesTableBody');
  const { data, error } = await supabase.from('sources').select('*').order('created_at');
  if (error || !data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="price-hint">لا توجد مصادر بعد.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((s) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.source_type}</td>
      <td>${s.is_affiliate ? '<span class="pill pill-green">نعم</span>' : '<span class="pill pill-gray">لا</span>'}</td>
      <td><span class="pill ${s.status === 'active' ? 'pill-green' : 'pill-orange'}">${s.status}</span></td>
    </tr>
  `).join('');
}
