// ============================================================
// VORA — Home page (classic script)
// ============================================================
(function () {
  var sb = window.VORA.supabase;
  var fmt = new Intl.NumberFormat('ar-SA');
  var money = function (n) { return fmt.format(Math.round(n)) + ' ر.س'; };

  function bestOffer(offers) {
    if (!offers || !offers.length) return null;
    return offers.slice().sort(function (a, b) { return a.price - b.price; })[0];
  }
  function maxDiscount(offers) {
    if (!offers || !offers.length) return 0;
    var best = 0;
    offers.forEach(function (o) {
      if (o.previous_price && o.previous_price > o.price) {
        var pct = Math.round(((o.previous_price - o.price) / o.previous_price) * 100);
        if (pct > best) best = pct;
      }
    });
    return best;
  }

  function productCard(p) {
    var offers = p.product_offers || [];
    var best = bestOffer(offers);
    var discount = maxDiscount(offers);
    var storeCount = offers.length;
    var img = p.primary_image_url || 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=600';

    var card = document.createElement('a');
    card.className = 'product-card';
    card.href = 'product.html?slug=' + encodeURIComponent(p.slug);
    card.innerHTML =
      '<div class="product-thumb">' +
        '<img src="' + img + '" alt="' + p.name_ar + '" loading="lazy">' +
        (discount > 0 ? '<span class="badge-discount">خصم ' + discount + '%</span>' : '') +
        (storeCount > 1 ? '<span class="badge-stores">' + storeCount + ' متاجر</span>' : '') +
      '</div>' +
      '<div class="product-body">' +
        '<div class="product-name">' + p.name_ar + '</div>' +
        '<div class="product-meta">⭐ ' + (p.rating ?? '—') + ' · ' + (p.reviews_count ?? 0) + ' تقييم</div>' +
        '<div class="price-row">' +
          (best ? '<span class="price-now">' + money(best.price) + '</span>' : '<span class="price-hint">السعر غير متوفر</span>') +
          (best && best.previous_price && best.previous_price > best.price ? '<span class="price-prev">' + money(best.previous_price) + '</span>' : '') +
        '</div>' +
        (storeCount ? '<div class="price-hint">أقل سعر من ' + storeCount + ' ' + (storeCount === 1 ? 'متجر' : 'متاجر') + '</div>' : '') +
      '</div>';
    return card;
  }

  var PRODUCT_SELECT =
    'id, name_ar, name_en, slug, primary_image_url, rating, reviews_count, is_featured,' +
    ' product_offers ( id, price, previous_price, merchant_name, product_url, affiliate_url, is_affiliate, availability )';

  async function loadStats() {
    var p1 = sb.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
    var p2 = sb.from('sources').select('*', { count: 'exact', head: true });
    var p3 = sb.from('product_offers').select('*', { count: 'exact', head: true }).eq('is_active', true);
    var results = await Promise.all([p1, p2, p3]);
    setStat('products', results[0].count);
    setStat('stores', results[1].count);
    setStat('offers', results[2].count);
  }
  function setStat(key, value) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (el && value != null) el.textContent = fmt.format(value) + '+';
  }

  async function loadCategories() {
    var row = document.getElementById('categoryRow');
    var res = await sb.from('categories').select('id, name_ar, slug, icon').eq('is_active', true).order('sort_order');
    if (res.error || !res.data) { row.innerHTML = ''; return; }
    row.innerHTML = res.data.map(function (c) {
      return '<button class="cat-pill" data-cat="' + c.id + '"><span class="emoji">' + (c.icon || '🏷️') + '</span><span>' + c.name_ar + '</span></button>';
    }).join('');
    row.querySelectorAll('.cat-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        runSearch(btn.querySelector('span:last-child').textContent);
      });
    });
  }

  async function loadDeals() {
    var grid = document.getElementById('dealsGrid');
    var res = await sb.from('products').select(PRODUCT_SELECT).eq('is_active', true);
    if (res.error || !res.data) { grid.innerHTML = '<p class="price-hint">تعذر تحميل العروض حاليًا.</p>'; return; }
    var withDiscount = res.data
      .map(function (p) { return { p: p, d: maxDiscount(p.product_offers) }; })
      .filter(function (x) { return x.d > 0; })
      .sort(function (a, b) { return b.d - a.d; })
      .slice(0, 8);
    var list = withDiscount.length ? withDiscount.map(function (x) { return x.p; }) : res.data.slice(0, 4);
    grid.innerHTML = '';
    list.forEach(function (p) { grid.appendChild(productCard(p)); });
  }

  async function loadTrending() {
    var grid = document.getElementById('trendingGrid');
    var res = await sb.from('products').select(PRODUCT_SELECT).eq('is_active', true).order('reviews_count', { ascending: false }).limit(8);
    if (res.error || !res.data) { grid.innerHTML = '<p class="price-hint">تعذر تحميل المنتجات حاليًا.</p>'; return; }
    grid.innerHTML = '';
    res.data.forEach(function (p) { grid.appendChild(productCard(p)); });
  }

  async function loadTicker() {
    var track = document.getElementById('tickerTrack');
    var res = await sb.from('product_offers')
      .select('price, previous_price, merchant_name, products ( name_ar )')
      .eq('is_active', true)
      .not('previous_price', 'is', null)
      .order('last_checked_at', { ascending: false })
      .limit(10);

    if (res.error || !res.data || !res.data.length) {
      track.innerHTML = '<span class="ticker-item">تابع أحدث انخفاضات الأسعار من عدة متاجر عبر VORA</span>';
      return;
    }
    var items = res.data
      .filter(function (o) { return o.previous_price > o.price; })
      .map(function (o) {
        var pct = Math.round(((o.previous_price - o.price) / o.previous_price) * 100);
        var name = (o.products && o.products.name_ar) || 'منتج';
        return '<span class="ticker-item">📉 <b>' + name + '</b> عند ' + o.merchant_name + ' انخفض <span class="drop">' + pct + '%</span> — الآن ' + money(o.price) + '</span>';
      });
    track.innerHTML = items.join('') + items.join('');
  }

  async function runSearch(term) {
    if (!term || !term.trim()) return;
    var grid = document.getElementById('trendingGrid');
    document.getElementById('trending').scrollIntoView({ behavior: 'smooth' });
    document.querySelector('#trending .section-head h2').textContent = 'نتائج البحث عن "' + term + '"';
    grid.innerHTML = '<div class="skeleton-row"></div>';

    var res = await sb.from('products').select(PRODUCT_SELECT).eq('is_active', true)
      .or('name_ar.ilike.%' + term + '%,name_en.ilike.%' + term + '%');

    if (res.error || !res.data || !res.data.length) {
      grid.innerHTML = '<p class="price-hint">ما لقينا نتائج مطابقة، جرّب كلمة بحث ثانية.</p>';
      return;
    }
    grid.innerHTML = '';
    res.data.forEach(function (p) { grid.appendChild(productCard(p)); });
  }

  function wireSearchForms() {
    [['heroSearchForm', 'heroSearchInput'], ['headerSearchForm', 'headerSearchInput'], ['mobileSearchForm', 'mobileSearchInput']]
      .forEach(function (pair) {
        var form = document.getElementById(pair[0]);
        var input = document.getElementById(pair[1]);
        if (!form) return;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          runSearch(input.value);
        });
      });
  }

  function wireFaq() {
    document.querySelectorAll('.faq-item').forEach(function (item) {
      item.querySelector('.faq-q').addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  function wireMerchantCtas() {
    ['merchantCta', 'merchantCtaMobile', 'merchantCtaBottom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () {
        document.getElementById('merchants').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  async function init() {
    if (!sb) { console.error('VORA: Supabase client not ready.'); return; }
    wireSearchForms();
    wireFaq();
    wireMerchantCtas();
    window.VORA.auth.renderAuthState();
    await Promise.all([loadStats(), loadCategories(), loadDeals(), loadTrending(), loadTicker()]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
