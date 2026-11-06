const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'saeeplus.db');
const db = new Database(dbPath);

// تحسين أداء SQLite لتحمل أكثر من 50,000 مستخدم وعمليات متزامنة فائقة السرعة
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB Cache
db.pragma('foreign_keys = ON');

// إنشاء الجداول والفهارس
db.exec(`
  -- جدول المستخدمين (يتحمل أكثر من 50 ألف حساب مع سرعة استعلام لحظية)
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    security_pin_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 'user' أو 'admin'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

  -- جدول المحلات (Shops)
  CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    governorate TEXT NOT NULL, -- المحافظة كتابة
    instagram_url TEXT,
    facebook_url TEXT,
    phone TEXT,
    subscription_months INTEGER NOT NULL DEFAULT 1,
    subscription_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    subscription_end DATETIME NOT NULL,
    is_hidden INTEGER DEFAULT 0, -- 0 = ظاهر (إذا لم ينتهِ الاشتراك)، 1 = مخفي يدوياً
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_hidden, subscription_end);
  CREATE INDEX IF NOT EXISTS idx_shops_gov ON shops(governorate);

  -- جدول المشاريع (Projects)
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    instagram_url TEXT,
    facebook_url TEXT,
    subscription_months INTEGER NOT NULL DEFAULT 1,
    subscription_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    subscription_end DATETIME NOT NULL,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_hidden, subscription_end);

  -- جدول خدمات تهمك (Services)
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    description TEXT,
    social_url TEXT,
    instagram_url TEXT,
    facebook_url TEXT,
    phone TEXT,
    subscription_months INTEGER NOT NULL DEFAULT 1,
    subscription_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    subscription_end DATETIME NOT NULL,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_hidden, subscription_end);

  -- جدول إعدادات الموقع وروابط التواصل
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// دالة تهيئة البيانات الأولية (Admin، الإعدادات وروابط التواصل، وبيانات تجريبية)
function initializeDefaults() {
  // 1. إعدادات التواصل وزر الاستفسار والاشتراك
  const defaultSettings = [
    { key: 'whatsapp_number', value: '962791234567' },
    { key: 'instagram_url', value: 'https://instagram.com/saee_plus' },
    { key: 'inquiry_whatsapp_text', value: 'مرحباً سعي بلس، أرغب بالاستفسار والاشتراك في المنصة' },
    { key: 'site_title', value: 'سعي بلس | المنصة الوطنية للمشاريع والمحلات والخدمات' },
    { key: 'contact_email', value: 'contact@saeeplus.com' }
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const s of defaultSettings) {
    insertSetting.run(s.key, s.value);
  }

  // لا يتم إنشاء حساب مدير بكلمة مرور ثابتة. استخدم scripts/create-admin.js.

  // 3. إضافة عينات مبدئية إذا كانت الجداول فارغة لعرض الموقع بتصميم متكامل
  const shopCount = db.prepare('SELECT COUNT(*) as count FROM shops').get().count;
  if (shopCount === 0) {
    const now = new Date();
    const endFuture = new Date();
    endFuture.setMonth(now.getMonth() + 6); // اشتراك 6 أشهر

    const addShop = db.prepare(`
      INSERT INTO shops (name, description, image_url, governorate, instagram_url, facebook_url, phone, subscription_months, subscription_start, subscription_end, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    addShop.run(
      'متجر نشامى للحلويات والتواصي',
      'أشهى الحلويات الأردنية والشرقية الطازجة والمخبوزات التراثية للمناسبات والاحتفالات مع التوصيل لكافة المناطق.',
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=700&auto=format&fit=crop&q=80',
      'عمان',
      'https://instagram.com/nashama_sweets',
      'https://facebook.com/nashama_sweets',
      '0790001122',
      6,
      now.toISOString(),
      endFuture.toISOString()
    );

    addShop.run(
      'أزياء بيت الأصالة التراثية',
      'تصميم وتفصيل الأزياء التقليدية والحديثة بأرقى الخامات وبأيدي خياطين محترفين مع عروض خاصة لعملاء سعي بلس.',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=700&auto=format&fit=crop&q=80',
      'إربد',
      'https://instagram.com/asala_fashion',
      'https://facebook.com/asala_fashion',
      '0780003344',
      6,
      now.toISOString(),
      endFuture.toISOString()
    );

    addShop.run(
      'مكتبة ومطبعة النجاح الرقمية',
      'خدمات الطباعة الرقمية وتجليد الأبحاث والقرطاسية المدرسية والجامعية والهدايا الدعائية للشركات والمؤسسات.',
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=700&auto=format&fit=crop&q=80',
      'الزرقاء',
      'https://instagram.com/najah_press',
      'https://facebook.com/najah_press',
      '0770005566',
      6,
      now.toISOString(),
      endFuture.toISOString()
    );
  }

  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
  if (projectCount === 0) {
    const now = new Date();
    const endFuture = new Date();
    endFuture.setMonth(now.getMonth() + 12); // اشتراك 12 شهر

    const addProj = db.prepare(`
      INSERT INTO projects (name, description, image_url, instagram_url, facebook_url, subscription_months, subscription_start, subscription_end, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    addProj.run(
      'مشروع جرين هوم للطاقة والزراعة المائية',
      'مشروع ريادي أردني يوفر حلول الزراعة المائية المنزلية الذكية وأنظمة توفير استهلاك المياه والطاقة الحديثة.',
      'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=700&auto=format&fit=crop&q=80',
      'https://instagram.com/greenhome_jo',
      'https://facebook.com/greenhome_jo',
      12,
      now.toISOString(),
      endFuture.toISOString()
    );

    addProj.run(
      'منصة سند للخدمات اللوجستية والتوصيل',
      'مشروع ريادي يوفر ربطاً ذكياً بين أصحاب المشاريع الصغيرة ومناديب التوصيل بأسعار مخفضة وتتبع مباشر.',
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=700&auto=format&fit=crop&q=80',
      'https://instagram.com/sanad_delivery',
      'https://facebook.com/sanad_delivery',
      12,
      now.toISOString(),
      endFuture.toISOString()
    );

    addProj.run(
      'استوديو حِرفتي للأعمال اليدوية والريزون',
      'مشروع شبابي متميز لتصنيع التحف الفنية والميداليات وقطع الديكور المصنوعة يدوياً من الريزون والخشب الطبيعي.',
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=700&auto=format&fit=crop&q=80',
      'https://instagram.com/hirfati_art',
      'https://facebook.com/hirfati_art',
      12,
      now.toISOString(),
      endFuture.toISOString()
    );
  }

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const now = new Date();
    const endFuture = new Date();
    endFuture.setMonth(now.getMonth() + 6);

    const addServ = db.prepare(`
      INSERT INTO services (service_name, provider_name, description, social_url, instagram_url, facebook_url, phone, subscription_months, subscription_start, subscription_end, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    addServ.run(
      'تصميم الهويات البصرية والشعارات الاحترافية',
      'المصمم حمزة القضاة',
      'خدمة شاملة لتصميم شعار مبتكر وهوية بصرية كاملة مع قوالب السوشيال ميديا للمشاريع والمحلات الجديدة.',
      'https://instagram.com/hamza_designs',
      'https://instagram.com/hamza_designs',
      'https://facebook.com/hamza_designs',
      '0791112233',
      6,
      now.toISOString(),
      endFuture.toISOString()
    );

    addServ.run(
      'استشارات التسويق الرقمي وإدارة الحملات الإعلانية',
      'أكاديمية رواد التسويق',
      'خطة تسويقية متكاملة وإدارة إعلانات ممولة على فيسبوك وانستغرام وجوجل لزيادة مبيعات المحلات والمشاريع.',
      'https://instagram.com/rowwad_marketing',
      'https://instagram.com/rowwad_marketing',
      'https://facebook.com/rowwad_marketing',
      '0782223344',
      6,
      now.toISOString(),
      endFuture.toISOString()
    );

    addServ.run(
      'الاستشارات المحاسبية ودراسات الجدوى الاقتصادية',
      'المستشار المالي أحمد الزعبي',
      'إعداد خطط العمل ودراسات الجدوى وتنظيم الدفاتر المحاسبية للمشاريع الناشئة والمتوسطة بأسعار رمزية.',
      'https://facebook.com/ahmad_financial',
      'https://instagram.com/ahmad_financial',
      'https://facebook.com/ahmad_financial',
      '0773334455',
      6,
      now.toISOString(),
      endFuture.toISOString()
    );
  }
}

initializeDefaults();

module.exports = db;
