const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// رفع حد حجم البيانات لاستيعاب الصور المرفوعة (Base64) بسلاسة
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw || '')).digest('hex');
}

function getDefaultData() {
  return {
    users: [
      {
        username: 'sham_mobile',
        passwordHash: hashPassword('123456'),
        city: 'دمشق',
        phone: '0933000111',
        bio: 'متجر متخصص بأحدث الهواتف الذكية والأجهزة الأصلية في دمشق.',
        avatar: ''
      },
      {
        username: 'aleppo_auto',
        passwordHash: hashPassword('123456'),
        city: 'حلب',
        phone: '0944000222',
        bio: 'بيع وشراء وتبديل السيارات والمركبات بحالة فنية موثوقة.',
        avatar: ''
      },
      {
        username: 'coast_estate',
        passwordHash: hashPassword('123456'),
        city: 'اللاذقية',
        phone: '0955000333',
        bio: 'مكتب عقاري للشقق والمنازل والأراضي على الساحل السوري.',
        avatar: ''
      },
      {
        username: 'pets_syria',
        passwordHash: hashPassword('123456'),
        city: 'حمص',
        phone: '0966000444',
        bio: 'تربية ورعاية الحيوانات الأليفة والطيور ومستلزماتها.',
        avatar: ''
      }
    ],
    ads: [
      {
        id: '101',
        title: 'سامسونج S24 الترا 512 جيجا',
        price: '18500000',
        currency: 'ل.س',
        category: 'هواتف وأجهزة ذكية',
        subCategory: 'سامسونج جالاكسي (Samsung)',
        city: 'دمشق',
        neighborhood: 'المزة',
        condition: 'جديد',
        description: 'جهاز أصلي جديد بالكرتونة بكامل ملحقاته.',
        ownerUsername: 'sham_mobile',
        image: '',
        reviews: [],
        createdAt: new Date().toISOString()
      },
      {
        id: '102',
        title: 'سيارة كيا سيراتو 2016',
        price: '92000000',
        currency: 'ل.س',
        category: 'سيارات ومركبات',
        subCategory: 'كيا',
        city: 'حلب',
        neighborhood: 'الشهباء',
        condition: 'مستعمل',
        description: 'ميكانيك ممتاز وجاهزية كاملة للفحص.',
        ownerUsername: 'aleppo_auto',
        image: '',
        reviews: [],
        createdAt: new Date().toISOString()
      },
      {
        id: '103',
        title: 'شقة سكنية 140 متر إكساء حديث',
        price: '320000000',
        currency: 'ل.س',
        category: 'عقارات',
        subCategory: 'شقق للبيع',
        city: 'اللاذقية',
        neighborhood: 'الزراعة',
        condition: 'جديد',
        description: 'طابق ثالث، إطلالة جميلة، تهوية ممتازة.',
        ownerUsername: 'coast_estate',
        image: '',
        reviews: [],
        createdAt: new Date().toISOString()
      },
      {
        id: '104',
        title: 'قطط شيرازية صغيرة عمر شهرين',
        price: '1200000',
        currency: 'ل.س',
        category: 'حيوانات أليفة وطيور',
        subCategory: 'قطط',
        city: 'حمص',
        neighborhood: 'الحمراء',
        condition: 'جديد',
        description: 'نشيطة وسليمة ومعتادة على الرمل.',
        ownerUsername: 'pets_syria',
        image: '',
        reviews: [],
        createdAt: new Date().toISOString()
      }
    ],
    messages: []
  };
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = getDefaultData();
      writeData(initial);
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      ads: Array.isArray(parsed.ads) ? parsed.ads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch (err) {
    console.error('Error reading data.json:', err);
    return getDefaultData();
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing data.json:', err);
  }
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    city: u.city || 'دمشق',
    phone: u.phone || '',
    bio: u.bio || '',
    avatar: u.avatar || ''
  };
}

// تسجيل حساب جديد
app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const city = String(req.body.city || 'دمشق').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const db = readData();
  const exists = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
  }

  const newUser = {
    username,
    passwordHash: hashPassword(password),
    city,
    phone: '',
    bio: '',
    avatar: ''
  };

  db.users.push(newUser);
  writeData(db);
  return res.status(201).json({ user: sanitizeUser(newUser) });
});

// تسجيل الدخول
app.post('/api/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const db = readData();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  return res.json({ user: sanitizeUser(user) });
});

// جلب بيانات مستخدم وإعلاناته
app.get('/api/users/:username', (req, res) => {
  const target = String(req.params.username || '').trim().toLowerCase();
  const db = readData();
  const found = db.users.find(u => u.username.toLowerCase() === target);
  const userAds = db.ads.filter(ad => String(ad.ownerUsername || '').toLowerCase() === target);

  if (!found) {
    return res.json({
      username: req.params.username,
      city: 'دمشق',
      phone: '',
      bio: '',
      avatar: '',
      adsCount: userAds.length,
      ads: userAds
    });
  }

  return res.json({
    ...sanitizeUser(found),
    adsCount: userAds.length,
    ads: userAds
  });
});

// تحديث إعدادات الملف الشخصي
app.put('/api/profile/settings', (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
  }

  const db = readData();
  let user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    user = {
      username,
      passwordHash: hashPassword('123456'),
      city: 'دمشق',
      phone: '',
      bio: '',
      avatar: ''
    };
    db.users.push(user);
  }

  if (typeof req.body.city === 'string') user.city = req.body.city.trim();
  if (typeof req.body.phone === 'string') user.phone = req.body.phone.trim();
  if (typeof req.body.bio === 'string') user.bio = req.body.bio.trim();
  if (typeof req.body.avatar === 'string') user.avatar = req.body.avatar;

  writeData(db);
  return res.json({ user: sanitizeUser(user) });
});

// جلب كل الإعلانات
app.get('/api/ads', (req, res) => {
  const db = readData();
  return res.json(db.ads);
});

// نشر إعلان جديد
app.post('/api/ads', (req, res) => {
  const title = String(req.body.title || '').trim();
  const rawPrice = String(req.body.price || '').replace(/[^\d]/g, '');
  if (!title || !rawPrice) {
    return res.status(400).json({ error: 'العنوان والسعر مطلوبان' });
  }

  const db = readData();
  const newAd = {
    id: String(req.body.id || Date.now()),
    title,
    price: rawPrice,
    currency: 'ل.س',
    category: String(req.body.category || 'عام').trim(),
    subCategory: String(req.body.subCategory || '').trim(),
    city: String(req.body.city || 'دمشق').trim(),
    neighborhood: String(req.body.neighborhood || '').trim(),
    condition: String(req.body.condition || 'مستعمل').trim(),
    description: String(req.body.description || '').trim(),
    ownerUsername: String(req.body.ownerUsername || 'مستخدم').trim(),
    image: typeof req.body.image === 'string' ? req.body.image : '',
    reviews: Array.isArray(req.body.reviews) ? req.body.reviews : [],
    createdAt: req.body.createdAt || new Date().toISOString()
  };

  db.ads.unshift(newAd);
  writeData(db);
  return res.status(201).json(newAd);
});

// إضافة تقييم لإعلان
app.post('/api/ads/:id/reviews', (req, res) => {
  const adId = String(req.params.id || '');
  const db = readData();
  const ad = db.ads.find(a => String(a.id) === adId);
  if (!ad) {
    return res.status(404).json({ error: 'الإعلان غير موجود' });
  }

  if (!Array.isArray(ad.reviews)) ad.reviews = [];
  ad.reviews.push({
    author: String(req.body.author || 'زائر').trim(),
    rating: String(req.body.rating || '5').trim(),
    comment: String(req.body.comment || '').trim(),
    createdAt: new Date().toISOString()
  });

  writeData(db);
  return res.status(201).json(ad);
});

// حذف إعلان
app.delete('/api/ads/:id', (req, res) => {
  const adId = String(req.params.id || '');
  const db = readData();
  const before = db.ads.length;
  db.ads = db.ads.filter(a => String(a.id) !== adId);
  if (db.ads.length === before) {
    return res.status(404).json({ error: 'الإعلان غير موجود' });
  }
  writeData(db);
  return res.json({ deleted: true, id: adId });
});

// جلب رسائل مستخدم
app.get('/api/messages', (req, res) => {
  const user = String(req.query.user || '').trim().toLowerCase();
  const db = readData();
  if (!user) {
    return res.json({ messages: db.messages });
  }
  const filtered = db.messages.filter(m => {
    const f = String(m.from || '').toLowerCase();
    const t = String(m.to || '').toLowerCase();
    return f === user || t === user;
  });
  return res.json({ messages: filtered });
});

// إرسال رسالة جديدة
app.post('/api/messages', (req, res) => {
  const from = String(req.body.from || req.body.sender || '').trim();
  const to = String(req.body.to || req.body.receiver || '').trim();
  const text = String(req.body.text || req.body.message || '').trim();

  if (!from || !to || !text) {
    return res.status(400).json({ error: 'بيانات الرسالة غير مكتملة' });
  }

  const db = readData();
  const msg = {
    id: String(req.body.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    from,
    to,
    text,
    adId: String(req.body.adId || ''),
    timestamp: req.body.timestamp || new Date().toISOString()
  };

  db.messages.push(msg);
  writeData(db);
  return res.status(201).json({ message: msg });
});

// إعادة توجيه أي مسار غير معروف إلى الواجهة الرئيسية
app.get('*', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(200).send('رخيص - السوق الشامل يعمل');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});