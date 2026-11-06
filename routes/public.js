const express = require('express');
const router = express.Router();
const db = require('../db');

// جلب إعدادات الموقع والتواصل (رقم الواتس ورابط الإنستغرام لزر الاستفسار والاشتراك)
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM site_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, settings });
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ success: false, message: 'فشل جلب إعدادات الموقع' });
  }
});

// 1. جلب المحلات النشطة فقط (غير مخفية واشتراكها ساري المفعول)
router.get('/shops', (req, res) => {
  try {
    const { governorate, search } = req.query;
    let query = `
      SELECT id, name, description, image_url, governorate, instagram_url, facebook_url, phone,
             subscription_months, subscription_start, subscription_end, created_at
      FROM shops
      WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')
    `;
    const params = [];

    if (governorate && governorate !== 'الكل') {
      query += ` AND governorate = ?`;
      params.push(governorate);
    }

    if (search && search.trim() !== '') {
      query += ` AND (name LIKE ? OR description LIKE ? OR governorate LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY id DESC`;

    const shops = db.prepare(query).all(...params);
    res.json({ success: true, shops });
  } catch (err) {
    console.error('Error fetching shops:', err);
    res.status(500).json({ success: false, message: 'فشل جلب المحلات' });
  }
});

// قائمة المحافظات المتوفرة في المحلات
router.get('/governorates', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT governorate
      FROM shops
      WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now') AND governorate IS NOT NULL AND governorate != ''
      ORDER BY governorate ASC
    `).all();
    const governorates = rows.map(r => r.governorate);
    res.json({ success: true, governorates });
  } catch (err) {
    console.error('Error fetching governorates:', err);
    res.status(500).json({ success: false, message: 'فشل جلب المحافظات' });
  }
});

// 2. جلب المشاريع النشطة فقط (غير مخفية واشتراكها ساري)
router.get('/projects', (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, name, description, image_url, instagram_url, facebook_url,
             subscription_months, subscription_start, subscription_end, created_at
      FROM projects
      WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ` AND (name LIKE ? OR description LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ` ORDER BY id DESC`;

    const projects = db.prepare(query).all(...params);
    res.json({ success: true, projects });
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ success: false, message: 'فشل جلب المشاريع' });
  }
});

// 3. جلب خدمات تهمك النشطة فقط
router.get('/services', (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, service_name, provider_name, description, social_url, instagram_url, facebook_url, phone,
             subscription_months, subscription_start, subscription_end, created_at
      FROM services
      WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ` AND (service_name LIKE ? OR provider_name LIKE ? OR description LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY id DESC`;

    const services = db.prepare(query).all(...params);
    res.json({ success: true, services });
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ success: false, message: 'فشل جلب الخدمات' });
  }
});

// إحصائيات عامة سريعة للموقع (المشاريع والمحلات والخدمات)
router.get('/stats', (req, res) => {
  try {
    const activeShops = db.prepare(`SELECT COUNT(*) as count FROM shops WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')`).get().count;
    const activeProjects = db.prepare(`SELECT COUNT(*) as count FROM projects WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')`).get().count;
    const activeServices = db.prepare(`SELECT COUNT(*) as count FROM services WHERE is_hidden = 0 AND datetime(subscription_end) > datetime('now')`).get().count;
    const registeredUsers = db.prepare(`SELECT COUNT(*) as count FROM users`).get().count;

    res.json({
      success: true,
      stats: {
        activeShops,
        activeProjects,
        activeServices,
        registeredUsers
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ success: false, message: 'فشل جلب الإحصائيات' });
  }
});

module.exports = router;
