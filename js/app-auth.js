/* ======================================================
   OmniSign App Auth (CLEAN + BULLETPROOF)
   ====================================================== */

/* ---------- App Detection (THE KEY FIX) ---------- */
function isDefinitelyApp() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true; // iOS
      resolve(standalone);
    });
  });
}
function onAppReady(callback) {
  const mq = window.matchMedia('(display-mode: standalone)');
  if (mq.matches || window.navigator.standalone === true) {
    callback();
    return;
  }
  // 🔥 CRITICAL: wait for Chrome to flip to standalone
  mq.addEventListener('change', e => {
    if (e.matches) callback();
  });
}
function mountAppHeader() {
  const header = document.createElement('div');
  header.id = 'omnisign-app-header';
  header.innerHTML = `
    <div class="app-left">
      <strong>OmniSign</strong>
    </div>
    <div class="app-right">
      <button id="os-open-profile">👤</button>
    </div>
  `
  document.body.prepend(header);
  document.getElementById('os-open-profile').onclick = openProfilePanel;
}

/* ---------- Timeout ---------- */
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
/* ---------- Profile Button ---------- */
function mountProfileButton() {
  const btn = document.createElement('button');
  btn.id = 'os-profile-btn';
  btn.innerText = '👤';
  btn.onclick = showProfile;
  document.body.appendChild(btn);
}

/* ---------- PIN Hash ---------- */
async function hashPin(pin) {
  const msgUint8 = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------- Overlay ---------- */
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

      <h4>Secure Your App</h4>
      <p style="font-size:14px;opacity:.8;">
        Set a 4-digit PIN to lock and unlock the OmniSign app.
      </p>

      <div style="position:relative;">
        <input id="os-pin" type="password" inputmode="numeric" maxlength="4" placeholder="4-Digit PIN">
        <button type="button" id="os-toggle-pin" style="position:absolute;right:10px;top:8px;">👁</button>
      </div>

      <div style="position:relative;">
        <input id="os-pin-confirm" type="password" inputmode="numeric" maxlength="4" placeholder="Confirm PIN">
        <button type="button" id="os-toggle-pin-confirm" style="position:absolute;right:10px;top:8px;">👁</button>
      </div>

      <button id="os-save">Save & Continue</button>
    </div>
  `);

  // Toggle PIN visibility
  document.getElementById('os-toggle-pin').onclick = () => {
    const i = document.getElementById('os-pin');
    i.type = i.type === 'password' ? 'text' : 'password';
  };

  document.getElementById('os-toggle-pin-confirm').onclick = () => {
    const i = document.getElementById('os-pin-confirm');
    i.type = i.type === 'password' ? 'text' : 'password';
  };

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
    setInitialized();
    setLastActive();
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
    resetApp();
  };
}

/* ---------- Profile ---------- */
function openProfilePanel() {
  const profile = getProfile();
  mountOverlay(`
    <div class="os-side-panel">
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
      <button id="os-close-panel">Close</button>
    </div>
  `);
  document.getElementById('os-close-panel').onclick = removeOverlay;
  document.getElementById('os-save-profile').onclick = async () => {
    setProfile({
      company: osVal('os-p-company'),
      fullName: osVal('os-p-name'),
      phone: osVal('os-p-phone'),
      email: osVal('os-p-email')
    });
    const newPin = osVal('os-new-pin');
    if (newPin.length === 4) {
      localStorage.setItem('omnisign_pin_hash', await hashPin(newPin));
    }
    setTimeoutValue(osVal('os-timeout'));
    removeOverlay();
    prefillBooking(getProfile());
  };
  document.getElementById('os-reset').onclick = resetApp;
}
function osVal(id) {
  return document.getElementById(id).value;
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

document.addEventListener('DOMContentLoaded', () => {
  onAppReady(() => {
   document.body.classList.add('omnisign-app-mode');
    const profile = getProfile();
    if (!isInitialized() || !profile) {
      showOnboarding();
    } else if (isLocked()) {
      showLock();
    } else {
      setLastActive();
      prefillBooking(profile);
    }
    mountAppHeader(); 
    ['click', 'keydown', 'submit'].forEach(evt =>
      document.addEventListener(evt, setLastActive)
    );
  });
});

/* ---------- Reset ---------- */
function resetApp() {
  if (!confirm('This will remove your saved info and PIN. Continue?')) return;
  localStorage.removeItem('omnisign_profile');
  localStorage.removeItem('omnisign_pin_hash');
  localStorage.removeItem('omnisign_last_active');
  localStorage.removeItem('omnisign_timeout');
  localStorage.removeItem('omnisign_initialized');
  location.reload();
}

/* ---------- Notifications ---------- */
function requestNotifications() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
document.addEventListener('click', e => {
  if (!e.target.classList.contains('os-eye')) return;
  const input = document.getElementById(e.target.dataset.target);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
});



