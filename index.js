const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// رفع حد حجم JSON لاستقبال الصور والرسائل الصوتية Base64
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// خدمة ملفات الواجهة الأمامية من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// الاتصال بقاعدة البيانات (MongoDB)
// ==========================================
if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.warn('Warning: MONGO_URI is not set.');
}

// ==========================================
// مخططات البيانات (Schemas & Models)
// ==========================================
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
    ownerUsername: { type: String, default: 'user', trim: true }
  },
  { timestamps: true }
);

const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// ==========================================
// دوال تشفير والتحقق من كلمة المرور
// ==========================================
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

// ==========================================
// مسارات تسجيل الدخول وإنشاء الحساب (الاسم وكلمة المرور فقط)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    if (!username || !password) {
      return res.status(400).json({ message: 'الرجاء إدخال الاسم وكلمة المرور' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: 'هذا الاسم مستخدم مسبقاً' });
    }

    const { salt, hash } = hashPassword(password);
    const token = crypto.randomBytes(24).toString('hex');

    const newUser = new User({
      username,
      passwordHash: hash,
      salt,
      token
    });

    await newUser.save();

    return res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      user: { username: newUser.username, token: newUser.token }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(400).json({ message: 'فشل إنشاء الحساب' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    if (!username || !password) {
      return res.status(400).json({ message: 'الرجاء إدخال الاسم وكلمة المرور' });
    }

    const user = await User.findOne({ username });
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return res.status(401).json({ message: 'الاسم أو كلمة المرور غير صحيحة' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    user.token = token;
    await user.save();

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      user: { username: user.username, token: user.token }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'حدث خطأ في الخادم' });
  }
});

// ==========================================
// مسارات الإعلانات (CRUD)
// ==========================================
app.get('/api/ads', async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 });
    return res.json(ads);
  } catch (err) {
    console.error('GET /api/ads error:', err);
    return res.status(500).json({ message: 'فشل جلب الإعلانات' });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const title = String(req.body.title ?? '').trim();
    const category = String(req.body.category ?? '').trim();
    if (!title || !category) {
      return res.status(400).json({ message: 'عنوان الإعلان والقسم مطلوبان' });
    }

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
      ownerUsername: String(req.body.ownerUsername ?? 'user').trim() || 'user'
    });

    await ad.save();
    return res.status(201).json(ad);
  } catch (err) {
    console.error('POST /api/ads error:', err);
    return res.status(400).json({ message: 'فشل إنشاء الإعلان' });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    const updated = await Ad.findByIdAndUpdate(
      req.params.id,
      {
        title: String(req.body.title ?? '').trim(),
        price: Number(req.body.price ?? 0),
        category: String(req.body.category ?? '').trim(),
        condition: String(req.body.condition ?? 'مستعمل').trim(),
        currency: String(req.body.currency ?? 'USD').trim(),
        city: String(req.body.city ?? '').trim(),
        neighbourhood: String(req.body.neighbourhood ?? '').trim(),
        description: String(req.body.description ?? ''),
        image: String(req.body.image ?? ''),
        ownerUsername: String(req.body.ownerUsername ?? 'user').trim() || 'user'
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'الإعلان غير موجود' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/ads/:id error:', err);
    return res.status(400).json({ message: 'فشل تحديث الإعلان' });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const deleted = await Ad.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'الإعلان غير موجود' });
    }
    return res.json({ message: 'تم حذف الإعلان بنجاح' });
  } catch (err) {
    console.error('DELETE /api/ads/:id error:', err);
    return res.status(400).json({ message: 'فشل حذف الإعلان' });
  }
});

// ==========================================
// مسارات الرسائل النصية والصوتية
// ==========================================
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(300);
    return res.json(messages);
  } catch (err) {
    console.error('GET /api/messages error:', err);
    return res.status(500).json({ message: 'فشل جلب الرسائل' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const sender = String(req.body.sender ?? 'user').trim() || 'user';
    const to = String(req.body.to ?? '').trim();
    const text = String(req.body.text ?? '');

    if (!to || !text) {
      return res.status(400).json({ message: 'المستلم ومحتوى الرسالة مطلوبان' });
    }

    const msg = new Message({ sender, to, text });
    await msg.save();
    return res.status(201).json(msg);
  } catch (err) {
    console.error('POST /api/messages error:', err);
    return res.status(400).json({ message: 'فشل إرسال الرسالة' });
  }
});

// ==========================================
// تقديم الواجهة لأي مسار غير API
// ==========================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});