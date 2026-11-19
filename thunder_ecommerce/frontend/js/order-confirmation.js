const API = 'http://localhost:5000/api';
const token = localStorage.getItem('shop_token');
const orderCode = new URLSearchParams(location.search).get('order');
const $ = id => document.getElementById(id);
const money = value => '₹' + Number(value || 0).toFixed(2);

async function loadConfirmation() {
  if (!token || !orderCode) {
    $('confirmationError').textContent = 'Sign in to view this order confirmation.';
    return;
  }
  try {
    const response = await fetch(`${API}/orders/${encodeURIComponent(orderCode)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const order = await response.json();
    if (!response.ok) throw new Error(order.message || 'Could not load this order');
    $('confirmationOrder').textContent = order.order_code;
    $('confirmationStatus').textContent = order.status;
    $('confirmationPayment').textContent = `${order.payment_status || 'Pending'} · ${order.payment_method}`;
    $('confirmationTotal').textContent = money(order.total_amount);
    $('confirmationItems').replaceChildren();
    for (const item of order.items) {
      const row = document.createElement('div');
      const name = document.createElement('span');
      const total = document.createElement('b');
      name.textContent = `${item.name} × ${Number(item.quantity)}`;
      total.textContent = money(item.payable_subtotal);
      row.append(name, total);
      $('confirmationItems').append(row);
    }
  } catch (error) {
    $('confirmationError').textContent = error.message;
  }
}
loadConfirmation();
