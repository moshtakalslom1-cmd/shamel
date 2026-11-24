const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const APP_NAME = 'رخيص';

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));

const users = [];
const ads = [];
const messages = [];

function normalizeText(str) {
    return String(str || '').trim().replace(/\s+/g, ' ');
}

app.get('/api/meta', (req, res) => {
    res.json({ appName: APP_NAME });
});

app.post('/api/signup', (req, res) => {
    const { username, password, bio } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: 'اسم المستخدم موجود مسبقاً' });
    }
    const newUser = {
        username,
        password,
        bio: bio && bio.trim() ? bio.trim() : `عضو في منصة ${APP_NAME}`,
        joinedAt: new Date().toLocaleDateString('ar-EG')
    };
    users.push(newUser);
    res.json({ message: `تم إنشاء الحساب في ${APP_NAME} بنجاح`, user: { username, bio: newUser.bio, joinedAt: newUser.joinedAt } });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(400).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    res.json({ message: `أهلاً بك في ${APP_NAME}`, user: { username: user.username, bio: user.bio, joinedAt: user.joinedAt } });
});

app.get('/api/users/:username', (req, res) => {
    const uname = req.params.username;
    const found = users.find(u => u.username === uname);
    const userAds = ads.filter(a => a.username === uname);
    res.json({
        username: uname,
        bio: found ? found.bio : `معلن في منصة ${APP_NAME}`,
        joinedAt: found ? found.joinedAt : 'عضو نشط',
        adsCount: userAds.length
    });
});

app.put('/api/users/:username/bio', (req, res) => {
    const uname = req.params.username;
    const { bio } = req.body;
    const found = users.find(u => u.username === uname);
    if (found) {
        found.bio = (bio || '').trim() || `عضو في منصة ${APP_NAME}`;
        return res.json({ message: 'تم تحديث الملف التعريفي بنجاح', bio: found.bio });
    }
    res.status(404).json({ message: 'المستخدم غير موجود' });
});

app.post('/api/ads', upload.array('images', 5), (req, res) => {
    const { title, price, city, phone, category, subcategory, description, username } = req.body;
    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const newAd = {
        id: Date.now(),
        title: normalizeText(title) || 'بدون عنوان',
        price: normalizeText(price) || 'غير محدد',
        city: normalizeText(city) || 'غير محدد',
        phone: normalizeText(phone) || 'غير متوفر',
        category: normalizeText(category) || 'إلكترونيات',
        subcategory: normalizeText(subcategory) || 'عام',
        description: description || '',
        username: username || 'زائر',
        images,
        createdAt: new Date().toISOString()
    };

    ads.unshift(newAd);
    res.json({ message: 'تم نشر الإعلان بنجاح', ad: newAd });
});

app.get('/api/ads', (req, res) => {
    const category = normalizeText(req.query.category);
    const subcategory = normalizeText(req.query.subcategory);
    const q = normalizeText(req.query.q).toLowerCase();
    const username = normalizeText(req.query.username);
    const city = normalizeText(req.query.city);

    let filtered = [...ads];

    if (username !== '') {
        filtered = filtered.filter(ad => normalizeText(ad.username) === username);
    }
    if (category !== '' && category !== 'الكل') {
        filtered = filtered.filter(ad => normalizeText(ad.category) === category);
    }
    if (subcategory !== '' && subcategory !== 'الكل') {
        filtered = filtered.filter(ad => normalizeText(ad.subcategory) === subcategory);
    }
    if (city !== '' && city !== 'الكل') {
        filtered = filtered.filter(ad => normalizeText(ad.city) === city);
    }
    if (q !== '') {
        filtered = filtered.filter(ad =>
            normalizeText(ad.title).toLowerCase().includes(q) ||
            normalizeText(ad.description).toLowerCase().includes(q) ||
            normalizeText(ad.city).toLowerCase().includes(q) ||
            normalizeText(ad.category).toLowerCase().includes(q) ||
            normalizeText(ad.subcategory).toLowerCase().includes(q)
        );
    }

    res.json(filtered);
});

app.get('/api/ads/:id', (req, res) => {
    const ad = ads.find(item => String(item.id) === String(req.params.id));
    if (!ad) {
        return res.status(404).json({ message: 'الإعلان غير موجود' });
    }
    res.json(ad);
});

app.post('/api/messages', (req, res) => {
    const { sender, receiver, adId, adTitle, text } = req.body;
    if (!sender || !receiver || !text) {
        return res.status(400).json({ message: 'بيانات الرسالة ناقصة' });
    }
    const newMessage = {
        id: Date.now(),
        sender,
        receiver,
        adId: adId ? Number(adId) : null,
        adTitle: adTitle || '',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messages.push(newMessage);
    res.json({ message: 'تم إرسال الرسالة بنجاح', msg: newMessage });
});

app.get('/api/messages/:username', (req, res) => {
    const user = req.params.username;
    const userMsgs = messages.filter(m => m.sender === user || m.receiver === user);
    res.json(userMsgs);
});

app.listen(PORT, () => {
    console.log(`${APP_NAME} server running on http://localhost:${PORT}`);
});