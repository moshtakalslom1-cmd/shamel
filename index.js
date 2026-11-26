const API_BASE = '';
const STORAGE_KEYS = {
  state: 'saha_market_state_v1'
};

const CATEGORIES = [
  'الكل',
  'عقارات',
  'سيارات',
  'إلكترونيات',
  'أثاث ومنزل',
  'خدمات'
];

const DEFAULT_ADS = [
  {
    id: 'ad-1',
    title: 'شقة بإطلالة واسعة وتجهيز كامل',
    price: 125000,
    currency: '$',
    category: 'عقارات',
    city: 'اللاذقية',
    sellerName: 'أبو كريم',
    createdAt: 'منذ ساعتين',
    desc: 'شقة حديثة مع موقف سيارة وتهوية ممتازة، جاهزة للسكن الفوري.'
  },
  {
    id: 'ad-2',
    title: 'سيدان بحالة ممتازة صيانة دورية',
    price: 19500,
    currency: '$',
    category: 'سيارات',
    city: 'دمشق',
    sellerName: 'رامي الحسن',
    createdAt: 'منذ 4 ساعات',
    desc: 'فحص كامل، محرك نظيف، لا تحتاج لأي مصاريف إضافية.'
  },
  {
    id: 'ad-3',
    title: 'شاشة مكتبية عالية الدقة للمونتاج والعمل',
    price: 14500,
    currency: '₺',
    category: 'إلكترونيات',
    city: 'أنطاليا',
    sellerName: 'طارق محمود',
    createdAt: 'منذ 6 ساعات',
    desc: 'ألوان دقيقة واستجابة سريعة، مناسبة للعمل المكتبي وتصميم المحتوى.'
  },
  {
    id: 'ad-4',
    title: 'طقم جلوس مودرن قماش مقاوم للبقع',
    price: 9200,
    currency: '₺',
    category: 'أثاث ومنزل',
    city: 'إسطنبول',
    sellerName: 'مها الشامي',
    createdAt: 'منذ يوم',
    desc: 'استخدام خفيف جداً، خشب متين وقماش مريح وسهل التنظيف.'
  },
  {
    id: 'ad-5',
    title: 'صيانة وتجهيز شبكات وحواسيب مكتبية',
    price: 1200,
    currency: '₺',
    category: 'خدمات',
    city: 'حلب',
    sellerName: 'سامر النجار',
    createdAt: 'منذ يومين',
    desc: 'تشخيص الأعطال، تنظيف وتبديل معجون التبريد، وتهيئة أنظمة العمل.'
  }
];

const DEFAULT_THREADS = [
  {
    id: 'thread-1',
    sellerName: 'أبو كريم',
    adTitle: 'شقة بإطلالة واسعة وتجهيز كامل',
    messages: [
      {
        id: 'm-1',
        sender: 'other',
        type: 'text',
        text: 'أهلاً بك، الإعلان متوفر ويمكن المعاينة في المواعيد المناسبة.',
        time: '12:10'
      }
    ]
  },
  {
    id: 'thread-2',
    sellerName: 'طارق محمود',
    adTitle: 'شاشة مكتبية عالية الدقة للمونتاج والعمل',
    messages: [
      {
        id: 'm-2',
        sender: 'other',
        type: 'text',
        text: 'مرحباً، الشاشة بكامل ملحقاتها وتعمل بكفاءة عالية.',
        time: 'أمس'
      }
    ]
  }
];

function createInitialState() {
  return {
    user: null,
    darkMode: false,
    lang: 'ar',
    defaultCity: '',
    selectedCategory: 'الكل',
    searchQuery: '',
    sortBy: 'newest',
    activeThreadId: 'thread-1',
    ads: DEFAULT_ADS,
    myAds: [],
    threads: DEFAULT_THREADS
  };
}

let appState = loadState();
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return {
      ...createInitialState(),
      ...parsed,
      ads: Array.isArray(parsed.ads) && parsed.ads.length ? parsed.ads : DEFAULT_ADS,
      threads: Array.isArray(parsed.threads) && parsed.threads.length ? parsed.threads : DEFAULT_THREADS
    };
  } catch (err) {
    console.error('خطأ في قراءة الحالة المحفوظة:', err);
    return createInitialState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(appState));
  } catch (err) {
    console.error('تعذر حفظ الحالة محلياً:', err);
  }
}

function showToast(message) {
  const toast = document.getElementById('toastMsg');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

function formatTimeNow() {
  const now = new Date();
  return now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/* التنقل بين الصفحات */
function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === viewId);
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
  if (viewId === 'view-messages') {
    renderMessagesView();
  } else if (viewId === 'view-my-ads') {
    renderMyAds();
  } else if (viewId === 'view-account') {
    renderAccountView();
  }
}

/* نافذة تسجيل الدخول وإنشاء الحساب */
function openAuthModal(defaultTab = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('open');
  switchAuthTab(defaultTab);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('open');
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const isLogin = tab === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);
  loginForm.style.display = isLogin ? 'block' : 'none';
  registerForm.style.display = isLogin ? 'none' : 'block';
}

async function authenticateWithBackend(name, password, mode = 'login') {
  try {
    const res = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, mode })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'فشل تسجيل الدخول');
    }

    return data.user || { name };
  } catch (err) {
    if (err instanceof TypeError) {
      return { name };
    }
    throw err;
  }
}

/* تسجيل دخول مبسّط عبر السيرفر (اسم + كلمة مرور) */
async function handleLoginSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('loginIdentifier').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!name || !password) {
    showToast('اكتب الاسم وكلمة المرور');
    return;
  }

  try {
    const user = await authenticateWithBackend(name, password, 'login');
    appState.user = { id: user.id || null, name: user.name || name };
    saveState();
    closeAuthModal();
    updateAuthUI();
    renderMessagesView();
    renderAccountView();
    showToast(`أهلاً بك ${appState.user.name}`);
  } catch (err) {
    showToast(err.message || 'تعذر تسجيل الدخول');
  }
}

/* إنشاء حساب مبسّط عبر السيرفر (اسم + كلمة مرور) */
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  if (!name || !password) {
    showToast('اكتب الاسم وكلمة المرور');
    return;
  }

  try {
    const user = await authenticateWithBackend(name, password, 'register');
    appState.user = { id: user.id || null, name: user.name || name };
    saveState();
    closeAuthModal();
    updateAuthUI();
    renderMessagesView();
    renderAccountView();
    showToast(`تم تسجيل ${appState.user.name} بنجاح`);
  } catch (err) {
    showToast(err.message || 'تعذر إنشاء الحساب');
  }
}

function logoutUser() {
  appState.user = null;
  saveState();
  updateAuthUI();
  renderMessagesView();
  renderAccountView();
  showToast('تم تسجيل الخروج');
}

function updateAuthUI() {
  const openAuthBtn = document.getElementById('openAuthBtn');
  if (!openAuthBtn) return;
  openAuthBtn.textContent = appState.user ? appState.user.name : 'تسجيل الدخول';
}

/* التصنيفات والإعلانات */
function renderCategories() {
  const strip = document.getElementById('categoriesStrip');
  if (!strip) return;
  strip.innerHTML = '';
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-pill ${appState.selectedCategory === cat ? 'active' : ''}`;
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      appState.selectedCategory = cat;
      saveState();
      renderCategories();
      renderListings();
    });
    strip.appendChild(btn);
  });
}

function getFilteredAds() {
  const q = appState.searchQuery.trim().toLowerCase();
  const city = document.getElementById('cityFilter')?.value || appState.defaultCity || '';
  const sort = document.getElementById('sortFilter')?.value || appState.sortBy || 'newest';

  const allAds = [...appState.myAds, ...appState.ads];
  const filtered = allAds.filter((ad) => {
    const matchCat = appState.selectedCategory === 'الكل' || ad.category === appState.selectedCategory;
    const matchCity = !city || ad.city === city;
    const matchQuery =
      !q ||
      ad.title.toLowerCase().includes(q) ||
      ad.city.toLowerCase().includes(q) ||
      ad.category.toLowerCase().includes(q) ||
      (ad.desc && ad.desc.toLowerCase().includes(q));
    return matchCat && matchCity && matchQuery;
  });

  if (sort === 'price-asc') {
    filtered.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => Number(b.price) - Number(a.price));
  }

  return filtered;
}

function createAdCardElement(ad, showDelete = false) {
  const card = document.createElement('article');
  card.className = 'ad-card';

  const thumb = document.createElement('div');
  thumb.className = 'ad-thumb';
  thumb.textContent = ad.category;

  const badge = document.createElement('span');
  badge.className = 'ad-badge';
  badge.textContent = ad.city;
  thumb.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'ad-body';

  const price = document.createElement('div');
  price.className = 'ad-price';
  price.textContent = `${Number(ad.price).toLocaleString('ar-EG')} ${ad.currency || '₺'}`;

  const title = document.createElement('h3');
  title.className = 'ad-title';
  title.textContent = ad.title;

  const desc = document.createElement('p');
  desc.className = 'brand-sub';
  desc.textContent = ad.desc || '';

  const meta = document.createElement('div');
  meta.className = 'ad-meta';
  meta.innerHTML = `<span>${ad.sellerName || 'معلن'}</span><span>${ad.createdAt || 'الآن'}</span>`;

  const actions = document.createElement('div');
  actions.className = 'ad-actions';

  const chatBtn = document.createElement('button');
  chatBtn.type = 'button';
  chatBtn.className = 'btn-primary';
  chatBtn.textContent = 'مراسلة البائع';
  chatBtn.addEventListener('click', () => startChatWithSeller(ad.sellerName || 'البائع', ad.title));

  actions.appendChild(chatBtn);

  if (showDelete) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-outline';
    delBtn.textContent = 'حذف';
    delBtn.addEventListener('click', () => deleteMyAd(ad.id));
    actions.appendChild(delBtn);
  }

  body.appendChild(price);
  body.appendChild(title);
  if (ad.desc) body.appendChild(desc);
  body.appendChild(meta);
  body.appendChild(actions);

  card.appendChild(thumb);
  card.appendChild(body);
  return card;
}

function renderListings() {
  const grid = document.getElementById('listingsGrid');
  const heading = document.getElementById('listingsHeading');
  if (!grid) return;

  const list = getFilteredAds();
  if (heading) {
    heading.textContent =
      appState.selectedCategory === 'الكل'
        ? `الإعلانات المتاحة (${list.length})`
        : `${appState.selectedCategory} (${list.length})`;
  }

  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = '<div class="panel-card" style="grid-column: 1 / -1;">لا توجد إعلانات مطابقة لخيارات البحث الحالية.</div>';
    return;
  }

  list.forEach((ad) => grid.appendChild(createAdCardElement(ad, false)));
}

function handleCreateAd(e) {
  e.preventDefault();
  const title = document.getElementById('adTitleInput').value.trim();
  const price = Number(document.getElementById('adPriceInput').value);
  const category = document.getElementById('adCategoryInput').value;
  const city = document.getElementById('adCityInput').value;
  const desc = document.getElementById('adDescInput').value.trim();

  if (!title || !price || price <= 0) {
    showToast('يرجى إدخال عنوان صحيح وسعر مناسب');
    return;
  }

  const newAd = {
    id: `my-${Date.now()}`,
    title,
    price,
    currency: city === 'أنطاليا' || city === 'إسطنبول' ? '₺' : '$',
    category,
    city,
    sellerName: appState.user ? appState.user.name : 'حسابي',
    createdAt: 'الآن',
    desc
  };

  appState.myAds.unshift(newAd);
  saveState();
  e.target.reset();
  renderMyAds();
  renderListings();
  showToast('تم نشر إعلانك بنجاح');
}

function deleteMyAd(adId) {
  appState.myAds = appState.myAds.filter((item) => item.id !== adId);
  saveState();
  renderMyAds();
  renderListings();
  showToast('تم حذف الإعلان');
}

function renderMyAds() {
  const grid = document.getElementById('myAdsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!appState.myAds.length) {
    grid.innerHTML = '<div class="panel-card" style="grid-column: 1 / -1;">لم تقم بإضافة أي إعلان بعد.</div>';
    return;
  }
  appState.myAds.forEach((ad) => grid.appendChild(createAdCardElement(ad, true)));
}

/* المحادثات والتسجيل الصوتي */
function startChatWithSeller(sellerName, adTitle) {
  if (!appState.user) {
    openAuthModal('login');
    showToast('سجّل دخولك أولاً لبدء المحادثة');
    return;
  }

  let thread = appState.threads.find((t) => t.sellerName === sellerName && t.adTitle === adTitle);
  if (!thread) {
    thread = {
      id: `thread-${Date.now()}`,
      sellerName,
      adTitle,
      messages: [
        {
          id: `m-${Date.now()}`,
          sender: 'other',
          type: 'text',
          text: `مرحباً بك بخصوص إعلان: ${adTitle}`,
          time: formatTimeNow()
        }
      ]
    };
    appState.threads.unshift(thread);
  }

  appState.activeThreadId = thread.id;
  saveState();
  switchView('view-messages');
}

function renderMessagesView() {
  const notice = document.getElementById('authRequiredNotice');
  const workspace = document.getElementById('chatWorkspace');
  if (!notice || !workspace) return;

  if (!appState.user) {
    notice.style.display = 'block';
    workspace.style.display = 'none';
    return;
  }

  notice.style.display = 'none';
  workspace.style.display = 'grid';
  renderThreadsList();
  renderChatMessages();
}

function renderThreadsList() {
  const container = document.getElementById('chatThreads');
  if (!container) return;
  container.innerHTML = '';

  appState.threads.forEach((thread) => {
    const div = document.createElement('div');
    div.className = `thread-item ${thread.id === appState.activeThreadId ? 'active' : ''}`;
    div.innerHTML = `
      <strong>${thread.sellerName}</strong>
      <span class="brand-sub">${thread.adTitle}</span>
    `;
    div.addEventListener('click', () => {
      appState.activeThreadId = thread.id;
      saveState();
      renderThreadsList();
      renderChatMessages();
    });
    container.appendChild(div);
  });
}

function renderChatMessages() {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const thread = appState.threads.find((t) => t.id === appState.activeThreadId) || appState.threads[0];
  box.innerHTML = '';
  if (!thread) return;

  thread.messages.forEach((msg) => {
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${msg.sender === 'me' ? 'msg-me' : 'msg-other'}`;

    if (msg.type === 'audio' && msg.audioData) {
      const label = document.createElement('div');
      label.textContent = 'رسالة صوتية';
      label.style.fontWeight = '700';
      label.style.marginBottom = '4px';

      const audioEl = document.createElement('audio');
      audioEl.controls = true;
      audioEl.src = msg.audioData;
      audioEl.style.maxWidth = '100%';

      bubble.appendChild(label);
      bubble.appendChild(audioEl);
    } else {
      const textEl = document.createElement('div');
      textEl.textContent = msg.text;
      bubble.appendChild(textEl);
    }

    const timeEl = document.createElement('div');
    timeEl.textContent = msg.time || '';
    timeEl.style.fontSize = '0.72rem';
    timeEl.style.opacity = '0.8';
    timeEl.style.marginTop = '4px';
    bubble.appendChild(timeEl);

    box.appendChild(bubble);
  });

  box.scrollTop = box.scrollHeight;
}

function sendTextMessage() {
  if (!appState.user) {
    openAuthModal('login');
    return;
  }
  const input = document.getElementById('chatTextInput');
  const text = input?.value.trim();
  if (!text) return;

  const thread = appState.threads.find((t) => t.id === appState.activeThreadId) || appState.threads[0];
  if (!thread) return;

  thread.messages.push({
    id: `msg-${Date.now()}`,
    sender: 'me',
    type: 'text',
    text,
    time: formatTimeNow()
  });

  input.value = '';
  saveState();
  renderChatMessages();
}

async function toggleVoiceRecording() {
  if (!appState.user) {
    openAuthModal('login');
    showToast('سجّل دخولك أولاً لإرسال رسالة صوتية');
    return;
  }

  const btn = document.getElementById('voiceRecordBtn');
  if (!isRecording) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('المتصفح لا يدعم التسجيل الصوتي المباشر');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          const thread = appState.threads.find((t) => t.id === appState.activeThreadId) || appState.threads[0];
          if (thread && typeof base64Audio === 'string') {
            thread.messages.push({
              id: `aud-${Date.now()}`,
              sender: 'me',
              type: 'audio',
              audioData: base64Audio,
              time: formatTimeNow()
            });
            saveState();
            renderChatMessages();
            showToast('تم إرسال التسجيل الصوتي');
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      isRecording = true;
      btn.classList.add('recording');
      btn.textContent = 'إيقاف وإرسال';
      showToast('جاري التسجيل الصوتي...');
    } catch (err) {
      console.error('خطأ في الوصول للميكروفون:', err);
      showToast('تعذر الوصول إلى الميكروفون، تأكد من منح الصلاحية');
    }
  } else {
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = 'تسجيل صوت';
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }
}

/* الإعدادات والحساب */
function applyThemeAndLang() {
  document.body.classList.toggle('dark-mode', Boolean(appState.darkMode));
  const cityFilter = document.getElementById('cityFilter');
  if (cityFilter && appState.defaultCity) {
    cityFilter.value = appState.defaultCity;
  }
  const locLabel = document.getElementById('activeLocationLabel');
  if (locLabel) {
    locLabel.textContent = `الموقع: ${appState.defaultCity || 'جميع المدن'}`;
  }
}

function renderAccountView() {
  const nameEl = document.getElementById('profileNameDisplay');
  const statusEl = document.getElementById('profileStatusDisplay');
  const actionBtn = document.getElementById('accountAuthActionBtn');
  const themeBadge = document.getElementById('themeStateBadge');
  const langBadge = document.getElementById('langStateBadge');
  const cityBadge = document.getElementById('cityStateBadge');

  if (appState.user) {
    nameEl.textContent = appState.user.name;
    statusEl.textContent = 'مسجّل الدخول';
    actionBtn.textContent = 'تسجيل الخروج';
    actionBtn.onclick = logoutUser;
  } else {
    nameEl.textContent = 'زائر غير مسجل';
    statusEl.textContent = 'سجّل دخولك أو أنشئ حساباً لإدارة إعلاناتك ومحادثاتك';
    actionBtn.textContent = 'تسجيل الدخول / إنشاء حساب';
    actionBtn.onclick = () => openAuthModal('login');
  }

  if (themeBadge) themeBadge.textContent = appState.darkMode ? 'مظلم' : 'نهاري';
  if (langBadge) langBadge.textContent = appState.lang === 'tr' ? 'التركية (TR)' : 'العربية (AR)';
  if (cityBadge) cityBadge.textContent = appState.defaultCity || 'الكل';
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('openAuthBtn')?.addEventListener('click', () => {
    if (appState.user) {
      switchView('view-account');
    } else {
      openAuthModal('login');
    }
  });

  document.getElementById('msgLoginBtn')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuthModal);
  document.getElementById('tabLogin')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegisterSubmit);

  document.getElementById('searchBtn')?.addEventListener('click', () => {
    appState.searchQuery = document.getElementById('searchInput')?.value || '';
    appState.defaultCity = document.getElementById('cityFilter')?.value || '';
    appState.sortBy = document.getElementById('sortFilter')?.value || 'newest';
    saveState();
    applyThemeAndLang();
    renderListings();
  });

  document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('searchBtn')?.click();
    }
  });

  document.getElementById('newAdQuickBtn')?.addEventListener('click', () => switchView('view-my-ads'));
  document.getElementById('createAdForm')?.addEventListener('submit', handleCreateAd);
  document.getElementById('sendMsgBtn')?.addEventListener('click', sendTextMessage);
  document.getElementById('voiceRecordBtn')?.addEventListener('click', toggleVoiceRecording);

  const toggleDark = () => {
    appState.darkMode = !appState.darkMode;
    saveState();
    applyThemeAndLang();
    renderAccountView();
  };

  const toggleLang = () => {
    appState.lang = appState.lang === 'ar' ? 'tr' : 'ar';
    saveState();
    renderAccountView();
    showToast(appState.lang === 'tr' ? 'تم اختيار وضع اللغة التركية' : 'تم اختيار وضع اللغة العربية');
  };

  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleDark);
  document.getElementById('menuThemeRow')?.addEventListener('click', toggleDark);
  document.getElementById('langToggleBtn')?.addEventListener('click', toggleLang);
  document.getElementById('menuLangRow')?.addEventListener('click', toggleLang);

  document.getElementById('menuCityRow')?.addEventListener('click', () => {
    const cities = ['', 'دمشق', 'حلب', 'اللاذقية', 'أنطاليا', 'إسطنبول'];
    const idx = cities.indexOf(appState.defaultCity);
    appState.defaultCity = cities[(idx + 1) % cities.length];
    saveState();
    applyThemeAndLang();
    renderListings();
    renderAccountView();
    showToast(`المدينة الافتراضية: ${appState.defaultCity || 'الكل'}`);
  });

  document.getElementById('menuResetDemoRow')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.state);
    appState = createInitialState();
    saveState();
    applyThemeAndLang();
    updateAuthUI();
    renderCategories();
    renderListings();
    renderMyAds();
    renderMessagesView();
    renderAccountView();
    showToast('تمت استعادة البيانات الافتراضية');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyThemeAndLang();
  updateAuthUI();
  renderCategories();
  renderListings();
  renderMyAds();
  renderAccountView();
  bindEvents();
});