const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

// ==========================================
// 1. إعدادات الوسائط (Middleware) وحجم الطلبات
// ==========================================
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// خدمة ملفات الواجهة الأمامية (يدعم المجلد الجذر ومجلد public)
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. مخططات وموديلات قاعدة البيانات (MongoDB)
// ==========================================
const adSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'USD', trim: true },
    category: { type: String, required: true, trim: true },
    subCategory: { type: String, default: '', trim: true },
    condition: { type: String, default: 'مستعمل', trim: true },
    city: { type: String, default: 'دمشق', trim: true },
    neighbourhood: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    ownerUsername: { type: String, default: 'user', trim: true }
  },
  { timestamps: true }
);

// فهارس لتحسين سرعة البحث والفرز
adSchema.index({ title: 'text', description: 'text', category: 'text', city: 'text' });
adSchema.index({ createdAt: -1 });
adSchema.index({ price: 1 });

const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, default: 'user', trim: true },
    to: { type: String, required: true, trim: true },
    recipient: { type: String, default: '', trim: true },
    text: { type: String, required: true, trim: true },
    adId: { type: String, default: '' },
    adTitle: { type: String, default: '' }
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1 });

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// ==========================================
// 3. دوال مساعدة للتحقق وتنظيف البيانات
// ==========================================
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function sanitizeAdPayload(body, isUpdate = false) {
  const payload = {};

  if (!isUpdate || body.title !== undefined) {
    payload.title = String(body.title ?? '').trim();
  }
  if (!isUpdate || body.price !== undefined) {
    const parsedPrice = Number(body.price);
    payload.price = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;
  }
  if (!isUpdate || body.currency !== undefined) {
    const allowedCurrencies = ['USD', 'SYP', 'TRY'];
    payload.currency = allowedCurrencies.includes(body.currency) ? body.currency : 'USD';
  }
  if (!isUpdate || body.category !== undefined) {
    payload.category = String(body.category ?? '').trim();
  }
  if (!isUpdate || body.subCategory !== undefined) {
    payload.subCategory = String(body.subCategory ?? '').trim();
  }
  if (!isUpdate || body.condition !== undefined) {
    payload.condition = String(body.condition ?? 'مستعمل').trim() || 'مستعمل';
  }
  if (!isUpdate || body.city !== undefined) {
    payload.city = String(body.city ?? 'دمشق').trim() || 'دمشق';
  }
  if (!isUpdate || body.neighbourhood !== undefined) {
    payload.neighbourhood = String(body.neighbourhood ?? '').trim();
  }
  if (!isUpdate || body.description !== undefined) {
    payload.description = String(body.description ?? '');
  }
  if (!isUpdate || body.image !== undefined) {
    payload.image = String(body.image ?? '').trim();
  }
  if (!isUpdate || body.ownerUsername !== undefined) {
    payload.ownerUsername = String(body.ownerUsername ?? 'user').trim() || 'user';
  }

  return payload;
}

// ==========================================
// 4. مسارات فحص الحالة والإعلانات (Ads API)
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dbConnected: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString()
  });
});

// جلب جميع الإعلانات مع دعم الفلترة والترتيب الاختياري من السيرفر
app.get('/api/ads', async (req, res) => {
  try {
    const filter = {};
    const { category, city, condition, q, sort } = req.query;

    if (category && String(category).trim()) {
      filter.category = String(category).trim();
    }
    if (condition && String(condition).trim()) {
      filter.condition = String(condition).trim();
    }
    if (city && String(city).trim()) {
      const escapedCity = String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cityRegex = new RegExp(escapedCity, 'i');
      filter.$or = [{ city: cityRegex }, { neighbourhood: cityRegex }];
    }
    if (q && String(q).trim()) {
      const escapedQ = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const qRegex = new RegExp(escapedQ, 'i');
      const searchCond = [
        { title: qRegex },
        { description: qRegex },
        { category: qRegex },
        { city: qRegex },
        { neighbourhood: qRegex }
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchCond }];
        delete filter.$or;
      } else {
        filter.$or = searchCond;
      }
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1, createdAt: -1 };
    else if (sort === 'price-desc') sortOption = { price: -1, createdAt: -1 };

    const ads = await Ad.find(filter).sort(sortOption);
    res.json(ads);
  } catch (err) {
    console.error('Error fetching ads:', err);
    res.status(500).json({ message: 'فشل جلب الإعلانات من قاعدة البيانات' });
  }
});

// جلب إعلان واحد حسب المعرف
app.get('/api/ads/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'معرف الإعلان غير صالح' });
    }

    const ad = await Ad.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({ message: 'الإعلان غير موجود' });
    }

    res.json(ad);
  } catch (err) {
    console.error('Error fetching single ad:', err);
    res.status(500).json({ message: 'فشل جلب تفاصيل الإعلان' });
  }
});

// إنشاء إعلان جديد
app.post('/api/ads', async (req, res) => {
  try {
    const payload = sanitizeAdPayload(req.body, false);

    if (!payload.title) {
      return res.status(400).json({ message: 'عنوان الإعلان مطلوب' });
    }
    if (!payload.category) {
      return res.status(400).json({ message: 'القسم الرئيسي مطلوب' });
    }

    const newAd = new Ad(payload);
    const savedAd = await newAd.save();
    res.status(201).json(savedAd);
  } catch (err) {
    console.error('Error creating ad:', err);
    res.status(400).json({ message: 'فشل نشر الإعلان', error: err.message });
  }
});

// دالة مشتركة لتحديث إعلان عبر PUT أو PATCH
async function updateAdHandler(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'معرف الإعلان غير صالح' });
    }

    const payload = sanitizeAdPayload(req.body, true);

    if (payload.title !== undefined && !payload.title) {
      return res.status(400).json({ message: 'لا يمكن ترك عنوان الإعلان فارغاً' });
    }

    const updatedAd = await Ad.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!updatedAd) {
      return res.status(404).json({ message: 'الإعلان غير موجود' });
    }

    res.json(updatedAd);
  } catch (err) {
    console.error('Error updating ad:', err);
    res.status(400).json({ message: 'فشل تحديث الإعلان', error: err.message });
  }
}

app.put('/api/ads/:id', updateAdHandler);
app.patch('/api/ads/:id', updateAdHandler);

// حذف إعلان نهائياً
app.delete('/api/ads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'معرف الإعلان غير صالح' });
    }

    const deletedAd = await Ad.findByIdAndDelete(id);
    if (!deletedAd) {
      return res.status(404).json({ message: 'الإعلان غير موجود' });
    }

    res.json({
      message: 'تم حذف الإعلان بنجاح',
      deletedId: id
    });
  } catch (err) {
    console.error('Error deleting ad:', err);
    res.status(400).json({ message: 'فشل حذف الإعلان', error: err.message });
  }
});

// ==========================================
// 5. مسارات المراسلات (Messages API)
// ==========================================
app.get('/api/messages', async (req, res) => {
  try {
    const filter = {};
    if (req.query.user && String(req.query.user).trim()) {
      const u = String(req.query.user).trim();
      filter.$or = [{ sender: u }, { to: u }, { recipient: u }];
    }

    const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ message: 'فشل جلب الرسائل' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const target = String(req.body.to ?? req.body.recipient ?? '').trim();
    const content = String(req.body.text ?? req.body.message ?? '').trim();
    const sender = String(req.body.sender ?? 'user').trim() || 'user';

    if (!target || !content) {
      return res.status(400).json({ message: 'اسم المستلم ونص الرسالة مطلوبان' });
    }

    const newMessage = new Message({
      sender,
      to: target,
      recipient: target,
      text: content,
      adId: String(req.body.adId ?? '').trim(),
      adTitle: String(req.body.adTitle ?? '').trim()
    });

    const savedMessage = await newMessage.save();
    res.status(201).json(savedMessage);
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(400).json({ message: 'فشل إرسال الرسالة', error: err.message });
  }
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'معرف الرسالة غير صالح' });
    }

    const deleted = await Message.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'الرسالة غير موجودة' });
    }

    res.json({ message: 'تم حذف الرسالة', id: req.params.id });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(400).json({ message: 'فشل حذف الرسالة' });
  }
});

// ==========================================
// 6. معالجة الأخطاء والصفحات الاحتياطية
// ==========================================
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'حجم البيانات أو الصورة المرفوعة أكبر من الحد المسموح (20MB)'
    });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'حدث خطأ غير متوقع في الخادم' });
});

app.get('*', (req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  res.sendFile(rootIndex, err => {
    if (err) {
      res.sendFile(publicIndex, err2 => {
        if (err2) {
          res.status(404).send('الصفحة غير موجودة');
        }
      });
    }
  });
});

// ==========================================
// 7. بدء تشغيل الخادم والاتصال بقاعدة البيانات
// ==========================================
async function startServer() {
  try {
    if (!MONGO_URI) {
      console.warn('Warning: MONGODB_URI / MONGO_URL is not set.');
    } else {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB Atlas successfully');
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();