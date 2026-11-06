const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const { authenticateToken, adminLimiter } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_HOST = (process.env.ADMIN_HOST || '').toLowerCase().trim();
function requestHost(req) {
  return (req.hostname || '').toLowerCase().replace(/^www\./, '');
}
function isAdminHost(req) {
  return Boolean(ADMIN_HOST) && requestHost(req) === ADMIN_HOST.replace(/^www\\./, '');
}


// الأمان: قائمة السماح يجب أن تحتوي نطاق الواجهة الفعلي، وليس *.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(v => v.trim()).filter(Boolean);
app.disable('x-powered-by');
app.disable('etag');
app.use(helmet({
  contentSecurityPolicy: false, // Enable after the missing HTML pages are restored and inline scripts/styles are removed.
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  frameguard: { action: 'deny' },
  noSniff: true
}));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin') || req.path.startsWith('/api/upload')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') return res.redirect(308, 'https://' + req.get('host') + req.originalUrl);
    next();
  });
}
app.use(cors({ origin(origin, cb) {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  return cb(new Error('Origin not allowed'));
}, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// وسيط استخراج المصادقة التلقائي (JWT)
app.use(authenticateToken);


// حماية صفحة الإدارة على مستوى الخادم، وليس بمجرد إخفاء الرابط في الواجهة.
// لا يُسمح بتحميل صفحة الإدارة إلا بوجود جلسة مدير صالحة.
app.get(['/admin', '/admin/', '/admin.html', '/admin/index.html'], (req, res, next) => {
  if (!isAdminHost(req)) return res.status(404).send('Not Found');
  if (!req.user) {
    return res.redirect(302, '/?login=required');
  }
  if (req.user.role !== 'admin') {
    return res.status(404).send('Not Found');
  }
  const adminPage = path.join(__dirname, 'public', 'admin.html');
  return res.sendFile(adminPage, (err) => {
    if (err && !res.headersSent) {
      res.status(404).send('صفحة الإدارة غير موجودة ضمن ملفات الواجهة الحالية.');
    }
  });
});

// خدمة الملفات الساكنة (الواجهة الأمامية والأصول والصور المرفوعة)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// مسارات واجهة برمجة التطبيقات (API Routes)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminLimiter, (req, res, next) => {
  if (!isAdminHost(req)) return res.status(404).json({ success: false, message: 'Not Found' });
  next();
}, adminRoutes);
app.use('/api/upload', adminLimiter, (req, res, next) => {
  if (!isAdminHost(req)) return res.status(404).json({ success: false, message: 'Not Found' });
  next();
}, uploadRoutes);

// التوجيه إلى الصفحة الرئيسية لجميع المسارات الأخرى
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالج الأخطاء المركزي
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ success: false, message: err.status && err.status < 500 ? err.message : 'حدث خطأ داخلي في الخادم' });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 خادم سعي بلس (Sa'e Plus) يعمل بنجاح!`);
  console.log(`🌐 الرابط المحلي: http://localhost:${PORT}`);
  console.log(`🛡️ قاعدة بيانات SQLite تعمل بوضع WAL؛ السعة الفعلية تعتمد على الحمل والاستضافة والاختبار`);
  console.log('🔐 لا يوجد حساب مدير افتراضي. أنشئه بأداة bootstrap-admin بعد ضبط بيانات البيئة.');
  console.log(`====================================================`);
});
