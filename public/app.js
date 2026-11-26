const CATEGORIES = [
  'الكل',
  'سيارات ومركبات',
  'عقارات',
  'هواتف وأجهزة لوحية',
  'إلكترونيات وكمبيوتر',
  'أثاث ومنزل',
  'أزياء وموضة',
  'خدمات',
  'وظائف',
  'أخرى'
];

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=75';

const state = {
  user: JSON.parse(localStorage.getItem('souq_user') || 'null'),
  token: localStorage.getItem('souq_token') || '',
  ads: [],
  activeCategory: 'الكل',
  activePeer: '',
  messages: [],
  blockedUsers: JSON.parse(localStorage.getItem('souq_blocked') || '[]'),
  pendingAdImage: '',
  pendingAvatarImage: '',
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false
};

// ==========================================
// 1. التهيئة وإدارة زر الرجوع
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initCategories();
  updateAuthUI();
  loadAds();
  loadBlockedUsers();

  window.addEventListener('popstate', () => {
    const openModals = document.querySelectorAll('.modal-overlay.open');
    if (openModals.length > 0) {
      openModals.forEach((m) => m.classList.remove('open'));
    }
  });
});

function openModalById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.classList.contains('open')) {
    el.classList.add('open');
    history.pushState({ modal: id }, '', '#' + id);
  }
}

function closeModal() {
  const openModals = document.querySelectorAll('.modal-overlay.open');
  if (openModals.length > 0) {
    openModals.forEach((m) => m.classList.remove('open'));
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
}

function handleModalBackdrop(event) {
  if (event.target.classList.contains('modal-overlay')) {
    closeModal();
  }
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span><span style="cursor:pointer" onclick="this.parentElement.remove()">✕</span>`;
  stack.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4200);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  return headers;
}

// ==========================================
// 2. الحسابات والدخول والخروج
// ==========================================
function updateAuthUI() {
  const statusLabel = document.getElementById('authStatusLabel');
  const loginBtn = document.getElementById('loginModalBtn');
  const logoutBtn = document.getElementById('logoutActionBtn');
  const headerName = document.getElementById('headerProfileName');
  const headerImg = document.getElementById('headerProfileImg');

  if (state.user && state.user.username) {
    const display = state.user.displayName || state.user.username;
    const avatar = state.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(state.user.username)}`;
    statusLabel.textContent = `مرحباً ${display} (@${state.user.username})`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    headerName.textContent = display;
    headerImg.src = avatar;
  } else {
    statusLabel.textContent = 'تصفح حر • سجل الدخول للنشر والمراسلة';
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    headerName.textContent = 'الملف الشخصي';
    headerImg.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest';
  }
}

function openAuthModal(mode = 'login') {
  switchAuthMode(mode);
  openModalById('authModalOverlay');
}

function switchAuthMode(mode) {
  const loginForm = document.getElementById('loginAccountForm');
  const regForm = document.getElementById('registerAccountForm');
  const loginTab = document.getElementById('loginTabBtn');
  const regTab = document.getElementById('registerTabBtn');

  if (mode === 'register') {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    loginTab.classList.remove('active');
    regTab.classList.add('active');
  } else {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    loginTab.classList.add('active');
    regTab.classList.remove('active');
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const username = document.getElementById('loginUserField').value.trim().toLowerCase();
  const password = document.getElementById('loginPassField').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل تسجيل الدخول');
    }
    state.user = data.user || { username };
    state.token = data.token || '';
    localStorage.setItem('souq_user', JSON.stringify(state.user));
    localStorage.setItem('souq_token', state.token);
    updateAuthUI();
    renderAdsGrid();
    closeModal();
    showToast('تم تسجيل الدخول بنجاح', 'success');
  } catch (err) {
    showToast(err.message || 'تعذر تسجيل الدخول', 'error');
  }
}

async function submitRegister(event) {
  event.preventDefault();
  const username = document.getElementById('regUserField').value.trim().toLowerCase();
  const password = document.getElementById('regPassField').value;

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل إنشاء الحساب');
    }
    state.user = data.user || { username };
    state.token = data.token || '';
    localStorage.setItem('souq_user', JSON.stringify(state.user));
    localStorage.setItem('souq_token', state.token);
    updateAuthUI();
    renderAdsGrid();
    closeModal();
    showToast('تم إنشاء الحساب وتسجيل الدخول', 'success');
  } catch (err) {
    showToast(err.message || 'تعذر إنشاء الحساب', 'error');
  }
}

function logoutAccount() {
  state.user = null;
  state.token = '';
  localStorage.removeItem('souq_user');
  localStorage.removeItem('souq_token');
  updateAuthUI();
  renderAdsGrid();
  closeModal();
  showToast('تم تسجيل الخروج بنجاح', 'info');
}

// ==========================================
// 3. الأقسام وضغط الصور والإعلانات
// ==========================================
function initCategories() {
  const strip = document.getElementById('categoriesStrip');
  const select = document.getElementById('adCategorySelect');

  if (strip) {
    strip.innerHTML = CATEGORIES.map((cat) => `
      <button type="button" class="category-pill ${cat === state.activeCategory ? 'active' : ''}" onclick="selectCategory('${escapeHtml(cat)}')">
        ${escapeHtml(cat)}
      </button>
    `).join('');
  }

  if (select) {
    select.innerHTML = CATEGORIES.filter((c) => c !== 'الكل')
      .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
      .join('');
  }
}

function selectCategory(cat) {
  state.activeCategory = cat;
  initCategories();
  renderAdsGrid();
}

function resetHomeView() {
  state.activeCategory = 'الكل';
  document.getElementById('searchQueryInput').value = '';
  document.getElementById('filterCitySelect').value = '';
  document.getElementById('filterConditionSelect').value = '';
  document.getElementById('sortAdsSelect').value = 'newest';
  initCategories();
  renderAdsGrid();
}

// ضغط الصورة لتفادي فشل الرفع بسبب حجم الملف
function compressImageFile(file, maxWidth = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function onAdImageFileChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImageFile(file, 900, 0.72);
    state.pendingAdImage = compressed;
    document.getElementById('adImageUrlInput').value = '';
    const wrap = document.getElementById('adPreviewWrap');
    const img = document.getElementById('adPreviewImg');
    img.src = compressed;
    wrap.style.display = 'flex';
  } catch (err) {
    showToast(err.message || 'فشل تجهيز الصورة', 'error');
  }
}

function onAdImageUrlChange(event) {
  const url = event.target.value.trim();
  const wrap = document.getElementById('adPreviewWrap');
  const img = document.getElementById('adPreviewImg');
  if (url) {
    state.pendingAdImage = url;
    img.src = url;
    wrap.style.display = 'flex';
  } else if (!state.pendingAdImage.startsWith('data:')) {
    state.pendingAdImage = '';
    wrap.style.display = 'none';
  }
}

async function loadAds() {
  try {
    const res = await fetch('/api/ads');
    const data = await res.json();
    state.ads = Array.isArray(data) ? data : (data.ads || []);
    renderAdsGrid();
  } catch (err) {
    showToast('تعذر تحميل الإعلانات من الخادم', 'error');
  }
}

function isAdOwner(ad) {
  if (!state.user || !state.user.username) return false;
  const owner = String(ad.owner || ad.username || ad.seller || '').toLowerCase();
  return owner === state.user.username.toLowerCase();
}

function renderAdsGrid() {
  const container = document.getElementById('adsGridContainer');
  if (!container) return;

  const q = (document.getElementById('searchQueryInput')?.value || '').trim().toLowerCase();
  const city = document.getElementById('filterCitySelect')?.value || '';
  const condition = document.getElementById('filterConditionSelect')?.value || '';
  const sort = document.getElementById('sortAdsSelect')?.value || 'newest';

  let list = state.ads.filter((ad) => {
    const owner = String(ad.owner || ad.username || '').toLowerCase();
    if (state.blockedUsers.includes(owner)) return false;
    if (state.activeCategory !== 'الكل' && ad.category !== state.activeCategory) return false;
    if (city && !(ad.city || '').includes(city)) return false;
    if (condition && ad.condition !== condition) return false;
    if (q) {
      const hay = `${ad.title || ''} ${ad.description || ''} ${ad.city || ''} ${ad.category || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'price-asc') {
    list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === 'price-desc') {
    list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else {
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-box">لا توجد إعلانات مطابقة لخيارات البحث الحالية.</div>`;
    return;
  }

  container.innerHTML = list.map((ad) => {
    const id = ad._id || ad.id;
    const owner = ad.owner || ad.username || 'معلن';
    const mine = isAdOwner(ad);
    const imgSrc = ad.image || FALLBACK_IMAGE;

    return `
      <article class="ad-card" onclick="openAdDetails('${escapeHtml(id)}')">
        <div class="ad-media">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" onerror="this.src='${FALLBACK_IMAGE}'" />
          <span class="ad-tag-cat">${escapeHtml(ad.category || 'عام')}</span>
          <span class="ad-tag-owner">@${escapeHtml(owner)}</span>
        </div>
        <div class="ad-body">
          <h3 class="ad-title">${escapeHtml(ad.title)}</h3>
          <div class="ad-price">${Number(ad.price || 0).toLocaleString()} ${escapeHtml(ad.currency || 'USD')}</div>
          <div class="ad-meta">
            <span>📍 ${escapeHtml(ad.city || 'غير محدد')}</span>
            <span>🏷️ ${escapeHtml(ad.condition || 'مستعمل')}</span>
          </div>
        </div>
        <div class="ad-footer" onclick="event.stopPropagation()">
          ${
            mine
              ? `<button type="button" class="btn" onclick="openAdModal('${escapeHtml(id)}')">تعديل</button>
                 <button type="button" class="btn btn-danger" onclick="deleteAdItem('${escapeHtml(id)}')">حذف</button>`
              : `<button type="button" class="btn btn-primary" onclick="openChatWithUser('${escapeHtml(owner)}', '${escapeHtml(ad.title)}')">مراسلة المعلن</button>`
          }
        </div>
      </article>
    `;
  }).join('');
}

function openAdModal(adId = '') {
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول أولاً لنشر أو تعديل إعلان', 'error');
    openAuthModal('login');
    return;
  }

  const form = document.getElementById('adEditorForm');
  form.reset();
  document.getElementById('editingAdId').value = '';
  state.pendingAdImage = '';
  document.getElementById('adPreviewWrap').style.display = 'none';

  if (adId) {
    const ad = state.ads.find((item) => String(item._id || item.id) === String(adId));
    if (!ad || !isAdOwner(ad)) {
      showToast('لا تملك صلاحية تعديل هذا الإعلان', 'error');
      return;
    }
    document.getElementById('adEditorTitle').textContent = 'تعديل الإعلان';
    document.getElementById('editingAdId').value = adId;
    document.getElementById('adTitleInput').value = ad.title || '';
    document.getElementById('adPriceInput').value = ad.price || 0;
    document.getElementById('adCategorySelect').value = ad.category || 'أخرى';
    document.getElementById('adConditionSelect').value = ad.condition || 'مستعمل';
    document.getElementById('adCurrencySelect').value = ad.currency || 'USD';
    document.getElementById('adCityInput').value = ad.city || '';
    document.getElementById('adHoodInput').value = ad.neighborhood || '';
    document.getElementById('adDescInput').value = ad.description || '';
    if (ad.image) {
      state.pendingAdImage = ad.image;
      document.getElementById('adPreviewImg').src = ad.image;
      document.getElementById('adPreviewWrap').style.display = 'flex';
    }
  } else {
    document.getElementById('adEditorTitle').textContent = 'نشر إعلان جديد';
    if (state.user.city) {
      document.getElementById('adCityInput').value = state.user.city;
    }
  }

  openModalById('adEditorModalOverlay');
}

async function saveAdItem(event) {
  event.preventDefault();
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول أولاً', 'error');
    return;
  }

  const submitBtn = document.getElementById('saveAdSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الحفظ...';

  const adId = document.getElementById('editingAdId').value.trim();
  const payload = {
    title: document.getElementById('adTitleInput').value.trim(),
    price: Number(document.getElementById('adPriceInput').value || 0),
    category: document.getElementById('adCategorySelect').value,
    condition: document.getElementById('adConditionSelect').value,
    currency: document.getElementById('adCurrencySelect').value,
    city: document.getElementById('adCityInput').value.trim(),
    neighborhood: document.getElementById('adHoodInput').value.trim(),
    description: document.getElementById('adDescInput').value.trim(),
    image: state.pendingAdImage || document.getElementById('adImageUrlInput').value.trim(),
    owner: state.user.username,
    username: state.user.username
  };

  try {
    const endpoint = adId ? `/api/ads/${encodeURIComponent(adId)}` : '/api/ads';
    const method = adId ? 'PUT' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل حفظ ونشر الإعلان');
    }
    await loadAds();
    closeModal();
    showToast(adId ? 'تم تحديث الإعلان بنجاح' : 'تم نشر الإعلان بنجاح', 'success');
  } catch (err) {
    showToast(err.message || 'فشل نشر الإعلان', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'حفظ ونشر';
  }
}

async function deleteAdItem(adId) {
  const ad = state.ads.find((item) => String(item._id || item.id) === String(adId));
  if (!ad || !isAdOwner(ad)) {
    showToast('لا يمكنك حذف إعلان لا تملكه', 'error');
    return;
  }
  if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;

  try {
    const res = await fetch(`/api/ads/${encodeURIComponent(adId)}`, {
      method: 'DELETE',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username: state.user.username })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل حذف الإعلان');
    }
    await loadAds();
    closeModal();
    showToast('تم حذف الإعلان', 'success');
  } catch (err) {
    showToast(err.message || 'تعذر حذف الإعلان', 'error');
  }
}

function openAdDetails(adId) {
  const ad = state.ads.find((item) => String(item._id || item.id) === String(adId));
  if (!ad) return;

  const owner = ad.owner || ad.username || 'معلن';
  const mine = isAdOwner(ad);
  const imgSrc = ad.image || FALLBACK_IMAGE;

  document.getElementById('adDetailsTitle').textContent = ad.title || 'تفاصيل الإعلان';
  document.getElementById('adDetailsBody').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" onerror="this.src='${FALLBACK_IMAGE}'" style="width:100%; max-height:320px; object-fit:cover; border-radius:12px; border:1px solid var(--border);" />
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="font-size:1.35rem; font-weight:800; color:var(--primary);">${Number(ad.price || 0).toLocaleString()} ${escapeHtml(ad.currency || 'USD')}</div>
        <span style="background:var(--bg-soft); padding:4px 12px; border-radius:999px; font-size:0.84rem; font-weight:700;">${escapeHtml(ad.category || 'عام')} • ${escapeHtml(ad.condition || 'مستعمل')}</span>
      </div>
      <div style="font-size:0.9rem; color:var(--text-sub);">
        📍 الموقع: <strong>${escapeHtml(ad.city || 'غير محدد')}</strong> ${ad.neighborhood ? `(${escapeHtml(ad.neighborhood)})` : ''} • المعلن: <strong>@${escapeHtml(owner)}</strong>
      </div>
      <div style="background:var(--bg-soft); padding:12px; border-radius:10px; font-size:0.92rem; line-height:1.6;">
        ${escapeHtml(ad.description || 'لا يوجد وصف إضافي لهذا الإعلان.')}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        ${
          mine
            ? `<button type="button" class="btn" onclick="openAdModal('${escapeHtml(adId)}')">تعديل</button>
               <button type="button" class="btn btn-danger" onclick="deleteAdItem('${escapeHtml(adId)}')">حذف</button>`
            : `<button type="button" class="btn btn-primary" onclick="openChatWithUser('${escapeHtml(owner)}', '${escapeHtml(ad.title)}')">مراسلة المعلن</button>`
        }
        <button type="button" class="btn btn-outline" onclick="closeModal()">إغلاق</button>
      </div>
    </div>
  `;
  openModalById('adDetailsModalOverlay');
}

// ==========================================
// 4. الدردشة النصية والصوتية والحظر
// ==========================================
function openChatModal() {
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول أولاً لفتح المحادثات', 'error');
    openAuthModal('login');
    return;
  }
  openModalById('chatModalOverlay');
  loadChatMessages();
  renderBlockedList();
}

function openChatWithUser(peerUsername, adTitle = '') {
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول أولاً لمراسلة المعلن', 'error');
    openAuthModal('login');
    return;
  }
  const cleanPeer = String(peerUsername || '').replace(/^@/, '').trim().toLowerCase();
  if (!cleanPeer || cleanPeer === state.user.username.toLowerCase()) {
    showToast('لا يمكنك مراسلة نفسك', 'error');
    return;
  }
  openChatModal();
  selectChatPeer(cleanPeer);
  if (adTitle) {
    document.getElementById('chatMessageInput').value = `مرحباً، بخصوص إعلان: ${adTitle}`;
  }
}

function selectChatPeer(peer) {
  const clean = String(peer || '').replace(/^@/, '').trim().toLowerCase();
  if (!clean) return;
  state.activePeer = clean;
  document.getElementById('chatHeaderTitle').textContent = `محادثة مع @${clean}`;
  updateBlockButtonText();
  renderChatPeers();
  renderChatThread();
}

async function loadChatMessages() {
  if (!state.user || !state.user.username) return;
  try {
    const res = await fetch(`/api/messages?user=${encodeURIComponent(state.user.username)}`, {
      headers: authHeaders()
    });
    const data = await res.json();
    state.messages = Array.isArray(data) ? data : (data.messages || []);
    renderChatPeers();
    renderChatThread();
  } catch (err) {
    showToast('تعذر تحميل الرسائل', 'error');
  }
}

function renderChatPeers() {
  const listEl = document.getElementById('chatPeersList');
  if (!listEl || !state.user) return;
  const me = state.user.username.toLowerCase();
  const peersSet = new Set();
  if (state.activePeer) peersSet.add(state.activePeer);

  state.messages.forEach((m) => {
    const from = String(m.from || m.sender || '').toLowerCase();
    const to = String(m.to || m.receiver || '').toLowerCase();
    if (from === me && to) peersSet.add(to);
    if (to === me && from) peersSet.add(from);
  });

  const peers = Array.from(peersSet);
  if (peers.length === 0) {
    listEl.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:8px;">لا توجد محادثات سابقة</div>`;
    return;
  }

  listEl.innerHTML = peers.map((p) => `
    <div class="peer-item ${p === state.activePeer ? 'active' : ''}" onclick="selectChatPeer('${escapeHtml(p)}')">
      @${escapeHtml(p)}
    </div>
  `).join('');
}

function renderChatThread() {
  const box = document.getElementById('chatMessagesBox');
  if (!box || !state.user) return;

  if (!state.activePeer) {
    box.innerHTML = `<div style="margin:auto; color:var(--text-muted); font-size:0.88rem;">اختر محادثة أو اكتب اسم المستخدم لبدء المراسلة.</div>`;
    return;
  }

  const me = state.user.username.toLowerCase();
  const peer = state.activePeer.toLowerCase();
  const thread = state.messages.filter((m) => {
    const from = String(m.from || m.sender || '').toLowerCase();
    const to = String(m.to || m.receiver || '').toLowerCase();
    return (from === me && to === peer) || (from === peer && to === me);
  });

  if (thread.length === 0) {
    box.innerHTML = `<div style="margin:auto; color:var(--text-muted); font-size:0.88rem;">لا توجد رسائل بعد مع @${escapeHtml(peer)}.</div>`;
    return;
  }

  box.innerHTML = thread.map((m) => {
    const from = String(m.from || m.sender || '').toLowerCase();
    const isMine = from === me;
    const content = m.audio
      ? `<audio controls src="${escapeHtml(m.audio)}" style="max-width:220px; height:36px;"></audio>`
      : escapeHtml(m.text || m.content || '');
    return `
      <div class="msg-item ${isMine ? 'msg-out' : 'msg-in'}">
        <div>${content}</div>
        <span class="msg-meta">@${escapeHtml(from)}</span>
      </div>
    `;
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function applyQuickReply(text) {
  const input = document.getElementById('chatMessageInput');
  input.value = text;
  input.focus();
}

async function submitChatMessage(event) {
  event.preventDefault();
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول أولاً', 'error');
    return;
  }
  if (!state.activePeer) {
    showToast('يرجى تحديد المستلم أولاً', 'error');
    return;
  }
  if (state.blockedUsers.includes(state.activePeer)) {
    showToast('هذا المستخدم محظور، قم بإلغاء الحظر أولاً', 'error');
    return;
  }

  const input = document.getElementById('chatMessageInput');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        from: state.user.username,
        sender: state.user.username,
        to: state.activePeer,
        receiver: state.activePeer,
        text,
        content: text
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'تعذر إرسال الرسالة');
    }
    input.value = '';
    await loadChatMessages();
  } catch (err) {
    showToast(err.message || 'فشل إرسال الرسالة', 'error');
  }
}

async function toggleVoiceNote() {
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول أولاً', 'error');
    return;
  }
  if (!state.activePeer) {
    showToast('حدد الشخص الذي تريد إرسال الصوت له أولاً', 'error');
    return;
  }

  const btn = document.getElementById('voiceRecBtn');

  if (state.isRecording && state.mediaRecorder) {
    state.mediaRecorder.stop();
    state.isRecording = false;
    btn.textContent = '🎙️';
    btn.classList.remove('btn-danger');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('المتصفح أو الاتصال غير آمن (HTTPS مطلوب للتسجيل الصوتي)', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    const recorder = new MediaRecorder(stream);
    state.mediaRecorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const res = await fetch('/api/messages', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              from: state.user.username,
              sender: state.user.username,
              to: state.activePeer,
              receiver: state.activePeer,
              audio: reader.result,
              text: 'رسالة صوتية'
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'فشل إرسال الرسالة الصوتية');
          await loadChatMessages();
          showToast('تم إرسال الرسالة الصوتية', 'success');
        } catch (err) {
          showToast(err.message || 'فشل إرسال الصوت', 'error');
        }
      };
      reader.readAsDataURL(blob);
    };

    recorder.start();
    state.isRecording = true;
    btn.textContent = '⏹️';
    btn.classList.add('btn-danger');
    showToast('جاري التسجيل الصوتي... اضغط مجدداً للإرسال', 'info');
  } catch (err) {
    showToast('تعذر الوصول إلى الميكروفون، تحقق من أذونات المتصفح', 'error');
  }
}

function loadBlockedUsers() {
  state.blockedUsers = JSON.parse(localStorage.getItem('souq_blocked') || '[]');
}

function updateBlockButtonText() {
  const btn = document.getElementById('blockPeerBtn');
  if (!btn || !state.activePeer) return;
  const isBlocked = state.blockedUsers.includes(state.activePeer);
  btn.textContent = isBlocked ? '✅ إلغاء الحظر' : '🚫 حظر';
}

function toggleBlockPeer() {
  if (!state.activePeer) {
    showToast('اختر مستخدماً أولاً', 'error');
    return;
  }
  const idx = state.blockedUsers.indexOf(state.activePeer);
  if (idx >= 0) {
    state.blockedUsers.splice(idx, 1);
    showToast(`تم إلغاء حظر @${state.activePeer}`, 'success');
  } else {
    state.blockedUsers.push(state.activePeer);
    showToast(`تم حظر @${state.activePeer}`, 'info');
  }
  localStorage.setItem('souq_blocked', JSON.stringify(state.blockedUsers));
  updateBlockButtonText();
  renderBlockedList();
  renderAdsGrid();
}

function renderBlockedList() {
  const el = document.getElementById('blockedUsersList');
  if (!el) return;
  if (state.blockedUsers.length === 0) {
    el.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">لا يوجد مستخدمون محظورون.</span>`;
    return;
  }
  el.innerHTML = state.blockedUsers.map((u) => `
    <span class="blocked-tag">
      @${escapeHtml(u)}
      <button type="button" style="border:none; background:none; color:inherit; cursor:pointer; font-weight:800;" onclick="unblockUser('${escapeHtml(u)}')">✕</button>
    </span>
  `).join('');
}

function unblockUser(username) {
  state.blockedUsers = state.blockedUsers.filter((u) => u !== username);
  localStorage.setItem('souq_blocked', JSON.stringify(state.blockedUsers));
  updateBlockButtonText();
  renderBlockedList();
  renderAdsGrid();
}

// ==========================================
// 5. الملف الشخصي الموسع
// ==========================================
function openProfileModal() {
  if (!state.user || !state.user.username) {
    showToast('يرجى تسجيل الدخول لفتح الملف الشخصي', 'error');
    openAuthModal('login');
    return;
  }

  const avatar = state.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(state.user.username)}`;
  state.pendingAvatarImage = avatar;

  document.getElementById('profilePreviewAvatar').src = avatar;
  document.getElementById('profileHandleText').textContent = `@${state.user.username}`;
  document.getElementById('profileCityText').textContent = state.user.city || 'المدينة غير محددة';
  document.getElementById('profileBioText').textContent = state.user.bio || '';

  document.getElementById('profileDisplayNameInput').value = state.user.displayName || state.user.username;
  document.getElementById('profileCityInput').value = state.user.city || '';
  document.getElementById('profileBioInput').value = state.user.bio || '';

  const myAds = state.ads.filter((ad) => isAdOwner(ad));
  document.getElementById('profileAdsCounter').textContent = myAds.length;

  const ownGrid = document.getElementById('profileOwnAdsGrid');
  if (myAds.length === 0) {
    ownGrid.innerHTML = `<div style="grid-column:1/-1; font-size:0.84rem; color:var(--text-muted);">لم تقم بنشر أي إعلانات بعد.</div>`;
  } else {
    ownGrid.innerHTML = myAds.map((ad) => {
      const id = ad._id || ad.id;
      return `
        <div class="my-ad-card">
          <strong style="font-size:0.88rem;">${escapeHtml(ad.title)}</strong>
          <span style="color:var(--primary); font-weight:700; font-size:0.84rem;">${Number(ad.price || 0).toLocaleString()} ${escapeHtml(ad.currency || 'USD')}</span>
          <div style="display:flex; gap:6px; margin-top:4px;">
            <button type="button" class="btn" style="padding:4px 8px; font-size:0.76rem;" onclick="openAdModal('${escapeHtml(id)}')">تعديل</button>
            <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.76rem;" onclick="deleteAdItem('${escapeHtml(id)}')">حذف</button>
          </div>
        </div>
      `;
    }).join('');
  }

  openModalById('profileModalOverlay');
}

async function onProfileAvatarChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImageFile(file, 320, 0.78);
    state.pendingAvatarImage = compressed;
    document.getElementById('profilePreviewAvatar').src = compressed;
  } catch (err) {
    showToast('فشل تجهيز الصورة الرمزية', 'error');
  }
}

async function saveUserProfile(event) {
  event.preventDefault();
  if (!state.user || !state.user.username) return;

  const updated = {
    ...state.user,
    displayName: document.getElementById('profileDisplayNameInput').value.trim() || state.user.username,
    city: document.getElementById('profileCityInput').value.trim(),
    bio: document.getElementById('profileBioInput').value.trim(),
    avatar: state.pendingAvatarImage || state.user.avatar
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updated)
    });
    if (res.ok) {
      const data = await res.json();
      state.user = data.user || updated;
    } else {
      state.user = updated;
    }
  } catch (_) {
    state.user = updated;
  }

  localStorage.setItem('souq_user', JSON.stringify(state.user));
  updateAuthUI();
  closeModal();
  showToast('تم حفظ بيانات الملف الشخصي', 'success');
}