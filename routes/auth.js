const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authLimiter, resetLimiter, requireAuth } = require('../middleware/auth');

// تخزين رمز الدخول في Cookie لا يمكن قراءته من JavaScript.
// Secure يعمل تلقائياً في بيئة الإنتاج التي تستخدم HTTPS.
function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('saee_token', token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  });
}


// 1. إنشاء حساب جديد مع اسم الحساب، إيميل، كلمة سر، ورمز أمان 4 خانات
router.post('/register', authLimiter, async (req, res) => {
  try {
    let { name, email, password, pin } = req.body;

    if (!name || !email || !password || !pin) {
      return res.status(400).json({
        success: false,
        message: 'يرجى ملء جميع الحقول المطلوبة (الاسم، البريد، كلمة المرور، ورمز الأمان).'
      });
    }

    name = String(name).trim();
    email = String(email).trim().toLowerCase();
    password = String(password);
    pin = String(pin).trim();

    // التحقق من صحة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال بريد إلكتروني صحيح.'
      });
    }

    // التحقق من قوة كلمة المرور
    if (password.length < 12) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور يجب أن تكون 12 خانة على الأقل.'
      });
    }

    // التحقق من أن رمز الأمان مكوّن من 4 أرقام تماماً
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'رمز الأمان يجب أن يتكون من 4 أرقام فقط (مثال: 4521).'
      });
    }

    // فحص ما إذا كان البريد مسجلاً مسبقاً
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ success: false, message: 'تعذر إنشاء الحساب بهذه البيانات. تحقق من البريد الإلكتروني أو سجّل الدخول.' });
    }

    // تشفير كلمة المرور ورمز الـ 4 خانات بأمان فائق (Bcrypt)
    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash = await bcrypt.hash(pin, 12);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, security_pin_hash, role)
      VALUES (?, ?, ?, ?, 'user')
    `).run(name, email, passwordHash, pinHash);

    const user = {
      id: result.lastInsertRowid,
      name,
      email,
      role: 'user'
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h', issuer: 'saee-plus', algorithm: 'HS256' });

    setAuthCookie(res, token);
    res.json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح! أهلاً بك في سعي بلس.',
      user,
      token
    });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم أثناء إنشاء الحساب.'
    });
  }
});

// 2. تسجيل الدخول
router.post('/login', authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.'
      });
    }

    email = String(email).trim().toLowerCase();
    password = String(password);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // Perform a dummy bcrypt comparison to reduce timing-based account discovery.
      await bcrypt.compare(password, '$2b$12$C6UzMDM.H6dfI/f/IKcEe.3Gv9yVv9Q3y8w0mVqY2gYx7e6Q8Jw5K');
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      });
    }

    // تحديث وقت آخر تسجيل دخول
    db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h', issuer: 'saee-plus', algorithm: 'HS256' });

    setAuthCookie(res, token);
    res.json({
      success: true,
      message: `أهلاً بك مجدداً يا ${user.name}!`,
      user: userData,
      token
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم أثناء تسجيل الدخول.'
    });
  }
});

// 3. استعادة كلمة المرور باستخدام الرمز السري ذو الـ 4 خانات
router.post('/forgot-password', resetLimiter, async (req, res) => {
  try {
    let { email, pin, newPassword } = req.body;

    if (!email || !pin || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال البريد الإلكتروني ورمز الأمان (4 خانات) وكلمة المرور الجديدة.'
      });
    }

    email = String(email).trim().toLowerCase();
    pin = String(pin).trim();
    newPassword = String(newPassword);

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'رمز الأمان يجب أن يتكون من 4 أرقام.'
      });
    }

    if (newPassword.length < 12) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة يجب أن تكون 12 خانة على الأقل.'
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'تعذر استعادة كلمة المرور بالبيانات المقدمة.' });
    }

    // التحقق من صحة رمز الـ 4 خانات
    const pinMatch = await bcrypt.compare(pin, user.security_pin_hash);
    if (!pinMatch) {
      return res.status(400).json({ success: false, message: 'تعذر استعادة كلمة المرور بالبيانات المقدمة.' });
    }

    // تشفير كلمة المرور الجديدة وحفظها
    const newHash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

    res.json({
      success: true,
      message: 'تم تعيين كلمة المرور الجديدة بنجاح! يمكنك الآن تسجيل الدخول بها.'
    });
  } catch (err) {
    console.error('Error during password reset:', err);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم أثناء إعادة تعيين كلمة المرور.'
    });
  }
});

// تسجيل الخروج: حذف Cookie من المتصفح.
router.post('/logout', (req, res) => {
  res.clearCookie('saee_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ success: true, message: 'تم تسجيل الخروج.' });
});

// 4. جلب بيانات الحساب الحالي المسجل
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'المستخدم غير موجود.' });
  }
  res.json({ success: true, user });
});

module.exports = router;
