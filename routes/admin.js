const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// جميع مسارات لوحة التحكم تتطلب تسجيل دخول كمدير (Admin)
router.use(requireAdmin);

// حساب تاريخ الانتهاء بناءً على عدد الأشهر
function calculateEndDate(startDate, months) {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + parseInt(months || 1, 10));
  return d.toISOString();
}

// -------------------------------------------------------------
// 1. الإحصائيات العامة للوحة التحكم
// -------------------------------------------------------------
router.get('/dashboard-stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const shopsTotal = db.prepare('SELECT COUNT(*) as c FROM shops').get().c;
    const shopsActive = db.prepare("SELECT COUNT(*) as c FROM shops WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')").get().c;
    const shopsExpired = db.prepare("SELECT COUNT(*) as c FROM shops WHERE datetime(subscription_end) <= datetime('now')").get().c;

    const projectsTotal = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
    const projectsActive = db.prepare("SELECT COUNT(*) as c FROM projects WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')").get().c;
    const projectsExpired = db.prepare("SELECT COUNT(*) as c FROM projects WHERE datetime(subscription_end) <= datetime('now')").get().c;

    const servicesTotal = db.prepare('SELECT COUNT(*) as c FROM services').get().c;
    const servicesActive = db.prepare("SELECT COUNT(*) as c FROM services WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')").get().c;
    const servicesExpired = db.prepare("SELECT COUNT(*) as c FROM services WHERE datetime(subscription_end) <= datetime('now')").get().c;

    res.json({
      success: true,
      stats: {
        totalUsers,
        shops: { total: shopsTotal, active: shopsActive, expired: shopsExpired },
        projects: { total: projectsTotal, active: projectsActive, expired: projectsExpired },
        services: { total: servicesTotal, active: servicesActive, expired: servicesExpired }
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب إحصائيات الإدارة' });
  }
});

// -------------------------------------------------------------
// 2. تحديث إعدادات التواصل وزر الاستفسار والاشتراك
// -------------------------------------------------------------
router.post('/settings', (req, res) => {
  try {
    const { whatsapp_number, instagram_url, inquiry_whatsapp_text, logo_url } = req.body;
    const upsert = db.prepare(`
      INSERT INTO site_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const updateMany = db.transaction(() => {
      if (whatsapp_number !== undefined) upsert.run('whatsapp_number', String(whatsapp_number).trim());
      if (instagram_url !== undefined) upsert.run('instagram_url', String(instagram_url).trim());
      if (inquiry_whatsapp_text !== undefined) upsert.run('inquiry_whatsapp_text', String(inquiry_whatsapp_text).trim());
      if (logo_url !== undefined) upsert.run('logo_url', String(logo_url).trim());
    });

    updateMany();

    res.json({ success: true, message: 'تم تحديث روابط التواصل وزر الاستفسار بنجاح!' });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ success: false, message: 'خطأ أثناء تحديث الإعدادات' });
  }
});


// حذف شعار الموقع المخصص والرجوع إلى الشعار الافتراضي.
router.delete('/logo', (req, res) => {
  try {
    const current = db.prepare("SELECT value FROM site_settings WHERE key = 'logo_url'").get();
    if (current?.value && current.value.startsWith('/uploads/')) {
      const fs = require('fs');
      const path = require('path');
      const filename = path.basename(current.value);
      const filePath = path.join(__dirname, '..', 'public', 'uploads', filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare("DELETE FROM site_settings WHERE key = 'logo_url'").run();
    res.json({ success: true, message: 'تم حذف الشعار المخصص والعودة للشعار الافتراضي.' });
  } catch (err) {
    console.error('Logo delete error:', err);
    res.status(500).json({ success: false, message: 'تعذر حذف الشعار.' });
  }
});

// -------------------------------------------------------------
// 3. إدارة المحلات (Shops)
// -------------------------------------------------------------
router.get('/shops', (req, res) => {
  try {
    const query = `
      SELECT *,
        CASE WHEN datetime(subscription_end) <= datetime('now') THEN 1 ELSE 0 END AS is_expired,
        CAST((julianday(subscription_end) - julianday('now')) AS INTEGER) AS days_remaining
      FROM shops
      ORDER BY id DESC
    `;
    const shops = db.prepare(query).all();
    res.json({ success: true, shops });
  } catch (err) {
    console.error('Admin shops error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب المحلات' });
  }
});

router.post('/shops', (req, res) => {
  try {
    const { name, description, image_url, governorate, instagram_url, facebook_url, phone, subscription_months } = req.body;

    if (!name || !governorate) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المحل والمحافظة.' });
    }

    const months = parseInt(subscription_months, 10) || 1;
    const now = new Date();
    const startDate = now.toISOString();
    const endDate = calculateEndDate(now, months);

    const stmt = db.prepare(`
      INSERT INTO shops (name, description, image_url, governorate, instagram_url, facebook_url, phone, subscription_months, subscription_start, subscription_end, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const info = stmt.run(
      name.trim(),
      description || '',
      image_url || '',
      governorate.trim(),
      instagram_url || '',
      facebook_url || '',
      phone || '',
      months,
      startDate,
      endDate
    );

    res.json({ success: true, message: 'تمت إضافة المحل بنجاح!', id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error adding shop:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة المحل' });
  }
});

router.put('/shops/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { name, description, image_url, governorate, instagram_url, facebook_url, phone } = req.body;

    if (!name || !governorate) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المحل والمحافظة.' });
    }

    db.prepare(`
      UPDATE shops
      SET name = ?, description = ?, image_url = ?, governorate = ?,
          instagram_url = ?, facebook_url = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name.trim(), description || '', image_url || '', governorate.trim(), instagram_url || '', facebook_url || '', phone || '', id);

    res.json({ success: true, message: 'تم تحديث بيانات المحل بنجاح!' });
  } catch (err) {
    console.error('Error updating shop:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل المحل' });
  }
});

router.delete('/shops/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM shops WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف المحل بنجاح!' });
  } catch (err) {
    console.error('Error deleting shop:', err);
    res.status(500).json({ success: false, message: 'فشل حذف المحل' });
  }
});

// زر الإخفاء / الإظهار اليدوي للمحل
router.post('/shops/:id/toggle-hide', (req, res) => {
  try {
    const shop = db.prepare('SELECT is_hidden FROM shops WHERE id = ?').get(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'المحل غير موجود' });

    const newHidden = shop.is_hidden ? 0 : 1;
    db.prepare('UPDATE shops SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHidden, req.params.id);

    res.json({
      success: true,
      is_hidden: newHidden,
      message: newHidden ? 'تم إخفاء المحل من الموقع بنجاح' : 'تم إظهار المحل على الموقع بنجاح'
    });
  } catch (err) {
    console.error('Error toggling shop visibility:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير حالة الظهور' });
  }
});

// زر تجديد اشتراك المحل وإعادة إظهاره
router.post('/shops/:id/renew', (req, res) => {
  try {
    const months = parseInt(req.body.months, 10) || 1;
    const shop = db.prepare('SELECT subscription_end, datetime(subscription_end) <= datetime("now") as is_expired FROM shops WHERE id = ?').get(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'المحل غير موجود' });

    // إذا كان منتهياً نحسب من تاريخ اللحظة، وإذا كان ما زال سارياً نمدد من تاريخ الانتهاء
    const baseDate = shop.is_expired ? new Date() : new Date(shop.subscription_end);
    const newEnd = calculateEndDate(baseDate, months);

    db.prepare(`
      UPDATE shops
      SET subscription_end = ?, subscription_months = subscription_months + ?, is_hidden = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newEnd, months, req.params.id);

    res.json({ success: true, message: `تم تجديد اشتراك المحل لمدة ${months} شهر وإظهاره على الموقع بنجاح!` });
  } catch (err) {
    console.error('Error renewing shop:', err);
    res.status(500).json({ success: false, message: 'فشل تجديد الاشتراك' });
  }
});

// -------------------------------------------------------------
// 4. إدارة المشاريع (Projects)
// -------------------------------------------------------------
router.get('/projects', (req, res) => {
  try {
    const query = `
      SELECT *,
        CASE WHEN datetime(subscription_end) <= datetime('now') THEN 1 ELSE 0 END AS is_expired,
        CAST((julianday(subscription_end) - julianday('now')) AS INTEGER) AS days_remaining
      FROM projects
      ORDER BY id DESC
    `;
    const projects = db.prepare(query).all();
    res.json({ success: true, projects });
  } catch (err) {
    console.error('Admin projects error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب المشاريع' });
  }
});

router.post('/projects', (req, res) => {
  try {
    const { name, description, image_url, instagram_url, facebook_url, subscription_months } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المشروع.' });
    }

    const months = parseInt(subscription_months, 10) || 1;
    const now = new Date();
    const startDate = now.toISOString();
    const endDate = calculateEndDate(now, months);

    const stmt = db.prepare(`
      INSERT INTO projects (name, description, image_url, instagram_url, facebook_url, subscription_months, subscription_start, subscription_end, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const info = stmt.run(
      name.trim(),
      description || '',
      image_url || '',
      instagram_url || '',
      facebook_url || '',
      months,
      startDate,
      endDate
    );

    res.json({ success: true, message: 'تمت إضافة المشروع بنجاح!', id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error adding project:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة المشروع' });
  }
});

router.put('/projects/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { name, description, image_url, instagram_url, facebook_url } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المشروع.' });
    }

    db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, image_url = ?, instagram_url = ?, facebook_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name.trim(), description || '', image_url || '', instagram_url || '', facebook_url || '', id);

    res.json({ success: true, message: 'تم تحديث المشروع بنجاح!' });
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل المشروع' });
  }
});

router.delete('/projects/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف المشروع بنجاح!' });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ success: false, message: 'فشل حذف المشروع' });
  }
});

router.post('/projects/:id/toggle-hide', (req, res) => {
  try {
    const proj = db.prepare('SELECT is_hidden FROM projects WHERE id = ?').get(req.params.id);
    if (!proj) return res.status(404).json({ success: false, message: 'المشروع غير موجود' });

    const newHidden = proj.is_hidden ? 0 : 1;
    db.prepare('UPDATE projects SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHidden, req.params.id);

    res.json({
      success: true,
      is_hidden: newHidden,
      message: newHidden ? 'تم إخفاء المشروع من الموقع بنجاح' : 'تم إظهار المشروع على الموقع بنجاح'
    });
  } catch (err) {
    console.error('Error toggling project visibility:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير حالة الظهور' });
  }
});

router.post('/projects/:id/renew', (req, res) => {
  try {
    const months = parseInt(req.body.months, 10) || 1;
    const proj = db.prepare('SELECT subscription_end, datetime(subscription_end) <= datetime("now") as is_expired FROM projects WHERE id = ?').get(req.params.id);
    if (!proj) return res.status(404).json({ success: false, message: 'المشروع غير موجود' });

    const baseDate = proj.is_expired ? new Date() : new Date(proj.subscription_end);
    const newEnd = calculateEndDate(baseDate, months);

    db.prepare(`
      UPDATE projects
      SET subscription_end = ?, subscription_months = subscription_months + ?, is_hidden = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newEnd, months, req.params.id);

    res.json({ success: true, message: `تم تجديد اشتراك المشروع لمدة ${months} شهر وإظهاره على الموقع بنجاح!` });
  } catch (err) {
    console.error('Error renewing project:', err);
    res.status(500).json({ success: false, message: 'فشل تجديد الاشتراك' });
  }
});

// -------------------------------------------------------------
// 5. إدارة خدمات تهمك (Services)
// -------------------------------------------------------------
router.get('/services', (req, res) => {
  try {
    const query = `
      SELECT *,
        CASE WHEN datetime(subscription_end) <= datetime('now') THEN 1 ELSE 0 END AS is_expired,
        CAST((julianday(subscription_end) - julianday('now')) AS INTEGER) AS days_remaining
      FROM services
      ORDER BY id DESC
    `;
    const services = db.prepare(query).all();
    res.json({ success: true, services });
  } catch (err) {
    console.error('Admin services error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب الخدمات' });
  }
});

router.post('/services', (req, res) => {
  try {
    const { service_name, provider_name, description, social_url, instagram_url, facebook_url, phone, subscription_months } = req.body;

    if (!service_name || !provider_name) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم الخدمة واسم مقدم الخدمة.' });
    }

    const months = parseInt(subscription_months, 10) || 1;
    const now = new Date();
    const startDate = now.toISOString();
    const endDate = calculateEndDate(now, months);

    const stmt = db.prepare(`
      INSERT INTO services (service_name, provider_name, description, social_url, instagram_url, facebook_url, phone, subscription_months, subscription_start, subscription_end, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const info = stmt.run(
      service_name.trim(),
      provider_name.trim(),
      description || '',
      social_url || instagram_url || facebook_url || '',
      instagram_url || '',
      facebook_url || '',
      phone || '',
      months,
      startDate,
      endDate
    );

    res.json({ success: true, message: 'تمت إضافة الخدمة بنجاح!', id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error adding service:', err);
    res.status(500).json({ success: false, message: 'فشل إضافة الخدمة' });
  }
});

router.put('/services/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { service_name, provider_name, description, social_url, instagram_url, facebook_url, phone } = req.body;

    if (!service_name || !provider_name) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم الخدمة واسم مقدم الخدمة.' });
    }

    db.prepare(`
      UPDATE services
      SET service_name = ?, provider_name = ?, description = ?, social_url = ?, instagram_url = ?, facebook_url = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      service_name.trim(),
      provider_name.trim(),
      description || '',
      social_url || instagram_url || facebook_url || '',
      instagram_url || '',
      facebook_url || '',
      phone || '',
      id
    );

    res.json({ success: true, message: 'تم تحديث الخدمة بنجاح!' });
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ success: false, message: 'فشل تعديل الخدمة' });
  }
});

router.delete('/services/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف الخدمة بنجاح!' });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ success: false, message: 'فشل حذف الخدمة' });
  }
});

router.post('/services/:id/toggle-hide', (req, res) => {
  try {
    const serv = db.prepare('SELECT is_hidden FROM services WHERE id = ?').get(req.params.id);
    if (!serv) return res.status(404).json({ success: false, message: 'الخدمة غير موجودة' });

    const newHidden = serv.is_hidden ? 0 : 1;
    db.prepare('UPDATE services SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHidden, req.params.id);

    res.json({
      success: true,
      is_hidden: newHidden,
      message: newHidden ? 'تم إخفاء الخدمة من الموقع بنجاح' : 'تم إظهار الخدمة على الموقع بنجاح'
    });
  } catch (err) {
    console.error('Error toggling service visibility:', err);
    res.status(500).json({ success: false, message: 'فشل تغيير حالة الظهور' });
  }
});

router.post('/services/:id/renew', (req, res) => {
  try {
    const months = parseInt(req.body.months, 10) || 1;
    const serv = db.prepare('SELECT subscription_end, datetime(subscription_end) <= datetime("now") as is_expired FROM services WHERE id = ?').get(req.params.id);
    if (!serv) return res.status(404).json({ success: false, message: 'الخدمة غير موجودة' });

    const baseDate = serv.is_expired ? new Date() : new Date(serv.subscription_end);
    const newEnd = calculateEndDate(baseDate, months);

    db.prepare(`
      UPDATE services
      SET subscription_end = ?, subscription_months = subscription_months + ?, is_hidden = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newEnd, months, req.params.id);

    res.json({ success: true, message: `تم تجديد اشتراك الخدمة لمدة ${months} شهر وإظهارها على الموقع بنجاح!` });
  } catch (err) {
    console.error('Error renewing service:', err);
    res.status(500).json({ success: false, message: 'فشل تجديد الاشتراك' });
  }
});

// -------------------------------------------------------------
// 6. إدارة المستخدمين (قاعدة بيانات تدعم 50 ألف حساب + مع البحث والفلترة السريعة)
// -------------------------------------------------------------
router.get('/users', (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT id, name, email, role, created_at, last_login FROM users';
    const params = [];

    if (search && search.trim() !== '') {
      query += ' WHERE name LIKE ? OR email LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const users = db.prepare(query).all(...params);
    const totalCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    res.json({ success: true, users, total: totalCount });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, message: 'خطأ في جلب المستخدمين' });
  }
});

module.exports = router;
