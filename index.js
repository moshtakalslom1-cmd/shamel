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
    favorites: Array.isArray(u.favorites) ? u.favorites : [],
    joinedAt: u.joinedAt || ''
  };
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/api/auth/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) return res.status(400).json({ message: 'يرجى إدخال الاسم وكلمة المرور' });

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
  if (!username || !password) return res.status(400).json({ message: 'يرجى إدخال الاسم وكلمة المرور' });

  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) {
    return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
  }

  res.json({ user: sanitizeUser(user) });
});

app.put('/api/profile/settings', (req, res) => {
  const { username, city, phone, bio } = req.body;
  if (!username) return res.status(400).json({ message: 'اسم المستخدم مطلوب' });

  const data = readData();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

  user.city = String(city || '').trim() || 'دمشق';
  user.phone = String(phone || '').trim();
  user.bio = String(bio || '').trim();

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
  const { q, category, city, condition, sort } = req.query;
  const data = readData();
  let list = [...data.ads].reverse();

  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(query) ||
      (a.description || '').toLowerCase().includes(query)
    );
  }
  if (category && category !== 'all') list = list.filter(a => a.category === category);
  if (city && city !== 'all') list = list.filter(a => a.city === city);
  if (condition && condition !== 'all') list = list.filter(a => a.condition === condition);

  if (sort === 'price_asc') list.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
  else if (sort === 'price_desc') list.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
  else if (sort === 'views') list.sort((a, b) => (b.views || 0) - (a.views || 0));

  res.json(list);
});

app.post('/api/ads', (req, res) => {
  const { title, price, category, city, condition, negotiable, description, image, ownerUsername } = req.body;
  if (!ownerUsername || !ownerUsername.trim()) {
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
  const { title, price, category, city, condition, negotiable, description, image, ownerUsername } = req.body;
  const data = readData();
  const idx = data.ads.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const ad = data.ads[idx];
  if (!ownerUsername || ad.ownerUsername.toLowerCase() !== ownerUsername.trim().toLowerCase()) {
    return res.status(403).json({ message: 'لا تملك صلاحية التعديل' });
  }

  data.ads[idx] = {
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