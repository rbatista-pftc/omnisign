/* ============================
   OmniSign App-Only Auth
   ============================ */

function isRunningAsApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||                // iOS
    document.referrer.startsWith('android-app://') ||      // Android
    localStorage.getItem('omnisign_force_app') === 'yes'   // first-launch fix
  );
}

const IS_APP = isRunningAsApp();
const DEFAULT_TIMEOUT = 30;
function getTimeout() {
  return Number(localStorage.getItem('omnisign_timeout')) || DEFAULT_TIMEOUT;
}
function setTimeoutValue(val) {
  localStorage.setItem('omnisign_timeout', Number(val));
}

/* ---------- Helpers ---------- */

function isInitialized() {
  return localStorage.getItem('omnisign_initialized') === 'yes';
}

function setInitialized() {
  localStorage.setItem('omnisign_initialized', 'yes');
}

function getProfile() {
  return JSON.parse(localStorage.getItem('omnisign_profile'));
}

function setProfile(data) {
  localStorage.setItem('omnisign_profile', JSON.stringify(data));
}

function setLastActive() {
  localStorage.setItem('omnisign_last_active', Date.now().toString());
}

function isLocked() {
  const last = localStorage.getItem('omnisign_last_active');
  if (!last) return false;
  return Date.now() - Number(last) > getTimeout() * 60 * 1000;
}

function mountProfileButton() {
  const btn = document.createElement('button');
  btn.id = 'os-profile-btn';
  btn.innerText = '👤';
  btn.onclick = showProfile;
  document.body.appendChild(btn);
}

/* ---------- PIN Hash (simple, not bank-level) ---------- */

async function hashPin(pin) {
  const msgUint8 = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------- UI Mount ---------- */

function mountOverlay(html) {
  const overlay = document.createElement('div');
  overlay.id = 'omnisign-app-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

function removeOverlay() {
  document.getElementById('omnisign-app-overlay')?.remove();
}

/* ---------- Onboarding ---------- */

function showOnboarding() {
  mountOverlay(`
    <div class="os-modal">
      <h2>Welcome to OmniSign</h2>
      <p>This app saves your info for faster bookings.</p>

      <input id="os-company" placeholder="Company Name">
      <input id="os-name" placeholder="Full Name">
      <input id="os-phone" placeholder="Phone Number">
      <input id="os-email" placeholder="Email">
      <hr>
      <h4 style="margin-top:10px;">Secure Your App</h4>
      <p style="font-size:14px;opacity:.8;">
      Set a 4-digit PIN to lock and unlock the OmniSign app.</p>
      <input id="os-pin" type="password" inputmode="numeric" maxlength="4" placeholder="4-Digit PIN">
      <input id="os-pin-confirm" type="password" inputmode="numeric" maxlength="4" placeholder="Confirm PIN">

      <button id="os-save">Save & Continue</button>
    </div>
  `);

  document.getElementById('os-save').onclick = async () => {
    const pin = document.getElementById('os-pin').value;
    const confirm = document.getElementById('os-pin-confirm').value;

    if (pin.length !== 4 || pin !== confirm) {
      alert('PIN must be 4 digits and match.');
      return;
    }

    const profile = {
      company: document.getElementById('os-company').value,
      fullName: document.getElementById('os-name').value,
      phone: document.getElementById('os-phone').value,
      email: document.getElementById('os-email').value
    };

    localStorage.setItem('omnisign_pin_hash', await hashPin(pin));
    setProfile(profile);
    requestNotifications();   
    setLastActive();
    setInitialized(); 
    localStorage.removeItem('omnisign_force_app');
    removeOverlay();
    prefillBooking(profile);
  };
}

/* ---------- Lock Screen ---------- */

function showLock() {
  mountOverlay(`
    <div class="os-modal">
      <h2>Enter PIN</h2>
      <input id="os-unlock-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••">
      <button id="os-unlock">Unlock</button>
      <button id="os-forgot" style="background:none;border:none;color:#555;">
      Forgot PIN?
      </button>
    </div>
  `);

  document.getElementById('os-unlock').onclick = async () => {
    const entered = document.getElementById('os-unlock-pin').value;
    const stored = localStorage.getItem('omnisign_pin_hash');

    if (await hashPin(entered) === stored) {
      setLastActive();
      removeOverlay();
      prefillBooking(getProfile());
    } else {
      alert('Incorrect PIN');
    }
  };

 document.getElementById('os-forgot').onclick = () => {
  if (!confirm(
    'Resetting the PIN will remove your saved info on this device. Continue?'
  )) return;
  resetApp(); // you already have this function
 };
}

/* ---------- Show Profile ------------- */

function showProfile() {
  const profile = getProfile();
  mountOverlay(`
    <div class="os-modal">
      <h2>Your Profile</h2>

      <input id="os-p-company" value="${profile.company}">
      <input id="os-p-name" value="${profile.fullName}">
      <input id="os-p-phone" value="${profile.phone}">
      <input id="os-p-email" value="${profile.email}">

      <label>Auto-lock after (minutes)</label>
      <input id="os-timeout" type="number" min="5" value="${getTimeout()}">

      <input id="os-new-pin" type="password" inputmode="numeric" maxlength="4" placeholder="New PIN (optional)">

      <button id="os-save-profile">Save</button>
      <button id="os-reset">Reset App</button>
      <button onclick="removeOverlay()">Close</button>
    </div>
  `);
  document.getElementById('os-save-profile').onclick = async () => {
    const updated = {
      company: document.getElementById('os-p-company').value,
      fullName: document.getElementById('os-p-name').value,
      phone: document.getElementById('os-p-phone').value,
      email: document.getElementById('os-p-email').value
    };

    setProfile(updated);
    const newPin = document.getElementById('os-new-pin').value;
    if (newPin.length === 4) {
      localStorage.setItem('omnisign_pin_hash', await hashPin(newPin));
    }
    setTimeoutValue(document.getElementById('os-timeout').value);
    removeOverlay();
    prefillBooking(updated);
  };
  document.getElementById('os-reset').onclick = resetApp;
}

/* ---------- Prefill Booking ---------- */

function prefillBooking(profile) {
  if (!profile) return;
  const company = document.querySelector('[name="company"]');
  if (company) company.value = profile.company;
  const name = document.querySelector('[name="name"]');
  if (name) name.value = profile.fullName;
  const phone = document.querySelector('[name="phone"]');
  if (phone) phone.value = profile.phone;
  const email = document.querySelector('[name="email"]');
  if (email) email.value = profile.email;
}

/* ---------- Init ---------- */

document.addEventListener('DOMContentLoaded', () => {
  if (!IS_APP) return;
  localStorage.setItem('omnisign_force_app', 'yes'); // 
  
  const profile = getProfile();

if (!isInitialized()) {
  showOnboarding();
} else if (!profile) {
  showOnboarding();
} else if (isLocked()) {
  showLock();
} else {
  setLastActive();
  prefillBooking(profile);
}
  mountProfileButton();  
  ['click', 'keydown', 'submit'].forEach(evt =>
    document.addEventListener(evt, setLastActive)
  );
});

function resetApp() {
  if (!confirm('This will remove your saved info and PIN. Continue?')) return;
  localStorage.removeItem('omnisign_profile');
  localStorage.removeItem('omnisign_pin_hash');
  localStorage.removeItem('omnisign_last_active');
  localStorage.removeItem('omnisign_timeout');
  location.reload();
}
function requestNotifications() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

