const API = {
  ads: '/api/ads',
  messages: '/api/messages',
  register: '/api/auth/register',
  login: '/api/auth/login'
};

const STORAGE_KEYS = {
  session: 'elite_souq_session_v1',
  profiles: 'elite_souq_profiles_v1',
  blocks: 'elite_souq_blocks_v1',
  localAds: 'elite_souq_local_ads_v1',
  localMessages: 'elite_souq_local_messages_v1'
};

const CATEGORIES = [
  { id: 'all', label: 'الكل', icon: '❖' },
  { id: 'سيارات ومركبات', label: 'سيارات ومركبات', icon: '◈' },
  { id: 'عقارات', label: 'عقارات', icon: '✦' },
  { id: 'إلكترونيات وكمبيوتر', label: 'إلكترونيات وكمبيوتر', icon: '❖' },
  { id: 'هواتف وأجهزة ذكية', label: 'هواتف وأجهزة ذكية', icon: '◈' },
  { id: 'أدوات منزلية', label: 'أدوات منزلية', icon: '✦' },
  { id: 'أزياء وموضة', label: 'أزياء وموضة', icon: '❖' },
  { id: 'حيوانات أليفة وطيور', label: 'حيوانات أليفة وطيور', icon: '◈' },
  { id: 'خدمات ومهن', label: 'خدمات ومهن', icon: '✦' }
];

const DEFAULT_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=elite';

const state = {
  session: loadJson(STORAGE_KEYS.session, null),
  profiles: loadJson(STORAGE_KEYS.profiles, {}),
  blocks: loadJson(STORAGE_KEYS.blocks, {}),
  ads: [],
  messages: [],
  selectedCategory: 'all',
  activePeer: '',
  activeModal: null,
  draftAdImage: '',
  draftAvatarImage: '',
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  pollTimer: null
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // تجاهل أخطاء امتلاء التخزين المحلي مؤقتاً
  }
}

function normUser(u) {
  return String(u || '').trim().toLowerCase();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" class="btn" style="padding: 2px 7px; font-size: 0.72rem;" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function apiRequest(url, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (state.session && state.session.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${state.session.token}`;
  }
  const res = await fetch(url, Object.assign({}, options, { headers }));
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    const txt = await res.text().catch(() => '');
    data = txt ? { message: txt } : null;
  }
  if (!res.ok) {
    const errMsg = (data && data.message) || `فشل الطلب (${res.status})`;
    throw new Error(errMsg);
  }
  return data;
}

function getCurrentUser() {
  return state.session && state.session.username ? normUser(state.session.username) : '';
}

function getUserProfile(username) {
  const key = normUser(username);
  const base = state.profiles[key] || {};
  return {
    displayName: base.displayName || key || 'مستخدم',
    city: base.city || '',
    bio: base.bio || '',
    avatar: base.avatar || `${DEFAULT_AVATAR}-${encodeURIComponent(key || 'guest')}`
  };
}

function updateAuthUI() {
  const user = getCurrentUser();
  const statusEl = document.getElementById('authStatusText');
  const authBtn = document.getElementById('authOpenBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const headerName = document.getElementById('headerUsername');
  const headerAvatar = document.getElementById('headerAvatar');

  if (user) {
    const prof = getUserProfile(user);
    if (statusEl) statusEl.textContent = `متصل بحساب: ${prof.displayName} (@${user})`;
    if (authBtn) authBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (headerName) headerName.textContent = prof.displayName;
    if (headerAvatar) headerAvatar.src = prof.avatar;
  } else {
    if (statusEl) statusEl.textContent = 'تصفح حر • سجل دخولك للنشر والدردشة';
    if (authBtn) authBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (headerName) headerName.textContent = 'ملفك';
    if (headerAvatar) headerAvatar.src = DEFAULT_AVATAR;
  }
}

function goHome() {
  state.selectedCategory = 'all';
  const search = document.getElementById('searchInput');
  const city = document.getElementById('cityFilter');
  const cond = document.getElementById('conditionFilter');
  const sort = document.getElementById('sortSelect');
  if (search) search.value = '';
  if (city) city.value = '';
  if (cond) cond.value = '';
  if (sort) sort.value = 'newest';
  renderCategories();
  renderAds();
}

function renderCategories() {
  const strip = document.getElementById('categoriesStrip');
  const select = document.getElementById('adCategory');

  if (strip) {
    strip.innerHTML = CATEGORIES.map(cat => {
      const active = state.selectedCategory === cat.id ? 'active' : '';
      return `<button type="button" class="cat-chip ${active}" onclick="selectCategory('${escapeHtml(cat.id)}')">
        <span class="ornament-diamond">${escapeHtml(cat.icon)}</span>
        <span>${escapeHtml(cat.label)}</span>
      </button>`;
    }).join('');
  }

  if (select) {
    const validCats = CATEGORIES.filter(c => c.id !== 'all');
    select.innerHTML = validCats
      .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
      .join('');
  }
}

function selectCategory(catId) {
  state.selectedCategory = catId;
  renderCategories();
  renderAds();
}

async function fetchAds() {
  try {
    const remoteAds = await apiRequest(API.ads);
    if (Array.isArray(remoteAds)) {
      state.ads = remoteAds;
      saveJson(STORAGE_KEYS.localAds, remoteAds);
      renderAds();
      return;
    }
  } catch {
    // في حال عدم توفر الاتصال بالسيرفر، نستخدم النسخة المحلية المخزنة
  }
  state.ads = loadJson(STORAGE_KEYS.localAds, []);
  renderAds();
}

function renderAds() {
  const grid = document.getElementById('adsGrid');
  if (!grid) return;

  const q = String(document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const city = String(document.getElementById('cityFilter')?.value || '').trim();
  const cond = String(document.getElementById('conditionFilter')?.value || '').trim();
  const sort = String(document.getElementById('sortSelect')?.value || 'newest');
  const currentUser = getCurrentUser();

  let list = state.ads.filter(ad => {
    if (state.selectedCategory !== 'all' && ad.category !== state.selectedCategory) return false;
    if (city && String(ad.city || '').trim() !== city) return false;
    if (cond && String(ad.condition || '').trim() !== cond) return false;
    if (q) {
      const hay = `${ad.title || ''} ${ad.description || ''} ${ad.city || ''} ${ad.category || ''} ${ad.ownerUsername || ''}`.toLowerCase();
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

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">لا توجد إعلانات مطابقة للبحث أو الفلاتر الحالية.</div>`;
    return;
  }

  grid.innerHTML = list.map(ad => {
    const id = String(ad._id || ad.id || '');
    const owner = normUser(ad.ownerUsername);
    const isOwner = Boolean(currentUser && owner && currentUser === owner);
    const imgSrc = ad.image || 'https://via.placeholder.com/480x300/150926/f6c453?text=ELITE+SOUQ';
    const curr = ad.currency || 'USD';
    const priceText = `${Number(ad.price || 0).toLocaleString()} ${curr}`;
    const locText = [ad.city, ad.neighbourhood].filter(Boolean).join(' - ') || 'غير محدد';

    const actionButtons = isOwner
      ? `<button type="button" class="btn btn-gold" onclick="event.stopPropagation(); openEditAd('${escapeHtml(id)}')">تعديل</button>
         <button type="button" class="btn btn-danger" onclick="event.stopPropagation(); deleteAdById('${escapeHtml(id)}')">حذف</button>`
      : `<button type="button" class="btn btn-diamond" onclick="event.stopPropagation(); startChatWith('${escapeHtml(owner)}')">مراسلة المعلن</button>`;

    return `<article class="ad-card" onclick="openAdDetails('${escapeHtml(id)}')">
      <div class="ad-img-wrap">
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" loading="lazy" />
        <span class="ad-badge-cat">◈ ${escapeHtml(ad.category || 'عام')}</span>
        <span class="ad-badge-owner">✦ @${escapeHtml(owner || 'معلن')}</span>
      </div>
      <div class="ad-body">
        <div class="ad-title">${escapeHtml(ad.title || 'بدون عنوان')}</div>
        <div class="ad-price">${escapeHtml(priceText)}</div>
        <div class="ad-meta">
          <span>❖ ${escapeHtml(locText)}</span>
          <span>${escapeHtml(ad.condition || 'مستعمل')}</span>
        </div>
      </div>
      <div class="ad-footer">${actionButtons}</div>
    </article>`;
  }).join('');
}

function openModal(id) {
  closeActiveModal();
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    state.activeModal = id;
  }
}

function closeActiveModal() {
  if (state.activeModal) {
    const el = document.getElementById(state.activeModal);
    if (el) el.classList.remove('open');
    state.activeModal = null;
  }
  stopVoiceRecordingIfNeeded();
}

function handleBackdropClick(event, type) {
  if (event.target && event.target.classList.contains('modal-backdrop')) {
    closeActiveModal();
  }
}

function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  openModal('authModal');
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('tabLogin');
  const regTab = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  const isLogin = tab === 'login';
  loginTab?.classList.toggle('active', isLogin);
  regTab?.classList.toggle('active', !isLogin);
  if (loginForm) loginForm.style.display = isLogin ? 'block' : 'none';
  if (regForm) regForm.style.display = isLogin ? 'none' : 'block';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = normUser(document.getElementById('loginUsername')?.value);
  const password = String(document.getElementById('loginPassword')?.value || '');
  if (!username || !password) return showToast('يرجى إدخال الاسم وكلمة المرور', 'error');

  try {
    const data = await apiRequest(API.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    state.session = { username, token: data?.user?.token || '' };
    saveJson(STORAGE_KEYS.session, state.session);
    updateAuthUI();
    closeActiveModal();
    showToast(`أهلاً بك @${username}`, 'success');
    await Promise.all([fetchAds(), fetchMessages()]);
  } catch (err) {
    showToast(err.message || 'فشل تسجيل الدخول', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = normUser(document.getElementById('regUsername')?.value);
  const password = String(document.getElementById('regPassword')?.value || '');
  if (!username || !password) return showToast('يرجى إدخال الاسم وكلمة المرور', 'error');

  try {
    const data = await apiRequest(API.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    state.session = { username, token: data?.user?.token || '' };
    saveJson(STORAGE_KEYS.session, state.session);
    updateAuthUI();
    closeActiveModal();
    showToast(`تم إنشاء الحساب @${username} بنجاح`, 'success');
    await Promise.all([fetchAds(), fetchMessages()]);
  } catch (err) {
    showToast(err.message || 'فشل إنشاء الحساب', 'error');
  }
}

function logoutUser() {
  state.session = null;
  saveJson(STORAGE_KEYS.session, null);
  updateAuthUI();
  renderAds();
  showToast('تم تسجيل الخروج', 'info');
}

function openAdForm(adObj = null) {
  if (!getCurrentUser()) {
    showToast('سجل دخولك أولاً لنشر أو تعديل الإعلانات', 'error');
    openAuthModal('login');
    return;
  }

  renderCategories();
  const titleEl = document.getElementById('adFormTitle');
  const idEl = document.getElementById('editAdId');
  const titleInput = document.getElementById('adTitle');
  const priceInput = document.getElementById('adPrice');
  const catInput = document.getElementById('adCategory');
  const condInput = document.getElementById('adCondition');
  const currInput = document.getElementById('adCurrency');
  const cityInput = document.getElementById('adCity');
  const hoodInput = document.getElementById('adNeighbourhood');
  const descInput = document.getElementById('adDescription');
  const urlInput = document.getElementById('adImageUrl');
  const fileInput = document.getElementById('adImageFile');
  const prevBox = document.getElementById('adImagePreviewBox');
  const prevImg = document.getElementById('adImagePreview');

  if (fileInput) fileInput.value = '';
  state.draftAdImage = adObj?.image || '';

  if (adObj) {
    if (titleEl) titleEl.textContent = 'تعديل الإعلان';
    if (idEl) idEl.value = String(adObj._id || adObj.id || '');
    if (titleInput) titleInput.value = adObj.title || '';
    if (priceInput) priceInput.value = adObj.price ?? 0;
    if (catInput) catInput.value = adObj.category || CATEGORIES[1].id;
    if (condInput) condInput.value = adObj.condition || 'مستعمل';
    if (currInput) currInput.value = adObj.currency || 'USD';
    if (cityInput) cityInput.value = adObj.city || '';
    if (hoodInput) hoodInput.value = adObj.neighbourhood || '';
    if (descInput) descInput.value = adObj.description || '';
    if (urlInput) urlInput.value = adObj.image && adObj.image.startsWith('http') ? adObj.image : '';
  } else {
    const prof = getUserProfile(getCurrentUser());
    if (titleEl) titleEl.textContent = 'إضافة إعلان جديد';
    if (idEl) idEl.value = '';
    if (titleInput) titleInput.value = '';
    if (priceInput) priceInput.value = '';
    if (catInput) catInput.value = CATEGORIES[1].id;
    if (condInput) condInput.value = 'مستعمل';
    if (currInput) currInput.value = 'USD';
    if (cityInput) cityInput.value = prof.city || '';
    if (hoodInput) hoodInput.value = '';
    if (descInput) descInput.value = '';
    if (urlInput) urlInput.value = '';
  }

  if (prevBox && prevImg) {
    if (state.draftAdImage) {
      prevImg.src = state.draftAdImage;
      prevBox.style.display = 'flex';
    } else {
      prevImg.src = '';
      prevBox.style.display = 'none';
    }
  }

  openModal('adFormModal');
}

function openEditAd(id) {
  const ad = state.ads.find(item => String(item._id || item.id) === String(id));
  if (!ad) return showToast('الإعلان غير موجود', 'error');
  if (normUser(ad.ownerUsername) !== getCurrentUser()) {
    return showToast('لا تملك صلاحية تعديل هذا الإعلان', 'error');
  }
  openAdForm(ad);
}

function handleImageFile(event, target) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    if (target === 'ad') {
      state.draftAdImage = result;
      const box = document.getElementById('adImagePreviewBox');
      const img = document.getElementById('adImagePreview');
      if (box && img) {
        img.src = result;
        box.style.display = 'flex';
      }
    } else if (target === 'avatar') {
      state.draftAvatarImage = result;
      const img = document.getElementById('profileAvatarPreview');
      if (img) img.src = result;
    }
  };
  reader.readAsDataURL(file);
}

function handleImageUrl(event) {
  const url = String(event.target?.value || '').trim();
  state.draftAdImage = url;
  const box = document.getElementById('adImagePreviewBox');
  const img = document.getElementById('adImagePreview');
  if (box && img) {
    if (url) {
      img.src = url;
      box.style.display = 'flex';
    } else {
      img.src = '';
      box.style.display = 'none';
    }
  }
}

async function submitAdForm(e) {
  e.preventDefault();
  if (!getCurrentUser()) return showToast('يجب تسجيل الدخول أولاً', 'error');

  const editId = String(document.getElementById('editAdId')?.value || '').trim();
  const payload = {
    title: String(document.getElementById('adTitle')?.value || '').trim(),
    price: Number(document.getElementById('adPrice')?.value || 0),
    category: String(document.getElementById('adCategory')?.value || '').trim(),
    condition: String(document.getElementById('adCondition')?.value || 'مستعمل').trim(),
    currency: String(document.getElementById('adCurrency')?.value || 'USD').trim(),
    city: String(document.getElementById('adCity')?.value || '').trim(),
    neighbourhood: String(document.getElementById('adNeighbourhood')?.value || '').trim(),
    description: String(document.getElementById('adDescription')?.value || '').trim(),
    image: state.draftAdImage
  };

  if (!payload.title || !payload.category) {
    return showToast('يرجى إدخال عنوان الإعلان واختيار القسم', 'error');
  }

  try {
    if (editId) {
      await apiRequest(`${API.ads}/${encodeURIComponent(editId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('تم تعديل الإعلان بنجاح', 'success');
    } else {
      await apiRequest(API.ads, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('تم نشر الإعلان بنجاح', 'success');
    }
    closeActiveModal();
    await fetchAds();
  } catch (err) {
    showToast(err.message || 'فشل حفظ الإعلان', 'error');
  }
}

async function deleteAdById(id) {
  if (!getCurrentUser()) return showToast('يجب تسجيل الدخول أولاً', 'error');
  const ad = state.ads.find(item => String(item._id || item.id) === String(id));
  if (!ad) return showToast('الإعلان غير موجود', 'error');
  if (normUser(ad.ownerUsername) !== getCurrentUser()) {
    return showToast('لا تملك صلاحية حذف هذا الإعلان', 'error');
  }

  try {
    await apiRequest(`${API.ads}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('تم حذف الإعلان بنجاح', 'success');
    if (state.activeModal === 'detailsModal') closeActiveModal();
    await fetchAds();
  } catch (err) {
    showToast(err.message || 'فشل حذف الإعلان', 'error');
  }
}

function openAdDetails(id) {
  const ad = state.ads.find(item => String(item._id || item.id) === String(id));
  if (!ad) return;

  const titleEl = document.getElementById('detailTitle');
  const contentEl = document.getElementById('detailContent');
  const owner = normUser(ad.ownerUsername);
  const isOwner = Boolean(getCurrentUser() && owner === getCurrentUser());
  const imgSrc = ad.image || 'https://via.placeholder.com/640x360/150926/f6c453?text=ELITE+SOUQ';

  if (titleEl) titleEl.textContent = ad.title || 'تفاصيل الإعلان';
  if (contentEl) {
    contentEl.innerHTML = `
      <div style="margin-bottom: 12px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border-gold); background: #06030d; text-align: center;">
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" style="max-height: 300px; max-width: 100%; object-fit: contain;" />
      </div>
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-bottom: 10px;">
        <div style="font-size: 1.15rem; font-weight: 800; color: var(--gold-bright);">${Number(ad.price || 0).toLocaleString()} ${escapeHtml(ad.currency || 'USD')}</div>
        <div style="font-size: 0.84rem; color: var(--diamond-bright);">◈ ${escapeHtml(ad.category || '')} • ${escapeHtml(ad.condition || 'مستعمل')}</div>
      </div>
      <div style="font-size: 0.84rem; color: var(--silver); margin-bottom: 10px;">
        ❖ الموقع: ${escapeHtml([ad.city, ad.neighbourhood].filter(Boolean).join(' - ') || 'غير محدد')} • المعلن: <strong>@${escapeHtml(owner || 'معلن')}</strong>
      </div>
      <p style="font-size: 0.88rem; color: var(--text-main); line-height: 1.65; white-space: pre-wrap; background: rgba(6, 3, 12, 0.75); padding: 12px; border-radius: 12px; border: 1px solid rgba(226,232,240,0.14);">${escapeHtml(ad.description || 'لا يوجد وصف إضافي.')}</p>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 14px;">
        ${
          isOwner
            ? `<button type="button" class="btn btn-gold" onclick="openEditAd('${escapeHtml(id)}')">تعديل الإعلان</button>
               <button type="button" class="btn btn-danger" onclick="deleteAdById('${escapeHtml(id)}')">حذف الإعلان</button>`
            : `<button type="button" class="btn btn-diamond" onclick="startChatWith('${escapeHtml(owner)}')">مراسلة المعلن</button>`
        }
        <button type="button" class="btn" onclick="closeActiveModal()">إغلاق</button>
      </div>
    `;
  }

  openModal('detailsModal');
}

function getBlockedSet(username = getCurrentUser()) {
  const u = normUser(username);
  const arr = Array.isArray(state.blocks[u]) ? state.blocks[u] : [];
  return new Set(arr.map(normUser).filter(Boolean));
}

function isBlockedUser(peer, username = getCurrentUser()) {
  return getBlockedSet(username).has(normUser(peer));
}

function toggleBlockCurrentPeer() {
  const me = getCurrentUser();
  const peer = normUser(state.activePeer);
  if (!me) return showToast('سجل دخولك أولاً', 'error');
  if (!peer || peer === me) return showToast('اختر مستخدماً آخر لحظر أو إلغاء حظر حسابه', 'error');

  const set = getBlockedSet(me);
  if (set.has(peer)) {
    set.delete(peer);
    showToast(`تم إلغاء حظر @${peer}`, 'success');
  } else {
    set.add(peer);
    showToast(`تم حظر @${peer}`, 'info');
  }
  state.blocks[me] = Array.from(set);
  saveJson(STORAGE_KEYS.blocks, state.blocks);
  renderChatUI();
}

function unblockUser(peer) {
  const me = getCurrentUser();
  const target = normUser(peer);
  if (!me || !target) return;
  const set = getBlockedSet(me);
  set.delete(target);
  state.blocks[me] = Array.from(set);
  saveJson(STORAGE_KEYS.blocks, state.blocks);
  renderChatUI();
  showToast(`تم إلغاء حظر @${target}`, 'success');
}

async function fetchMessages() {
  try {
    const remoteMsgs = await apiRequest(API.messages);
    if (Array.isArray(remoteMsgs)) {
      state.messages = remoteMsgs;
      saveJson(STORAGE_KEYS.localMessages, remoteMsgs);
      if (state.activeModal === 'chatModal') renderChatUI();
      return;
    }
  } catch {
    // استخدام النسخة المحلية في حال انقطاع الاتصال
  }
  state.messages = loadJson(STORAGE_KEYS.localMessages, []);
  if (state.activeModal === 'chatModal') renderChatUI();
}

function openChatModal(initialPeer = '') {
  if (!getCurrentUser()) {
    showToast('سجل دخولك أولاً لاستخدام الدردشة', 'error');
    openAuthModal('login');
    return;
  }
  if (initialPeer) state.activePeer = normUser(initialPeer);
  renderChatUI();
  openModal('chatModal');
  fetchMessages();
}

function startChatWith(peerUsername) {
  const peer = normUser(peerUsername);
  if (!peer) return showToast('تعذر تحديد حساب المعلن', 'error');
  if (peer === getCurrentUser()) return showToast('هذا إعلانك الخاص', 'info');
  openChatModal(peer);
}

function addOrSelectPeer(rawName) {
  const peer = normUser(rawName);
  if (!peer) return;
  if (peer === getCurrentUser()) return showToast('لا يمكنك مراسلة نفسك', 'info');
  state.activePeer = peer;
  renderChatUI();
}

function renderChatUI() {
  const me = getCurrentUser();
  if (!me) return;

  const blockedSet = getBlockedSet(me);
  const peers = new Set();

  if (state.activePeer) peers.add(normUser(state.activePeer));
  state.messages.forEach(m => {
    const s = normUser(m.sender);
    const t = normUser(m.to);
    if (s === me && t && t !== me) peers.add(t);
    if (t === me && s && s !== me) peers.add(s);
  });
  state.ads.forEach(a => {
    const o = normUser(a.ownerUsername);
    if (o && o !== me) peers.add(o);
  });

  const peerList = Array.from(peers).filter(Boolean);
  if (!state.activePeer && peerList.length > 0) {
    state.activePeer = peerList[0];
  }

  const userListEl = document.getElementById('chatUserList');
  const titleEl = document.getElementById('chatModalTitle');
  const blockBtn = document.getElementById('toggleBlockBtn');
  const msgsEl = document.getElementById('chatMessages');
  const blockedCont = document.getElementById('blockedUsersContainer');

  if (titleEl) {
    titleEl.innerHTML = state.activePeer
      ? `<span class="ornament-diamond">◈</span> محادثة مع @${escapeHtml(state.activePeer)}`
      : `<span class="ornament-diamond">◈</span> الدردشة المباشرة`;
  }

  if (blockBtn) {
    const isBlocked = state.activePeer ? blockedSet.has(normUser(state.activePeer)) : false;
    blockBtn.textContent = isBlocked ? '✓ إلغاء الحظر' : '🚫 حظر';
  }

  if (userListEl) {
    if (!peerList.length) {
      userListEl.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 8px;">اكتب اسم مستخدم بالأعلى لبدء محادثة.</div>`;
    } else {
      userListEl.innerHTML = peerList.map(p => {
        const active = p === normUser(state.activePeer) ? 'active' : '';
        const bBadge = blockedSet.has(p) ? ' <span style="color:#fca5a5;font-size:0.7rem;">(محظور)</span>' : '';
        return `<div class="user-item ${active}" onclick="addOrSelectPeer('${escapeHtml(p)}')">
          <span>@${escapeHtml(p)}${bBadge}</span>
        </div>`;
      }).join('');
    }
  }

  if (blockedCont) {
    const arr = Array.from(blockedSet);
    blockedCont.innerHTML = arr.length
      ? arr.map(u => `<span class="blocked-chip">@${escapeHtml(u)} <button type="button" style="background:none;border:none;color:#fff;cursor:pointer;font-weight:700;" onclick="unblockUser('${escapeHtml(u)}')">✕</button></span>`).join('')
      : `<span style="font-size: 0.76rem; color: var(--text-muted);">لا يوجد مستخدمون محظورون.</span>`;
  }

  if (msgsEl) {
    const peer = normUser(state.activePeer);
    if (!peer) {
      msgsEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);margin:auto;font-size:0.84rem;">اختر مستخدماً لبدء الدردشة.</div>`;
      return;
    }

    if (blockedSet.has(peer)) {
      msgsEl.innerHTML = `<div style="text-align:center;color:#fca5a5;margin:auto;font-size:0.84rem;">هذا المستخدم محظور حالياً. قم بإلغاء الحظر لعرض أو إرسال الرسائل.</div>`;
      return;
    }

    const thread = state.messages
      .filter(m => {
        const s = normUser(m.sender);
        const t = normUser(m.to);
        return (s === me && t === peer) || (s === peer && t === me);
      })
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    if (!thread.length) {
      msgsEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);margin:auto;font-size:0.84rem;">لا توجد رسائل بعد مع @${escapeHtml(peer)}.</div>`;
      return;
    }

    msgsEl.innerHTML = thread.map(m => {
      const isMine = normUser(m.sender) === me;
      const cls = isMine ? 'msg-me' : 'msg-other';
      const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
      const rawText = String(m.text || '');
      const bodyHtml = rawText.startsWith('data:audio')
        ? `<audio controls src="${escapeHtml(rawText)}" style="max-width: 220px; height: 34px;"></audio>`
        : `<span>${escapeHtml(rawText)}</span>`;
      return `<div class="msg-bubble ${cls}">${bodyHtml}<span class="msg-time">${escapeHtml(timeStr)}</span></div>`;
    }).join('');

    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
}

function insertQuickPhrase(text) {
  const input = document.getElementById('chatTextInput');
  if (!input) return;
  input.value = text;
  input.focus();
}

async function sendChatMessage(e) {
  e.preventDefault();
  const me = getCurrentUser();
  const peer = normUser(state.activePeer);
  const input = document.getElementById('chatTextInput');
  const text = String(input?.value || '').trim();

  if (!me) return showToast('يجب تسجيل الدخول أولاً', 'error');
  if (!peer) return showToast('اختر مستخدماً لإرسال الرسالة إليه', 'error');
  if (isBlockedUser(peer, me)) return showToast('المستخدم محظور في قائمتك', 'error');
  if (!text) return;

  try {
    const saved = await apiRequest(API.messages, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: peer, text })
    });
    if (saved && typeof saved === 'object') {
      state.messages.unshift(saved);
    } else {
      state.messages.unshift({ sender: me, to: peer, text, createdAt: new Date().toISOString() });
    }
    saveJson(STORAGE_KEYS.localMessages, state.messages);
    if (input) input.value = '';
    renderChatUI();
  } catch (err) {
    showToast(`تعذر إرسال الرسالة: ${err.message}`, 'error');
  }
}

async function toggleVoiceRecording() {
  const btn = document.getElementById('voiceRecordBtn');
  if (!state.isRecording) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showToast('المتصفح لا يدعم التسجيل الصوتي', 'error');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      state.mediaRecorder = new MediaRecorder(stream);
      state.mediaRecorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) state.audioChunks.push(ev.data);
      };
      state.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(state.audioChunks, { type: state.mediaRecorder?.mimeType || 'audio/webm' });
        if (!blob.size) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const audioDataUrl = String(reader.result || '');
          const peer = normUser(state.activePeer);
          if (!audioDataUrl || !peer) return;
          try {
            const saved = await apiRequest(API.messages, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: peer, text: audioDataUrl })
            });
            state.messages.unshift(saved || { sender: getCurrentUser(), to: peer, text: audioDataUrl, createdAt: new Date().toISOString() });
            saveJson(STORAGE_KEYS.localMessages, state.messages);
            renderChatUI();
            showToast('تم إرسال الرسالة الصوتية', 'success');
          } catch (err) {
            showToast(`فشل إرسال الصوت: ${err.message}`, 'error');
          }
        };
        reader.readAsDataURL(blob);
      };
      state.mediaRecorder.start();
      state.isRecording = true;
      if (btn) btn.textContent = '⏹️';
      showToast('جاري التسجيل الصوتي... اضغط مجدداً للإرسال', 'info');
    } catch {
      showToast('تعذر الوصول إلى الميكروفون', 'error');
    }
  } else {
    stopVoiceRecordingIfNeeded();
  }
}

function stopVoiceRecordingIfNeeded() {
  const btn = document.getElementById('voiceRecordBtn');
  if (state.isRecording && state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  state.isRecording = false;
  if (btn) btn.textContent = '🎙️';
}

function openProfileModal() {
  const user = getCurrentUser();
  const prof = getUserProfile(user || 'guest');
  state.draftAvatarImage = prof.avatar;

  const prev = document.getElementById('profileAvatarPreview');
  const cardUser = document.getElementById('profileCardUsername');
  const cardCity = document.getElementById('profileCardCity');
  const cardBio = document.getElementById('profileCardBio');
  const adsCountEl = document.getElementById('profileAdsCount');
  const nameInput = document.getElementById('profileName');
  const cityInput = document.getElementById('profileCity');
  const bioInput = document.getElementById('profileBio');
  const myAdsBox = document.getElementById('profileMyAdsList');

  if (prev) prev.src = prof.avatar;
  if (cardUser) cardUser.textContent = user ? `@${user}` : 'زائر';
  if (cardCity) cardCity.textContent = prof.city ? `❖ ${prof.city}` : 'المدينة غير محددة';
  if (cardBio) cardBio.textContent = prof.bio || 'أضف نبذة تعريفية قصيرة لتظهر في ملفك الموسع.';
  if (nameInput) nameInput.value = prof.displayName;
  if (cityInput) cityInput.value = prof.city;
  if (bioInput) bioInput.value = prof.bio;

  const mine = user ? state.ads.filter(a => normUser(a.ownerUsername) === user) : [];
  if (adsCountEl) adsCountEl.textContent = String(mine.length);

  if (myAdsBox) {
    if (!user) {
      myAdsBox.innerHTML = `<div style="font-size:0.78rem;color:var(--text-muted);">سجل دخولك لعرض إعلاناتك وإدارتها من هنا.</div>`;
    } else if (!mine.length) {
      myAdsBox.innerHTML = `<div style="font-size:0.78rem;color:var(--text-muted);">لم تنشر أي إعلان بعد.</div>`;
    } else {
      myAdsBox.innerHTML = mine.map(a => {
        const aid = String(a._id || a.id || '');
        return `<div class="my-ad-mini-item">
          <strong style="color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(a.title)}</strong>
          <span style="color:var(--gold-bright);">${Number(a.price || 0).toLocaleString()} ${escapeHtml(a.currency || 'USD')}</span>
          <div style="display:flex;gap:4px;margin-top:2px;">
            <button type="button" class="btn btn-gold" style="padding:2px 6px;font-size:0.7rem;" onclick="openEditAd('${escapeHtml(aid)}')">تعديل</button>
            <button type="button" class="btn btn-danger" style="padding:2px 6px;font-size:0.7rem;" onclick="deleteAdById('${escapeHtml(aid)}')">حذف</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  openModal('profileModal');
}

function saveProfile(e) {
  e.preventDefault();
  const user = getCurrentUser();
  if (!user) {
    showToast('سجل دخولك أولاً لحفظ الملف الشخصي', 'error');
    openAuthModal('login');
    return;
  }

  const displayName = String(document.getElementById('profileName')?.value || '').trim() || user;
  const city = String(document.getElementById('profileCity')?.value || '').trim();
  const bio = String(document.getElementById('profileBio')?.value || '').trim();
  const avatar = state.draftAvatarImage || getUserProfile(user).avatar;

  state.profiles[user] = { displayName, city, bio, avatar };
  saveJson(STORAGE_KEYS.profiles, state.profiles);
  updateAuthUI();
  closeActiveModal();
  showToast('تم حفظ بيانات الملف الشخصي بنجاح', 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
  renderCategories();
  updateAuthUI();
  await Promise.all([fetchAds(), fetchMessages()]);
  state.pollTimer = setInterval(fetchMessages, 6000);
});