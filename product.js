import { supabase } from './supabase-client.js';
import { renderAuthState, getSessionUser } from './auth.js';

const fmt = new Intl.NumberFormat('ar-SA');
const money = (n) => `${fmt.format(Math.round(n))} ر.س`;

const params = new URLSearchParams(window.location.search);
const slug = params.get('slug');
const content = document.getElementById('productContent');

renderAuthState();

if (!slug) {
  content.innerHTML = '<div class="empty-state"><div class="icon">🔎</div><p>ما فيه منتج محدد.</p></div>';
} else {
  loadProduct(slug);
}

async function loadProduct(slug) {
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id, name_ar, name_en, slug, description, rating, reviews_count, primary_image_url,
      product_offers ( id, price, previous_price, merchant_name, product_url, affiliate_url, is_affiliate, availability, last_checked_at )
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !product) {
    content.innerHTML = '<div class="empty-state"><div class="icon">😕</div><p>ما لقينا هذا المنتج.</p></div>';
    return;
  }

  document.title = `${product.name_ar} — VORA`;
  document.getElementById('crumbName').textContent = product.name_ar;

  const offers = [...(product.product_offers || [])].sort((a, b) => a.price - b.price);
  const best = offers[0];
  const history = await loadPriceHistory(offers.map((o) => o.id));

  content.innerHTML = `
    <div class="product-hero">
      <div class="product-hero-img">
        <img src="${product.primary_image_url || ''}" alt="${product.name_ar}">
      </div>
      <div class="product-hero-info">
        <h1>${product.name_ar}</h1>
        <div class="product-meta">⭐ ${product.rating ?? '—'} · ${product.reviews_count ?? 0} تقييم · ${offers.length} ${offers.length === 1 ? 'عرض' : 'عروض'}</div>
        ${product.description ? `<p style="color:var(--text-dim); margin-top:14px; max-width:520px;">${product.description}</p>` : ''}
        ${best ? `
          <div style="margin-top:22px;">
            <div class="price-hint">أقل سعر متوفر الآن</div>
            <div style="display:flex; align-items:baseline; gap:10px; margin-top:4px;">
              <span class="price-now" style="font-size:30px;">${money(best.price)}</span>
              ${best.previous_price && best.previous_price > best.price ? `<span class="price-prev">${money(best.previous_price)}</span>` : ''}
            </div>
          </div>` : ''}
        <div class="product-hero-actions">
          ${best ? `<a class="btn btn-primary btn-lg" target="_blank" rel="noopener sponsored" href="${best.affiliate_url || best.product_url}">${best.is_affiliate ? 'اشترِ الآن' : 'زيارة المتجر'}</a>` : ''}
          <button class="btn btn-ghost" id="wishlistBtn">♡ أضف للمفضلة</button>
        </div>
        <div class="panel" id="alertPanel" style="margin-top:24px;">
          <div class="panel-head"><h2>نبّهني إذا نزل السعر</h2></div>
          <form id="alertForm" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
            <div class="form-group" style="flex:1; min-width:160px; margin-bottom:0;">
              <label for="targetPrice">السعر المستهدف (ر.س)</label>
              <input type="number" id="targetPrice" min="1" step="1" required>
            </div>
            <button type="submit" class="btn btn-primary">تفعيل التنبيه</button>
          </form>
          <div class="form-msg" id="alertMsg"></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>مقارنة الأسعار (${offers.length})</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>المتجر</th><th>السعر</th><th>السعر السابق</th><th>التوفر</th><th></th></tr></thead>
          <tbody>
            ${offers.map((o, i) => `
              <tr>
                <td>${o.merchant_name || 'متجر'} ${i === 0 ? '<span class="pill pill-green">الأوفر</span>' : ''}</td>
                <td style="font-family:var(--font-mono); font-weight:600;">${money(o.price)}</td>
                <td style="font-family:var(--font-mono); color:var(--text-dimmer);">${o.previous_price && o.previous_price > o.price ? money(o.previous_price) : '—'}</td>
                <td>${o.availability === 'in_stock' ? '<span class="pill pill-green">متوفر</span>' : '<span class="pill pill-gray">غير متوفر</span>'}</td>
                <td><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener sponsored" href="${o.affiliate_url || o.product_url}">${o.is_affiliate ? 'شراء' : 'زيارة'}</a></td>
              </tr>
            `).join('') || `<tr><td colspan="5" class="price-hint">لا توجد عروض حاليًا.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    ${history.length > 1 ? `
      <div class="panel">
        <div class="panel-head"><h2>تاريخ السعر</h2></div>
        <div class="price-history-chart">${renderChart(history)}</div>
      </div>
    ` : ''}
  `;

  wireWishlist(product.id);
  wireAlert(product.id);
}

async function loadPriceHistory(offerIds) {
  if (!offerIds.length) return [];
  const { data, error } = await supabase
    .from('price_history')
    .select('price, recorded_at')
    .in('offer_id', offerIds)
    .order('recorded_at', { ascending: true });
  if (error || !data) return [];
  return data;
}

function renderChart(points) {
  const w = 900, h = 180, pad = 20;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.price - min) / range) * (h - pad * 2);
    return [x, y];
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="مخطط تاريخ السعر">
      <path d="${area}" fill="rgba(198,255,61,.12)" stroke="none"></path>
      <path d="${path}" fill="none" stroke="#C6FF3D" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${coords.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#C6FF3D"></circle>`).join('')}
    </svg>
  `;
}

/* ---------------- Wishlist ---------------- */
async function wireWishlist(productId) {
  const btn = document.getElementById('wishlistBtn');
  const user = await getSessionUser();

  if (user) {
    const { data } = await supabase
      .from('wishlist')
      .select('product_id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .maybeSingle();
    if (data) {
      btn.textContent = '♥ في المفضلة';
      btn.classList.add('btn-primary');
    }
  }

  btn.addEventListener('click', async () => {
    const currentUser = await getSessionUser();
    if (!currentUser) {
      window.location.href = `login.html`;
      return;
    }
    const isSaved = btn.textContent.includes('♥');
    if (isSaved) {
      await supabase.from('wishlist').delete().eq('user_id', currentUser.id).eq('product_id', productId);
      btn.textContent = '♡ أضف للمفضلة';
      btn.classList.remove('btn-primary');
    } else {
      await supabase.from('wishlist').insert({ user_id: currentUser.id, product_id: productId });
      btn.textContent = '♥ في المفضلة';
      btn.classList.add('btn-primary');
    }
  });
}

/* ---------------- Price alert ---------------- */
function wireAlert(productId) {
  const form = document.getElementById('alertForm');
  const msg = document.getElementById('alertMsg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = await getSessionUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    const target = parseFloat(document.getElementById('targetPrice').value);
    const { error } = await supabase.from('price_alerts').insert({
      user_id: user.id,
      product_id: productId,
      target_price: target,
    });
    msg.className = `form-msg show ${error ? 'error' : 'success'}`;
    msg.textContent = error ? 'تعذر تفعيل التنبيه، حاول مرة ثانية.' : `تمام! بنعلمك أول ما يوصل السعر ${money(target)}.`;
    if (!error) form.reset();
  });
}
