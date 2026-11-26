const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ==========================================
// 1. الإعدادات والـ Middleware
// ==========================================
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. نماذج MongoDB والتخزين الاحتياطي
// ==========================================
let dbConnected = false;

const memoryStore = {
  users: new Map(), // username -> { username, passwordHash, displayName, city, bio, avatar, createdAt }
  ads: [],
  messages: []
};

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, default: '' },
  city: { type: String, default: '' },
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const adSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  price: { type: Number, required: true, default: 0 },
  category: { type: String, default: 'أخرى' },
  condition: { type: String, default: 'مستعمل' },
  currency: { type: String, default: 'USD' },
  city: { type: String, default: '' },
  neighborhood: { type: String, default: '' },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
  owner: { type: String, required: true, lowercase: true, trim: true },
  username: { type: String, required: true, lowercase: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  from: { type: String, required: true, lowercase: true, trim: true },
  to: { type: String, required: true, lowercase: true, trim: true },
  text: { type: String, default: '' },
  audio: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
const AdModel = mongoose.models.Ad || mongoose.model('Ad', adSchema);
const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);

if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      dbConnected = true;
      console.log('Connected to MongoDB');
    })
    .catch((err) => {
      dbConnected = false;
      console.error('MongoDB connection error, falling back to memory:', err.message);
    });
} else {
  console.log('MONGODB_URI not set; running with in-memory store');
}

// ==========================================
// 3. أدوات المصادقة والأمان
// ==========================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHex] = storedHash.split(':');
  const derivedBuf = crypto.scryptSync(String(password), salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derivedBuf.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

function signToken(username) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.u || !parsed.exp || Date.now() > parsed.exp) return null;
    return String(parsed.u).toLowerCase();
  } catch (_) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const tokenUser = verifyToken(bearerToken);
  if (tokenUser) {
    req.authUser = tokenUser;
    return next();
  }
  return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً لإتمام العملية' });
}

function sanitizeUser(u) {
  return {
    username: u.username,
    displayName: u.displayName || u.username,
    city: u.city || '',
    bio: u.bio || '',
    avatar: u.avatar || ''
  };
}

// ==========================================
// 4. مسارات الحسابات والملف الشخصي
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (username.length < 2 || password.length < 4) {
      return res.status(400).json({ error: 'اسم المستخدم (حرفان على الأقل) وكلمة المرور (4 أحرف على الأقل) مطلوبة' });
    }

    if (dbConnected) {
      const existing = await UserModel.findOne({ username });
      if (existing) {
        return res.status(409).json({ error: 'اسم المستخدم مسجل مسبقاً' });
      }
      const created = await UserModel.create({
        username,
        passwordHash: hashPassword(password),
        displayName: username
      });
      const token = signToken(username);
      return res.status(201).json({ user: sanitizeUser(created), token });
    }

    if (memoryStore.users.has(username)) {
      return res.status(409).json({ error: 'اسم المستخدم مسجل مسبقاً' });
    }
    const newUser = {
      username,
      passwordHash: hashPassword(password),
      displayName: username,
      city: '',
      bio: '',
      avatar: '',
      createdAt: new Date()
    };
    memoryStore.users.set(username, newUser);
    const token = signToken(username);
    return res.status(201).json({ user: sanitizeUser(newUser), token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    if (dbConnected) {
      const user = await UserModel.findOne({ username });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }
      const token = signToken(username);
      return res.json({ user: sanitizeUser(user), token });
    }

    const user = memoryStore.users.get(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    const token = signToken(username);
    return res.json({ user: sanitizeUser(user), token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const username = req.authUser;
    const displayName = String(req.body.displayName || username).trim();
    const city = String(req.body.city || '').trim();
    const bio = String(req.body.bio || '').trim();
    const avatar = String(req.body.avatar || '');

    if (dbConnected) {
      const updated = await UserModel.findOneAndUpdate(
        { username },
        { $set: { displayName, city, bio, avatar } },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
      }
      return res.json({ user: sanitizeUser(updated) });
    }

    const user = memoryStore.users.get(username);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    user.displayName = displayName;
    user.city = city;
    user.bio = bio;
    user.avatar = avatar;
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: 'تعذر تحديث الملف الشخصي' });
  }
});

// ==========================================
// 5. مسارات الإعلانات
// ==========================================
app.get('/api/ads', async (req, res) => {
  try {
    if (dbConnected) {
      const ads = await AdModel.find().sort({ createdAt: -1 }).lean();
      return res.json(ads);
    }
    return res.json(memoryStore.ads);
  } catch (err) {
    console.error('Get ads error:', err);
    return res.status(500).json({ error: 'تعذر جلب الإعلانات' });
  }
});

app.post('/api/ads', requireAuth, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const price = Number(req.body.price);
    if (!title || Number.isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'يرجى إدخال عنوان صحيح وسعر صالح للإعلان' });
    }

    const docData = {
      title,
      price,
      category: String(req.body.category || 'أخرى').trim(),
      condition: String(req.body.condition || 'مستعمل').trim(),
      currency: String(req.body.currency || 'USD').trim(),
      city: String(req.body.city || '').trim(),
      neighborhood: String(req.body.neighborhood || '').trim(),
      description: String(req.body.description || '').trim(),
      image: String(req.body.image || ''),
      owner: req.authUser,
      username: req.authUser,
      createdAt: new Date()
    };

    if (dbConnected) {
      const created = await AdModel.create(docData);
      return res.status(201).json(created);
    }

    const item = { id: crypto.randomUUID(), _id: crypto.randomUUID(), ...docData };
    item._id = item.id;
    memoryStore.ads.unshift(item);
    return res.status(201).json(item);
  } catch (err) {
    console.error('Create ad error:', err);
    return res.status(500).json({ error: 'فشل نشر الإعلان على الخادم' });
  }
});

app.put('/api/ads/:id', requireAuth, async (req, res) => {
  try {
    const adId = req.params.id;
    const title = String(req.body.title || '').trim();
    const price = Number(req.body.price);
    if (!title || Number.isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'بيانات التعديل غير صالحة' });
    }

    if (dbConnected) {
      const ad = await AdModel.findById(adId);
      if (!ad) return res.status(404).json({ error: 'الإعلان غير موجود' });
      if (String(ad.owner || ad.username).toLowerCase() !== req.authUser) {
        return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا الإعلان' });
      }
      ad.title = title;
      ad.price = price;
      ad.category = String(req.body.category || ad.category).trim();
      ad.condition = String(req.body.condition || ad.condition).trim();
      ad.currency = String(req.body.currency || ad.currency).trim();
      ad.city = String(req.body.city ?? ad.city).trim();
      ad.neighborhood = String(req.body.neighborhood ?? ad.neighborhood).trim();
      ad.description = String(req.body.description ?? ad.description).trim();
      if (typeof req.body.image === 'string') {
        ad.image = req.body.image;
      }
      await ad.save();
      return res.json(ad);
    }

    const idx = memoryStore.ads.findIndex((a) => String(a._id || a.id) === String(adId));
    if (idx < 0) return res.status(404).json({ error: 'الإعلان غير موجود' });
    const ad = memoryStore.ads[idx];
    if (String(ad.owner || ad.username).toLowerCase() !== req.authUser) {
      return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا الإعلان' });
    }
    memoryStore.ads[idx] = {
      ...ad,
      title,
      price,
      category: String(req.body.category || ad.category).trim(),
      condition: String(req.body.condition || ad.condition).trim(),
      currency: String(req.body.currency || ad.currency).trim(),
      city: String(req.body.city ?? ad.city).trim(),
      neighborhood: String(req.body.neighborhood ?? ad.neighborhood).trim(),
      description: String(req.body.description ?? ad.description).trim(),
      image: typeof req.body.image === 'string' ? req.body.image : ad.image
    };
    return res.json(memoryStore.ads[idx]);
  } catch (err) {
    console.error('Update ad error:', err);
    return res.status(500).json({ error: 'فشل تحديث الإعلان' });
  }
});

app.delete('/api/ads/:id', requireAuth, async (req, res) => {
  try {
    const adId = req.params.id;
    if (dbConnected) {
      const ad = await AdModel.findById(adId);
      if (!ad) return res.status(404).json({ error: 'الإعلان غير موجود' });
      if (String(ad.owner || ad.username).toLowerCase() !== req.authUser) {
        return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا الإعلان' });
      }
      await AdModel.deleteOne({ _id: adId });
      return res.json({ ok: true });
    }

    const idx = memoryStore.ads.findIndex((a) => String(a._id || a.id) === String(adId));
    if (idx < 0) return res.status(404).json({ error: 'الإعلان غير موجود' });
    const ad = memoryStore.ads[idx];
    if (String(ad.owner || ad.username).toLowerCase() !== req.authUser) {
      return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا الإعلان' });
    }
    memoryStore.ads.splice(idx, 1);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete ad error:', err);
    return res.status(500).json({ error: 'فشل حذف الإعلان' });
  }
});

// ==========================================
// 6. مسارات الرسائل النصية والصوتية
// ==========================================
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const me = req.authUser;
    if (dbConnected) {
      const msgs = await MessageModel.find({
        $or: [{ from: me }, { to: me }]
      })
        .sort({ createdAt: 1 })
        .lean();
      return res.json(msgs);
    }

    const filtered = memoryStore.messages.filter(
      (m) => m.from === me || m.to === me
    );
    return res.json(filtered);
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'تعذر تحميل الرسائل' });
  }
});

app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    const from = req.authUser;
    const to = String(req.body.to || req.body.receiver || '')
      .replace(/^@/, '')
      .trim()
      .toLowerCase();
    const text = String(req.body.text || req.body.content || '').trim();
    const audio = String(req.body.audio || '');

    if (!to) {
      return res.status(400).json({ error: 'يرجى تحديد المستلم' });
    }
    if (!text && !audio) {
      return res.status(400).json({ error: 'لا يمكن إرسال رسالة فارغة' });
    }

    const msgDoc = { from, to, text, audio, createdAt: new Date() };

    if (dbConnected) {
      const created = await MessageModel.create(msgDoc);
      return res.status(201).json(created);
    }

    const item = { id: crypto.randomUUID(), ...msgDoc };
    memoryStore.messages.push(item);
    return res.status(201).json(item);
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: 'فشل إرسال الرسالة' });
  }
});

// ==========================================
// 7. تقديم الواجهة ومعالجة الأخطاء
// ==========================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'حجم الملف أو الصورة كبير جداً' });
  }
  return res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});