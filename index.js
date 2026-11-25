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
    return { users: [], ads: [], messages: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing data:', err);
  }
}

function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    city: u.city || 'دمشق',
    phone: u.phone || '',
    bio: u.bio || '',
    avatar: u.avatar || '',
    favorites: Array.isArray(u.favorites) ? u.favorites : [],
    joinedAt: u.joinedAt || ''
  };
}

function normalizeSypPrice(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const num = Number(digits);
  if (!Number.isFinite(num) || num <= 0) return null;
  return String(num);
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/chat', (req, res) => {
  const chatFile = path.join(__dirname, 'public', 'chat.html');
  if (fs.existsSync(chatFile)) {
    return res.sendFile(chatFile);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/auth/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) return res.status(400).json({ message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });

  const data = readData();
  if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ message: 'اسم المستخدم موجود مسبقاً' });
  }

  const newUser = {
    id: crypto.randomUUID(),
    username,
    password,
    city: 'دمشق',
    phone: '',
    bio: '',
    avatar: '',
    favorites: [],
    joinedAt: new Date().toISOString().split('T')[0]
  };

  data.users.push(newUser);
  writeData(data);
  res.status(201).json({ message: 'تم إنشاء الحساب بنجاح', user: sanitizeUser(newUser) });
});

app.post('/api/auth/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) return res.status(400).json({ message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });

  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) {
    return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
  }

  res.json({ user: sanitizeUser(user) });
});

app.put('/api/profile/settings', (req, res) => {
  const { username, city, phone, bio, avatar } = req.body;
  if (!username) return res.status(400).json({ message: 'اسم المستخدم مطلوب' });

  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

  user.city = String(city || '').trim() || 'دمشق';
  user.phone = String(phone || '').trim();
  user.bio = String(bio || '').trim();
  if (avatar !== undefined) {
    user.avatar = String(avatar || '').trim();
  }

  writeData(data);
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/users/:username', (req, res) => {
  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
  res.json(sanitizeUser(user));
});

app.post('/api/favorites/toggle', (req, res) => {
  const { username, adId } = req.body;
  if (!username || !adId) return res.status(400).json({ message: 'بيانات غير مكتملة' });

  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

  if (!Array.isArray(user.favorites)) user.favorites = [];
  const idx = user.favorites.indexOf(adId);
  if (idx === -1) user.favorites.push(adId);
  else user.favorites.splice(idx, 1);

  writeData(data);
  res.json({ favorites: user.favorites });
});

app.get('/api/ads', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { q, category, subType, brand, city, condition, sort } = req.query;
  const data = readData();
  let list = [...data.ads].reverse();

  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(query) ||
      (a.description || '').toLowerCase().includes(query) ||
      (a.brand || '').toLowerCase().includes(query) ||
      (a.subType || '').toLowerCase().includes(query)
    );
  }
  if (category && category !== 'all') list = list.filter(a => a.category === category);
  if (subType && subType !== 'all') list = list.filter(a => a.subType === subType);
  if (brand && brand !== 'all') list = list.filter(a => a.brand === brand);
  if (city && city !== 'all') list = list.filter(a => a.city === city);
  if (condition && condition !== 'all') list = list.filter(a => a.condition === condition);

  const numericPrice = item => {
    const n = Number(String(item.price || '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  if (sort === 'price_asc') list.sort((a, b) => numericPrice(a) - numericPrice(b));
  else if (sort === 'price_desc') list.sort((a, b) => numericPrice(b) - numericPrice(a));
  else if (sort === 'views') list.sort((a, b) => (b.views || 0) - (a.views || 0));

  res.json(list);
});

app.post('/api/ads', (req, res) => {
  const { title, price, category, subType, brand, city, condition, negotiable, description, image, ownerUsername } = req.body;
  if (!ownerUsername || !ownerUsername.trim()) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'عنوان الإعلان مطلوب' });
  }

  const normalizedPrice = normalizeSypPrice(price);
  if (!normalizedPrice) {
    return res.status(400).json({ message: 'يرجى إدخال السعر بالأرقام بالليرة السورية' });
  }

  const data = readData();
  const newAd = {
    id: crypto.randomUUID(),
    title: title.trim(),
    price: normalizedPrice,
    currency: 'ل.س',
    category: category || 'أخرى',
    subType: (subType || 'متنوعات').trim(),
    brand: (brand || 'عام').trim(),
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

app.put('/api/ads/:id', (req, res) => {
  const { title, price, category, subType, brand, city, condition, negotiable, description, image, ownerUsername } = req.body;
  const data = readData();
  const idx = data.ads.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const ad = data.ads[idx];
  if (!ownerUsername || ad.ownerUsername.toLowerCase() !== ownerUsername.trim().toLowerCase()) {
    return res.status(403).json({ message: 'لا تملك صلاحية التعديل' });
  }

  let updatedPrice = ad.price;
  if (price !== undefined) {
    const parsed = normalizeSypPrice(price);
    if (!parsed) {
      return res.status(400).json({ message: 'يرجى إدخال السعر بالأرقام بالليرة السورية' });
    }
    updatedPrice = parsed;
  }

  data.ads[idx] = {
    ...ad,
    title: title !== undefined ? title.trim() : ad.title,
    price: updatedPrice,
    currency: 'ل.س',
    category: category !== undefined ? category : ad.category,
    subType: subType !== undefined ? String(subType).trim() : ad.subType,
    brand: brand !== undefined ? String(brand).trim() : ad.brand,
    city: city !== undefined ? city : ad.city,
    condition: condition !== undefined ? condition : ad.condition,
    negotiable: negotiable !== undefined ? Boolean(negotiable) : ad.negotiable,
    description: description !== undefined ? description.trim() : ad.description,
    image: image !== undefined && image !== '' ? image : ad.image,
    updatedAt: new Date().toISOString()
  };

  writeData(data);
  res.json(data.ads[idx]);
});

app.delete('/api/ads/:id', (req, res) => {
  const ownerUsername = (req.body.ownerUsername || req.query.ownerUsername || '').trim().toLowerCase();
  const data = readData();
  const idx = data.ads.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  if (!ownerUsername || data.ads[idx].ownerUsername.toLowerCase() !== ownerUsername) {
    return res.status(403).json({ message: 'لا تملك صلاحية الحذف' });
  }

  data.ads.splice(idx, 1);
  writeData(data);
  res.json({ message: 'تم الحذف' });
});

app.post('/api/ads/:id/view', (req, res) => {
  const data = readData();
  const ad = data.ads.find(a => a.id === req.params.id);
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });
  ad.views = (Number(ad.views) || 0) + 1;
  writeData(data);
  res.json({ views: ad.views });
});

app.post('/api/ads/:id/comments', (req, res) => {
  const { text, username } = req.body;
  if (!username) return res.status(401).json({ message: 'يجب تسجيل الدخول' });
  if (!text || !text.trim()) return res.status(400).json({ message: 'التعليق فارغ' });

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

app.post('/api/messages', (req, res) => {
  const { from, to, text, adId, adTitle, adPrice } = req.body;
  if (!from || !to || !text || !text.trim()) return res.status(400).json({ message: 'بيانات ناقصة' });

  const data = readData();
  const msg = {
    id: crypto.randomUUID(),
    from: from.trim(),
    to: to.trim(),
    text: text.trim(),
    adId: adId || null,
    adTitle: adTitle || null,
    adPrice: adPrice || null,
    createdAt: new Date().toISOString()
  };

  data.messages.push(msg);
  writeData(data);
  res.status(201).json(msg);
});

app.get('/api/messages', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const username = (req.query.username || '').trim().toLowerCase();
  if (!username) return res.status(400).json({ message: 'مطلوب اسم المستخدم' });

  const data = readData();
  const userMsgs = data.messages.filter(m => m.from.toLowerCase() === username || m.to.toLowerCase() === username);
  res.json(userMsgs);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDataFile();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});