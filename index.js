const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ storage, limits: { files: 5 } });

const DATA_FILE = path.join(__dirname, 'data.json');
let users = new Map();
let ads = [];
let directMessages = [];

function loadDataFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.users) users = new Map(Object.entries(parsed.users));
      if (Array.isArray(parsed.ads)) ads = parsed.ads;
      if (Array.isArray(parsed.directMessages)) directMessages = parsed.directMessages;
    }
  } catch (err) {
    console.error('Error loading data.json:', err);
  }
}

function saveDataToDisk() {
  try {
    const obj = {
      users: Object.fromEntries(users),
      ads,
      directMessages
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving data.json:', err);
  }
}

loadDataFromDisk();

function formatTimeNow() {
  return new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

// --- المستخدمون ---
app.post('/api/signup', (req, res) => {
  const { username, password, bio } = req.body || {};
  const cleanUser = (username || '').trim();
  if (!cleanUser || !password) {
    return res.status(400).json({ message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
  }
  if (users.has(cleanUser)) {
    return res.status(400).json({ message: 'اسم المستخدم موجود مسبقاً' });
  }
  users.set(cleanUser, {
    username: cleanUser,
    password,
    bio: (bio && bio.trim()) || 'معلن في منصة رخيص',
    joinedAt: new Date().toISOString().slice(0, 10)
  });
  saveDataToDisk();
  return res.json({ message: 'تم إنشاء الحساب بنجاح' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const cleanUser = (username || '').trim();
  const user = users.get(cleanUser);
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
  }
  return res.json({ message: 'تم تسجيل الدخول بنجاح' });
});

app.get('/api/users/:username', (req, res) => {
  const user = users.get(req.params.username);
  if (!user) {
    return res.json({
      username: req.params.username,
      bio: 'معلن في منصة رخيص',
      joinedAt: new Date().toISOString().slice(0, 10)
    });
  }
  return res.json({ username: user.username, bio: user.bio, joinedAt: user.joinedAt });
});

app.put('/api/users/:username/bio', (req, res) => {
  const { bio } = req.body || {};
  let user = users.get(req.params.username);
  if (!user) {
    user = {
      username: req.params.username,
      password: '',
      bio: (bio || '').trim() || 'معلن في منصة رخيص',
      joinedAt: new Date().toISOString().slice(0, 10)
    };
    users.set(req.params.username, user);
  } else {
    user.bio = (bio || '').trim() || 'معلن في منصة رخيص';
  }
  saveDataToDisk();
  return res.json({ message: 'تم حفظ النبذة بنجاح', bio: user.bio });
});

// --- الإعلانات ---
app.get('/api/ads', (req, res) => {
  const { category, subcategory, q, username, city } = req.query;
  let result = [...ads];

  if (category && category !== 'الكل') result = result.filter((a) => a.category === category);
  if (subcategory && subcategory !== 'الكل') result = result.filter((a) => a.subcategory === subcategory);
  if (city && city !== 'الكل') result = result.filter((a) => a.city === city);
  if (username) result = result.filter((a) => a.username === username);
  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    result = result.filter(
      (a) =>
        (a.title && a.title.toLowerCase().includes(term)) ||
        (a.description && a.description.toLowerCase().includes(term))
    );
  }
  return res.json(result);
});

app.get('/api/ads/:id', (req, res) => {
  const ad = ads.find((a) => String(a.id) === String(decodeURIComponent(req.params.id)));
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });
  return res.json(ad);
});

app.post('/api/ads', upload.array('images', 5), (req, res) => {
  const { category, subcategory, title, price, city, phone, description, username } = req.body || {};
  const cleanUser = (username || '').trim();
  if (!title || !price || !city || !phone || !cleanUser) {
    return res.status(400).json({ message: 'يرجى تعبئة جميع الحقول المطلوبة' });
  }

  const uploadedImages = (req.files || []).map((f) => `/uploads/${f.filename}`);
  const newAd = {
    id: String(Date.now()),
    category: category || 'إلكترونيات',
    subcategory: subcategory || 'عام',
    title: String(title).trim(),
    price: String(price).trim(),
    city: String(city).trim(),
    phone: String(phone).trim(),
    description: description || '',
    username: cleanUser,
    images: uploadedImages,
    comments: []
  };

  ads.unshift(newAd);
  saveDataToDisk();
  return res.json({ message: 'تم نشر الإعلان بنجاح', ad: newAd });
});

app.put('/api/ads/:id', upload.array('images', 5), (req, res) => {
  const adIndex = ads.findIndex((a) => String(a.id) === String(decodeURIComponent(req.params.id)));
  if (adIndex === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const { category, subcategory, title, price, city, phone, description, username } = req.body || {};
  if (String(ads[adIndex].username || '').trim() !== String(username || '').trim()) {
    return res.status(403).json({ message: 'غير مصرح لك بتعديل هذا الإعلان' });
  }

  ads[adIndex].category = category || ads[adIndex].category;
  ads[adIndex].subcategory = subcategory || ads[adIndex].subcategory;
  ads[adIndex].title = title ? String(title).trim() : ads[adIndex].title;
  ads[adIndex].price = price ? String(price).trim() : ads[adIndex].price;
  ads[adIndex].city = city ? String(city).trim() : ads[adIndex].city;
  ads[adIndex].phone = phone ? String(phone).trim() : ads[adIndex].phone;
  ads[adIndex].description = description !== undefined ? description : ads[adIndex].description;

  if (req.files && req.files.length > 0) {
    ads[adIndex].images = req.files.map((f) => `/uploads/${f.filename}`);
  }

  saveDataToDisk();
  return res.json({ message: 'تم تحديث الإعلان بنجاح', ad: ads[adIndex] });
});

app.delete('/api/ads/:id', (req, res) => {
  const adIndex = ads.findIndex((a) => String(a.id) === String(decodeURIComponent(req.params.id)));
  if (adIndex === -1) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const { username } = req.query;
  if (String(ads[adIndex].username || '').trim() !== String(username || '').trim()) {
    return res.status(403).json({ message: 'غير مصرح لك بحذف هذا الإعلان' });
  }

  ads.splice(adIndex, 1);
  saveDataToDisk();
  return res.json({ message: 'تم حذف الإعلان بنجاح' });
});

// --- التعليقات ---
app.get('/api/ads/:id/comments', (req, res) => {
  const ad = ads.find((a) => String(a.id) === String(decodeURIComponent(req.params.id)));
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });
  return res.json(ad.comments || []);
});

app.post('/api/ads/:id/comments', (req, res) => {
  const { user, text } = req.body || {};
  if (!user || !text || !text.trim()) {
    return res.status(400).json({ message: 'يرجى كتابة تعليق صالح' });
  }
  const ad = ads.find((a) => String(a.id) === String(decodeURIComponent(req.params.id)));
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const comment = {
    id: String(Date.now()),
    user,
    text: text.trim(),
    timestamp: formatTimeNow()
  };
  ad.comments.push(comment);
  saveDataToDisk();
  return res.json({ message: 'تمت إضافة التعليق', comment });
});

// --- الدردشة المباشرة ---
app.post('/api/chat/messages', (req, res) => {
  const { sender, receiver, text } = req.body || {};
  if (!sender || !receiver || !text || !text.trim()) {
    return res.status(400).json({ message: 'بيانات الرسالة غير مكتملة' });
  }
  const msg = {
    id: String(Date.now()),
    sender,
    receiver,
    text: text.trim(),
    timestamp: formatTimeNow()
  };
  directMessages.push(msg);
  saveDataToDisk();
  return res.json({ message: 'تم إرسال الرسالة', data: msg });
});

app.get('/api/chat/messages', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.json([]);
  const conversation = directMessages.filter(
    (m) =>
      (m.sender === user1 && m.receiver === user2) ||
      (m.sender === user2 && m.receiver === user1)
  );
  return res.json(conversation);
});

app.get('/api/chat/conversations', (req, res) => {
  const { user } = req.query;
  if (!user) return res.json([]);
  const mapByPartner = new Map();
  directMessages.forEach((m) => {
    if (m.sender === user || m.receiver === user) {
      const partner = m.sender === user ? m.receiver : m.sender;
      mapByPartner.set(partner, {
        participants: [user, partner],
        lastMessage: m.text,
        timestamp: m.timestamp
      });
    }
  });
  return res.json(Array.from(mapByPartner.values()).reverse());
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});