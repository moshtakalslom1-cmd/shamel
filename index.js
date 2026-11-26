const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    token: { type: String, default: '' }
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

const adSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true, default: 0 },
    category: { type: String, required: true, trim: true },
    condition: { type: String, default: 'مستعمل', trim: true },
    currency: { type: String, default: 'USD', trim: true },
    city: { type: String, default: '', trim: true },
    neighbourhood: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    ownerUsername: { type: String, required: true, trim: true, lowercase: true }
  },
  { timestamps: true }
);

const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true, trim: true, lowercase: true },
    to: { type: String, required: true, trim: true, lowercase: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

async function getAuthenticatedUser(req) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;
  return User.findOne({ token });
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    if (!username || !password) return res.status(400).json({ message: 'البيانات ناقصة' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ message: 'المستخدم موجود' });

    const { salt, hash } = hashPassword(password);
    const token = crypto.randomBytes(24).toString('hex');

    const newUser = new User({ username, passwordHash: hash, salt, token });
    await newUser.save();
    return res.status(201).json({ user: { username: newUser.username, token: newUser.token } });
  } catch (err) {
    return res.status(400).json({ message: 'فشل التسجيل' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const user = await User.findOne({ username });
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return res.status(401).json({ message: 'البيانات غير صحيحة' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    user.token = token;
    await user.save();
    return res.json({ user: { username: user.username, token: user.token } });
  } catch (err) {
    return res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

app.get('/api/ads', async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 });
    return res.json(ads);
  } catch (err) {
    return res.status(500).json({ message: 'فشل جلب الإعلانات' });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: 'يجب تسجيل الدخول' });

    const title = String(req.body.title ?? '').trim();
    const category = String(req.body.category ?? '').trim();
    if (!title || !category) return res.status(400).json({ message: 'بيانات الإعلان ناقصة' });

    const ad = new Ad({
      title,
      price: Number(req.body.price ?? 0),
      category,
      condition: String(req.body.condition ?? 'مستعمل').trim(),
      currency: String(req.body.currency ?? 'USD').trim(),
      city: String(req.body.city ?? '').trim(),
      neighbourhood: String(req.body.neighbourhood ?? '').trim(),
      description: String(req.body.description ?? ''),
      image: String(req.body.image ?? ''),
      ownerUsername: authUser.username
    });

    await ad.save();
    return res.status(201).json(ad);
  } catch (err) {
    return res.status(400).json({ message: 'فشل نشر الإعلان' });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });

    const authUser = await getAuthenticatedUser(req);
    if (!authUser || authUser.username !== ad.ownerUsername) {
      return res.status(403).json({ message: 'لا تملك صلاحية التعديل' });
    }

    ad.title = String(req.body.title ?? ad.title).trim();
    ad.price = Number(req.body.price ?? ad.price);
    ad.category = String(req.body.category ?? ad.category).trim();
    ad.condition = String(req.body.condition ?? ad.condition).trim();
    ad.currency = String(req.body.currency ?? ad.currency).trim();
    ad.city = String(req.body.city ?? ad.city).trim();
    ad.neighbourhood = String(req.body.neighbourhood ?? ad.neighbourhood).trim();
    ad.description = String(req.body.description ?? ad.description);
    if (typeof req.body.image === 'string') ad.image = req.body.image;

    await ad.save();
    return res.json(ad);
  } catch (err) {
    return res.status(400).json({ message: 'فشل التعديل' });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ message: 'الإعلان غير موجود' });

    const authUser = await getAuthenticatedUser(req);
    if (!authUser || authUser.username !== ad.ownerUsername) {
      return res.status(403).json({ message: 'لا تملك صلاحية الحذف' });
    }

    await Ad.findByIdAndDelete(req.params.id);
    return res.json({ message: 'تم الحذف' });
  } catch (err) {
    return res.status(400).json({ message: 'فشل الحذف' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(300);
    return res.json(messages);
  } catch (err) {
    return res.status(500).json({ message: 'فشل جلب الرسائل' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return res.status(401).json({ message: 'يجب تسجيل الدخول' });

    const to = String(req.body.to ?? '').trim().toLowerCase();
    const text = String(req.body.text ?? '');
    if (!to || !text) return res.status(400).json({ message: 'بيانات الرسالة ناقصة' });

    const msg = new Message({ sender: authUser.username, to, text });
    await msg.save();
    return res.status(201).json(msg);
  } catch (err) {
    return res.status(400).json({ message: 'فشل الإرسال' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));