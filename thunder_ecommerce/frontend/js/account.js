const API = 'http://localhost:5000/api';
const GUEST_CART_KEY = 'shop_guest_cart';
const $ = id => document.getElementById(id);
let mode = 'login';
const params = new URLSearchParams(location.search);
const checkoutReturn = params.get('return') === 'checkout' || sessionStorage.getItem('checkout_after_login') === '1';

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';
  $('accountEyebrow').textContent = registering ? 'JOIN THUNDER' : 'YOUR ACCOUNT';
  $('accountTitle').textContent = registering ? 'Create your account' : 'Welcome back';
  $('accountSubtitle').textContent = registering
    ? 'Create an account to finish checkout and track your orders.'
    : checkoutReturn ? 'Sign in to continue to your secure checkout.' : 'Sign in to view your account and orders.';
  $('accountSubmit').textContent = registering ? 'Create account' : 'Sign in';
  $('accountNameField').classList.toggle('hidden', !registering);
  $('accountMobileField').classList.toggle('hidden', !registering);
  $('accountConfirmField').classList.toggle('hidden', !registering);
  $('accountName').required = registering;
  $('accountMobile').required = registering;
  $('accountConfirm').required = registering;
  $('accountSwitch').innerHTML = registering
    ? 'Already have an account? <a href="#" id="switchAccount">Sign in</a>'
    : 'New to Thunder? <a href="#" id="switchAccount">Create an account</a>';
  $('switchAccount').onclick = event => {
    event.preventDefault();
    setMode(registering ? 'login' : 'register');
  };
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(API + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

async function mergeGuestCart(token) {
  let guestItems;
  try {
    guestItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
  } catch {
    localStorage.removeItem(GUEST_CART_KEY);
    guestItems = [];
  }
  if (!Array.isArray(guestItems) || !guestItems.length) return;
  const response = await fetch(`${API}/cart/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: guestItems })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not merge your guest cart');
  localStorage.removeItem(GUEST_CART_KEY);
  if (data.adjusted?.length) sessionStorage.setItem('shop_cart_adjusted', '1');
}

$('accountForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('accountMessage').textContent = '';
  $('accountMessage').classList.remove('error-message');
  if (mode === 'register' && $('accountPassword').value !== $('accountConfirm').value) {
    $('accountMessage').textContent = 'Passwords do not match.';
    return;
  }
  const payload = {
    email: $('accountEmail').value.trim(),
    password: $('accountPassword').value
  };
  if (mode === 'register') {
    payload.name = $('accountName').value.trim();
    payload.mobile = $('accountMobile').value.trim();
    payload.password_confirmation = $('accountConfirm').value;
  }
  $('accountSubmit').disabled = true;
  try {
    const result = await request(`/auth/${mode === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (mode === 'register') {
      $('accountMessage').textContent = 'Account created successfully. Sign in to continue.';
      $('accountEmail').value = payload.email;
      $('accountPassword').value = '';
      setMode('login');
      return;
    }
    localStorage.setItem('shop_token', result.token);
    localStorage.setItem('shop_user', JSON.stringify(result.user));
    await mergeGuestCart(result.token);
    if (result.user.role === 'admin') {
      location.href = 'admin.html';
      return;
    }
    if (checkoutReturn) {
      sessionStorage.setItem('checkout_after_login', '1');
      location.href = 'index.html?checkout=1';
      return;
    }
    location.href = 'index.html';
  } catch (error) {
    $('accountMessage').textContent = error.message;
    $('accountMessage').classList.add('error-message');
  } finally {
    $('accountSubmit').disabled = false;
  }
});

setMode('login');
