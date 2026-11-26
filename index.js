const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MONGODB_URI = process.env.MONGODB_URI || '';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw || '')).digest('hex');
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

// --- تعريف نماذج MongoDB ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  city: { type: String, default: 'دمشق' },
  phone: { type: String, default: '' },
  bio: { type: String, default: '' },
  avatar: { type: String, default: '' }
});

const reviewSchema = new mongoose.Schema({
  author: String,
  rating: String,
  comment: String,
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const adSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  price: { type: String, required: true },
  currency: { type: String, default: 'ل.س' },
  category: { type: String, default: 'عام' },
  subCategory: { type: String, default: '' },
  city: { type: String, default: 'دمشق' },
  neighborhood: { type: String, default: '' },
  condition: { type: String, default: 'مستعمل' },
  description: { type: String, default: '' },
  ownerUsername: { type: String, default: 'مستخدم' },
  image: { type: String, default: '' },
  reviews: { type: [reviewSchema], default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  adId: { type: String, default: '' },
  timestamp: { type: String, default: () => new Date().toISOString() }
});

const UserModel = mongoose.model('User', userSchema);
const AdModel = mongoose.model('Ad', adSchema);
const MessageModel = mongoose.model('Message', messageSchema);

let dbConnected = false;

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

function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = getDefaultData();
      writeLocalData(initial);
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      ads: Array.isArray(parsed.ads) ? parsed.ads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch (err) {
    return getDefaultData();
  }
}

function writeLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {}
}

async function seedDatabaseIfEmpty() {
  if (!dbConnected) return;
  const usersCount = await UserModel.countDocuments();
  const adsCount = await AdModel.countDocuments();
  if (usersCount === 0 && adsCount === 0) {
    const def = getDefaultData();
    await UserModel.insertMany(def.users, { ordered: false }).catch(() => {});
    await AdModel.insertMany(def.ads, { ordered: false }).catch(() => {});
  }
}

async function connectMongo() {
  if (!MONGODB_URI) {
    console.log('MONGODB_URI not set; running with local fallback.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    dbConnected = true;
    console.log('Connected to MongoDB Atlas');
    await seedDatabaseIfEmpty();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    dbConnected = false;
  }
}

// --- المسارات (API) ---

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const city = String(req.body.city || 'دمشق').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  if (dbConnected) {
    const exists = await UserModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (exists) return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });

    const created = await UserModel.create({
      username,
      passwordHash: hashPassword(password),
      city,
      phone: '',
      bio: '',
      avatar: ''
    });
    return res.status(201).json({ user: sanitizeUser(created) });
  }

  const db = readLocalData();
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
  }
  const newUser = { username, passwordHash: hashPassword(password), city, phone: '', bio: '', avatar: '' };
  db.users.push(newUser);
  writeLocalData(db);
  return res.status(201).json({ user: sanitizeUser(newUser) });
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  if (dbConnected) {
    const user = await UserModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    return res.json({ user: sanitizeUser(user) });
  }

  const db = readLocalData();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/users/:username', async (req, res) => {
  const rawName = String(req.params.username || '').trim();
  const target = rawName.toLowerCase();

  if (dbConnected) {
    const found = await UserModel.findOne({ username: new RegExp(`^${rawName}$`, 'i') });
    const userAds = await AdModel.find({ ownerUsername: new RegExp(`^${rawName}$`, 'i') }).sort({ createdAt: -1 });
    return res.json({
      username: found ? found.username : rawName,
      city: found ? found.city : 'دمشق',
      phone: found ? found.phone : '',
      bio: found ? found.bio : '',
      avatar: found ? found.avatar : '',
      adsCount: userAds.length,
      ads: userAds
    });
  }

  const db = readLocalData();
  const found = db.users.find(u => u.username.toLowerCase() === target);
  const userAds = db.ads.filter(ad => String(ad.ownerUsername || '').toLowerCase() === target);
  return res.json({
    ...(found ? sanitizeUser(found) : { username: rawName, city: 'دمشق', phone: '', bio: '', avatar: '' }),
    adsCount: userAds.length,
    ads: userAds
  });
});

app.put('/api/profile/settings', async (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'اسم المستخدم مطلوب' });

  if (dbConnected) {
    let user = await UserModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) {
      user = await UserModel.create({
        username,
        passwordHash: hashPassword('123456'),
        city: 'دمشق',
        phone: '',
        bio: '',
        avatar: ''
      });
    }
    if (typeof req.body.city === 'string') user.city = req.body.city.trim();
    if (typeof req.body.phone === 'string') user.phone = req.body.phone.trim();
    if (typeof req.body.bio === 'string') user.bio = req.body.bio.trim();
    if (typeof req.body.avatar === 'string') user.avatar = req.body.avatar;
    await user.save();
    return res.json({ user: sanitizeUser(user) });
  }

  const db = readLocalData();
  let user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    user = { username, passwordHash: hashPassword('123456'), city: 'دمشق', phone: '', bio: '', avatar: '' };
    db.users.push(user);
  }
  if (typeof req.body.city === 'string') user.city = req.body.city.trim();
  if (typeof req.body.phone === 'string') user.phone = req.body.phone.trim();
  if (typeof req.body.bio === 'string') user.bio = req.body.bio.trim();
  if (typeof req.body.avatar === 'string') user.avatar = req.body.avatar;
  writeLocalData(db);
  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/ads', async (req, res) => {
  if (dbConnected) {
    const ads = await AdModel.find({}).sort({ createdAt: -1 });
    return res.json(ads);
  }
  const db = readLocalData();
  return res.json(db.ads);
});

app.post('/api/ads', async (req, res) => {
  const title = String(req.body.title || '').trim();
  const rawPrice = String(req.body.price || '').replace(/[^\d]/g, '');
  if (!title || !rawPrice) {
    return res.status(400).json({ error: 'العنوان والسعر مطلوبان' });
  }

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

  if (dbConnected) {
    const saved = await AdModel.create(newAd);
    return res.status(201).json(saved);
  }

  const db = readLocalData();
  db.ads.unshift(newAd);
  writeLocalData(db);
  return res.status(201).json(newAd);
});

app.post('/api/ads/:id/reviews', async (req, res) => {
  const adId = String(req.params.id || '');
  const review = {
    author: String(req.body.author || 'زائر').trim(),
    rating: String(req.body.rating || '5').trim(),
    comment: String(req.body.comment || '').trim(),
    createdAt: new Date().toISOString()
  };

  if (dbConnected) {
    const ad = await AdModel.findOne({ id: adId });
    if (!ad) return res.status(404).json({ error: 'الإعلان غير موجود' });
    ad.reviews.push(review);
    await ad.save();
    return res.status(201).json(ad);
  }

  const db = readLocalData();
  const ad = db.ads.find(a => String(a.id) === adId);
  if (!ad) return res.status(404).json({ error: 'الإعلان غير موجود' });
  if (!Array.isArray(ad.reviews)) ad.reviews = [];
  ad.reviews.push(review);
  writeLocalData(db);
  return res.status(201).json(ad);
});

app.delete('/api/ads/:id', async (req, res) => {
  const adId = String(req.params.id || '');

  if (dbConnected) {
    const deleted = await AdModel.findOneAndDelete({ id: adId });
    if (!deleted) return res.status(404).json({ error: 'الإعلان غير موجود' });
    return res.json({ deleted: true, id: adId });
  }

  const db = readLocalData();
  const before = db.ads.length;
  db.ads = db.ads.filter(a => String(a.id) !== adId);
  if (db.ads.length === before) return res.status(404).json({ error: 'الإعلان غير موجود' });
  writeLocalData(db);
  return res.json({ deleted: true, id: adId });
});

app.get('/api/messages', async (req, res) => {
  const user = String(req.query.user || '').trim().toLowerCase();

  if (dbConnected) {
    const all = await MessageModel.find({}).sort({ timestamp: 1 });
    if (!user) return res.json({ messages: all });
    const filtered = all.filter(m =>
      String(m.from || '').toLowerCase() === user || String(m.to || '').toLowerCase() === user
    );
    return res.json({ messages: filtered });
  }

  const db = readLocalData();
  if (!user) return res.json({ messages: db.messages });
  const filtered = db.messages.filter(m =>
    String(m.from || '').toLowerCase() === user || String(m.to || '').toLowerCase() === user
  );
  return res.json({ messages: filtered });
});

app.post('/api/messages', async (req, res) => {
  const from = String(req.body.from || req.body.sender || '').trim();
  const to = String(req.body.to || req.body.receiver || '').trim();
  const text = String(req.body.text || req.body.message || '').trim();

  if (!from || !to || !text) {
    return res.status(400).json({ error: 'بيانات الرسالة غير مكتملة' });
  }

  const msg = {
    id: String(req.body.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    from,
    to,
    text,
    adId: String(req.body.adId || ''),
    timestamp: req.body.timestamp || new Date().toISOString()
  };

  if (dbConnected) {
    const saved = await MessageModel.create(msg);
    return res.status(201).json({ message: saved });
  }

  const db = readLocalData();
  db.messages.push(msg);
  writeLocalData(db);
  return res.status(201).json({ message: msg });
});

app.get('*', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(200).send('رخيص - السوق الشامل يعمل');
});

connectMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});