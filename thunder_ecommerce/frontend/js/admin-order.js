const API = 'http://localhost:5000/api';
const token = localStorage.getItem('shop_token');
const orderCode = new URLSearchParams(location.search).get('order');
const statuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
const $ = id => document.getElementById(id);
const money = value => '₹' + Number(value || 0).toFixed(2);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
  return data;
}
function addressText(order) {
  return [
    order.address_house, order.address_street, order.address_landmark,
    order.address_city, order.address_state, order.address_postal_code, order.address_country
  ].filter(Boolean).join(', ') || order.shipping_address;
}
function renderOrder(order) {
  const rows = order.items.map(item => `
    <tr><td>${esc(item.name)}</td><td>${Number(item.quantity)}</td><td>${money(item.unit_price)}</td>
      <td>${money(item.discount_amount)}</td><td>${money(item.payable_subtotal)}</td></tr>`).join('');
  const history = order.history.map(entry => `
    <li><b>${esc(entry.status)}</b><span>${new Date(entry.created_at).toLocaleString()}</span>
      ${entry.note ? `<small>${esc(entry.note)}</small>` : ''}</li>`).join('');
  $('adminOrderDetails').innerHTML = `
    <article class="panel-card">
      <div class="order-title-row"><div><p class="eyebrow">ORDER ID</p><h2>${esc(order.order_code)}</h2></div>
        <span class="status-badge">${esc(order.status)}</span></div>
      <div class="order-customer-grid">
        <p><b>Customer</b><br>${esc(order.customer_name)}</p><p><b>Email</b><br>${esc(order.email)}</p>
        <p><b>Mobile</b><br>${esc(order.mobile)}</p><p><b>Order date</b><br>${new Date(order.created_at).toLocaleString()}</p>
        <p><b>Delivery address</b><br>${esc(addressText(order))}</p>
        <p><b>Delivery instructions</b><br>${esc(order.delivery_instructions || '—')}</p>
        <p><b>Payment method</b><br>${esc(order.payment_method)}</p>
        <p><b>Payment status</b><br>${esc(order.payment_status || 'Pending')}</p>
      </div>
    </article>
    <article class="panel-card"><h2>Purchased products</h2><div class="table-wrap">
      <table class="admin-table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Discount</th><th>Line total</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="order-totals">
        <div><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
        <div><span>Discount</span><b>− ${money(order.discount_amount)}</b></div>
        <div><span>Delivery charges</span><b>${money(order.delivery_charges)}</b></div>
        <div class="grand-total"><span>Final payable amount</span><b>${money(order.total_amount)}</b></div>
      </div>
    </article>
    <article class="panel-card"><h2>Status history</h2>
      <ol class="status-history">${history || '<li>No status history available.</li>'}</ol>
      <form id="orderStatusForm" class="inline-form"><label>Update status
        <select name="status">${statuses.map(status => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}</select>
      </label><button class="primary" type="submit">Save status</button></form>
    </article>`;
  $('orderStatusForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await api(`/admin/orders/${encodeURIComponent(order.order_code)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: event.currentTarget.elements.status.value })
      });
      await loadOrder();
      $('orderAdminMessage').textContent = 'Order status updated.';
      $('orderAdminMessage').classList.remove('error-message');
    } catch (error) {
      $('orderAdminMessage').textContent = error.message;
      $('orderAdminMessage').classList.add('error-message');
    }
  };
}
async function loadOrder() {
  if (!orderCode) throw new Error('Order ID is missing from the URL.');
  const currentUser = await api('/auth/me');
  if (!currentUser || currentUser.role !== 'admin') {
    localStorage.removeItem('shop_token');
    localStorage.removeItem('shop_user');
    location.href = 'account.html';
    return;
  }
  renderOrder(await api(`/admin/orders/${encodeURIComponent(orderCode)}`));
}
$('orderAdminLogout').onclick = () => {
  localStorage.removeItem('shop_token');
  localStorage.removeItem('shop_user');
  location.href = 'index.html';
};
loadOrder().catch(error => {
  $('orderAdminMessage').textContent = error.message;
  $('orderAdminMessage').classList.add('error-message');
  if (/auth|admin/i.test(error.message)) setTimeout(() => { location.href = 'account.html'; }, 1000);
});
