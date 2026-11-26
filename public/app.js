const CATEGORIES = [
  { name: 'الكل', icon: '❖' },
  { name: 'إلكترونيات وكمبيوتر', icon: '◈' },
  { name: 'موبايلات وتابلت', icon: '✦' },
  { name: 'سيارات ومركبات', icon: '❖' },
  { name: 'عقارات ومنازل', icon: '◈' },
  { name: 'أثاث ومفروشات', icon: '✦' },
  { name: 'أدوات منزلية', icon: '❖' },
  { name: 'أزياء وموضة', icon: '◈' },
  { name: 'خدمات ومهن', icon: '✦' }
];

const DEFAULT_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=user';
const DEFAULT_AD_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="400" height="240" fill="%230b0f18"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23f6c453" font-family="sans-serif" font-size="18">بدون صورة</text></svg>';

const STORAGE_KEYS = {
  profile: 'rakhis_profile_v1',
  blocked: 'rakhis_blocked_v1',
  peers: 'rakhis_peers_v1',
  auth: 'rakhis_auth_user_v1'
};

const state = {
  ads: [],
  messages: [],
  selectedCategory: 'الكل',
  activeModal: null,
  modalHistoryPushed: false,
  currentPeer: '',
  peers: loadJson(STORAGE_KEYS.peers, []),
  blockedUsers: loadJson(STORAGE_KEYS.blocked, []),
  authUser: loadJson(STORAGE_KEYS.auth, null),
  profile: loadJson(STORAGE_KEYS.profile, {
    name: '',
    city: '',
    bio: '',
    avatar: DEFAULT_AVATAR
  }),
  uploadedAdImage: '',
  uploadedAvatarImage: '',
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getActiveUsername() {
  if (state.authUser && state.authUser.username) {
    return String(state.authUser.username).trim().toLowerCase();
  }
  return '';
}

function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.authUser && state.authUser.token) {
    headers.Authorization = `Bearer ${state.authUser.token}`;
  }
  const activeUser = getActiveUsername();
  if (activeUser) {
    headers['x-username'] = activeUser;
  }
  return headers;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" style="background:none;border:none;color:inherit;font-weight:800;cursor:pointer;" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 3500);
}

// ==========================================
// النوافذ والرجوع
// ==========================================
const MODAL_MAP = {
  details: 'detailsModal',
  adForm: 'adFormModal',
  chat: 'chatModal',
  profile: 'profileModal',
  auth: 'authModal'
};

function openModal(name) {
  const id = MODAL_MAP[name];
  if (!id) return;

  Object.values(MODAL_MAP).forEach(elId => {
    const el = document.getElementById(elId);
    if (el) el.classList.remove('open');
  });

  const target = document.getElementById(id);
  if (target) {
    target.classList.add('open');
    state.activeModal = name;
    if (!state.modalHistoryPushed) {
      history.pushState({ modal: name }, '', '#modal-' + name);
      state.modalHistoryPushed = true;
    }
  }
}

function closeModalUIOnly() {
  Object.values(MODAL_MAP).forEach(elId => {
    const el = document.getElementById(elId);
    if (el) el.classList.remove('open');
  });
  state.activeModal = null;
  state.modalHistoryPushed = false;
  stopVoiceRecordingIfActive();
}

function closeActiveModal() {
  if (!state.activeModal) return;
  if (state.modalHistoryPushed) {
    history.back();
  } else {
    closeModalUIOnly();
  }
}

function handleBackdropClick(event, name) {
  if (event.target && event.target.classList.contains('modal-backdrop') && state.activeModal === name) {
    closeActiveModal();
  }
}

window.addEventListener('popstate', () => {
  if (state.activeModal) {
    closeModalUIOnly();
  }
});

function goHome() {
  if (state.activeModal) closeActiveModal();
  state.selectedCategory = 'الكل';

  const searchEl = document.getElementById('searchInput');
  const cityEl = document.getElementById('cityFilter');
  const condEl = document.getElementById('conditionFilter');
  const sortEl = document.getElementById('sortSelect');

  if (searchEl) searchEl.value = '';
  if (cityEl) cityEl.value = '';
  if (condEl) condEl.value = '';
  if (sortEl) sortEl.value = 'newest';

  renderCategories();
  renderAds();
}

// ==========================================
// تسجيل الدخول وإنشاء الحساب (الاسم وكلمة المرور فقط)
// ==========================================
function renderAuthHeader() {
  const authBtn = document.getElementById('authOpenBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const statusText = document.getElementById('authStatusText');
  const activeUser = getActiveUsername();

  if (activeUser) {
    if (authBtn) authBtn.textContent = `❖ ${activeUser}`;
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (statusText) statusText.textContent = `حساب نشط: ${activeUser}`;
  } else {
    if (authBtn) authBtn.textContent = '❖ دخول / حساب';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (statusText) statusText.textContent = 'إعلانات سريعة • تواصل مباشر';
  }
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin')?.classList.toggle('active', isLogin);
  document.getElementById('tabRegister')?.classList.toggle('active', !isLogin);
  document.getElementById('loginForm').style.display = isLogin ? 'block' : 'none';
  document.getElementById('registerForm').style.display = isLogin ? 'none' : 'block';
}

function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  openModal('auth');
}

function applyLoggedInUser(userObj) {
  const username = String(userObj.username || '').trim().toLowerCase();
  state.authUser = {
    username,
    token: userObj.token || ''
  };
  saveJson(STORAGE_KEYS.auth, state.authUser);

  state.profile.name = username;
  saveJson(STORAGE_KEYS.profile, state.profile);

  applyProfileHeader();
  renderAuthHeader();
  renderAds();
  renderChatUsers();
  renderChatMessages();
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showToast('أدخل الاسم وكلمة المرور', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل تسجيل الدخول');

    applyLoggedInUser(data.user || { username });
    event.target.reset();
    closeActiveModal();
    showToast('تم تسجيل الدخول بنجاح', 'success');
  } catch (err) {
    showToast(err.message || 'خطأ في تسجيل الدخول', 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById('regUsername').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;

  if (!username || !password) {
    showToast('أدخل الاسم وكلمة المرور', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل إنشاء الحساب');

    applyLoggedInUser(data.user || { username });
    event.target.reset();
    closeActiveModal();
    showToast('تم إنشاء الحساب بنجاح', 'success');
  } catch (err) {
    showToast(err.message || 'خطأ في إنشاء الحساب', 'error');
  }
}

function logoutUser() {
  state.authUser = null;
  localStorage.removeItem(STORAGE_KEYS.auth);
  renderAuthHeader();
  applyProfileHeader();
  renderAds();
  showToast('تم تسجيل الخروج', 'info');
}

// ==========================================
// جلب البيانات
// ==========================================
async function fetchAds() {
  try {
    const res = await fetch('/api/ads');
    if (!res.ok) throw new Error('فشل جلب الإعلانات');
    const data = await res.json();
    state.ads = Array.isArray(data) ? data : [];
    renderAds();
  } catch (err) {
    console.error(err);
    state.ads = [];
    renderAds();
    showToast('تعذر جلب الإعلانات من الخادم', 'error');
  }
}

async function fetchMessages() {
  try {
    const res = await fetch('/api/messages');
    if (!res.ok) throw new Error('فشل جلب الرسائل');
    const data = await res.json();
    state.messages = Array.isArray(data) ? data : [];
    syncPeersFromMessages();
    if (state.activeModal === 'chat') {
      renderChatUsers();
      renderChatMessages();
    }
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// الأقسام والعرض
// ==========================================
function renderCategories() {
  const strip = document.getElementById('categoriesStrip');
  const select = document.getElementById('adCategory');
  if (!strip) return;

  strip.innerHTML = CATEGORIES.map(cat => {
    const activeClass = state.selectedCategory === cat.name ? 'active' : '';
    return `
      <button type="button" class="cat-chip ${activeClass}" onclick="selectCategory('${escapeHtml(cat.name)}')">
        <span>${escapeHtml(cat.icon)}</span>
        <span>${escapeHtml(cat.name)}</span>
      </button>
    `;
  }).join('');

  if (select) {
    const currentVal = select.value;
    select.innerHTML = CATEGORIES.filter(c => c.name !== 'الكل')
      .map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`)
      .join('');
    if (currentVal) select.value = currentVal;
  }
}

function selectCategory(cat) {
  state.selectedCategory = cat;
  renderCategories();
  renderAds();
}

function formatPrice(price, currency) {
  const num = Number(price || 0).toLocaleString('en-US');
  const map = { USD: '$', TRY: '₺', SYP: 'ل.س' };
  return `${num} ${map[currency] || currency || '$'}`;
}

function isAdOwner(ad) {
  const me = getActiveUsername();
  if (!me || !ad || !ad.ownerUsername) return false;
  return String(ad.ownerUsername).trim().toLowerCase() === me;
}

function renderAds() {
  const grid = document.getElementById('adsGrid');
  if (!grid) return;

  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const city = (document.getElementById('cityFilter')?.value || '').trim();
  const cond = (document.getElementById('conditionFilter')?.value || '').trim();
  const sort = document.getElementById('sortSelect')?.value || 'newest';

  let filtered = state.ads.filter(ad => {
    if (state.selectedCategory !== 'الكل' && ad.category !== state.selectedCategory) return false;
    if (city && !(ad.city || '').includes(city) && !(ad.neighbourhood || '').includes(city)) return false;
    if (cond && ad.condition !== cond) return false;
    if (q) {
      const hay = `${ad.title || ''} ${ad.description || ''} ${ad.category || ''} ${ad.city || ''} ${ad.ownerUsername || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'price-asc') {
    filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else {
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 1rem; font-weight: 800; color: var(--silver); margin-bottom: 6px;">لا توجد إعلانات حالياً</div>
        <div style="font-size: 0.82rem;">سجّل دخولك واضغط على "+ إعلان" لنشر إعلانك.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map(ad => {
      const id = ad._id || ad.id;
      const imgSrc = ad.image && ad.image.trim() ? ad.image : DEFAULT_AD_IMG;
      const owner = String(ad.ownerUsername || 'معلن').trim();
      const canManage = isAdOwner(ad);

      const footerButtons = canManage
        ? `
          <button type="button" class="btn btn-gold" onclick="openAdForm('${escapeHtml(id)}')">تعديل</button>
          <button type="button" class="btn btn-danger" onclick="deleteAd('${escapeHtml(id)}')">حذف</button>
        `
        : `
          <button type="button" class="btn btn-diamond" onclick="startChatWithOwner('${escapeHtml(owner)}', '${escapeHtml(id)}', '${escapeHtml(ad.title)}')">مراسلة المعلن</button>
        `;

      return `
        <article class="ad-card" onclick="openAdDetails('${escapeHtml(id)}')">
          <div class="ad-img-wrap">
            <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" loading="lazy" onerror="this.src='${DEFAULT_AD_IMG}'" />
            <span class="ad-badge-cat">${escapeHtml(ad.category || 'عام')}</span>
            <span class="ad-badge-owner">✦ ${escapeHtml(owner)}</span>
          </div>
          <div class="ad-body">
            <div class="ad-title">${escapeHtml(ad.title)}</div>
            <div class="ad-price">${escapeHtml(formatPrice(ad.price, ad.currency))}</div>
            <div class="ad-meta">
              <span>${escapeHtml(ad.city || 'غير محدد')}</span>
              <span>${escapeHtml(ad.condition || 'مستعمل')}</span>
            </div>
          </div>
          <div class="ad-footer" onclick="event.stopPropagation()">
            ${footerButtons}
          </div>
        </article>
      `;
    })
    .join('');
}

// ==========================================
// تفاصيل الإعلان والإضافة والتعديل والحذف
// ==========================================
function openAdDetails(id) {
  const ad = state.ads.find(item => (item._id || item.id) === id);
  if (!ad) return;

  const imgSrc = ad.image && ad.image.trim() ? ad.image : DEFAULT_AD_IMG;
  const owner = String(ad.ownerUsername || 'معلن').trim();
  const canManage = isAdOwner(ad);

  const ownerActions = canManage
    ? `
      <button type="button" class="btn btn-gold" onclick="closeActiveModal(); setTimeout(() => openAdForm('${escapeHtml(ad._id || ad.id)}'), 120)">✏️ تعديل</button>
      <button type="button" class="btn btn-danger" onclick="deleteAd('${escapeHtml(ad._id || ad.id)}', true)">🗑️ حذف</button>
    `
    : '';

  document.getElementById('detailTitle').textContent = ad.title || 'تفاصيل الإعلان';
  document.getElementById('detailContent').innerHTML = `
    <div style="border-radius: var(--radius-md); overflow: hidden; max-height: 280px; background: #06080d; margin-bottom: 12px; text-align: center;">
      <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" style="max-width: 100%; max-height: 280px; object-fit: contain;" onerror="this.src='${DEFAULT_AD_IMG}'" />
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
      <span style="font-size: 1.2rem; font-weight: 800; color: var(--gold-bright);">${escapeHtml(formatPrice(ad.price, ad.currency))}</span>
      <span class="cat-chip active">${escapeHtml(ad.category || '')}</span>
    </div>
    <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 10px;">
      المدينة: <strong style="color: var(--text-main);">${escapeHtml(ad.city || 'غير محدد')}</strong> •
      الحالة: <strong style="color: var(--text-main);">${escapeHtml(ad.condition || 'مستعمل')}</strong> •
      الناشر: <strong style="color: var(--diamond);">${escapeHtml(owner)}</strong>
    </div>
    <p style="font-size: 0.9rem; line-height: 1.6; color: var(--silver); white-space: pre-wrap; margin-bottom: 14px;">${escapeHtml(ad.description || 'لا يوجد وصف إضافي.')}</p>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
      <button type="button" class="btn btn-diamond" onclick="startChatWithOwner('${escapeHtml(owner)}', '${escapeHtml(ad._id || ad.id)}', '${escapeHtml(ad.title)}')">💬 مراسلة الناشر</button>
      ${ownerActions}
    </div>
  `;
  openModal('details');
}

function openAdForm(id = null) {
  if (!getActiveUsername()) {
    showToast('سجّل دخولك أولاً لإضافة أو تعديل إعلان', 'error');
    openAuthModal('login');
    return;
  }

  const form = document.getElementById('adForm');
  form.reset();
  state.uploadedAdImage = '';
  document.getElementById('adImagePreviewBox').style.display = 'none';
  document.getElementById('adImagePreview').src = '';

  if (id) {
    const ad = state.ads.find(item => (item._id || item.id) === id);
    if (!ad) return;

    if (!isAdOwner(ad)) {
      showToast('لا يمكنك تعديل إعلان ليس ملكك', 'error');
      return;
    }

    document.getElementById('adFormTitle').textContent = 'تعديل الإعلان';
    document.getElementById('editAdId').value = id;
    document.getElementById('adTitle').value = ad.title || '';
    document.getElementById('adPrice').value = ad.price ?? 0;
    document.getElementById('adCategory').value = ad.category || CATEGORIES[1].name;
    document.getElementById('adCondition').value = ad.condition || 'مستعمل';
    document.getElementById('adCurrency').value = ad.currency || 'USD';
    document.getElementById('adCity').value = ad.city || state.profile.city || '';
    document.getElementById('adNeighbourhood').value = ad.neighbourhood || '';
    document.getElementById('adDescription').value = ad.description || '';

    if (ad.image) {
      state.uploadedAdImage = ad.image;
      if (!ad.image.startsWith('data:')) {
        document.getElementById('adImageUrl').value = ad.image;
      }
      document.getElementById('adImagePreview').src = ad.image;
      document.getElementById('adImagePreviewBox').style.display = 'flex';
    }
  } else {
    document.getElementById('adFormTitle').textContent = 'إضافة إعلان جديد';
    document.getElementById('editAdId').value = '';
    document.getElementById('adCity').value = state.profile.city || '';
  }

  openModal('adForm');
}

function handleImageFile(event, target) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    if (target === 'ad') {
      state.uploadedAdImage = dataUrl;
      document.getElementById('adImageUrl').value = '';
      document.getElementById('adImagePreview').src = dataUrl;
      document.getElementById('adImagePreviewBox').style.display = 'flex';
    } else if (target === 'avatar') {
      state.uploadedAvatarImage = dataUrl;
      document.getElementById('profileAvatarPreview').src = dataUrl;
    }
  };
  reader.readAsDataURL(file);
}

function handleImageUrl(event) {
  const url = (event.target.value || '').trim();
  state.uploadedAdImage = url;
  const box = document.getElementById('adImagePreviewBox');
  const img = document.getElementById('adImagePreview');
  if (url) {
    img.src = url;
    box.style.display = 'flex';
  } else {
    img.src = '';
    box.style.display = 'none';
  }
}

async function submitAdForm(event) {
  event.preventDefault();

  const activeUser = getActiveUsername();
  if (!activeUser) {
    showToast('يجب تسجيل الدخول أولاً', 'error');
    openAuthModal('login');
    return;
  }

  const editId = document.getElementById('editAdId').value.trim();
  const urlInput = document.getElementById('adImageUrl').value.trim();
  const finalImage = state.uploadedAdImage || urlInput || '';

  const payload = {
    title: document.getElementById('adTitle').value.trim(),
    price: Number(document.getElementById('adPrice').value || 0),
    category: document.getElementById('adCategory').value,
    condition: document.getElementById('adCondition').value,
    currency: document.getElementById('adCurrency').value,
    city: document.getElementById('adCity').value.trim(),
    neighbourhood: document.getElementById('adNeighbourhood').value.trim(),
    description: document.getElementById('adDescription').value.trim(),
    image: finalImage,
    ownerUsername: activeUser,
    requesterUsername: activeUser
  };

  try {
    const isEdit = Boolean(editId);
    const res = await fetch(isEdit ? `/api/ads/${encodeURIComponent(editId)}` : '/api/ads', {
      method: isEdit ? 'PUT' : 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'فشل حفظ الإعلان');
    }

    closeActiveModal();
    await fetchAds();
    showToast(isEdit ? 'تم تحديث الإعلان بنجاح' : 'تم نشر الإعلان بنجاح', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'حدث خطأ أثناء حفظ الإعلان', 'error');
  }
}

async function deleteAd(id, fromDetails = false) {
  const ad = state.ads.find(item => (item._id || item.id) === id);
  if (!ad || !isAdOwner(ad)) {
    showToast('لا يمكنك حذف إعلان شخص آخر', 'error');
    return;
  }

  try {
    const activeUser = getActiveUsername();
    const res = await fetch(`/api/ads/${encodeURIComponent(id)}?username=${encodeURIComponent(activeUser)}`, {
      method: 'DELETE',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ requesterUsername: activeUser })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'فشل حذف الإعلان');
    }

    if (fromDetails && state.activeModal === 'details') {
      closeActiveModal();
    }
    await fetchAds();
    showToast('تم حذف الإعلان', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'تعذر حذف الإعلان', 'error');
  }
}

// ==========================================
// الدردشة والتسجيل الصوتي وقائمة الحظر
// ==========================================
function syncPeersFromMessages() {
  const me = getActiveUsername();
  const set = new Set(state.peers);
  state.messages.forEach(m => {
    const sender = String(m.sender || '').trim().toLowerCase();
    const to = String(m.to || '').trim().toLowerCase();
    if (sender && sender !== me) set.add(sender);
    if (to && to !== me) set.add(to);
  });
  state.peers = Array.from(set);
  saveJson(STORAGE_KEYS.peers, state.peers);
  if (!state.currentPeer && state.peers.length > 0) {
    state.currentPeer = state.peers[0];
  }
}

function openChatModal() {
  if (!getActiveUsername()) {
    showToast('سجّل دخولك أولاً لاستخدام الدردشة', 'error');
    openAuthModal('login');
    return;
  }
  fetchMessages();
  renderChatUsers();
  renderChatMessages();
  renderBlockedUsers();
  updateBlockButton();
  openModal('chat');
}

function startChatWithOwner(owner, adId = '', adTitle = '') {
  if (!getActiveUsername()) {
    showToast('سجّل دخولك أولاً لمراسلة المعلن', 'error');
    openAuthModal('login');
    return;
  }
  if (state.activeModal === 'details') {
    closeActiveModal();
  }
  const cleanOwner = String(owner || '').trim().toLowerCase();
  addOrSelectPeer(cleanOwner);
  if (adTitle) {
    const input = document.getElementById('chatTextInput');
    if (input && !input.value) {
      input.value = `مرحباً، بخصوص إعلان: ${adTitle}`;
    }
  }
  setTimeout(() => openChatModal(), 120);
}

function addOrSelectPeer(name) {
  const clean = String(name || '').trim().toLowerCase();
  if (!clean) return;
  if (!state.peers.includes(clean)) {
    state.peers.unshift(clean);
    saveJson(STORAGE_KEYS.peers, state.peers);
  }
  state.currentPeer = clean;
  renderChatUsers();
  renderChatMessages();
  updateBlockButton();
}

function renderChatUsers() {
  const list = document.getElementById('chatUserList');
  if (!list) return;

  const visiblePeers = state.peers.filter(u => !state.blockedUsers.includes(u));
  if (visiblePeers.length === 0) {
    list.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 6px;">لا توجد محادثات نشطة</div>`;
    return;
  }

  if (!visiblePeers.includes(state.currentPeer)) {
    state.currentPeer = visiblePeers[0];
  }

  list.innerHTML = visiblePeers
    .map(user => {
      const active = user === state.currentPeer ? 'active' : '';
      return `<div class="user-item ${active}" onclick="addOrSelectPeer('${escapeHtml(user)}')"><span>${escapeHtml(user)}</span></div>`;
    })
    .join('');
}

function renderChatMessages() {
  const box = document.getElementById('chatMessages');
  if (!box) return;

  const peer = String(state.currentPeer || '').trim().toLowerCase();
  if (!peer) {
    box.innerHTML = `<div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; margin: auto;">اختر مستخدماً أو أضف اسماً لبدء الدردشة</div>`;
    return;
  }

  if (state.blockedUsers.includes(peer)) {
    box.innerHTML = `<div style="font-size: 0.82rem; color: #fca5a5; text-align: center; margin: auto;">هذا المستخدم محظور</div>`;
    return;
  }

  const me = getActiveUsername();
  const convo = state.messages
    .filter(
      m =>
        !state.blockedUsers.includes(String(m.sender || '').toLowerCase()) &&
        !state.blockedUsers.includes(String(m.to || '').toLowerCase()) &&
        ((String(m.sender || '').toLowerCase() === me && String(m.to || '').toLowerCase() === peer) ||
          (String(m.sender || '').toLowerCase() === peer && String(m.to || '').toLowerCase() === me))
    )
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  if (convo.length === 0) {
    box.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin: auto;">لا توجد رسائل مع ${escapeHtml(peer)} بعد</div>`;
    return;
  }

  box.innerHTML = convo
    .map(m => {
      const isMe = String(m.sender || '').toLowerCase() === me;
      const timeStr = m.createdAt
        ? new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        : '';
      const textVal = String(m.text || '');

      const bodyHtml = textVal.startsWith('data:audio')
        ? `<audio controls preload="metadata" src="${escapeHtml(textVal)}" style="max-width: 100%; height: 34px;"></audio>`
        : `<div>${escapeHtml(textVal)}</div>`;

      return `
        <div class="msg-bubble ${isMe ? 'msg-me' : 'msg-other'}">
          ${bodyHtml}
          <span class="msg-time">${escapeHtml(timeStr)}</span>
        </div>
      `;
    })
    .join('');

  box.scrollTop = box.scrollHeight;
}

function insertQuickPhrase(phrase) {
  const input = document.getElementById('chatTextInput');
  if (input) {
    input.value = phrase;
    input.focus();
  }
}

async function sendChatMessage(event) {
  event.preventDefault();
  const me = getActiveUsername();
  if (!me) {
    showToast('سجّل دخولك أولاً لإرسال رسالة', 'error');
    return;
  }

  const input = document.getElementById('chatTextInput');
  const text = (input.value || '').trim();
  const peer = String(state.currentPeer || '').trim().toLowerCase();

  if (!peer) {
    showToast('أدخل أو اختر اسم المستلم أولاً', 'error');
    return;
  }
  if (state.blockedUsers.includes(peer)) {
    showToast('لا يمكن إرسال رسالة لمستخدم محظور', 'error');
    return;
  }
  if (!text) return;

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sender: me, to: peer, text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل إرسال الرسالة');

    input.value = '';
    state.messages.unshift(data);
    renderChatMessages();
  } catch (err) {
    showToast(err.message || 'تعذر إرسال الرسالة', 'error');
  }
}

function getSupportedAudioMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
  }
  return '';
}

async function toggleVoiceRecording() {
  const me = getActiveUsername();
  if (!me) {
    showToast('سجّل دخولك أولاً لإرسال رسالة صوتية', 'error');
    return;
  }

  const btn = document.getElementById('voiceRecordBtn');
  const peer = String(state.currentPeer || '').trim().toLowerCase();

  if (!peer) {
    showToast('اختر أو أضف مستخدماً أولاً لإرسال رسالة صوتية', 'error');
    return;
  }
  if (state.blockedUsers.includes(peer)) {
    showToast('المستخدم محظور', 'error');
    return;
  }

  if (!state.isRecording) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('المتصفح لا يدعم التسجيل الصوتي', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      state.audioChunks = [];
      state.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      state.mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          state.audioChunks.push(e.data);
        }
      };

      state.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());

        if (!state.audioChunks.length) {
          showToast('لم يتم التقاط صوت، حاول مجدداً', 'error');
          return;
        }

        const blobType = state.mediaRecorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(state.audioChunks, { type: blobType });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const base64Audio = String(reader.result || '');
          if (!base64Audio.startsWith('data:audio')) {
            showToast('فشل ترميز المقطع الصوتي', 'error');
            return;
          }

          try {
            const res = await fetch('/api/messages', {
              method: 'POST',
              headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ sender: me, to: peer, text: base64Audio })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل إرسال الرسالة الصوتية');

            state.messages.unshift(data);
            renderChatMessages();
            showToast('تم إرسال الرسالة الصوتية', 'success');
          } catch (err) {
            showToast(err.message || 'تعذر إرسال الرسالة الصوتية', 'error');
          }
        };

        reader.readAsDataURL(audioBlob);
      };

      state.mediaRecorder.start();
      state.isRecording = true;
      if (btn) btn.textContent = '⏹️';
      showToast('جاري التسجيل... اضغط ⏹️ للإرسال', 'info');
    } catch (err) {
      console.error('Microphone error:', err);
      showToast('تعذر الوصول إلى الميكروفون، تحقق من الأذونات أو HTTPS', 'error');
    }
  } else {
    stopVoiceRecordingIfActive();
  }
}

function stopVoiceRecordingIfActive() {
  const btn = document.getElementById('voiceRecordBtn');
  if (state.isRecording && state.mediaRecorder) {
    try {
      if (state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      }
    } catch (e) {
      console.warn('Error stopping recorder:', e);
    }
  }
  state.isRecording = false;
  if (btn) btn.textContent = '🎙️';
}

function toggleBlockCurrentPeer() {
  const peer = String(state.currentPeer || '').trim().toLowerCase();
  if (!peer) return;

  if (state.blockedUsers.includes(peer)) {
    unblockUser(peer);
  } else {
    state.blockedUsers.push(peer);
    saveJson(STORAGE_KEYS.blocked, state.blockedUsers);
    state.currentPeer = state.peers.find(u => !state.blockedUsers.includes(u)) || '';
    renderChatUsers();
    renderChatMessages();
    renderBlockedUsers();
    updateBlockButton();
    showToast(`تم حظر ${peer}`, 'info');
  }
}

function unblockUser(username) {
  const clean = String(username || '').trim().toLowerCase();
  state.blockedUsers = state.blockedUsers.filter(u => u !== clean);
  saveJson(STORAGE_KEYS.blocked, state.blockedUsers);
  if (!state.currentPeer) state.currentPeer = clean;
  renderChatUsers();
  renderChatMessages();
  renderBlockedUsers();
  updateBlockButton();
  showToast(`تم إلغاء حظر ${clean}`, 'success');
}

function renderBlockedUsers() {
  const container = document.getElementById('blockedUsersContainer');
  if (!container) return;

  if (state.blockedUsers.length === 0) {
    container.innerHTML = `<span style="font-size: 0.76rem; color: var(--text-muted);">لا يوجد مستخدمون محظورون</span>`;
    return;
  }

  container.innerHTML = state.blockedUsers
    .map(
      u => `
        <span class="blocked-chip">
          <span>${escapeHtml(u)}</span>
          <button type="button" style="background:none;border:none;color:#fff;cursor:pointer;font-weight:800;" onclick="unblockUser('${escapeHtml(u)}')">إلغاء</button>
        </span>
      `
    )
    .join('');
}

function updateBlockButton() {
  const btn = document.getElementById('toggleBlockBtn');
  if (!btn) return;
  const peer = String(state.currentPeer || '').trim().toLowerCase();
  btn.textContent = peer && state.blockedUsers.includes(peer) ? '✅ إلغاء الحظر' : '🚫 حظر';
}

// ==========================================
// الملف الشخصي
// ==========================================
function applyProfileHeader() {
  const avatarEl = document.getElementById('headerAvatar');
  const nameEl = document.getElementById('headerUsername');
  if (avatarEl) avatarEl.src = state.profile.avatar || DEFAULT_AVATAR;
  if (nameEl) nameEl.textContent = getActiveUsername() || state.profile.name || 'ملفك';
}

function openProfileModal() {
  state.uploadedAvatarImage = state.profile.avatar || DEFAULT_AVATAR;
  document.getElementById('profileName').value = getActiveUsername() || state.profile.name || '';
  document.getElementById('profileCity').value = state.profile.city || '';
  document.getElementById('profileBio').value = state.profile.bio || '';
  document.getElementById('profileAvatarPreview').src = state.uploadedAvatarImage;
  openModal('profile');
}

function saveProfile(event) {
  event.preventDefault();
  const name = document.getElementById('profileName').value.trim();
  if (!name) return;

  state.profile = {
    name,
    city: document.getElementById('profileCity').value.trim(),
    bio: document.getElementById('profileBio').value.trim(),
    avatar: state.uploadedAvatarImage || state.profile.avatar || DEFAULT_AVATAR
  };

  saveJson(STORAGE_KEYS.profile, state.profile);
  applyProfileHeader();
  closeActiveModal();
  showToast('تم حفظ بيانات الملف الشخصي', 'success');
}

// ==========================================
// التشغيل الأولي
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  applyProfileHeader();
  renderAuthHeader();
  renderCategories();
  fetchAds();
  fetchMessages();
});