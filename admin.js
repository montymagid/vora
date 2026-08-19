// ============================================================
// VORA — Admin dashboard (classic script)
// ============================================================
(function () {
  var sb = window.VORA.supabase;
  var fmt = new Intl.NumberFormat('ar-SA');
  var money = function (n) { return fmt.format(Math.round(n)) + ' ر.س'; };
  var profile = null;
  var loaded = {};

  window.showSection = function (name) {
    document.querySelectorAll('.dash-section').forEach(function (s) { s.style.display = 'none'; });
    document.getElementById('sec-' + name).style.display = 'block';
    document.querySelectorAll('.nav-link').forEach(function (a) { a.classList.toggle('active', a.dataset.section === name); });
  };

  function wireNav() {
    document.querySelectorAll('.nav-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        showSection(a.dataset.section);
        loadSection(a.dataset.section);
      });
    });
  }

  function loadSection(name) {
    if (loaded[name]) return;
    loaded[name] = true;
    if (name === 'merchants') loadMerchants();
    if (name === 'products') loadProducts();
    if (name === 'categories') loadCategories();
    if (name === 'sources') loadSources();
  }

  async function loadOverview() {
    var cards = document.querySelectorAll('#overviewStats .stat-card .num');

    var results = await Promise.all([
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('stores').select('id, status, subscription_status, subscription_plan_id, subscription_plans ( price_monthly )'),
      sb.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      sb.from('product_offers').select('*', { count: 'exact', head: true }).eq('is_active', true),
      sb.from('affiliate_clicks').select('*', { count: 'exact', head: true }),
    ]);

    var usersCount = results[0].count;
    var stores = results[1].data || [];
    var productsCount = results[2].count;
    var offersCount = results[3].count;
    var clicksCount = results[4].count;

    var pendingStores = stores.filter(function (s) { return s.status === 'pending'; }).length;
    var paidStores = stores.filter(function (s) { return s.subscription_status === 'active'; }).length;
    var mrr = stores.filter(function (s) { return s.subscription_status === 'active'; })
      .reduce(function (sum, s) { return sum + ((s.subscription_plans && s.subscription_plans.price_monthly) || 0); }, 0);

    cards[0].textContent = fmt.format(usersCount || 0);
    cards[1].textContent = fmt.format(stores.length);
    cards[2].textContent = fmt.format(productsCount || 0);
    cards[3].textContent = fmt.format(offersCount || 0);
    cards[4].textContent = fmt.format(paidStores);
    cards[5].textContent = money(mrr);
    cards[6].textContent = fmt.format(clicksCount || 0);
    cards[7].textContent = fmt.format(pendingStores);
  }

  async function loadMerchants() {
    var tbody = document.getElementById('merchantsTableBody');
    var res = await sb.from('stores').select('id, name, location_city, status, subscription_status, subscription_plans ( name )').order('created_at', { ascending: false });

    if (res.error || !res.data || !res.data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="price-hint">لا توجد متاجر مسجلة بعد.</td></tr>';
      return;
    }

    var statusPill = { pending: 'pill-gray', approved: 'pill-green', suspended: 'pill-orange' };
    var statusLabel = { pending: 'قيد المراجعة', approved: 'معتمد', suspended: 'موقوف' };

    tbody.innerHTML = res.data.map(function (s) {
      return '<tr><td>' + s.name + '</td><td>' + (s.location_city || '—') + '</td>' +
        '<td><span class="pill ' + (statusPill[s.status] || 'pill-gray') + '">' + (statusLabel[s.status] || s.status) + '</span></td>' +
        '<td>' + ((s.subscription_plans && s.subscription_plans.name) || 'مجانية') + ' · ' + (s.subscription_status || 'inactive') + '</td>' +
        '<td style="display:flex; gap:6px;">' +
        (s.status !== 'approved' ? '<button class="btn btn-ghost btn-sm" data-approve="' + s.id + '">اعتماد</button>' : '') +
        (s.status !== 'suspended' ? '<button class="btn btn-danger btn-sm" data-suspend="' + s.id + '">إيقاف</button>' : '<button class="btn btn-ghost btn-sm" data-approve="' + s.id + '">تفعيل</button>') +
        '</td></tr>';
    }).join('');

    tbody.querySelectorAll('[data-approve]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        await sb.from('stores').update({ status: 'approved' }).eq('id', btn.dataset.approve);
        loaded.merchants = false; loadMerchants();
      });
    });
    tbody.querySelectorAll('[data-suspend]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        await sb.from('stores').update({ status: 'suspended' }).eq('id', btn.dataset.suspend);
        loaded.merchants = false; loadMerchants();
      });
    });
  }

  async function loadProducts() {
    var tbody = document.getElementById('productsTableBody');
    var res = await sb.from('products').select('id, name_ar, is_active, categories ( name_ar ), product_offers ( id )').order('created_at', { ascending: false }).limit(100);

    if (res.error || !res.data || !res.data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="price-hint">لا توجد منتجات بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(function (p) {
      return '<tr><td>' + p.name_ar + '</td><td>' + ((p.categories && p.categories.name_ar) || '—') + '</td>' +
        '<td>' + (p.product_offers || []).length + '</td>' +
        '<td>' + (p.is_active ? '<span class="pill pill-green">نشط</span>' : '<span class="pill pill-gray">موقوف</span>') + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-toggle="' + p.id + '" data-active="' + p.is_active + '">' + (p.is_active ? 'إيقاف' : 'تفعيل') + '</button></td></tr>';
    }).join('');

    tbody.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var nowActive = btn.dataset.active === 'true';
        await sb.from('products').update({ is_active: !nowActive }).eq('id', btn.dataset.toggle);
        loaded.products = false; loadProducts();
      });
    });
  }

  function wireCategoryForm() {
    document.getElementById('categoryForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var name_ar = document.getElementById('catName').value.trim();
      var icon = document.getElementById('catIcon').value.trim() || '🏷️';
      var slug = name_ar.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
      await sb.from('categories').insert({ name_ar: name_ar, icon: icon, slug: slug });
      document.getElementById('categoryForm').reset();
      loaded.categories = false;
      loadCategories();
    });
  }

  async function loadCategories() {
    var tbody = document.getElementById('categoriesTableBody');
    var res = await sb.from('categories').select('*').order('sort_order');
    if (res.error || !res.data || !res.data.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="price-hint">لا توجد تصنيفات.</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map(function (c) {
      return '<tr><td>' + (c.icon || '') + ' ' + c.name_ar + '</td>' +
        '<td>' + (c.is_active ? '<span class="pill pill-green">مفعّل</span>' : '<span class="pill pill-gray">موقوف</span>') + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-toggle="' + c.id + '" data-active="' + c.is_active + '">' + (c.is_active ? 'إيقاف' : 'تفعيل') + '</button></td></tr>';
    }).join('');
    tbody.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var nowActive = btn.dataset.active === 'true';
        await sb.from('categories').update({ is_active: !nowActive }).eq('id', btn.dataset.toggle);
        loaded.categories = false; loadCategories();
      });
    });
  }

  async function loadSources() {
    var tbody = document.getElementById('sourcesTableBody');
    var res = await sb.from('sources').select('*').order('created_at');
    if (res.error || !res.data || !res.data.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="price-hint">لا توجد مصادر بعد.</td></tr>';
      return;
    }
    tbody.innerHTML = res.data.map(function (s) {
      return '<tr><td>' + s.name + '</td><td>' + s.source_type + '</td>' +
        '<td>' + (s.is_affiliate ? '<span class="pill pill-green">نعم</span>' : '<span class="pill pill-gray">لا</span>') + '</td>' +
        '<td><span class="pill ' + (s.status === 'active' ? 'pill-green' : 'pill-orange') + '">' + s.status + '</span></td></tr>';
    }).join('');
  }

  async function init() {
    profile = await window.VORA.auth.requireRole(['admin', 'super_admin'], '../');
    if (!profile) return;

    window.VORA.auth.renderAuthState('../');
    document.getElementById('dashUser').innerHTML = '<b>' + (profile.full_name || 'أدمن') + '</b>' + profile.email;

    wireNav();
    await loadOverview();
    wireCategoryForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
