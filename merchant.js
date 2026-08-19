// ============================================================
// VORA — Merchant dashboard (classic script)
// ============================================================
(function () {
  var sb = window.VORA.supabase;
  var fmt = new Intl.NumberFormat('ar-SA');
  var money = function (n) { return fmt.format(Math.round(n)) + ' ر.س'; };
  var slugify = function (s) {
    return s.toString().trim().toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) + '-' + Math.random().toString(36).slice(2, 7);
  };

  var profile = null;
  var myStore = null;
  var lastImportPreview = null;

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
      });
    });
  }

  async function loadStore() {
    var res = await sb.from('stores').select('*').eq('owner_id', profile.id).maybeSingle();
    myStore = res.data || null;
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

  async function loadOverview() {
    var cards = document.querySelectorAll('#overviewStats .stat-card');
    var noStorePanel = document.getElementById('noStorePanel');

    if (!myStore) {
      noStorePanel.style.display = 'block';
      cards[0].querySelector('.num').textContent = '0';
      cards[1].querySelector('.num').textContent = '0';
      cards[2].querySelector('.num').textContent = 'لا يوجد متجر';
      cards[3].querySelector('.num').textContent = '—';
      return;
    }
    noStorePanel.style.display = 'none';

    var res = await sb.from('product_offers').select('id, is_active').eq('store_id', myStore.id);
    var offers = res.data || [];
    var activeOffers = offers.filter(function (o) { return o.is_active; }).length;
    cards[0].querySelector('.num').textContent = fmt.format(activeOffers);
    cards[1].querySelector('.num').textContent = fmt.format(offers.length);

    var statusMap = { pending: 'قيد المراجعة', approved: 'معتمد', suspended: 'موقوف' };
    cards[2].querySelector('.num').textContent = statusMap[myStore.status] || myStore.status;
    cards[2].querySelector('.num').style.fontSize = '18px';

    var subMap = { active: 'مفعّل', expired: 'منتهي', trialing: 'تجريبي', inactive: 'غير مفعّل' };
    cards[3].querySelector('.num').textContent = subMap[myStore.subscription_status] || 'غير مفعّل';
    cards[3].querySelector('.num').style.fontSize = '18px';

    await loadProductsTable();
    await loadCategoryOptions();
    await loadSubscriptionPanel();
  }

  function wireForms() {
    document.getElementById('storeForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = document.getElementById('storeSubmitBtn');
      var msg = document.getElementById('storeMsg');
      btn.disabled = true;
      btn.textContent = 'جاري الحفظ…';

      var payload = {
        owner_id: profile.id,
        name: document.getElementById('storeName').value.trim(),
        location_city: document.getElementById('storeCity').value.trim(),
        description: document.getElementById('storeDesc').value.trim(),
        whatsapp: document.getElementById('storeWhatsapp').value.trim(),
        website: document.getElementById('storeWebsite').value.trim(),
      };

      var error;
      if (myStore) {
        error = (await sb.from('stores').update(payload).eq('id', myStore.id)).error;
      } else {
        payload.slug = slugify(payload.name);
        error = (await sb.from('stores').insert(payload)).error;
      }

      btn.disabled = false;
      btn.textContent = 'حفظ بيانات المتجر';
      msg.className = 'form-msg show ' + (error ? 'error' : 'success');
      msg.textContent = error ? 'صار خطأ أثناء الحفظ.' : 'تم الحفظ! متجرك الآن قيد المراجعة من فريق VORA.';

      if (!error) { await loadStore(); await loadOverview(); }
    });

    document.getElementById('importForm').addEventListener('submit', handleImport);
    document.getElementById('manualForm').addEventListener('submit', handleManualAdd);
  }

  async function loadProductsTable() {
    var tbody = document.getElementById('productsTableBody');
    if (!myStore) { tbody.innerHTML = '<tr><td colspan="4" class="price-hint">أنشئ متجرك أولًا.</td></tr>'; return; }

    var res = await sb.from('product_offers')
      .select('id, price, availability, is_active, products ( name_ar, primary_image_url, slug )')
      .eq('store_id', myStore.id)
      .order('created_at', { ascending: false });

    if (res.error || !res.data || !res.data.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="price-hint">ما أضفت منتجات بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(function (o) {
      var p = o.products || {};
      return '<tr><td style="display:flex; align-items:center; gap:10px;"><img src="' + (p.primary_image_url || '') + '" alt=""><span>' + (p.name_ar || '—') + '</span></td>' +
        '<td style="font-family:var(--font-mono);">' + money(o.price) + '</td>' +
        '<td>' + (o.is_active ? '<span class="pill pill-green">منشور</span>' : '<span class="pill pill-gray">موقوف</span>') + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-toggle="' + o.id + '" data-active="' + o.is_active + '">' + (o.is_active ? 'إيقاف' : 'تفعيل') + '</button></td></tr>';
    }).join('');

    tbody.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var nowActive = btn.dataset.active === 'true';
        await sb.from('product_offers').update({ is_active: !nowActive }).eq('id', btn.dataset.toggle);
        await loadProductsTable();
        await loadOverview();
      });
    });
  }

  async function loadCategoryOptions() {
    var select = document.getElementById('mCategory');
    if (select.dataset.loaded) return;
    var res = await sb.from('categories').select('id, name_ar').eq('is_active', true).order('sort_order');
    select.innerHTML = (res.data || []).map(function (c) { return '<option value="' + c.id + '">' + c.name_ar + '</option>'; }).join('');
    select.dataset.loaded = '1';
  }

  async function handleImport(e) {
    e.preventDefault();
    var btn = document.getElementById('importBtn');
    var msg = document.getElementById('importMsg');
    var wrap = document.getElementById('importPreviewWrap');
    var url = document.getElementById('importUrl').value.trim();

    btn.disabled = true;
    btn.textContent = 'جاري الاستيراد…';
    msg.className = '';
    wrap.innerHTML = '';

    try {
      var res = await sb.functions.invoke('import-product', { body: { url: url } });
      var data = res.data;
      if (res.error || (data && data.error)) throw new Error((data && data.error) || (res.error && res.error.message) || 'error');

      lastImportPreview = Object.assign({}, data, { product_url: url });
      wrap.innerHTML =
        '<div class="import-preview"><img src="' + (data.image || '') + '" alt="">' +
        '<div style="flex:1;">' +
          '<div class="form-group"><label>اسم المنتج</label><input type="text" id="prevName" value="' + ((data.name || '').replace(/"/g, '&quot;')) + '"></div>' +
          '<div class="form-row">' +
            '<div class="form-group"><label>السعر (ر.س)</label><input type="number" id="prevPrice" value="' + (data.price ?? '') + '"></div>' +
            '<div class="form-group"><label>التصنيف</label><select id="prevCategory"></select></div>' +
          '</div>' +
          '<button class="btn btn-primary btn-sm" id="publishImportBtn">نشر المنتج</button>' +
        '</div></div>';

      var catSelect = document.getElementById('prevCategory');
      var catsRes = await sb.from('categories').select('id, name_ar').eq('is_active', true).order('sort_order');
      catSelect.innerHTML = (catsRes.data || []).map(function (c) { return '<option value="' + c.id + '">' + c.name_ar + '</option>'; }).join('');

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
    if (!myStore) { alert('أنشئ متجرك أولًا من تبويب "متجري".'); return; }
    var name = document.getElementById('prevName').value.trim();
    var price = parseFloat(document.getElementById('prevPrice').value);
    var category_id = document.getElementById('prevCategory').value || null;

    if (!name || !price) { alert('لازم اسم المنتج والسعر قبل النشر.'); return; }

    var pRes = await sb.from('products').insert({
      name_ar: name, slug: slugify(name), description: lastImportPreview.description,
      category_id: category_id, primary_image_url: lastImportPreview.image, created_by: profile.id,
    }).select().single();

    if (pRes.error) { alert('صار خطأ أثناء إنشاء المنتج.'); return; }

    await sb.from('product_offers').insert({
      product_id: pRes.data.id, store_id: myStore.id, merchant_name: myStore.name,
      price: price, product_url: lastImportPreview.product_url, is_affiliate: false,
    });

    document.getElementById('importPreviewWrap').innerHTML = '';
    document.getElementById('importForm').reset();
    document.getElementById('importMsg').className = 'form-msg show success';
    document.getElementById('importMsg').textContent = 'تم نشر المنتج بنجاح 🎉';
    await loadProductsTable();
    await loadOverview();
  }

  async function handleManualAdd(e) {
    e.preventDefault();
    if (!myStore) { alert('أنشئ متجرك أولًا من تبويب "متجري".'); return; }
    var btn = document.getElementById('manualSubmitBtn');
    var msg = document.getElementById('manualMsg');
    btn.disabled = true;
    btn.textContent = 'جاري النشر…';

    var name = document.getElementById('mName').value.trim();
    var price = parseFloat(document.getElementById('mPrice').value);
    var category_id = document.getElementById('mCategory').value || null;
    var image = document.getElementById('mImage').value.trim();
    var productUrl = document.getElementById('mUrl').value.trim();
    var description = document.getElementById('mDesc').value.trim();

    var pRes = await sb.from('products').insert({
      name_ar: name, slug: slugify(name), description: description,
      category_id: category_id, primary_image_url: image, created_by: profile.id,
    }).select().single();

    if (pRes.error) {
      msg.className = 'form-msg show error';
      msg.textContent = 'صار خطأ أثناء إنشاء المنتج.';
      btn.disabled = false;
      btn.textContent = 'نشر المنتج';
      return;
    }

    await sb.from('product_offers').insert({
      product_id: pRes.data.id, store_id: myStore.id, merchant_name: myStore.name,
      price: price, product_url: productUrl, is_affiliate: false,
    });

    msg.className = 'form-msg show success';
    msg.textContent = 'تم نشر المنتج بنجاح 🎉';
    btn.disabled = false;
    btn.textContent = 'نشر المنتج';
    document.getElementById('manualForm').reset();
    await loadProductsTable();
    await loadOverview();
  }

  async function loadSubscriptionPanel() {
    var panel = document.getElementById('subscriptionPanel');
    var plansRes = await sb.from('subscription_plans').select('*').eq('is_active', true).order('sort_order');
    var plans = plansRes.data || [];

    if (!myStore) { panel.innerHTML = '<p class="price-hint">أنشئ متجرك أولًا لتفعيل باقة اشتراك.</p>'; return; }

    panel.innerHTML =
      '<div class="stat-cards" style="margin-bottom:22px;">' +
      plans.map(function (p) {
        var isCurrent = myStore.subscription_plan_id === p.id;
        return '<div class="stat-card" style="' + (isCurrent ? 'border-color:var(--accent);' : '') + '">' +
          '<div class="label" style="font-size:15px; font-weight:600; color:var(--text);">' + p.name + '</div>' +
          '<div class="num" style="font-size:20px; margin:8px 0;">' + (p.price_monthly > 0 ? money(p.price_monthly) + ' / شهر' : 'مجانية') + '</div>' +
          '<div class="label">' + (p.max_products ? 'حتى ' + p.max_products + ' منتج' : 'منتجات غير محدودة') + '</div>' +
          '<button class="btn ' + (isCurrent ? 'btn-ghost' : 'btn-primary') + ' btn-sm" style="margin-top:12px; width:100%;" data-plan="' + p.id + '">' +
          (isCurrent ? 'باقتك الحالية' : 'الترقية لهذي الباقة') + '</button></div>';
      }).join('') +
      '</div><p class="price-hint">* الدفع الفعلي غير مفعّل في هذا العرض التجريبي — الترقية هنا توضيحية فقط.</p>';

    panel.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var expires = new Date();
        expires.setDate(expires.getDate() + 30);
        await sb.from('stores').update({
          subscription_plan_id: btn.dataset.plan, subscription_status: 'active', subscription_expires_at: expires.toISOString(),
        }).eq('id', myStore.id);
        await loadStore();
        await loadOverview();
      });
    });
  }

  async function init() {
    profile = await window.VORA.auth.requireRole(['merchant', 'admin', 'super_admin'], '../');
    if (!profile) return;

    window.VORA.auth.renderAuthState('../');
    document.getElementById('dashUser').innerHTML = '<b>' + (profile.full_name || 'تاجر') + '</b>' + profile.email;

    wireNav();
    await loadStore();
    wireForms();
    await loadOverview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
