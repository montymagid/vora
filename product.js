// ============================================================
// VORA — Product detail page (classic script)
// ============================================================
(function () {
  var sb = window.VORA.supabase;
  var fmt = new Intl.NumberFormat('ar-SA');
  var money = function (n) { return fmt.format(Math.round(n)) + ' ر.س'; };

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug');
  var content = document.getElementById('productContent');
  var lastImportPreview = null; // unused here, kept for symmetry

  async function loadPriceHistory(offerIds) {
    if (!offerIds.length) return [];
    var res = await sb.from('price_history').select('price, recorded_at').in('offer_id', offerIds).order('recorded_at', { ascending: true });
    if (res.error || !res.data) return [];
    return res.data;
  }

  function renderChart(points) {
    var w = 900, h = 180, pad = 20;
    var prices = points.map(function (p) { return p.price; });
    var min = Math.min.apply(null, prices), max = Math.max.apply(null, prices);
    var range = max - min || 1;
    var stepX = (w - pad * 2) / (points.length - 1);

    var coords = points.map(function (p, i) {
      var x = pad + i * stepX;
      var y = h - pad - ((p.price - min) / range) * (h - pad * 2);
      return [x, y];
    });

    var path = coords.map(function (c, i) { return (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1); }).join(' ');
    var area = path + ' L' + coords[coords.length - 1][0].toFixed(1) + ',' + (h - pad) + ' L' + coords[0][0].toFixed(1) + ',' + (h - pad) + ' Z';

    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="مخطط تاريخ السعر">' +
      '<path d="' + area + '" fill="rgba(198,255,61,.12)" stroke="none"></path>' +
      '<path d="' + path + '" fill="none" stroke="#C6FF3D" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>' +
      coords.map(function (c) { return '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="3.5" fill="#C6FF3D"></circle>'; }).join('') +
      '</svg>';
  }

  async function wireWishlist(productId) {
    var btn = document.getElementById('wishlistBtn');
    var user = await window.VORA.auth.getSessionUser();

    if (user) {
      var res = await sb.from('wishlist').select('product_id').eq('user_id', user.id).eq('product_id', productId).maybeSingle();
      if (res.data) {
        btn.textContent = '♥ في المفضلة';
        btn.classList.add('btn-primary');
      }
    }

    btn.addEventListener('click', async function () {
      var currentUser = await window.VORA.auth.getSessionUser();
      if (!currentUser) { window.location.href = 'login.html'; return; }
      var isSaved = btn.textContent.indexOf('♥') !== -1;
      if (isSaved) {
        await sb.from('wishlist').delete().eq('user_id', currentUser.id).eq('product_id', productId);
        btn.textContent = '♡ أضف للمفضلة';
        btn.classList.remove('btn-primary');
      } else {
        await sb.from('wishlist').insert({ user_id: currentUser.id, product_id: productId });
        btn.textContent = '♥ في المفضلة';
        btn.classList.add('btn-primary');
      }
    });
  }

  function wireAlert(productId) {
    var form = document.getElementById('alertForm');
    var msg = document.getElementById('alertMsg');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var user = await window.VORA.auth.getSessionUser();
      if (!user) { window.location.href = 'login.html'; return; }
      var target = parseFloat(document.getElementById('targetPrice').value);
      var res = await sb.from('price_alerts').insert({ user_id: user.id, product_id: productId, target_price: target });
      msg.className = 'form-msg show ' + (res.error ? 'error' : 'success');
      msg.textContent = res.error ? 'تعذر تفعيل التنبيه، حاول مرة ثانية.' : 'تمام! بنعلمك أول ما يوصل السعر ' + money(target) + '.';
      if (!res.error) form.reset();
    });
  }

  async function loadProduct(slug) {
    var res = await sb.from('products')
      .select('id, name_ar, name_en, slug, description, rating, reviews_count, primary_image_url,' +
        ' product_offers ( id, price, previous_price, merchant_name, product_url, affiliate_url, is_affiliate, availability, last_checked_at )')
      .eq('slug', slug).eq('is_active', true).single();

    var product = res.data;
    if (res.error || !product) {
      content.innerHTML = '<div class="empty-state"><div class="icon">😕</div><p>ما لقينا هذا المنتج.</p></div>';
      return;
    }

    document.title = product.name_ar + ' — VORA';
    var crumb = document.getElementById('crumbName');
    if (crumb) crumb.textContent = product.name_ar;

    var offers = (product.product_offers || []).slice().sort(function (a, b) { return a.price - b.price; });
    var best = offers[0];
    var history = await loadPriceHistory(offers.map(function (o) { return o.id; }));

    content.innerHTML =
      '<div class="product-hero">' +
        '<div class="product-hero-img"><img src="' + (product.primary_image_url || '') + '" alt="' + product.name_ar + '"></div>' +
        '<div class="product-hero-info">' +
          '<h1>' + product.name_ar + '</h1>' +
          '<div class="product-meta">⭐ ' + (product.rating ?? '—') + ' · ' + (product.reviews_count ?? 0) + ' تقييم · ' + offers.length + ' ' + (offers.length === 1 ? 'عرض' : 'عروض') + '</div>' +
          (product.description ? '<p style="color:var(--text-dim); margin-top:14px; max-width:520px;">' + product.description + '</p>' : '') +
          (best ? '<div style="margin-top:22px;"><div class="price-hint">أقل سعر متوفر الآن</div>' +
            '<div style="display:flex; align-items:baseline; gap:10px; margin-top:4px;">' +
            '<span class="price-now" style="font-size:30px;">' + money(best.price) + '</span>' +
            (best.previous_price && best.previous_price > best.price ? '<span class="price-prev">' + money(best.previous_price) + '</span>' : '') +
            '</div></div>' : '') +
          '<div class="product-hero-actions">' +
            (best ? '<a class="btn btn-primary btn-lg" target="_blank" rel="noopener sponsored" href="' + (best.affiliate_url || best.product_url) + '">' + (best.is_affiliate ? 'اشترِ الآن' : 'زيارة المتجر') + '</a>' : '') +
            '<button class="btn btn-ghost" id="wishlistBtn">♡ أضف للمفضلة</button>' +
          '</div>' +
          '<div class="panel" id="alertPanel" style="margin-top:24px;">' +
            '<div class="panel-head"><h2>نبّهني إذا نزل السعر</h2></div>' +
            '<form id="alertForm" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">' +
              '<div class="form-group" style="flex:1; min-width:160px; margin-bottom:0;"><label for="targetPrice">السعر المستهدف (ر.س)</label><input type="number" id="targetPrice" min="1" step="1" required></div>' +
              '<button type="submit" class="btn btn-primary">تفعيل التنبيه</button>' +
            '</form>' +
            '<div class="form-msg" id="alertMsg"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-head"><h2>مقارنة الأسعار (' + offers.length + ')</h2></div>' +
        '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>المتجر</th><th>السعر</th><th>السعر السابق</th><th>التوفر</th><th></th></tr></thead>' +
          '<tbody>' +
          (offers.length ? offers.map(function (o, i) {
            return '<tr><td>' + (o.merchant_name || 'متجر') + ' ' + (i === 0 ? '<span class="pill pill-green">الأوفر</span>' : '') + '</td>' +
              '<td style="font-family:var(--font-mono); font-weight:600;">' + money(o.price) + '</td>' +
              '<td style="font-family:var(--font-mono); color:var(--text-dimmer);">' + (o.previous_price && o.previous_price > o.price ? money(o.previous_price) : '—') + '</td>' +
              '<td>' + (o.availability === 'in_stock' ? '<span class="pill pill-green">متوفر</span>' : '<span class="pill pill-gray">غير متوفر</span>') + '</td>' +
              '<td><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener sponsored" href="' + (o.affiliate_url || o.product_url) + '">' + (o.is_affiliate ? 'شراء' : 'زيارة') + '</a></td></tr>';
          }).join('') : '<tr><td colspan="5" class="price-hint">لا توجد عروض حاليًا.</td></tr>') +
          '</tbody></table></div>' +
      '</div>' +
      (history.length > 1 ? '<div class="panel"><div class="panel-head"><h2>تاريخ السعر</h2></div><div class="price-history-chart">' + renderChart(history) + '</div></div>' : '');

    wireWishlist(product.id);
    wireAlert(product.id);
  }

  async function init() {
    window.VORA.auth.renderAuthState();
    if (!slug) {
      content.innerHTML = '<div class="empty-state"><div class="icon">🔎</div><p>ما فيه منتج محدد.</p></div>';
      return;
    }
    loadProduct(slug);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
