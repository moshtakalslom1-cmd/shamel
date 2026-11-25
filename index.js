const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = { users: [], ads: [], messages: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

function readData() {
  initDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      ads: Array.isArray(parsed.ads) ? parsed.ads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch (err) {
    console.error('خطأ في قراءة data.json:', err);
    return { users: [], ads: [], messages: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    city: u.city || 'دمشق',
    phone: u.phone || '',
    bio: u.bio || '',
    favorites: Array.isArray(u.favorites) ? u.favorites : [],
    joinedAt: u.joinedAt || ''
  };
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

// إنشاء حساب جديد أولاً بالاسم وكلمة المرور
app.post('/api/auth/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ message: 'يرجى إدخال الاسم وكلمة المرور لإنشاء الحساب' });
  }

  const data = readData();
  const exists = data.users.some(
    u => u.username.toLowerCase() === username.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ message: 'اسم المستخدم موجود مسبقاً، يرجى اختيار اسم آخر أو تسجيل الدخول' });
  }

  const newUser = {
    id: crypto.randomUUID(),
    username,
    password,
    city: 'دمشق',
    phone: '',
    bio: '',
    favorites: [],
    joinedAt: new Date().toISOString().split('T')[0]
  };

  data.users.push(newUser);
  writeData(data);
  res.status(201).json({ message: 'تم إنشاء الحساب بنجاح، يمكنك الآن تسجيل الدخول', user: sanitizeUser(newUser) });
});

// تسجيل الدخول بالاسم وكلمة المرور فقط
app.post('/api/auth/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ message: 'يرجى إدخال الاسم وكلمة المرور' });
  }

  const data = readData();
  const user = data.users.find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ message: 'الحساب غير موجود، يرجى إنشاء حساب أولاً' });
  }

  if (user.password !== password) {
    return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
  }

  res.json({ user: sanitizeUser(user) });
});

// تحديث إعدادات الملف الشخصي وتغيير كلمة المرور
app.put('/api/profile/settings', (req, res) => {
  const { username, city, phone, bio, newPassword } = req.body;
  if (!username) {
    return res.status(400).json({ message: 'اسم المستخدم مطلوب' });
  }

  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  if (city !== undefined) user.city = String(city).trim();
  if (phone !== undefined) user.phone = String(phone).trim();
  if (bio !== undefined) user.bio = String(bio).trim();
  if (newPassword && String(newPassword).trim().length >= 3) {
    user.password = String(newPassword).trim();
  }

  writeData(data);
  res.json({ message: 'تم حفظ إعدادات الملف الشخصي', user: sanitizeUser(user) });
});

// تبديل المفضلة (قلب)
app.post('/api/favorites/toggle', (req, res) => {
  const { username, adId } = req.body;
  if (!username || !adId) {
    return res.status(400).json({ message: 'بيانات غير مكتملة' });
  }
  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }
  if (!Array.isArray(user.favorites)) user.favorites = [];

  const idx = user.favorites.indexOf(adId);
  if (idx === -1) {
    user.favorites.push(adId);
  } else {
    user.favorites.splice(idx, 1);
  }
  writeData(data);
  res.json({ favorites: user.favorites });
});

// جلب الإعلانات مع البحث والفلترة والترتيب
app.get('/api/ads', (req, res) => {
  const { q, category, city, condition, sort, owner } = req.query;
  const data = readData();
  let ads = [...data.ads].reverse();

  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    ads = ads.filter(ad =>
      (ad.title || '').toLowerCase().includes(query) ||
      (ad.description || '').toLowerCase().includes(query)
    );
  }
  if (category && category !== 'all') {
    ads = ads.filter(ad => ad.category === category);
  }
  if (city && city !== 'all') {
    ads = ads.filter(ad => ad.city === city);
  }
  if (condition && condition !== 'all') {
    ads = ads.filter(ad => ad.condition === condition);
  }
  if (owner && owner.trim()) {
    ads = ads.filter(ad => (ad.ownerUsername || '').toLowerCase() === owner.trim().toLowerCase());
  }

  if (sort === 'price_asc') {
    ads.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
  } else if (sort === 'price_desc') {
    ads.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
  } else if (sort === 'views') {
    ads.sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  }

  res.json(ads);
});

// زيادة عداد المشاهدات
app.post('/api/ads/:id/view', (req, res) => {
  const data = readData();
  const ad = data.ads.find(a => a.id === req.params.id);
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });
  ad.views = (Number(ad.views) || 0) + 1;
  writeData(data);
  res.json({ views: ad.views });
});

// نشر إعلان جديد
app.post('/api/ads', (req, res) => {
  const { title, price, category, city, condition, negotiable, description, image, ownerUsername } = req.body;
  if (!ownerUsername || !ownerUsername.trim()) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول بالاسم وكلمة المرور أولاً' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'عنوان الإعلان مطلوب' });
  }

  const data = readData();
  const newAd = {
    id: crypto.randomUUID(),
    title: title.trim(),
    price: price ? String(price).trim() : '0',
    category: category || 'أخرى',
    city: city || 'دمشق',
    condition: condition || 'مستعمل',
    negotiable: Boolean(negotiable),
    description: (description || '').trim(),
    image: image || '',
    ownerUsername: ownerUsername.trim(),
    views: 0,
    createdAt: new Date().toISOString(),
    comments: []
  };

  data.ads.push(newAd);
  writeData(data);
  res.status(201).json(newAd);
});

// تعديل إعلان موجود
app.put('/api/ads/:id', (req, res) => {
  const { title, price, category, city, condition, negotiable, description, image, ownerUsername } = req.body;
  const data = readData();
  const index = data.ads.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const ad = data.ads[index];
  if (!ownerUsername || ad.ownerUsername.toLowerCase() !== ownerUsername.trim().toLowerCase()) {
    return res.status(403).json({ message: 'لا تملك صلاحية تعديل هذا الإعلان' });
  }

  data.ads[index] = {
    ...ad,
    title: title !== undefined ? title.trim() : ad.title,
    price: price !== undefined ? String(price).trim() : ad.price,
    category: category !== undefined ? category : ad.category,
    city: city !== undefined ? city : ad.city,
    condition: condition !== undefined ? condition : ad.condition,
    negotiable: negotiable !== undefined ? Boolean(negotiable) : ad.negotiable,
    description: description !== undefined ? description.trim() : ad.description,
    image: image !== undefined && image !== '' ? image : ad.image,
    updatedAt: new Date().toISOString()
  };

  writeData(data);
  res.json(data.ads[index]);
});

// حذف إعلان
app.delete('/api/ads/:id', (req, res) => {
  const ownerUsername = (req.body.ownerUsername || req.query.ownerUsername || '').trim().toLowerCase();
  const data = readData();
  const index = data.ads.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  if (!ownerUsername || data.ads[index].ownerUsername.toLowerCase() !== ownerUsername) {
    return res.status(403).json({ message: 'لا تملك صلاحية حذف هذا الإعلان' });
  }

  data.ads.splice(index, 1);
  writeData(data);
  res.json({ message: 'تم حذف الإعلان بنجاح' });
});

// إضافة تعليق
app.post('/api/ads/:id/comments', (req, res) => {
  const { text, username } = req.body;
  if (!username) return res.status(401).json({ message: 'يجب تسجيل الدخول للتعليق' });
  if (!text || !text.trim()) return res.status(400).json({ message: 'نص التعليق فارغ' });

  const data = readData();
  const ad = data.ads.find(a => a.id === req.params.id);
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });

  if (!Array.isArray(ad.comments)) ad.comments = [];
  const comment = {
    id: crypto.randomUUID(),
    text: text.trim(),
    username: username.trim(),
    createdAt: new Date().toISOString()
  };

  ad.comments.push(comment);
  writeData(data);
  res.status(201).json(comment);
});

// جلب الرسائل والمحادثات للمستخدم
app.get('/api/messages', (req, res) => {
  const username = (req.query.username || '').trim().toLowerCase();
  if (!username) return res.status(400).json({ message: 'اسم المستخدم مطلوب' });
  const data = readData();
  const userMsgs = data.messages.filter(
    m => (m.from || '').toLowerCase() === username || (m.to || '').toLowerCase() === username
  );
  res.json(userMsgs);
});

// إرسال رسالة مباشرة أو رسالة سريعة جاهزة
app.post('/api/messages', (req, res) => {
  const { from, to, adId, adTitle, text } = req.body;
  if (!from || !to || !text || !text.trim()) {
    return res.status(400).json({ message: 'بيانات الرسالة غير مكتملة' });
  }
  const data = readData();
  const msg = {
    id: crypto.randomUUID(),
    from: from.trim(),
    to: to.trim(),
    adId: adId || '',
    adTitle: adTitle || '',
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  data.messages.push(msg);
  writeData(data);
  res.status(201).json(msg);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDataFile();
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});