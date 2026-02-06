/* ============================
   OmniSign App-Only Auth
   ============================ */

const IS_APP = window.matchMedia('(display-mode: standalone)').matches;
const LOCK_TIMEOUT_MINUTES = 30;

/* ---------- Helpers ---------- */

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
  return Date.now() - Number(last) > LOCK_TIMEOUT_MINUTES * 60 * 1000;
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
}

/* ---------- Prefill Booking ---------- */

function prefillBooking(profile) {
  if (!profile) return;

  document.querySelector('[name="company"]')?.value = profile.company;
  document.querySelector('[name="fullName"]')?.value = profile.fullName;
  document.querySelector('[name="phone"]')?.value = profile.phone;
  document.querySelector('[name="email"]')?.value = profile.email;
}

/* ---------- Init ---------- */

document.addEventListener('DOMContentLoaded', () => {
  if (!IS_APP) return;

  const profile = getProfile();

  if (!profile) {
    showOnboarding();
  } else if (isLocked()) {
    showLock();
  } else {
    setLastActive();
    prefillBooking(profile);
  }

  ['click', 'keydown', 'submit'].forEach(evt =>
    document.addEventListener(evt, setLastActive)
  );
});
