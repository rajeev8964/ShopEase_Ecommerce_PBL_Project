const API = 'http://localhost:5000/api';
const GUEST_CART_KEY = 'shop_guest_cart';
let token = localStorage.getItem('shop_token') || '';
let user = null;
try { user = JSON.parse(localStorage.getItem('shop_user') || 'null'); } catch { localStorage.removeItem('shop_user'); }
let products = [];
let cart = [];
let guestCart = readGuestCart();
let cartMode = 'guest';
let pendingCheckout = false;
let productPage = 1;
let totalProductPages = 1;
let authMode = 'login';
const $ = id => document.getElementById(id);
const money = value => '₹' + Number(value || 0).toFixed(2);
const categoryIcons = {
  Earbuds: '🎧', Neckbands: '🎵', Chargers: '⚡', Cables: '🔌',
  Speakers: '🔊', Accessories: '✨', Electronics: '📱', Fashion: '🧢',
  'Home & Kitchen': '🏠'
};

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(API + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
  return data;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
function readGuestCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(item => Number.isInteger(Number(item.product_id)) && Number(item.product_id) > 0 &&
      Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0)
      .map(item => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) }));
  } catch {
    localStorage.removeItem(GUEST_CART_KEY);
    return [];
  }
}
function saveGuestCart() {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestCart));
}
function productImage(url, name) {
  if (!url) return `<div class="product-placeholder" aria-label="${esc(name)}">🎧</div>`;
  const src = url.startsWith('/uploads/') ? `http://localhost:5000${url}` : url;
  if (!/^https?:\/\//i.test(src) && !src.startsWith('/assets/products/')) return `<div class="product-placeholder">🎧</div>`;
  return `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy">`;
}
function priceMarkup(product) {
  const compareAt = Number(product.compare_at_price);
  const price = Number(product.price);
  if (compareAt > price) {
    const discount = Math.round((compareAt - price) / compareAt * 100);
    return `<span class="price">${money(price)} <del>${money(compareAt)}</del></span><small class="discount-badge">${discount}% off</small>`;
  }
  return `<span class="price">${money(price)}</span>`;
}
function productCard(product) {
  const stock = Number(product.stock);
  return `<article class="product">
    <button class="product-image-button" onclick="viewProduct(${Number(product.id)})" aria-label="View ${esc(product.name)}">${productImage(product.image_url, product.name)}</button>
    ${Number(product.compare_at_price) > Number(product.price) ? '<span class="offer-ribbon">SPECIAL OFFER</span>' : ''}
    <div class="product-info">
      <small>${esc(product.category_name || 'General')}</small>
      <h3><button class="text-button" onclick="viewProduct(${Number(product.id)})">${esc(product.name)}</button></h3>
      <p class="product-description">${esc(product.description || 'Quality product for everyday use.')}</p>
      <small class="product-rating">${Number(product.review_count) > 0
        ? `★ ${Number(product.average_rating).toFixed(1)} · ${Number(product.review_count)} review${Number(product.review_count) === 1 ? '' : 's'}`
        : 'New · No reviews yet'}</small>
      <small class="${stock ? 'stock-available' : 'stock-empty'}">${stock > 0 ? `${stock} in stock` : 'Out of stock'}</small>
      <div class="product-bottom"><div>${priceMarkup(product)}</div>
        <div class="product-actions">
          <button class="add" onclick="addToCart(${Number(product.id)})" ${stock < 1 ? 'disabled' : ''}>Add to Cart</button>
          <button class="buy-now" onclick="buyNow(${Number(product.id)})" ${stock < 1 ? 'disabled' : ''}>Buy Now</button>
          <button class="view-details" onclick="viewProduct(${Number(product.id)})">View Details</button>
        </div>
      </div>
    </div>
  </article>`;
}
function renderGrid(elementId, items, emptyMessage) {
  $(elementId).innerHTML = items.map(productCard).join('') || `<p class="empty-section">${esc(emptyMessage)}</p>`;
}
function syncAccount() {
  const loggedIn = Boolean(token && user);
  $('loginOpen').classList.toggle('hidden', loggedIn);
  $('ordersOpen').classList.toggle('hidden', !loggedIn || user.role === 'admin');
  $('logoutBtn').classList.toggle('hidden', !loggedIn);
  if (loggedIn) $('loginOpen').textContent = `Hi, ${user.name.split(' ')[0]}`;
}
async function loadCategories() {
  try {
    const categories = await request('/categories');
    $('categoryFilter').innerHTML = '<option value="">All categories</option>' +
      categories.map(category => `<option value="${Number(category.id)}">${esc(category.name)}</option>`).join('');
    $('categoryGrid').innerHTML = categories.map(category =>
      `<button class="category-tile" onclick="selectCategory(${Number(category.id)})">${category.image_url
        ? `<span class="category-image">${productImage(category.image_url, category.name)}</span>`
        : `<i aria-hidden="true">${categoryIcons[category.name] || '🛍️'}</i>`}${esc(category.name)}<span>Explore →</span></button>`
    ).join('') || '<p class="empty-section">Categories will appear here soon.</p>';
  } catch (error) {
    $('categoryGrid').innerHTML = `<p class="empty-section">Could not load categories: ${esc(error.message)}</p>`;
  }
}
async function loadProducts(resetPage = true) {
  if (resetPage) productPage = 1;
  const query = new URLSearchParams();
  query.set('page', productPage);
  query.set('limit', '50');
  const search = $('searchInputInline').value.trim();
  if (search) query.set('search', search);
  if ($('categoryFilter').value) query.set('category', $('categoryFilter').value);
  if ($('minPrice').value) query.set('minPrice', $('minPrice').value);
  if ($('maxPrice').value) query.set('maxPrice', $('maxPrice').value);
  if ($('sortFilter').value) query.set('sort', $('sortFilter').value);
  try {
    const data = await request('/products?' + query);
    products = data.items;
    totalProductPages = data.totalPages;
    $('productPagination').classList.toggle('hidden', totalProductPages <= 1);
    $('pageLabel').textContent = `Page ${productPage} of ${totalProductPages}`;
    $('previousPage').disabled = productPage <= 1;
    $('nextPage').disabled = productPage >= totalProductPages;
    $('productGrid').innerHTML = products.map(productCard).join('') || '<p class="empty-section">No products match your filters.</p>';
  } catch (error) {
    $('productGrid').innerHTML = `<p class="empty-section">Could not load products. ${esc(error.message)}</p>`;
  }
}
async function loadHomeSections() {
  try {
    const [featured, bestSellers, offers, reviews] = await Promise.all([
      request('/products?limit=4&sort=newest'),
      request('/products/best-sellers'),
      request('/products?limit=4&offers=true&sort=newest'),
      request('/reviews')
    ]);
    renderGrid('featuredGrid', featured.items, 'Products will appear here soon.');
    renderGrid('bestSellersGrid', bestSellers, 'Best sellers will appear after customers place orders.');
    $('offersGrid').innerHTML = offers.items.map(productCard).join('');
    $('offersEmpty').classList.toggle('hidden', offers.items.length > 0);
    $('reviewsGrid').innerHTML = reviews.map(review => `
      <article class="review-card"><div class="review-stars" aria-label="${Number(review.rating)} out of 5 stars">${'★'.repeat(Math.max(0, Math.min(5, Number(review.rating))))}${'☆'.repeat(5 - Math.max(0, Math.min(5, Number(review.rating))))}</div>
        <p>“${esc(review.comment)}”</p><b>${esc(review.customer_name)}</b><small>Verified product review · ${esc(review.product_name)}</small></article>`
    ).join('') || '<p class="empty-section">Customer reviews will appear here when shoppers share feedback.</p>';
  } catch (error) {
    $('featuredGrid').innerHTML = `<p class="empty-section">${esc(error.message)}</p>`;
    $('bestSellersGrid').innerHTML = '<p class="empty-section">Best sellers are temporarily unavailable.</p>';
    $('offersGrid').innerHTML = '<p class="empty-section">Offers are temporarily unavailable.</p>';
    $('reviewsGrid').innerHTML = '<p class="empty-section">Reviews are temporarily unavailable.</p>';
  }
}
function selectCategory(categoryId) {
  $('categoryFilter').value = String(categoryId);
  loadProducts();
  $('products').scrollIntoView({ behavior: 'smooth' });
}
function openAuth(mode = 'login') {
  authMode = mode;
  $('authTitle').textContent = mode === 'login' ? 'Welcome back' : 'Create your account';
  $('authSubmit').textContent = mode === 'login' ? 'Login' : 'Register';
  $('nameField').classList.toggle('hidden', mode === 'login');
  $('authMobileField').classList.toggle('hidden', mode === 'login');
  $('authConfirmField').classList.toggle('hidden', mode === 'login');
  $('authName').required = mode === 'register';
  $('authMobile').required = mode === 'register';
  $('authPasswordConfirm').required = mode === 'register';
  $('switchAuth').innerHTML = mode === 'login'
    ? 'New here? <a href="#" id="switchLink">Create an account</a>'
    : 'Already registered? <a href="#" id="switchLink">Login</a>';
  $('authMessage').textContent = '';
  $('authModal').classList.remove('hidden');
  $('switchLink').onclick = event => {
    event.preventDefault();
    openAuth(authMode === 'login' ? 'register' : 'login');
  };
}
async function updateCartCount() {
  if (!token || !user) {
    $('cartCount').textContent = guestCart.reduce((sum, item) => sum + item.quantity, 0);
    return;
  }
  try {
    if (guestCart.length) {
      const adjusted = await mergeGuestCart();
      if (adjusted.length) $('cartMessage').textContent = 'Guest cart quantities were adjusted to current stock.';
    }
    const items = await request('/cart');
    $('cartCount').textContent = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  } catch (error) {
    $('cartMessage').textContent = error.message;
  }
}
async function addToCart(id) {
  try {
    if (token) {
      await request('/cart', { method: 'POST', body: JSON.stringify({ product_id: id, quantity: 1 }) });
    } else {
      const product = await request(`/products/${id}`);
      const item = guestCart.find(entry => entry.product_id === Number(id));
      const quantity = (item?.quantity || 0) + 1;
      if (quantity > Number(product.stock)) throw new Error('Requested quantity exceeds available stock');
      if (item) item.quantity = quantity;
      else guestCart.push({ product_id: Number(id), quantity: 1 });
      saveGuestCart();
    }
    await updateCartCount();
  } catch (error) {
    window.alert(error.message);
  }
}
async function buyNow(id) {
  await addToCart(id);
  await showCart();
}
async function viewProduct(id) {
  try {
    const product = await request(`/products/${id}`);
    const stock = Number(product.stock);
    $('productDetails').innerHTML = `
      <div class="detail-image">${productImage(product.image_url, product.name)}</div>
      <p class="eyebrow">${esc(product.category_name || 'General')}</p>
      <h2>${esc(product.name)}</h2><p>${esc(product.description || '')}</p>
      <p>${priceMarkup(product)} · <b class="${stock ? 'stock-available' : 'stock-empty'}">${stock ? `${stock} in stock` : 'Out of stock'}</b></p>
      <button class="primary" onclick="addToCart(${Number(product.id)})" ${stock < 1 ? 'disabled' : ''}>Add to Cart</button>`;
    $('productModal').classList.remove('hidden');
  } catch (error) {
    window.alert(error.message);
  }
}
async function loadGuestCart() {
  const fetched = await Promise.all(guestCart.map(async entry => {
    try {
      const product = await request(`/products/${entry.product_id}`);
      return {
        id: entry.product_id,
        product_id: entry.product_id,
        quantity: entry.quantity,
        name: product.name,
        price: Number(product.price),
        compare_at_price: product.compare_at_price,
        image_url: product.image_url,
        stock: Number(product.stock),
        subtotal: Number(product.price) * entry.quantity
      };
    } catch (error) {
      if (error.message === 'Product not found') return null;
      throw error;
    }
  }));
  const available = fetched.filter(Boolean);
  if (available.length !== guestCart.length) {
    guestCart = available.map(item => ({ product_id: item.product_id, quantity: item.quantity }));
    saveGuestCart();
  }
  return available;
}
async function mergeGuestCart() {
  if (!token || !guestCart.length) return [];
  const response = await request('/cart/merge', { method: 'POST', body: JSON.stringify({ items: guestCart }) });
  guestCart = [];
  saveGuestCart();
  return response.adjusted || [];
}
function renderCart() {
  $('cartItems').innerHTML = cart.map(item => `
    <div class="cart-row">
      <div class="cart-product">${productImage(item.image_url, item.name)}<span>${esc(item.name)}<small>${money(item.price)} each · ${Number(item.stock)} in stock</small></span></div>
      <div class="quantity-control">
        <button aria-label="Decrease quantity" onclick="changeQuantity(${item.id},${Number(item.quantity) - 1})" ${Number(item.quantity) <= 1 ? 'disabled' : ''}>−</button>
        <b>${Number(item.quantity)}</b>
        <button aria-label="Increase quantity" onclick="changeQuantity(${item.id},${Number(item.quantity) + 1})" ${Number(item.quantity) >= Number(item.stock) ? 'disabled' : ''}>+</button>
      </div>
      <b>${money(item.subtotal)}</b><button class="remove-cart" onclick="removeCart(${item.id})">Remove</button>
    </div>`).join('') || '<p>Your cart is empty.</p>';
  const total = cart.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const subtotal = cart.reduce((sum, item) => {
    const regular = Number(item.compare_at_price) > Number(item.price) ? Number(item.compare_at_price) : Number(item.price);
    return sum + regular * Number(item.quantity);
  }, 0);
  $('cartSubtotal').textContent = money(subtotal);
  $('cartDiscount').textContent = `− ${money(subtotal - total)}`;
  $('cartDelivery').textContent = money(0);
  $('cartTotal').textContent = money(total);
  $('checkoutTotal').textContent = money(total);
  $('checkoutForm').classList.toggle('hidden', !cart.length || cartMode !== 'account');
  $('guestCheckoutBtn').classList.toggle('hidden', !cart.length || Boolean(token));
  $('retryMergeBtn').classList.toggle('hidden', !cart.length || cartMode !== 'merge-error');
  $('cartCount').textContent = cart.reduce((sum, item) => sum + Number(item.quantity), 0);
}
async function showCart() {
  try {
    let adjusted = [];
    if (token && guestCart.length) {
      try {
        adjusted = await mergeGuestCart();
        cartMode = 'account';
      } catch (error) {
        cart = await loadGuestCart();
        cartMode = 'merge-error';
        renderCart();
        $('cartMessage').textContent = `Could not merge your guest cart: ${error.message}. Retry when connected.`;
        $('cartModal').classList.remove('hidden');
        return;
      }
    }
    if (token) {
      cartMode = 'account';
      cart = await request('/cart');
    } else {
      cartMode = 'guest';
      cart = await loadGuestCart();
    }
    renderCart();
    $('cartMessage').textContent = adjusted.length ? 'Some quantities were adjusted to match current stock.' : '';
    if (!$('checkoutName').value) $('checkoutName').value = user?.name || '';
    if (!$('checkoutEmail').value) $('checkoutEmail').value = user?.email || '';
    if (!$('checkoutMobile').value) $('checkoutMobile').value = user?.mobile || '';
    if (!$('checkoutCountry').value) $('checkoutCountry').value = 'India';
    $('cartModal').classList.remove('hidden');
  } catch (error) {
    window.alert(error.message);
  }
}
async function changeQuantity(id, quantity) {
  if (quantity < 1) return;
  try {
    if (cartMode === 'guest' || cartMode === 'merge-error') {
      const item = guestCart.find(entry => entry.product_id === Number(id));
      if (!item) return;
      const product = await request(`/products/${id}`);
      if (quantity > Number(product.stock)) throw new Error('Requested quantity exceeds available stock');
      item.quantity = quantity;
      saveGuestCart();
      cart = await loadGuestCart();
    } else {
      await request(`/cart/${id}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
      cart = await request('/cart');
    }
    renderCart();
  } catch (error) {
    $('cartMessage').textContent = error.message;
  }
}
async function removeCart(id) {
  try {
    if (cartMode === 'guest' || cartMode === 'merge-error') {
      guestCart = guestCart.filter(item => item.product_id !== Number(id));
      saveGuestCart();
      cart = await loadGuestCart();
    } else {
      await request(`/cart/${id}`, { method: 'DELETE' });
      cart = await request('/cart');
    }
    renderCart();
  } catch (error) {
    $('cartMessage').textContent = error.message;
  }
}
async function showOrders() {
  try {
    const orders = await request('/orders/my-orders');
    $('orderHistory').innerHTML = orders.map(order => `
      <article class="history-order">
        <div><b>${esc(order.order_code)}</b><span>${new Date(order.created_at).toLocaleString()}</span></div>
        <p>${esc(order.products || 'Order items')} · ${money(order.total_amount)} · Payment ${esc(order.payment_status || 'Pending')}</p>
        <div><span class="status-badge">${esc(order.status)}</span><button class="nav-btn" onclick="viewOrder('${esc(order.order_code)}')">View details</button></div>
      </article>`).join('') || '<p>You have not placed any orders yet.</p>';
    $('ordersModal').classList.remove('hidden');
  } catch (error) {
    window.alert(error.message);
  }
}
async function viewOrder(orderCode) {
  try {
    const order = await request(`/orders/${encodeURIComponent(orderCode)}`);
    $('orderHistory').innerHTML = `
      <button class="nav-btn" id="backOrders">← All orders</button><h3>${esc(order.order_code)}</h3>
      <p>Status: <span class="status-badge">${esc(order.status)}</span></p>
      <p>Placed ${new Date(order.created_at).toLocaleString()}</p>
      <div class="order-detail-items">${order.items.map(item => `<div>${esc(item.name)} × ${Number(item.quantity)} @ ${money(item.unit_price)} <b>${money(item.payable_subtotal)}</b></div>`).join('')}</div>
      <p>Delivery address: ${esc(order.shipping_address)}</p>
      <p>Payment: ${esc(order.payment_method)} · ${esc(order.payment_status || 'Pending')}</p>
      <div class="order-totals"><div><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
        <div><span>Discount</span><b>− ${money(order.discount_amount)}</b></div>
        <div><span>Delivery charges</span><b>${money(order.delivery_charges)}</b></div>
        <div class="grand-total"><span>Final payable amount</span><b>${money(order.total_amount)}</b></div></div>
      <h4>Status history</h4><ol class="status-history">${(order.history || []).map(entry =>
        `<li><b>${esc(entry.status)}</b><span>${new Date(entry.created_at).toLocaleString()}</span></li>`).join('')}</ol>`;
    $('backOrders').onclick = showOrders;
  } catch (error) {
    window.alert(error.message);
  }
}

$('loginOpen').onclick = event => {
  event.preventDefault();
  location.href = 'account.html';
};
$('searchBtn').onclick = () => {
  $('searchInputInline').value = $('searchInput').value;
  loadProducts();
  $('products').scrollIntoView({ behavior: 'smooth' });
};
$('filterBtn').onclick = loadProducts;
$('searchInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('searchBtn').click();
});
$('searchInputInline').addEventListener('input', () => { $('searchInput').value = $('searchInputInline').value; });
$('searchInputInline').addEventListener('keydown', event => { if (event.key === 'Enter') loadProducts(); });
$('categoryFilter').onchange = loadProducts;
$('sortFilter').onchange = loadProducts;
$('previousPage').onclick = () => { if (productPage > 1) { productPage -= 1; loadProducts(false); } };
$('nextPage').onclick = () => { if (productPage < totalProductPages) { productPage += 1; loadProducts(false); } };
$('cartOpen').onclick = showCart;
$('guestCheckoutBtn').onclick = () => {
  sessionStorage.setItem('checkout_after_login', '1');
  location.href = 'account.html?return=checkout';
};
$('retryMergeBtn').onclick = showCart;
$('ordersOpen').onclick = showOrders;
$('logoutBtn').onclick = () => {
  localStorage.removeItem('shop_token');
  localStorage.removeItem('shop_user');
  token = '';
  user = null;
  cartMode = 'guest';
  cart = [];
  syncAccount();
  updateCartCount();
};
document.querySelectorAll('[data-close]').forEach(button => {
  button.onclick = () => $(button.dataset.close).classList.add('hidden');
});
$('authForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const payload = { email: $('authEmail').value, password: $('authPassword').value };
    if (authMode === 'register') {
      payload.name = $('authName').value;
      payload.mobile = $('authMobile').value;
      payload.password_confirmation = $('authPasswordConfirm').value;
      if (payload.password !== payload.password_confirmation) throw new Error('Passwords do not match');
    }
    const result = await request('/auth/' + authMode, { method: 'POST', body: JSON.stringify(payload) });
    if (authMode === 'register') {
      openAuth('login');
      $('authMessage').textContent = 'Account created. Please log in to continue checkout.';
      return;
    }
    token = result.token;
    user = result.user;
    localStorage.setItem('shop_token', token);
    localStorage.setItem('shop_user', JSON.stringify(user));
    syncAccount();
    const shouldResumeCheckout = pendingCheckout;
    pendingCheckout = false;
    $('authModal').classList.add('hidden');
    try {
      const adjusted = await mergeGuestCart();
      await updateCartCount();
      if (shouldResumeCheckout) {
        await showCart();
        $('cartMessage').textContent = adjusted.length
          ? 'Sign-in complete. Some guest-cart quantities were adjusted to current stock; review your order.'
          : 'Sign-in complete. Review your order and enter delivery details.';
      }
    } catch (error) {
      if (shouldResumeCheckout) {
        await showCart();
        $('cartMessage').textContent = `Sign-in succeeded, but cart sync failed: ${error.message}. Retry cart sync before checkout.`;
      } else {
        window.alert(`Signed in, but guest cart sync failed: ${error.message}`);
      }
    }
  } catch (error) {
    $('authMessage').textContent = error.message;
  }
};
$('checkoutForm').onsubmit = async event => {
  event.preventDefault();
  if (!cart.length || cartMode !== 'account') return;
  const form = event.currentTarget;
  try {
    const result = await request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        name: $('checkoutName').value.trim(),
        email: $('checkoutEmail').value.trim(),
        mobile: $('checkoutMobile').value.trim(),
        address: {
          house: $('checkoutHouse').value.trim(),
          street: $('checkoutStreet').value.trim(),
          landmark: $('checkoutLandmark').value.trim(),
          city: $('checkoutCity').value.trim(),
          state: $('checkoutState').value.trim(),
          postal_code: $('checkoutPin').value.trim(),
          country: $('checkoutCountry').value.trim(),
          delivery_instructions: $('checkoutInstructions').value.trim()
        },
        payment_method: 'cod'
      })
    });
    cart = [];
    guestCart = [];
    saveGuestCart();
    form.reset();
    location.href = `order-confirmation.html?order=${encodeURIComponent(result.order_id)}`;
  } catch (error) {
    $('cartMessage').textContent = error.message;
  }
};
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && !event.target.dataset.fallback) {
    event.target.dataset.fallback = 'true';
    const placeholder = document.createElement('span');
    placeholder.className = 'product-placeholder';
    placeholder.textContent = '🎧';
    event.target.replaceWith(placeholder);
  }
}, true);
$('searchInputInline').value = $('searchInput').value;
syncAccount();
loadCategories();
loadProducts();
loadHomeSections();
updateCartCount();
let promoIndex = 0;
const promos = [...document.querySelectorAll('.promo-item')];
const promoDots = [...document.querySelectorAll('.promo-dots i')];
if (promos.length > 1) {
  window.setInterval(() => {
    promos[promoIndex].classList.remove('active');
    promoDots[promoIndex].classList.remove('active');
    promoIndex = (promoIndex + 1) % promos.length;
    promos[promoIndex].classList.add('active');
    promoDots[promoIndex].classList.add('active');
  }, 4200);
}
const pageParams = new URLSearchParams(location.search);
if (pageParams.get('checkout') === '1' && token) {
  sessionStorage.removeItem('checkout_after_login');
  showCart().then(() => {
    const adjusted = sessionStorage.getItem('shop_cart_adjusted') === '1';
    sessionStorage.removeItem('shop_cart_adjusted');
    $('cartMessage').textContent = adjusted
      ? 'Sign-in complete. Guest-cart quantities were adjusted to current stock; review your order.'
      : 'Sign-in complete. Review your order and enter delivery details.';
  });
}
if (pageParams.get('orders') === '1' && token && user?.role !== 'admin') showOrders();
