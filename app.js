import { supabase } from './supabase-client.js';

const fmt = new Intl.NumberFormat('ar-SA');
const money = (n) => `${fmt.format(Math.round(n))} ر.س`;

/* ---------------- Helpers ---------------- */
function bestOffer(offers) {
  if (!offers || !offers.length) return null;
  return [...offers].sort((a, b) => a.price - b.price)[0];
}
function maxDiscount(offers) {
  if (!offers || !offers.length) return 0;
  let best = 0;
  for (const o of offers) {
    if (o.previous_price && o.previous_price > o.price) {
      const pct = Math.round(((o.previous_price - o.price) / o.previous_price) * 100);
      if (pct > best) best = pct;
    }
  }
  return best;
}

function productCard(p) {
  const offers = p.product_offers || [];
  const best = bestOffer(offers);
  const discount = maxDiscount(offers);
  const storeCount = offers.length;
  const img = p.primary_image_url || 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=600';

  const card = document.createElement('a');
  card.className = 'product-card';
  card.href = `product.html?slug=${encodeURIComponent(p.slug)}`;
  card.innerHTML = `
    <div class="product-thumb">
      <img src="${img}" alt="${p.name_ar}" loading="lazy">
      ${discount > 0 ? `<span class="badge-discount">خصم ${discount}%</span>` : ''}
      ${storeCount > 1 ? `<span class="badge-stores">${storeCount} متاجر</span>` : ''}
    </div>
    <div class="product-body">
      <div class="product-name">${p.name_ar}</div>
      <div class="product-meta">⭐ ${p.rating ?? '—'} · ${p.reviews_count ?? 0} تقييم</div>
      <div class="price-row">
        ${best ? `<span class="price-now">${money(best.price)}</span>` : `<span class="price-hint">السعر غير متوفر</span>`}
        ${best && best.previous_price && best.previous_price > best.price ? `<span class="price-prev">${money(best.previous_price)}</span>` : ''}
      </div>
      ${storeCount ? `<div class="price-hint">أقل سعر من ${storeCount} ${storeCount === 1 ? 'متجر' : 'متاجر'}</div>` : ''}
    </div>
  `;
  return card;
}

/* ---------------- Data loading ---------------- */
const PRODUCT_SELECT = `
  id, name_ar, name_en, slug, primary_image_url, rating, reviews_count, is_featured,
  product_offers ( id, price, previous_price, merchant_name, product_url, affiliate_url, is_affiliate, availability )
`;

async function loadStats() {
  const [{ count: productsCount }, { count: storesCount }, { count: offersCount }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('sources').select('*', { count: 'exact', head: true }),
    supabase.from('product_offers').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  setStat('products', productsCount);
  setStat('stores', storesCount);
  setStat('offers', offersCount);
}
function setStat(key, value) {
  const el = document.querySelector(`[data-stat="${key}"]`);
  if (el && value != null) el.textContent = fmt.format(value) + '+';
}

async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name_ar, slug, icon')
    .eq('is_active', true)
    .order('sort_order');
  const row = document.getElementById('categoryRow');
  if (error || !data) { row.innerHTML = ''; return; }
  row.innerHTML = data.map(c => `
    <button class="cat-pill" data-cat="${c.id}">
      <span class="emoji">${c.icon || '🏷️'}</span><span>${c.name_ar}</span>
    </button>
  `).join('');
  row.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => runSearch(btn.querySelector('span:last-child').textContent));
  });
}

async function loadDeals() {
  const grid = document.getElementById('dealsGrid');
  const { data, error } = await supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true);
  if (error || !data) { grid.innerHTML = '<p class="price-hint">تعذر تحميل العروض حاليًا.</p>'; return; }
  const withDiscount = data
    .map(p => ({ p, d: maxDiscount(p.product_offers) }))
    .filter(x => x.d > 0)
    .sort((a, b) => b.d - a.d)
    .slice(0, 8);
  const list = withDiscount.length ? withDiscount.map(x => x.p) : data.slice(0, 4);
  grid.innerHTML = '';
  list.forEach(p => grid.appendChild(productCard(p)));
}

async function loadTrending() {
  const grid = document.getElementById('trendingGrid');
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('reviews_count', { ascending: false })
    .limit(8);
  if (error || !data) { grid.innerHTML = '<p class="price-hint">تعذر تحميل المنتجات حاليًا.</p>'; return; }
  grid.innerHTML = '';
  data.forEach(p => grid.appendChild(productCard(p)));
}

async function loadTicker() {
  const track = document.getElementById('tickerTrack');
  const { data, error } = await supabase
    .from('product_offers')
    .select('price, previous_price, merchant_name, products ( name_ar )')
    .eq('is_active', true)
    .not('previous_price', 'is', null)
    .order('last_checked_at', { ascending: false })
    .limit(10);

  if (error || !data || !data.length) {
    track.innerHTML = '<span class="ticker-item">تابع أحدث انخفاضات الأسعار من عدة متاجر عبر VORA</span>';
    return;
  }
  const items = data
    .filter(o => o.previous_price > o.price)
    .map(o => {
      const pct = Math.round(((o.previous_price - o.price) / o.previous_price) * 100);
      return `<span class="ticker-item">📉 <b>${o.products?.name_ar ?? 'منتج'}</b> عند ${o.merchant_name} انخفض <span class="drop">${pct}%</span> — الآن ${money(o.price)}</span>`;
    });
  // duplicate list for seamless marquee loop
  track.innerHTML = items.join('') + items.join('');
}

/* ---------------- Search ---------------- */
async function runSearch(term) {
  if (!term || !term.trim()) return;
  const grid = document.getElementById('trendingGrid');
  document.getElementById('trending').scrollIntoView({ behavior: 'smooth' });
  document.querySelector('#trending .section-head h2').textContent = `نتائج البحث عن "${term}"`;
  grid.innerHTML = '<div class="skeleton-row"></div>';

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .or(`name_ar.ilike.%${term}%,name_en.ilike.%${term}%`);

  if (error || !data || !data.length) {
    grid.innerHTML = '<p class="price-hint">ما لقينا نتائج مطابقة، جرّب كلمة بحث ثانية.</p>';
    return;
  }
  grid.innerHTML = '';
  data.forEach(p => grid.appendChild(productCard(p)));
}

function wireSearchForms() {
  const pairs = [
    ['heroSearchForm', 'heroSearchInput'],
    ['headerSearchForm', 'headerSearchInput'],
    ['mobileSearchForm', 'mobileSearchInput'],
  ];
  pairs.forEach(([formId, inputId]) => {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runSearch(input.value);
    });
  });
}

/* ---------------- UI chrome ---------------- */
function wireMobileMenu() {
  const drawer = document.getElementById('mobileDrawer');
  const toggle = document.getElementById('menuToggle');
  toggle.addEventListener('click', () => drawer.classList.toggle('open'));
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => drawer.classList.remove('open')));
}

function wireFaq() {
  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-q').addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

function wireMerchantCtas() {
  ['merchantCta', 'merchantCtaMobile', 'merchantCtaBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => document.getElementById('merchants').scrollIntoView({ behavior: 'smooth' }));
  });
}

/* ---------------- Init ---------------- */
(async function init() {
  wireSearchForms();
  wireMobileMenu();
  wireFaq();
  wireMerchantCtas();

  const { renderAuthState } = await import('./auth.js');
  renderAuthState();

  await Promise.all([
    loadStats(),
    loadCategories(),
    loadDeals(),
    loadTrending(),
    loadTicker(),
  ]);
})();
