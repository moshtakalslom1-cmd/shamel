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

// تهيئة ملف البيانات data.json إذا لم يكن موجوداً
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      users: [],
      ads: [],
      messages: []
    };
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

// منع خطأ 404 للأيقونة في الكونسول
app.get('/favicon.ico', (req, res) => res.status(204).end());

// تسجيل الدخول أو إنشاء حساب تلقائي مبسط بالبريد الإلكتروني
app.post('/api/auth/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const name = (req.body.name || '').trim();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'يرجى إدخال بريد إلكتروني صحيح' });
  }

  const data = readData();
  let user = data.users.find(u => u.email === email);

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email,
      name: name || email.split('@')[0],
      joinedAt: new Date().toISOString().split('T')[0]
    };
    data.users.push(user);
    writeData(data);
  } else if (name && user.name !== name) {
    user.name = name;
    writeData(data);
  }

  res.json({ user });
});

// جلب جميع الإعلانات مع دعم البحث والتصفية
app.get('/api/ads', (req, res) => {
  const { q, category, subcategory, city, owner } = req.query;
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

  if (subcategory && subcategory !== 'all') {
    ads = ads.filter(ad => ad.subcategory === subcategory);
  }

  if (city && city !== 'all') {
    ads = ads.filter(ad => ad.city === city);
  }

  if (owner && owner.trim()) {
    ads = ads.filter(ad => (ad.ownerEmail || '').toLowerCase() === owner.trim().toLowerCase());
  }

  res.json(ads);
});

// جلب إعلان واحد بالمعرّف
app.get('/api/ads/:id', (req, res) => {
  const data = readData();
  const ad = data.ads.find(a => a.id === req.params.id);
  if (!ad) {
    return res.status(404).json({ message: 'الإعلان غير موجود' });
  }
  res.json(ad);
});

// إضافة إعلان جديد
app.post('/api/ads', (req, res) => {
  const { title, price, category, subcategory, city, description, image, ownerEmail, ownerName } = req.body;

  if (!ownerEmail) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
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
    subcategory: subcategory || '',
    city: city || 'غير محدد',
    description: (description || '').trim(),
    image: image || '',
    ownerEmail: ownerEmail.trim().toLowerCase(),
    ownerName: (ownerName || ownerEmail.split('@')[0]).trim(),
    createdAt: new Date().toISOString(),
    comments: []
  };

  data.ads.push(newAd);
  writeData(data);

  res.status(201).json(newAd);
});

// تعديل إعلان موجود
app.put('/api/ads/:id', (req, res) => {
  const { title, price, category, subcategory, city, description, image, ownerEmail } = req.body;
  const data = readData();
  const index = data.ads.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ message: 'الإعلان غير موجود' });
  }

  const ad = data.ads[index];
  if (!ownerEmail || ad.ownerEmail.toLowerCase() !== ownerEmail.trim().toLowerCase()) {
    return res.status(403).json({ message: 'لا تملك صلاحية تعديل هذا الإعلان' });
  }

  data.ads[index] = {
    ...ad,
    title: title !== undefined ? title.trim() : ad.title,
    price: price !== undefined ? String(price).trim() : ad.price,
    category: category !== undefined ? category : ad.category,
    subcategory: subcategory !== undefined ? subcategory : ad.subcategory,
    city: city !== undefined ? city : ad.city,
    description: description !== undefined ? description.trim() : ad.description,
    image: image !== undefined && image !== '' ? image : ad.image,
    updatedAt: new Date().toISOString()
  };

  writeData(data);
  res.json(data.ads[index]);
});

// حذف إعلان
app.delete('/api/ads/:id', (req, res) => {
  const ownerEmail = (req.body.ownerEmail || req.query.ownerEmail || '').trim().toLowerCase();
  const data = readData();
  const index = data.ads.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ message: 'الإعلان غير موجود' });
  }

  if (!ownerEmail || data.ads[index].ownerEmail.toLowerCase() !== ownerEmail) {
    return res.status(403).json({ message: 'لا تملك صلاحية حذف هذا الإعلان' });
  }

  data.ads.splice(index, 1);
  writeData(data);
  res.json({ message: 'تم حذف الإعلان بنجاح' });
});

// إضافة تعليق على إعلان
app.post('/api/ads/:id/comments', (req, res) => {
  const { text, userEmail, userName } = req.body;
  if (!userEmail) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول للتعليق' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ message: 'نص التعليق فارغ' });
  }

  const data = readData();
  const ad = data.ads.find(a => a.id === req.params.id);
  if (!ad) {
    return res.status(404).json({ message: 'الإعلان غير موجود' });
  }

  if (!Array.isArray(ad.comments)) ad.comments = [];
  const comment = {
    id: crypto.randomUUID(),
    text: text.trim(),
    userEmail: userEmail.trim().toLowerCase(),
    userName: (userName || userEmail.split('@')[0]).trim(),
    createdAt: new Date().toISOString()
  };

  ad.comments.push(comment);
  writeData(data);
  res.status(201).json(comment);
});

// جلب الرسائل الخاصة بالمستخدم
app.get('/api/messages', (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ message: 'البريد مطلوب' });
  }
  const data = readData();
  const userMessages = data.messages.filter(
    m => m.from === email || m.to === email
  );
  res.json(userMessages);
});

// إرسال رسالة مباشرة
app.post('/api/messages', (req, res) => {
  const { from, to, adId, adTitle, text } = req.body;
  if (!from || !to || !text || !text.trim()) {
    return res.status(400).json({ message: 'بيانات الرسالة غير مكتملة' });
  }

  const data = readData();
  const msg = {
    id: crypto.randomUUID(),
    from: from.trim().toLowerCase(),
    to: to.trim().toLowerCase(),
    adId: adId || '',
    adTitle: adTitle || '',
    text: text.trim(),
    createdAt: new Date().toISOString()
  };

  data.messages.push(msg);
  writeData(data);
  res.status(201).json(msg);
});

// إرجاع الواجهة لأي مسار غير معرف
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDataFile();
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});