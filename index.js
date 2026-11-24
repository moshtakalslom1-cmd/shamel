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

const users = new Map();
const ads = [];
const directMessages = [];

function formatTimeNow() {
  return new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

// --- المستخدمون ---
app.post('/api/signup', (req, res) => {
  const { username, password, bio } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
  }
  if (users.has(username)) {
    return res.status(400).json({ message: 'اسم المستخدم موجود مسبقاً' });
  }
  users.set(username, {
    username,
    password,
    bio: (bio && bio.trim()) || 'معلن في منصة رخيص',
    joinedAt: new Date().toISOString().slice(0, 10)
  });
  return res.json({ message: 'تم إنشاء الحساب بنجاح' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.get(username);
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
  const ad = ads.find((a) => String(a.id) === String(req.params.id));
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });
  return res.json(ad);
});

app.post('/api/ads', upload.array('images', 5), (req, res) => {
  const { category, subcategory, title, price, city, phone, description, username } = req.body || {};
  if (!title || !price || !city || !phone || !username) {
    return res.status(400).json({ message: 'يرجى تعبئة جميع الحقول المطلوبة' });
  }

  const uploadedImages = (req.files || []).map((f) => `/uploads/${f.filename}`);
  const newAd = {
    id: String(Date.now()),
    category: category || 'إلكترونيات',
    subcategory: subcategory || 'عام',
    title,
    price,
    city,
    phone,
    description: description || '',
    username,
    images: uploadedImages,
    comments: []
  };

  ads.unshift(newAd);
  return res.json({ message: 'تم نشر الإعلان بنجاح', ad: newAd });
});

// --- التعليقات ---
app.get('/api/ads/:id/comments', (req, res) => {
  const ad = ads.find((a) => String(a.id) === String(req.params.id));
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });
  return res.json(ad.comments || []);
});

app.post('/api/ads/:id/comments', (req, res) => {
  const { user, text } = req.body || {};
  if (!user || !text || !text.trim()) {
    return res.status(400).json({ message: 'يرجى كتابة تعليق صالح' });
  }
  const ad = ads.find((a) => String(a.id) === String(req.params.id));
  if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });

  const comment = {
    id: String(Date.now()),
    user,
    text: text.trim(),
    timestamp: formatTimeNow()
  };
  ad.comments.push(comment);
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