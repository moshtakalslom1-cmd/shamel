const CATEGORIES = [
  'الكل',
  'سيارات ومركبات',
  'عقارات',
  'إلكترونيات وموبايلات',
  'أثاث ومنزل',
  'وظائف وخدمات',
  'أزياء ومستلزمات',
  'أخرى'
];

const STORAGE_KEYS = {
  ADS: 'lux_market_ads_v2',
  MESSAGES: 'lux_market_messages_v2',
  PROFILE: 'lux_market_profile_v2',
  BLOCKED: 'lux_market_blocked_v2'
};

const DEFAULT_ADS = [
  {
    _id: 'demo-1',
    title: 'سيارة عائلية نظيفة جاهزة للسفر',
    price: 8500,
    currency: 'USD',
    category: 'سيارات ومركبات',
    condition: 'مستعمل',
    city: 'حلب',
    neighbourhood: 'الفرقان',
    description: 'محرك ممتاز، مكيف شغال، صيانة دورية كاملة بدون أي أعطال.',
    image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=70',
    ownerUsername: 'أبو_عمر'
  },
  {
    _id: 'demo-2',
    title: 'شقة مشمسة إطلالة جميلة جاهزة للسكن',
    price: 42000,
    currency: 'USD',
    category: 'عقارات',
    condition: 'جديد',
    city: 'دمشق',
    neighbourhood: 'المزة',
    description: 'إكساء حديث، غرفتين وصالون، قريبة من الخدمات والمواصلات.',
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70',
    ownerUsername: 'طارق_العقارية'
  },
  {
    _id: 'demo-3',
    title: 'حاسوب مكتبي قوي للألعاب والمونتاج',
    price: 1250,
    currency: 'USD',
    category: 'إلكترونيات وموبايلات',
    condition: 'مستعمل',
    city: 'أنطاليا',
    neighbourhood: 'كورتيلي',
    description: 'أداء عالٍ ومستقر للعمل والمونتاج والبث المباشر، بحالة ممتازة.',
    image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=800&q=70',
    ownerUsername: 'مشتاق'
  }
];

let state = {
  ads: [],
  messages: [],
  blockedUsers: [],
  profile: {
    name: 'مشتاق',
    city: 'أنطاليا',
    bio: 'مستخدم نشط في السوق الشامل',
    avatar: ''
  },
  selectedCategory: 'الكل',
  activeModal: null, // 'details' | 'adForm' | 'chat' | 'profile' | null
  activeChatPeer: 'أبو_عمر',
  currentAdImage: '',
  currentProfileImage: '',
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false
};

/* ================= التنبيهات المخصصة داخل التطبيق ================= */
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
  }, 3600);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

/* ================= إدارة تاريخ المتصفح لزر الرجوع ================= */
function openModalWithHistory(modalName) {
  if (state.activeModal === modalName) return;
  state.activeModal = modalName;
  syncModalVisibility();
  try {
    history.pushState({ modal: modalName }, '', `#${modalName}`);
  } catch (_) {}
}

function closeActiveModal(fromPopState = false) {
  if (!state.activeModal) return;

  if (state.isRecording && state.mediaRecorder) {
    try { state.mediaRecorder.stop(); } catch (_) {}
    state.isRecording = false;
    resetVoiceButton();
  }

  state.activeModal = null;
  syncModalVisibility();

  if (!fromPopState && history.state && history.state.modal) {
    try { history.back(); } catch (_) {}
  } else {
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (_) {}
  }
}

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

function handleBackdropClick(event, modalName) {
  if (event.target.classList.contains('modal-backdrop') && state.activeModal === modalName) {
    closeActiveModal();
  }
}

function syncModalVisibility() {
  const map = {
    details: 'detailsModal',
    adForm: 'adFormModal',
    chat: 'chatModal',
    profile: 'profileModal'
  };

  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open', state.activeModal === key);
  });
}

window.addEventListener('popstate', () => {
  if (state.activeModal) closeActiveModal(true);
});

/* ================= تحميل وحفظ البيانات ================= */
async function initApp() {
  const savedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
  if (savedProfile) {
    try {
      state.profile = { ...state.profile, ...JSON.parse(savedProfile) };
    } catch (_) {}
  }
  renderProfileHeader();

  const savedBlocked = localStorage.getItem(STORAGE_KEYS.BLOCKED);
  if (savedBlocked) {
    try {
      state.blockedUsers = JSON.parse(savedBlocked);
    } catch (_) {}
  }

  const savedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
  if (savedMessages) {
    try {
      state.messages = JSON.parse(savedMessages);
    } catch (_) {}
  }

  if (!Array.isArray(state.messages) || !state.messages.length) {
    state.messages = [
      {
        id: 'm-1',
        from: 'أبو_عمر',
        to: state.profile.name,
        type: 'text',
        text: 'أهلاً بك، السيارة موجودة ومتاحة للمعاينة.',
        time: '10:15'
      }
    ];
    persistMessages();
  }

  renderCategories();
  populateCategorySelect();
  await loadAds();
}

async function loadAds() {
  try {
    const res = await fetch('/api/ads');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        state.ads = data;
        persistAds();
        renderAds();
        return;
      }
    }
  } catch (_) {}

  const localAds = localStorage.getItem(STORAGE_KEYS.ADS);
  if (localAds) {
    try {
      state.ads = JSON.parse(localAds);
    } catch (_) {
      state.ads = [...DEFAULT_ADS];
    }
  } else {
    state.ads = [...DEFAULT_ADS];
    persistAds();
  }
  renderAds();
}

function persistAds() {
  localStorage.setItem(STORAGE_KEYS.ADS, JSON.stringify(state.ads));
}

function persistMessages() {
  localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(state.messages));
}

function persistBlocked() {
  localStorage.setItem(STORAGE_KEYS.BLOCKED, JSON.stringify(state.blockedUsers));
}

/* ================= التصنيفات وعرض الإعلانات ================= */
function renderCategories() {
  const strip = document.getElementById('categoriesStrip');
  if (!strip) return;

  strip.innerHTML = CATEGORIES.map(cat => `
    <button type="button" class="cat-chip ${state.selectedCategory === cat ? 'active' : ''}" onclick="selectCategory('${escapeHtml(cat)}')">
      ${escapeHtml(cat)}
    </button>
  `).join('');
}

function populateCategorySelect() {
  const sel = document.getElementById('adCategory');
  if (!sel) return;

  sel.innerHTML = CATEGORIES.filter(c => c !== 'الكل')
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
}

function selectCategory(cat) {
  state.selectedCategory = cat;
  renderCategories();
  renderAds();
}

function renderAds() {
  const grid = document.getElementById('adsGrid');
  if (!grid) return;

  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const city = (document.getElementById('cityFilter')?.value || '').trim();
  const condition = (document.getElementById('conditionFilter')?.value || '').trim();
  const sort = document.getElementById('sortSelect')?.value || 'newest';

  let filtered = state.ads.filter(ad => {
    if (state.selectedCategory !== 'الكل' && ad.category !== state.selectedCategory) return false;
    if (condition && ad.condition !== condition) return false;
    if (
      city &&
      !String(ad.city || '').includes(city) &&
      !String(ad.neighbourhood || '').includes(city)
    ) {
      return false;
    }
    if (q) {
      const hay = `${ad.title || ''} ${ad.description || ''} ${ad.city || ''} ${ad.category || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'price-asc') {
    filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">لا توجد إعلانات مطابقة للبحث حالياً.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(ad => {
    const id = ad._id || ad.id;
    const imgSrc = ad.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=60';
    const priceFmt = `${Number(ad.price || 0).toLocaleString()} ${escapeHtml(ad.currency || 'USD')}`;
    const loc = [ad.city, ad.neighbourhood].filter(Boolean).join(' - ') || 'غير محدد';

    return `
      <article class="ad-card" onclick="openAdDetails('${escapeHtml(id)}')">
        <div class="ad-img-wrap">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" loading="lazy" />
          <span class="ad-badge-cat">${escapeHtml(ad.category || 'عام')}</span>
        </div>
        <div class="ad-body">
          <div class="ad-title">${escapeHtml(ad.title)}</div>
          <div class="ad-price">${priceFmt}</div>
          <div class="ad-meta">
            <span>📍 ${escapeHtml(loc)}</span>
            <span>${escapeHtml(ad.condition || 'مستعمل')}</span>
          </div>
        </div>
        <div class="ad-footer" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-diamond" style="flex:1;justify-content:center;" onclick="openChatWithPeer('${escapeHtml(ad.ownerUsername || 'صاحب_الإعلان')}', 'مرحباً، بخصوص إعلان: ${escapeHtml(ad.title)}')">
            💬 مراسلة
          </button>
          <button type="button" class="btn" onclick="openAdForm('${escapeHtml(id)}')">تعديل</button>
          <button type="button" class="btn btn-danger" onclick="deleteAd('${escapeHtml(id)}')">حذف</button>
        </div>
      </article>
    `;
  }).join('');
}

/* ================= تفاصيل الإعلان ================= */
function openAdDetails(id) {
  const ad = state.ads.find(item => String(item._id || item.id) === String(id));
  if (!ad) {
    showToast('الإعلان غير موجود', 'error');
    return;
  }

  const imgSrc = ad.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=70';
  const loc = [ad.city, ad.neighbourhood].filter(Boolean).join(' - ') || 'غير محدد';

  document.getElementById('detailTitle').textContent = ad.title;
  document.getElementById('detailContent').innerHTML = `
    <div class="preview-box" style="max-height:280px;margin-bottom:14px;">
      <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ad.title)}" style="max-height:280px;" />
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
      <div class="ad-price" style="font-size:1.25rem;">${Number(ad.price || 0).toLocaleString()} ${escapeHtml(ad.currency || 'USD')}</div>
      <span class="cat-chip active" style="cursor:default;">${escapeHtml(ad.category)} • ${escapeHtml(ad.condition || 'مستعمل')}</span>
    </div>
    <p style="color:var(--silver);font-size:0.9rem;margin-bottom:8px;">📍 الموقع: ${escapeHtml(loc)} | 👤 المعلن: ${escapeHtml(ad.ownerUsername || 'مستخدم')}</p>
    <p style="line-height:1.65;color:var(--text-main);margin-bottom:16px;">${escapeHtml(ad.description || 'لا يوجد وصف إضافي.')}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="btn btn-gold" style="flex:1;justify-content:center;" onclick="openChatWithPeer('${escapeHtml(ad.ownerUsername || 'صاحب_الإعلان')}', 'مرحباً، هل هذا العنصر متاح؟ (${escapeHtml(ad.title)})')">
        💬 مراسلة صاحب الإعلان
      </button>
      <button type="button" class="btn" onclick="openAdForm('${escapeHtml(id)}')">✏️ تعديل</button>
      <button type="button" class="btn btn-danger" onclick="deleteAd('${escapeHtml(id)}')">🗑️ حذف</button>
    </div>
  `;

  openModalWithHistory('details');
}

/* ================= إضافة / تعديل / حذف الإعلان ================= */
function openAdForm(editId = null) {
  const form = document.getElementById('adForm');
  if (form) form.reset();

  state.currentAdImage = '';
  document.getElementById('adImagePreviewBox').style.display = 'none';

  if (editId) {
    const ad = state.ads.find(item => String(item._id || item.id) === String(editId));
    if (!ad) {
      showToast('تعذر العثور على الإعلان للتعديل', 'error');
      return;
    }

    document.getElementById('adFormTitle').textContent = 'تعديل الإعلان';
    document.getElementById('editAdId').value = ad._id || ad.id;
    document.getElementById('adTitle').value = ad.title || '';
    document.getElementById('adPrice').value = ad.price ?? 0;
    document.getElementById('adCurrency').value = ad.currency || 'USD';
    document.getElementById('adCategory').value = ad.category || CATEGORIES[1];
    document.getElementById('adCondition').value = ad.condition || 'مستعمل';
    document.getElementById('adCity').value = ad.city || '';
    document.getElementById('adNeighbourhood').value = ad.neighbourhood || '';
    document.getElementById('adDescription').value = ad.description || '';

    if (ad.image) {
      state.currentAdImage = ad.image;
      if (!ad.image.startsWith('data:')) {
        document.getElementById('adImageUrl').value = ad.image;
      }
      showPreview('ad', ad.image);
    }
  } else {
    document.getElementById('adFormTitle').textContent = 'إضافة إعلان جديد';
    document.getElementById('editAdId').value = '';
    document.getElementById('adCity').value = state.profile.city || '';
  }

  openModalWithHistory('adForm');
}

function handleImageFile(event, target) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 8 ميجابايت', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    if (target === 'ad') {
      state.currentAdImage = dataUrl;
      document.getElementById('adImageUrl').value = '';
      showPreview('ad', dataUrl);
    } else {
      state.currentProfileImage = dataUrl;
      showPreview('profile', dataUrl);
    }
  };
  reader.readAsDataURL(file);
}

function handleImageUrl(event) {
  const url = event.target.value.trim();
  state.currentAdImage = url;
  if (url) {
    showPreview('ad', url);
  } else {
    document.getElementById('adImagePreviewBox').style.display = 'none';
  }
}

function showPreview(target, src) {
  if (target === 'ad') {
    document.getElementById('adImagePreview').src = src;
    document.getElementById('adImagePreviewBox').style.display = 'flex';
  } else {
    document.getElementById('profileImagePreview').src = src;
    document.getElementById('profilePreviewBox').style.display = 'flex';
  }
}

async function submitAdForm(event) {
  event.preventDefault();

  const editId = document.getElementById('editAdId').value.trim();
  const payload = {
    title: document.getElementById('adTitle').value.trim(),
    price: Number(document.getElementById('adPrice').value || 0),
    currency: document.getElementById('adCurrency').value,
    category: document.getElementById('adCategory').value,
    condition: document.getElementById('adCondition').value,
    city: document.getElementById('adCity').value.trim(),
    neighbourhood: document.getElementById('adNeighbourhood').value.trim(),
    description: document.getElementById('adDescription').value.trim(),
    image: state.currentAdImage || document.getElementById('adImageUrl').value.trim(),
    ownerUsername: state.profile.name || 'مستخدم'
  };

  if (!payload.title) {
    showToast('يرجى إدخال عنوان الإعلان', 'error');
    return;
  }

  try {
    if (editId) {
      let saved = { ...payload, _id: editId };
      try {
        const res = await fetch(`/api/ads/${encodeURIComponent(editId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) saved = await res.json();
      } catch (_) {}

      state.ads = state.ads.map(item =>
        String(item._id || item.id) === String(editId) ? { ...item, ...saved } : item
      );
      persistAds();
      renderAds();
      closeActiveModal();
      showToast('تم حفظ التعديلات بنجاح', 'success');
    } else {
      let created = { ...payload, _id: `ad-${Date.now()}` };
      try {
        const res = await fetch('/api/ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) created = await res.json();
      } catch (_) {}

      state.ads.unshift(created);
      persistAds();
      renderAds();
      closeActiveModal();
      showToast('تم نشر الإعلان بنجاح', 'success');
    }
  } catch (_) {
    showToast('حدث خطأ أثناء حفظ الإعلان', 'error');
  }
}

async function deleteAd(id) {
  try {
    await fetch(`/api/ads/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (_) {}

  state.ads = state.ads.filter(item => String(item._id || item.id) !== String(id));
  persistAds();
  renderAds();

  if (state.activeModal === 'details') {
    closeActiveModal();
  }
  showToast('تم حذف الإعلان', 'success');
}

/* ================= الدردشة المنفصلة + الصوت + الحظر ================= */
function isUserBlocked(username) {
  return state.blockedUsers.includes(username);
}

function getPeersList() {
  const set = new Set(['أبو_عمر', 'طارق_العقارية']);
  state.ads.forEach(a => {
    if (a.ownerUsername && a.ownerUsername !== state.profile.name) {
      set.add(a.ownerUsername);
    }
  });
  state.messages.forEach(m => {
    if (m.from && m.from !== state.profile.name) set.add(m.from);
    if (m.to && m.to !== state.profile.name) set.add(m.to);
  });
  return Array.from(set).filter(u => !isUserBlocked(u));
}

function openChatModal() {
  const peers = getPeersList();
  if ((!state.activeChatPeer || isUserBlocked(state.activeChatPeer)) && peers.length) {
    state.activeChatPeer = peers[0];
  }
  renderChatSidebar();
  renderChatMessages();
  openModalWithHistory('chat');
}

function openChatWithPeer(peerName, initialDraft = '') {
  const cleanPeer = (peerName || 'صاحب_الإعلان').trim();
  if (isUserBlocked(cleanPeer)) {
    showToast(`المستخدم (${cleanPeer}) محظور حالياً. يمكنك فك الحظر من قائمة المحظورين.`, 'error');
    return;
  }

  state.activeChatPeer = cleanPeer;
  renderChatSidebar();
  renderChatMessages();

  if (initialDraft) {
    document.getElementById('chatTextInput').value = initialDraft;
  }
  openModalWithHistory('chat');
}

function addOrSelectPeer(val) {
  const clean = (val || '').trim();
  if (!clean) return;

  if (isUserBlocked(clean)) {
    showToast(`(${clean}) موجود في قائمة المحظورين`, 'error');
    return;
  }

  state.activeChatPeer = clean;
  renderChatSidebar();
  renderChatMessages();
}

function renderChatSidebar() {
  const peers = getPeersList();
  const listEl = document.getElementById('chatUserList');
  if (listEl) {
    listEl.innerHTML = peers.length
      ? peers.map(p => `
          <div class="user-item ${p === state.activeChatPeer ? 'active' : ''}" onclick="selectChatPeer('${escapeHtml(p)}')">
            <span>👤 ${escapeHtml(p)}</span>
          </div>
        `).join('')
      : `<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">لا توجد محادثات نشطة</div>`;
  }

  const blockedEl = document.getElementById('blockedUsersList');
  if (blockedEl) {
    blockedEl.innerHTML = state.blockedUsers.length
      ? state.blockedUsers.map(b => `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-elevated);padding:6px 10px;border-radius:10px;font-size:0.82rem;">
            <span>${escapeHtml(b)}</span>
            <button type="button" class="btn" style="padding:4px 8px;font-size:0.75rem;" onclick="unblockUser('${escapeHtml(b)}')">فك الحظر</button>
          </div>
        `).join('')
      : `<div style="color:var(--text-muted);font-size:0.8rem;">لا يوجد مستخدمون محظورون</div>`;
  }

  const titleEl = document.getElementById('chatModalTitle');
  const blockBtn = document.getElementById('toggleBlockBtn');

  if (state.activeChatPeer) {
    if (titleEl) titleEl.textContent = `💬 دردشة مع ${state.activeChatPeer}`;
    if (blockBtn) {
      blockBtn.style.display = 'inline-flex';
      blockBtn.textContent = isUserBlocked(state.activeChatPeer) ? '✓ فك الحظر' : '🚫 حظر المستخدم';
    }
  } else {
    if (titleEl) titleEl.textContent = '💬 الدردشة المنفصلة';
    if (blockBtn) blockBtn.style.display = 'none';
  }
}

function selectChatPeer(peer) {
  state.activeChatPeer = peer;
  renderChatSidebar();
  renderChatMessages();
}

function toggleBlockCurrentPeer() {
  const peer = state.activeChatPeer;
  if (!peer) return;

  if (isUserBlocked(peer)) {
    unblockUser(peer);
  } else {
    state.blockedUsers.push(peer);
    persistBlocked();
    showToast(`تم حظر ${peer} وإضافته لقائمة المحظورين`, 'success');
    const nextPeers = getPeersList();
    state.activeChatPeer = nextPeers[0] || '';
    renderChatSidebar();
    renderChatMessages();
  }
}

function unblockUser(username) {
  state.blockedUsers = state.blockedUsers.filter(u => u !== username);
  persistBlocked();
  state.activeChatPeer = username;
  renderChatSidebar();
  renderChatMessages();
  showToast(`تم فك الحظر عن ${username}`, 'success');
}

function renderChatMessages() {
  const box = document.getElementById('chatMessages');
  if (!box) return;

  const peer = state.activeChatPeer;
  if (!peer) {
    box.innerHTML = `<div style="text-align:center;color:var(--text-muted);margin:auto;">اختر مستخدماً لبدء الدردشة</div>`;
    return;
  }

  if (isUserBlocked(peer)) {
    box.innerHTML = `<div style="text-align:center;color:#fca5a5;margin:auto;">هذا المستخدم محظور حالياً</div>`;
    return;
  }

  const me = state.profile.name || 'أنا';
  const thread = state.messages.filter(
    m => !isUserBlocked(m.from) && !isUserBlocked(m.to) &&
         ((m.from === me && m.to === peer) || (m.from === peer && m.to === me))
  );

  if (!thread.length) {
    box.innerHTML = `<div style="text-align:center;color:var(--text-muted);margin:auto;">ابدأ المحادثة مع ${escapeHtml(peer)} نصاً أو صوتاً</div>`;
    return;
  }

  box.innerHTML = thread.map(m => {
    const isMine = m.from === me;
    const bodyHtml = m.type === 'audio' && m.audioData
      ? `<div class="audio-player"><audio controls src="${m.audioData}" style="max-width:220px;height:32px;"></audio></div>`
      : `<div>${escapeHtml(m.text)}</div>`;

    return `
      <div class="msg-bubble ${isMine ? 'msg-me' : 'msg-other'}">
        ${bodyHtml}
        <span class="msg-time">${escapeHtml(m.time || '')}</span>
      </div>
    `;
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function sendChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById('chatTextInput');
  const text = (input?.value || '').trim();

  if (!text) {
    showToast('اكتب رسالة أو استخدم التسجيل الصوتي', 'error');
    return;
  }

  appendMessage({ type: 'text', text });
  input.value = '';
}

function sendQuickPhrase(phrase) {
  appendMessage({ type: 'text', text: phrase });
}

function resetVoiceButton() {
  const btn = document.getElementById('voiceRecordBtn');
  if (!btn) return;
  btn.textContent = '🎙️ صوت';
  btn.classList.remove('btn-danger');
}

async function toggleVoiceRecording() {
  const btn = document.getElementById('voiceRecordBtn');
  if (!state.activeChatPeer || isUserBlocked(state.activeChatPeer)) {
    showToast('اختر مستخدماً غير محظور أولاً', 'error');
    return;
  }

  if (!state.isRecording) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('الميكروفون غير مدعوم في هذا المتصفح', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      state.mediaRecorder = new MediaRecorder(stream);

      state.mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
      };

      state.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = ev => {
          appendMessage({ type: 'audio', text: 'رسالة صوتية', audioData: ev.target.result });
          showToast('تم إرسال الرسالة الصوتية', 'success');
        };
        reader.readAsDataURL(blob);
      };

      state.mediaRecorder.start();
      state.isRecording = true;
      if (btn) {
        btn.textContent = '⏹️ إيقاف';
        btn.classList.add('btn-danger');
      }
      showToast('جاري التسجيل الصوتي... اضغط إيقاف للإرسال');
    } catch (_) {
      showToast('تعذر الوصول إلى الميكروفون، تأكد من منح الإذن', 'error');
    }
  } else {
    try { state.mediaRecorder.stop(); } catch (_) {}
    state.isRecording = false;
    resetVoiceButton();
  }
}

function appendMessage({ type = 'text', text = '', audioData = '' }) {
  const me = state.profile.name || 'أنا';
  const peer = state.activeChatPeer;
  if (!peer || isUserBlocked(peer)) return;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const msg = {
    id: `msg-${Date.now()}`,
    from: me,
    to: peer,
    type,
    text,
    audioData,
    time: timeStr
  };

  state.messages.push(msg);
  persistMessages();
  renderChatSidebar();
  renderChatMessages();

  fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: me,
      to: peer,
      text: type === 'audio' ? '[رسالة صوتية]' : text
    })
  }).catch(() => {});
}

/* ================= الملف التعريفي ================= */
function openProfileModal() {
  document.getElementById('profileName').value = state.profile.name || '';
  document.getElementById('profileCity').value = state.profile.city || '';
  document.getElementById('profileBio').value = state.profile.bio || '';
  state.currentProfileImage = state.profile.avatar || '';

  if (state.currentProfileImage) {
    showPreview('profile', state.currentProfileImage);
  } else {
    document.getElementById('profilePreviewBox').style.display = 'none';
  }

  openModalWithHistory('profile');
}

function saveProfile(event) {
  event.preventDefault();
  const name = document.getElementById('profileName').value.trim();
  if (!name) {
    showToast('يرجى إدخال الاسم الظاهر', 'error');
    return;
  }

  state.profile = {
    name,
    city: document.getElementById('profileCity').value.trim(),
    bio: document.getElementById('profileBio').value.trim(),
    avatar: state.currentProfileImage || state.profile.avatar || ''
  };

  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(state.profile));
  renderProfileHeader();
  closeActiveModal();
  showToast('تم تحديث الملف التعريفي بنجاح', 'success');
}

function renderProfileHeader() {
  const nameEl = document.getElementById('headerUsername');
  if (nameEl) nameEl.textContent = state.profile.name || 'الملف التعريفي';

  const img = document.getElementById('headerAvatar');
  if (img) {
    if (state.profile.avatar) {
      img.src = state.profile.avatar;
      img.style.display = 'inline-block';
    } else {
      img.style.display = 'none';
    }
  }
}

initApp();