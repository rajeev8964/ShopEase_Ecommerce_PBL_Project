const API = 'http://localhost:5000/api';
const token = localStorage.getItem('shop_token');
const $ = id => document.getElementById(id);
let products = [];
let categories = [];
const money = value => '₹' + Number(value || 0).toFixed(2);
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
async function api(path, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(API + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
  return data;
}
function showMessage(message, isError = false) {
  $('adminMessage').textContent = message;
  $('adminMessage').classList.toggle('error-message', isError);
}
function logout() {
  localStorage.removeItem('shop_token');
  localStorage.removeItem('shop_user');
  location.href = '../index.html';
}
function setSection(name) {
  document.querySelectorAll('.admin-section').forEach(section => {
    section.classList.toggle('hidden', section.id !== `section-${name}`);
  });
  document.querySelectorAll('#adminNav [data-section]').forEach(button => {
    button.classList.toggle('active', button.dataset.section === name);
  });
  $('pageTitle').textContent = name === 'reports' ? 'Sales Reports' : name[0].toUpperCase() + name.slice(1);
}
function drawBars(elementId, values, formatValue) {
  const target = $(elementId);
  if (!values.length) {
    target.innerHTML = '<p class="empty-chart">No sales data yet.</p>';
    return;
  }
  const max = Math.max(...values.map(item => Number(item.value)), 1);
  target.innerHTML = values.map(item => `
    <div class="bar-item"><div class="bar-caption"><span>${esc(item.label)}</span><b>${esc(formatValue(item.value))}</b></div>
      <div class="bar-track"><span style="width:${Math.max(3, Number(item.value) / max * 100)}%"></span></div></div>`).join('');
}
function renderCharts(charts) {
  drawBars('dailyChart', charts.dailySales, money);
  drawBars('monthlyChart', charts.monthlyRevenue, money);
  drawBars('bestSellersChart', charts.bestSellers.map(item => ({ label: item.name, value: item.quantity })), value => `${value} sold`);
  drawBars('dailyReportChart', charts.dailySales, money);
  drawBars('monthlyReportChart', charts.monthlyRevenue, money);
  drawBars('bestReportChart', charts.bestSellers.map(item => ({ label: item.name, value: item.quantity })), value => `${value} sold`);
}
async function loadDashboard() {
  const data = await api('/admin/dashboard');
  $('ordersStat').textContent = data.orders;
  $('customersStat').textContent = data.customers;
  $('productsStat').textContent = data.products;
  $('revenueStat').textContent = money(data.revenue);
  $('pendingStat').textContent = data.pending;
  $('deliveredStat').textContent = data.delivered;
  $('cancelledStat').textContent = data.cancelled;
  $('lowStockStat').textContent = data.low_stock;
  renderCharts(data.charts);
}
async function loadCategories() {
  categories = await api('/categories');
  $('productCategory').innerHTML = '<option value="">Uncategorized</option>' +
    categories.map(category => `<option value="${category.id}">${esc(category.name)}</option>`).join('');
  $('categoryRows').innerHTML = categories.map(category => `
    <tr><td>${esc(category.name)}</td><td>
      <button class="table-action" data-category-edit="${Number(category.id)}">Edit</button>
      <button class="table-action danger" data-category-delete="${Number(category.id)}">Delete</button>
    </td></tr>`).join('') || '<tr><td colspan="2">No categories yet.</td></tr>';
}
async function loadProducts() {
  const data = await api('/admin/products');
  products = data.items;
  const visibleProducts = $('productStockFilter').value === 'low'
    ? products.filter(product => Number(product.stock) <= 5 && Number(product.is_active))
    : products;
  $('productRows').innerHTML = visibleProducts.map(product => `
    <tr><td>${esc(product.name)}</td><td>${money(product.price)}${Number(product.compare_at_price) > Number(product.price) ? ` <del>${money(product.compare_at_price)}</del>` : ''}</td><td>${Number(product.stock)}${Number(product.stock) <= 5 && Number(product.is_active) ? ' <span class="low-stock-badge">Low stock</span>' : ''}</td>
      <td>${esc(product.category_name || '—')}</td><td><span class="status-badge ${Number(product.is_active) ? '' : 'inactive-badge'}">${Number(product.is_active) ? 'Active' : 'Inactive'}</span></td><td>
        <button class="table-action" data-product-edit="${Number(product.id)}">Edit</button>
        <button class="table-action danger" data-product-delete="${Number(product.id)}">Delete</button>
      </td></tr>`      ).join('') || '<tr><td colspan="6">No products yet.</td></tr>';
}
async function loadOrders() {
      const orders = await api('/admin/orders');
  $('orderRows').innerHTML = orders.map(order => `
    <tr><td>${esc(order.order_code)}</td><td>${new Date(order.created_at).toLocaleString()}</td>
      <td>${esc(order.customer_name)}</td><td>${esc(order.mobile)}</td><td>${esc(order.email)}</td>
      <td>${esc([order.address_house, order.address_street, order.address_landmark, order.address_city, order.address_state, order.address_postal_code, order.address_country].filter(Boolean).join(', ') || order.shipping_address)}</td>
      <td>${esc(order.products || '—')}</td><td>${esc(order.quantities || '—')}</td><td>${esc(order.unit_prices || '—')}</td>
      <td>${money(order.subtotal)}</td><td>${money(order.discount_amount)}</td><td>${money(order.delivery_charges)}</td>
      <td><b>${money(order.total_amount)}</b></td><td>${esc(order.payment_method)}</td>
      <td>${esc(order.payment_status || 'Pending')}</td><td><span class="status-badge">${esc(order.status)}</span></td>
      <td><a class="table-action" href="order.html?order=${encodeURIComponent(order.order_code)}">View Order</a></td></tr>`
  ).join('') || '<tr><td colspan="17">No customer orders yet.</td></tr>';
}
async function loadCustomers() {
  const query = new URLSearchParams();
  if ($('customerSearch').value.trim()) query.set('search', $('customerSearch').value.trim());
  const customers = await api('/admin/customers?' + query);
  $('customerRows').innerHTML = customers.map(customer => `
    <tr><td>${Number(customer.id)}</td><td>${esc(customer.name)}</td><td>${esc(customer.mobile || '—')}</td><td>${esc(customer.email)}</td>
      <td>${new Date(customer.created_at).toLocaleDateString()}</td>
      <td>${Number(customer.orders)}</td><td>${money(customer.spent)}</td>
      <td>${customer.last_order_date ? new Date(customer.last_order_date).toLocaleString() : '—'}</td></tr>`
  ).join('') || '<tr><td colspan="8">No customers found.</td></tr>';
}
function resetProductForm() {
  $('productForm').reset();
  $('productForm').elements.id.value = '';
  $('productFormTitle').textContent = 'Add product';
  $('saveProduct').textContent = 'Save product';
  $('cancelProductEdit').classList.add('hidden');
}
function editProduct(id) {
  const product = products.find(item => Number(item.id) === id);
  if (!product) return;
  const form = $('productForm');
  form.elements.id.value = product.id;
  form.elements.name.value = product.name;
  form.elements.price.value = product.price;
  form.elements.compare_at_price.value = product.compare_at_price || '';
  form.elements.stock.value = product.stock;
  form.elements.category_id.value = product.category_id || '';
  form.elements.description.value = product.description || '';
  form.elements.is_active.checked = Number(product.is_active) === 1;
  $('productFormTitle').textContent = 'Edit product';
  $('saveProduct').textContent = 'Update product';
  $('cancelProductEdit').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteProduct(id) {
  if (!window.confirm('Delete this product? Products with order history cannot be deleted.')) return;
  try {
    await api(`/admin/products/${id}`, { method: 'DELETE' });
    await Promise.all([loadProducts(), loadDashboard()]);
    showMessage('Product deleted.');
  } catch (error) {
    showMessage(error.message, true);
  }
}
document.querySelectorAll('#adminNav [data-section]').forEach(button => {
  button.onclick = () => {
    setSection(button.dataset.section);
    showMessage('');
  };
});
$('adminLogout').onclick = logout;
$('cancelProductEdit').onclick = resetProductForm;
$('productStockFilter').onchange = loadProducts;
$('customerSearchForm').onsubmit = async event => {
  event.preventDefault();
  try { await loadCustomers(); } catch (error) { showMessage(error.message, true); }
};
$('productForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const data = new FormData(form);
  data.set('is_active', form.elements.is_active.checked ? '1' : '0');
  try {
    await api(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PUT' : 'POST', body: data });
    resetProductForm();
    await Promise.all([loadProducts(), loadDashboard()]);
    showMessage(id ? 'Product updated.' : 'Product added.');
  } catch (error) {
    showMessage(error.message, true);
  }
};
$('categoryForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: form.elements.name.value.trim() })
    });
    form.reset();
    await loadCategories();
    showMessage('Category added.');
  } catch (error) {
    showMessage(error.message, true);
  }
};
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-product-edit],[data-product-delete],[data-category-edit],[data-category-delete]');
  if (!target) return;
  if (target.dataset.productEdit) editProduct(Number(target.dataset.productEdit));
  if (target.dataset.productDelete) await deleteProduct(Number(target.dataset.productDelete));
  if (target.dataset.categoryEdit) {
    const category = categories.find(item => Number(item.id) === Number(target.dataset.categoryEdit));
    const name = window.prompt('Edit category name:', category?.name || '');
    if (name === null) return;
    try {
      await api(`/categories/${category.id}`, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) });
      await loadCategories();
      showMessage('Category updated.');
    } catch (error) { showMessage(error.message, true); }
  }
  if (target.dataset.categoryDelete) {
    if (!window.confirm('Delete this category? Products will remain but become uncategorized.')) return;
    try {
      await api(`/categories/${target.dataset.categoryDelete}`, { method: 'DELETE' });
      await Promise.all([loadCategories(), loadProducts()]);
      showMessage('Category deleted.');
    } catch (error) { showMessage(error.message, true); }
  }
});

async function init() {
  if (!token) return logout();
  try {
    const currentUser = await api('/auth/me');
    if (!currentUser || currentUser.role !== 'admin') return logout();
    await Promise.all([loadDashboard(), loadCategories(), loadProducts(), loadOrders(), loadCustomers()]);
  } catch (error) {
    showMessage(error.message, true);
    if (/auth|admin/i.test(error.message)) setTimeout(logout, 1000);
  }
}
init();
