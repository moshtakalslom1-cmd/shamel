const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'moshtaksloomm@gmail.com',
    pass: 'flqy vxqk axtj jtzw'
  }
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
  } else {
    console.log('تم الاتصال بقاعدة البيانات بنجاح.');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    phone TEXT,
    email TEXT UNIQUE,
    city TEXT,
    verification_code TEXT,
    is_verified INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    title TEXT,
    category TEXT,
    sub_category TEXT,
    price TEXT,
    city TEXT,
    phone TEXT,
    description TEXT,
    image TEXT,
    images TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    sender_name TEXT,
    receiver_id INTEGER,
    receiver_name TEXT,
    ad_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`ALTER TABLE ads ADD COLUMN sub_category TEXT`, () => {});
  db.run(`ALTER TABLE ads ADD COLUMN images TEXT`, () => {});
});

// 1. تسجيل مستخدم جديد
app.post('/api/register', (req, res) => {
  const { username, password, phone, email, city } = req.body;
  if (!username || !password || !email) {
    return res.status(400).json({ error: 'الرجاء تعبئة الحقول الإجبارية' });
  }

  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

  const sql = `INSERT INTO users (username, password, phone, email, city, verification_code, is_verified) VALUES (?, ?, ?, ?, ?, ?, 0)`;
  db.run(sql, [username.trim(), password, (phone || '').trim(), email.trim().toLowerCase(), (city || '').trim(), verificationCode], function (err) {
    if (err) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    const mailOptions = {
      from: 'moshtaksloomm@gmail.com',
      to: email.trim().toLowerCase(),
      subject: 'رمز التحقق من حسابك - سوق الشامل',
      text: `رمز التحقق الخاص بك هو: ${verificationCode}`
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error('خطأ في إرسال البريد:', error);
        return res.status(500).json({ error: 'تم إنشاء الحساب ولكن تعذر إرسال رمز التحقق' });
      }
      return res.status(200).json({ message: 'تم التسجيل وإرسال رمز التحقق إلى بريدك الإلكتروني' });
    });
  });
});

// 2. تفعيل الحساب
app.post('/api/verify', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني ورمز التحقق' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const sql = `SELECT * FROM users WHERE email = ? AND verification_code = ?`;
  db.get(sql, [cleanEmail, cleanCode], (err, user) => {
    if (err) return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
    if (!user) return res.status(400).json({ error: 'البريد الإلكتروني أو رمز التحقق غير صحيح' });

    const updateSql = `UPDATE users SET is_verified = 1, verification_code = NULL WHERE email = ?`;
    db.run(updateSql, [cleanEmail], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: 'فشل تحديث حالة الحساب' });
      return res.status(200).json({ message: 'تم تفعيل الحساب بنجاح' });
    });
  });
});

// 3. إعادة إرسال رمز التحقق
app.post('/api/resend-code', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني' });

  const cleanEmail = email.trim().toLowerCase();
  const newCode = Math.floor(100000 + Math.random() * 900000).toString();

  db.get(`SELECT * FROM users WHERE email = ?`, [cleanEmail], (err, user) => {
    if (err) return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
    if (!user) return res.status(404).json({ error: 'البريد الإلكتروني غير مسجل' });

    db.run(`UPDATE users SET verification_code = ? WHERE email = ?`, [newCode, cleanEmail], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'فشل تحديث رمز التحقق' });

      transporter.sendMail({
        from: 'moshtaksloomm@gmail.com',
        to: cleanEmail,
        subject: 'إعادة إرسال رمز التحقق - سوق الشامل',
        text: `رمز التحقق الجديد الخاص بك هو: ${newCode}`
      }, (mailErr) => {
        if (mailErr) return res.status(500).json({ error: 'تعذر إرسال رمز التحقق' });
        return res.status(200).json({ message: 'تمت إعادة إرسال رمز التحقق بنجاح' });
      });
    });
  });
});

// 4. تسجيل الدخول
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });
  }

  const cleanEmail = email.trim().toLowerCase();

  db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [cleanEmail, password], (err, user) => {
    if (err) return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
    if (!user) return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    if (Number(user.is_verified) !== 1) {
      return res.status(403).json({ error: 'الحساب غير مفعل. يرجى تأكيد البريد الإلكتروني أولاً' });
    }

    return res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        city: user.city
      }
    });
  });
});

// 5. تحديث إعدادات الملف الشخصي للمستخدم
app.put('/api/profile/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const { username, phone, city } = req.body;

  if (!userId || !username || !username.trim()) {
    return res.status(400).json({ error: 'يرجى إدخال اسم مستخدم صحيح' });
  }

  const cleanName = username.trim();
  const cleanPhone = (phone || '').trim();
  const cleanCity = (city || '').trim();

  db.run(
    `UPDATE users SET username = ?, phone = ?, city = ? WHERE id = ?`,
    [cleanName, cleanPhone, cleanCity, userId],
    function (err) {
      if (err) return res.status(500).json({ error: 'فشل تحديث بيانات الملف الشخصي' });
      if (this.changes === 0) return res.status(404).json({ error: 'المستخدم غير موجود' });

      db.run(`UPDATE ads SET username = ? WHERE user_id = ?`, [cleanName, userId], () => {});
      db.get(`SELECT id, username, email, phone, city FROM users WHERE id = ?`, [userId], (getErr, updatedUser) => {
        if (getErr || !updatedUser) return res.status(500).json({ error: 'تعذر جلب البيانات المحدثة' });
        return res.status(200).json({ message: 'تم حفظ الإعدادات بنجاح', user: updatedUser });
      });
    }
  );
});

// 6. طلب استعادة كلمة المرور
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني' });

  const cleanEmail = email.trim().toLowerCase();
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

  db.run(`UPDATE users SET verification_code = ? WHERE email = ?`, [resetCode, cleanEmail], function (err) {
    if (err) return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
    if (this.changes === 0) return res.status(404).json({ error: 'البريد الإلكتروني غير موجود' });

    transporter.sendMail({
      from: 'process.env.EMAIL_USER.com',
      to: cleanEmail,
      subject: 'رمز استعادة كلمة المرور - سوق الشامل',
      text: `رمز التحقق لتعيين كلمة مرور جديدة هو: ${resetCode}`
    }, (error) => {
      if (error) return res.status(500).json({ error: 'تعذر إرسال رمز التحقق' });
      return res.status(200).json({ message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
    });
  });
});

// 7. تعيين كلمة المرور الجديدة
app.post('/api/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني والرمز وكلمة المرور الجديدة' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  db.get(`SELECT * FROM users WHERE email = ? AND verification_code = ?`, [cleanEmail, cleanCode], (err, user) => {
    if (err) return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
    if (!user) return res.status(400).json({ error: 'البريد الإلكتروني أو رمز التحقق غير صحيح' });

    db.run(`UPDATE users SET password = ?, verification_code = NULL, is_verified = 1 WHERE email = ?`, [newPassword, cleanEmail], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: 'فشل تحديث كلمة المرور' });
      return res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول' });
    });
  });
});

// 8. جلب الإعلانات
app.get('/api/ads', (req, res) => {
  db.all(`SELECT * FROM ads ORDER BY created_at DESC, id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'فشل جلب الإعلانات' });
    res.json(rows);
  });
});

// 9. إضافة إعلان جديد مع قسم فرعي وعدة صور
app.post('/api/ads', upload.array('images', 10), (req, res) => {
  const { user_id, username, title, category, sub_category, price, city, phone, description } = req.body;
  if (!user_id || !title || !price || !category) {
    return res.status(400).json({ error: 'يرجى تعبئة الحقول المطلوبة' });
  }

  const imagePaths = req.files && req.files.length > 0
    ? req.files.map(f => '/uploads/' + f.filename)
    : [];
  const mainImage = imagePaths.length > 0 ? imagePaths[0] : null;
  const imagesJson = JSON.stringify(imagePaths);

  const sql = `INSERT INTO ads (user_id, username, title, category, sub_category, price, city, phone, description, image, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [user_id, username, title.trim(), category, sub_category || 'عام', price.trim(), (city || '').trim(), (phone || '').trim(), (description || '').trim(), mainImage, imagesJson], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'فشل حفظ الإعلان في قاعدة البيانات' });
    }
    return res.status(201).json({ message: 'تم نشر الإعلان بنجاح', adId: this.lastID });
  });
});

// 10. حذف إعلان مع جميع صوره
app.delete('/api/ads/:id', (req, res) => {
  const adId = req.params.id;
  db.get(`SELECT image, images FROM ads WHERE id = ?`, [adId], (err, ad) => {
    if (err) return res.status(500).json({ error: 'خطأ في الاستعلام' });
    if (!ad) return res.status(404).json({ error: 'الإعلان غير موجود' });

    let allImages = [];
    try {
      allImages = ad.images ? JSON.parse(ad.images) : (ad.image ? [ad.image] : []);
    } catch (e) {
      allImages = ad.image ? [ad.image] : [];
    }

    allImages.forEach(imgRelPath => {
      const fullPath = path.join(__dirname, imgRelPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });

    db.run(`DELETE FROM ads WHERE id = ?`, [adId], function (deleteErr) {
      if (deleteErr) return res.status(500).json({ error: 'فشل حذف الإعلان' });
      return res.status(200).json({ message: 'تم حذف الإعلان بنجاح' });
    });
  });
});

// 11. جلب رسائل الدردشة بين مستخدمين
app.get('/api/messages', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) {
    return res.status(400).json({ error: 'مطلوب تحديد الطرفين' });
  }

  const sql = `
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?)
       OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC, id ASC
  `;
  db.all(sql, [user1, user2, user2, user1], (err, rows) => {
    if (err) return res.status(500).json({ error: 'فشل جلب الرسائل' });
    res.json(rows);
  });
});

// 12. جلب قائمة المحادثات للمستخدم الحالي
app.get('/api/conversations/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const sql = `
    SELECT * FROM messages
    WHERE sender_id = ? OR receiver_id = ?
    ORDER BY created_at DESC, id DESC
  `;
  db.all(sql, [userId, userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'فشل جلب المحادثات' });

    const map = new Map();
    rows.forEach(msg => {
      const otherId = Number(msg.sender_id) === userId ? Number(msg.receiver_id) : Number(msg.sender_id);
      const otherName = Number(msg.sender_id) === userId ? msg.receiver_name : msg.sender_name;
      if (!map.has(otherId)) {
        map.set(otherId, {
          otherUserId: otherId,
          otherUserName: otherName || `مستخدم #${otherId}`,
          lastMessage: msg.content,
          createdAt: msg.created_at
        });
      }
    });

    res.json(Array.from(map.values()));
  });
});

// 13. إرسال رسالة دردشة
app.post('/api/messages', (req, res) => {
  const { sender_id, sender_name, receiver_id, receiver_name, ad_id, content } = req.body;
  if (!sender_id || !receiver_id || !content || !content.trim()) {
    return res.status(400).json({ error: 'يرجى كتابة رسالة صحيحة' });
  }

  const sql = `INSERT INTO messages (sender_id, sender_name, receiver_id, receiver_name, ad_id, content) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [sender_id, sender_name, receiver_id, receiver_name || 'مستخدم', ad_id || null, content.trim()], function (err) {
    if (err) return res.status(500).json({ error: 'فشل إرسال الرسالة' });
    res.status(201).json({
      id: this.lastID,
      sender_id,
      sender_name,
      receiver_id,
      receiver_name,
      ad_id,
      content: content.trim()
    });
  });
});

app.listen(PORT, () => {
  console.log(`السيرفر يعمل بكامل طاقته على المنفذ http://localhost:${PORT}`);
});