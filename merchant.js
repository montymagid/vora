import { supabase } from './supabase-client.js';
import { requireRole, renderAuthState, signOut } from './auth.js';

const fmt = new Intl.NumberFormat('ar-SA');
const money = (n) => `${fmt.format(Math.round(n))} ر.س`;
const slugify = (s) =>
  s.toString().trim().toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) + '-' + Math.random().toString(36).slice(2, 7);

let profile = null;
let myStore = null;

/* ---------------- Section switching ---------------- */
window.showSection = (name) => {
  document.querySelectorAll('.dash-section').forEach((s) => (s.style.display = 'none'));
  document.getElementById(`sec-${name}`).style.display = 'block';
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.section === name));
};
document.querySelectorAll('.nav-link').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showSection(a.dataset.section);
  })
);

/* ---------------- Init ---------------- */
(async function init() {
  profile = await requireRole(['merchant', 'admin', 'super_admin'], '../');
  if (!profile) return;

  renderAuthState('../');
  document.getElementById('dashUser').innerHTML = `<b>${profile.full_name || 'تاجر'}</b>${profile.email}`;

  await loadStore();
  wireForms();
  await loadOverview();
})();

async function loadStore() {
  const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle();
  myStore = data || null;
  fillStoreForm();
}

function fillStoreForm() {
  if (!myStore) return;
  document.getElementById('storeName').value = myStore.name || '';
  document.getElementById('storeCity').value = myStore.location_city || '';
  document.getElementById('storeDesc').value = myStore.description || '';
  document.getElementById('storeWhatsapp').value = myStore.whatsapp || '';
  document.getElementById('storeWebsite').value = myStore.website || '';
}

/* ---------------- Overview ---------------- */
async function loadOverview() {
  const cards = document.querySelectorAll('#overviewStats .stat-card');
  const noStorePanel = document.getElementById('noStorePanel');

  if (!myStore) {
    noStorePanel.style.display = 'block';
    cards[0].querySelector('.num').textContent = '0';
    cards[1].querySelector('.num').textContent = '0';
    cards[2].querySelector('.num').textContent = 'لا يوجد متجر';
    cards[3].querySelector('.num').textContent = '—';
    return;
  }
  noStorePanel.style.display = 'none';

  const { data: offers } = await supabase
    .from('product_offers')
    .select('id, is_active')
    .eq('store_id', myStore.id);

  const activeOffers = (offers || []).filter((o) => o.is_active).length;
  cards[0].querySelector('.num').textContent = fmt.format(activeOffers);
  cards[1].querySelector('.num').textContent = fmt.format((offers || []).length);

  const statusLabel = { pending: 'قيد المراجعة', approved: 'معتمد', suspended: 'موقوف' }[myStore.status] || myStore.status;
  cards[2].querySelector('.num').textContent = statusLabel;
  cards[2].querySelector('.num').style.fontSize = '18px';

  const subLabel = { active: 'مفعّل', expired: 'منتهي', trialing: 'تجريبي', inactive: 'غير مفعّل' }[myStore.subscription_status] || 'غير مفعّل';
  cards[3].querySelector('.num').textContent = subLabel;
  cards[3].querySelector('.num').style.fontSize = '18px';

  await loadProductsTable();
  await loadCategoryOptions();
  await loadSubscriptionPanel();
}

/* ---------------- Store form ---------------- */
function wireForms() {
  document.getElementById('storeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('storeSubmitBtn');
    const msg = document.getElementById('storeMsg');
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ…';

    const payload = {
      owner_id: profile.id,
      name: document.getElementById('storeName').value.trim(),
      location_city: document.getElementById('storeCity').value.trim(),
      description: document.getElementById('storeDesc').value.trim(),
      whatsapp: document.getElementById('storeWhatsapp').value.trim(),
      website: document.getElementById('storeWebsite').value.trim(),
    };

    let error;
    if (myStore) {
      ({ error } = await supabase.from('stores').update(payload).eq('id', myStore.id));
    } else {
      payload.slug = slugify(payload.name);
      ({ error } = await supabase.from('stores').insert(payload));
    }

    btn.disabled = false;
    btn.textContent = 'حفظ بيانات المتجر';
    msg.className = `form-msg show ${error ? 'error' : 'success'}`;
    msg.textContent = error ? 'صار خطأ أثناء الحفظ.' : 'تم الحفظ! متجرك الآن قيد المراجعة من فريق VORA.';

    if (!error) {
      await loadStore();
      await loadOverview();
    }
  });

  document.getElementById('importForm').addEventListener('submit', handleImport);
  document.getElementById('manualForm').addEventListener('submit', handleManualAdd);
}

/* ---------------- Products table ---------------- */
async function loadProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  if (!myStore) {
    tbody.innerHTML = '<tr><td colspan="4" class="price-hint">أنشئ متجرك أولًا.</td></tr>';
    return;
  }
  const { data, error } = await supabase
    .from('product_offers')
    .select('id, price, availability, is_active, products ( name_ar, primary_image_url, slug )')
    .eq('store_id', myStore.id)
    .order('created_at', { ascending: false });

  if (error || !data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="price-hint">ما أضفت منتجات بعد.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((o) => `
    <tr>
      <td style="display:flex; align-items:center; gap:10px;">
        <img src="${o.products?.primary_image_url || ''}" alt="">
        <span>${o.products?.name_ar || '—'}</span>
      </td>
      <td style="font-family:var(--font-mono);">${money(o.price)}</td>
      <td>${o.is_active ? '<span class="pill pill-green">منشور</span>' : '<span class="pill pill-gray">موقوف</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-toggle="${o.id}" data-active="${o.is_active}">${o.is_active ? 'إيقاف' : 'تفعيل'}</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggle;
      const nowActive = btn.dataset.active === 'true';
      await supabase.from('product_offers').update({ is_active: !nowActive }).eq('id', id);
      await loadProductsTable();
      await loadOverview();
    })
  );
}

async function loadCategoryOptions() {
  const select = document.getElementById('mCategory');
  if (select.dataset.loaded) return;
  const { data } = await supabase.from('categories').select('id, name_ar').eq('is_active', true).order('sort_order');
  select.innerHTML = (data || []).map((c) => `<option value="${c.id}">${c.name_ar}</option>`).join('');
  select.dataset.loaded = '1';
}

/* ---------------- Import by URL (calls Edge Function) ---------------- */
let lastImportPreview = null;

async function handleImport(e) {
  e.preventDefault();
  const btn = document.getElementById('importBtn');
  const msg = document.getElementById('importMsg');
  const wrap = document.getElementById('importPreviewWrap');
  const url = document.getElementById('importUrl').value.trim();

  btn.disabled = true;
  btn.textContent = 'جاري الاستيراد…';
  msg.className = '';
  wrap.innerHTML = '';

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('import-product', {
      body: { url },
    });

    if (error || data?.error) throw new Error(data?.error || error.message);

    lastImportPreview = { ...data, product_url: url };
    wrap.innerHTML = `
      <div class="import-preview">
        <img src="${data.image || ''}" alt="">
        <div style="flex:1;">
          <div class="form-group"><label>اسم المنتج</label><input type="text" id="prevName" value="${(data.name || '').replace(/"/g, '&quot;')}"></div>
          <div class="form-row">
            <div class="form-group"><label>السعر (ر.س)</label><input type="number" id="prevPrice" value="${data.price ?? ''}"></div>
            <div class="form-group"><label>التصنيف</label><select id="prevCategory"></select></div>
          </div>
          <button class="btn btn-primary btn-sm" id="publishImportBtn">نشر المنتج</button>
        </div>
      </div>
    `;
    const catSelect = document.getElementById('prevCategory');
    const { data: cats } = await supabase.from('categories').select('id, name_ar').eq('is_active', true).order('sort_order');
    catSelect.innerHTML = (cats || []).map((c) => `<option value="${c.id}">${c.name_ar}</option>`).join('');

    if (!data.found_price) {
      msg.className = 'form-msg show error';
      msg.textContent = 'ما قدرنا نستخرج السعر تلقائيًا — حط السعر يدويًا قبل النشر.';
    } else {
      msg.className = 'form-msg show success';
      msg.textContent = 'تم جلب بيانات المنتج، راجعها قبل النشر.';
    }

    document.getElementById('publishImportBtn').addEventListener('click', publishImportedProduct);
  } catch (err) {
    msg.className = 'form-msg show error';
    msg.textContent = 'تعذر استيراد هذا الرابط. جرّب رابطًا آخر أو أضف المنتج يدويًا.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'استيراد';
  }
}

async function publishImportedProduct() {
  if (!myStore) {
    alert('أنشئ متجرك أولًا من تبويب "متجري".');
    return;
  }
  const name = document.getElementById('prevName').value.trim();
  const price = parseFloat(document.getElementById('prevPrice').value);
  const category_id = document.getElementById('prevCategory').value || null;

  if (!name || !price) {
    alert('لازم اسم المنتج والسعر قبل النشر.');
    return;
  }

  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({
      name_ar: name,
      slug: slugify(name),
      description: lastImportPreview.description,
      category_id,
      primary_image_url: lastImportPreview.image,
      created_by: profile.id,
    })
    .select()
    .single();

  if (pErr) { alert('صار خطأ أثناء إنشاء المنتج.'); return; }

  await supabase.from('product_offers').insert({
    product_id: product.id,
    store_id: myStore.id,
    merchant_name: myStore.name,
    price,
    product_url: lastImportPreview.product_url,
    is_affiliate: false,
  });

  document.getElementById('importPreviewWrap').innerHTML = '';
  document.getElementById('importForm').reset();
  document.getElementById('importMsg').className = 'form-msg show success';
  document.getElementById('importMsg').textContent = 'تم نشر المنتج بنجاح 🎉';
  await loadProductsTable();
  await loadOverview();
}

/* ---------------- Manual add ---------------- */
async function handleManualAdd(e) {
  e.preventDefault();
  if (!myStore) {
    alert('أنشئ متجرك أولًا من تبويب "متجري".');
    return;
  }
  const btn = document.getElementById('manualSubmitBtn');
  const msg = document.getElementById('manualMsg');
  btn.disabled = true;
  btn.textContent = 'جاري النشر…';

  const name = document.getElementById('mName').value.trim();
  const price = parseFloat(document.getElementById('mPrice').value);
  const category_id = document.getElementById('mCategory').value || null;
  const image = document.getElementById('mImage').value.trim();
  const productUrl = document.getElementById('mUrl').value.trim();
  const description = document.getElementById('mDesc').value.trim();

  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({ name_ar: name, slug: slugify(name), description, category_id, primary_image_url: image, created_by: profile.id })
    .select()
    .single();

  if (pErr) {
    msg.className = 'form-msg show error';
    msg.textContent = 'صار خطأ أثناء إنشاء المنتج.';
    btn.disabled = false;
    btn.textContent = 'نشر المنتج';
    return;
  }

  await supabase.from('product_offers').insert({
    product_id: product.id,
    store_id: myStore.id,
    merchant_name: myStore.name,
    price,
    product_url: productUrl,
    is_affiliate: false,
  });

  msg.className = 'form-msg show success';
  msg.textContent = 'تم نشر المنتج بنجاح 🎉';
  btn.disabled = false;
  btn.textContent = 'نشر المنتج';
  document.getElementById('manualForm').reset();
  await loadProductsTable();
  await loadOverview();
}

/* ---------------- Subscription ---------------- */
async function loadSubscriptionPanel() {
  const panel = document.getElementById('subscriptionPanel');
  const { data: plans } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order');

  if (!myStore) {
    panel.innerHTML = '<p class="price-hint">أنشئ متجرك أولًا لتفعيل باقة اشتراك.</p>';
    return;
  }

  panel.innerHTML = `
    <div class="stat-cards" style="margin-bottom:22px;">
      ${(plans || []).map((p) => `
        <div class="stat-card" style="${myStore.subscription_plan_id === p.id ? 'border-color:var(--accent);' : ''}">
          <div class="label" style="font-size:15px; font-weight:600; color:var(--text);">${p.name}</div>
          <div class="num" style="font-size:20px; margin:8px 0;">${p.price_monthly > 0 ? money(p.price_monthly) + ' / شهر' : 'مجانية'}</div>
          <div class="label">${p.max_products ? `حتى ${p.max_products} منتج` : 'منتجات غير محدودة'}</div>
          <button class="btn ${myStore.subscription_plan_id === p.id ? 'btn-ghost' : 'btn-primary'} btn-sm" style="margin-top:12px; width:100%;" data-plan="${p.id}">
            ${myStore.subscription_plan_id === p.id ? 'باقتك الحالية' : 'الترقية لهذي الباقة'}
          </button>
        </div>
      `).join('')}
    </div>
    <p class="price-hint">* الدفع الفعلي غير مفعّل في هذا العرض التجريبي — الترقية هنا توضيحية فقط.</p>
  `;

  panel.querySelectorAll('[data-plan]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const plan_id = btn.dataset.plan;
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      await supabase.from('stores').update({
        subscription_plan_id: plan_id,
        subscription_status: 'active',
        subscription_expires_at: expires.toISOString(),
      }).eq('id', myStore.id);
      await loadStore();
      await loadOverview();
    })
  );
}
