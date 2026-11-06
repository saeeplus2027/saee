// ==============================================================
// سعي بلس | SA'E PLUS - منطق لوحة تحكم الإدارة (Admin Panel)
// الإضافات، التعديلات، الحذف، تجديد الاشتراكات، الإخفاء والإظهار
// ==============================================================

const AdminApp = {
  currentTab: 'shops',
  stats: {},
  shops: [],
  projects: [],
  services: [],
  users: [],

  async init() {
    if (!Auth.isAdmin()) {
      showToast('غير مصرح لك بالدخول إلى لوحة التحكم', 'error');
      window.location.hash = '#home';
      return;
    }

    this.bindEvents();
    this.injectLogoManager();
    this.switchTab('stats');
    await this.loadDashboardStats();
  },

  injectLogoManager() {
    const pane = document.getElementById('admin-pane-settings');
    if (!pane || document.getElementById('admin-logo-manager')) return;
    const box = document.createElement('section');
    box.id = 'admin-logo-manager';
    box.className = 'admin-section-card';
    box.style.marginTop = '22px';
    box.innerHTML = `
      <div class="admin-section-header">
        <h3><i class="fa-solid fa-image"></i> شعار الموقع</h3>
        <span>تغيير الشعار الظاهر للزبائن</span>
      </div>
      <div style="padding:24px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <img id="admin-current-logo" src="/assets/saee-logo.png" alt="الشعار الحالي"
          style="width:120px;height:120px;object-fit:contain;border:1px solid #ddd;border-radius:14px;background:#fff;padding:8px">
        <div style="flex:1;min-width:240px">
          <label for="admin-logo-file" style="display:block;font-weight:700;margin-bottom:8px">اختر شعاراً جديداً</label>
          <input id="admin-logo-file" type="file" accept="image/png,image/jpeg,image/webp"
            style="display:block;margin-bottom:12px">
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" id="admin-logo-save" class="btn-add-new"><i class="fa-solid fa-upload"></i> رفع واعتماد الشعار</button>
            <button type="button" id="admin-logo-remove" class="btn-action-sm btn-action-delete"><i class="fa-solid fa-trash"></i> إزالة الشعار المخصص</button>
          </div>
          <small style="display:block;color:#777;margin-top:10px">الصيغ المسموحة: PNG وJPG وWEBP — الحد الأقصى 5MB.</small>
        </div>
      </div>`;
    pane.prepend(box);

    const preview = document.getElementById('admin-current-logo');
    const fileInput = document.getElementById('admin-logo-file');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file && preview) preview.src = URL.createObjectURL(file);
    });
    document.getElementById('admin-logo-save')?.addEventListener('click', () => this.saveSiteLogo());
    document.getElementById('admin-logo-remove')?.addEventListener('click', () => this.removeSiteLogo());
    this.loadCurrentLogo();
  },

  async loadCurrentLogo() {
    try {
      const response = await fetch('/api/public/settings');
      const data = await response.json();
      const img = document.getElementById('admin-current-logo');
      if (img && data.success) img.src = data.settings.logo_url || '/assets/saee-logo.png';
    } catch (error) {
      console.error('Logo load error:', error);
    }
  },

  async saveSiteLogo() {
    const input = document.getElementById('admin-logo-file');
    const file = input?.files?.[0];
    if (!file) return showToast('اختر صورة الشعار أولاً.', 'error');
    const form = new FormData();
    form.append('image', file);
    try {
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
        body: form
      });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok || !uploaded.success) {
        return showToast(uploaded.message || 'فشل رفع الشعار.', 'error');
      }
      const saveResponse = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ logo_url: uploaded.url })
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.success) {
        return showToast(saved.message || 'تم رفع الصورة لكن تعذر اعتمادها.', 'error');
      }
      const img = document.getElementById('admin-current-logo');
      if (img) img.src = uploaded.url;
      if (window.App) {
        window.App.settings.logo_url = uploaded.url;
        window.App.updateSiteLogo();
      }
      showToast('تم تحديث شعار الموقع بنجاح.', 'success');
      input.value = '';
    } catch (error) {
      console.error('Save logo error:', error);
      showToast('حدث خطأ أثناء تحديث الشعار.', 'error');
    }
  },

  async removeSiteLogo() {
    if (!confirm('هل تريد إزالة الشعار المخصص والعودة إلى الشعار الافتراضي؟')) return;
    try {
      const response = await fetch('/api/admin/logo', {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await response.json();
      if (!response.ok || !data.success) return showToast(data.message || 'تعذر إزالة الشعار.', 'error');
      const img = document.getElementById('admin-current-logo');
      if (img) img.src = '/assets/saee-logo.png';
      if (window.App) {
        window.App.settings.logo_url = '';
        window.App.updateSiteLogo();
      }
      showToast('تمت إزالة الشعار المخصص.', 'success');
    } catch (error) {
      console.error('Remove logo error:', error);
      showToast('حدث خطأ أثناء إزالة الشعار.', 'error');
    }
  },

  bindEvents() {
    // تبديل تبويبات لوحة التحكم
    document.querySelectorAll('.admin-menu-item[data-tab]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // تسجيل خروج الأدمن
    document.getElementById('btn-admin-logout-sidebar')?.addEventListener('click', () => {
      Auth.logout();
    });

    // حفظ إعدادات التواصل وزر الاستفسار
    document.getElementById('form-admin-settings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSettings();
    });

    // رفع صورة المحل
    document.getElementById('shop-image-file')?.addEventListener('change', (e) => {
      this.handleImageUpload(e.target.files[0], 'shop-image-url', 'shop-image-preview');
    });

    // رفع صورة المشروع
    document.getElementById('project-image-file')?.addEventListener('change', (e) => {
      this.handleImageUpload(e.target.files[0], 'project-image-url', 'project-image-preview');
    });
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.admin-menu-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.admin-menu-item[data-tab="${tabName}"]`)?.classList.add('active');

    document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
    const activePane = document.getElementById(`admin-pane-${tabName}`);
    if (activePane) activePane.style.display = 'block';

    if (tabName === 'stats') this.loadDashboardStats();
    if (tabName === 'shops') this.loadShops();
    if (tabName === 'projects') this.loadProjects();
    if (tabName === 'services') this.loadServices();
    if (tabName === 'settings') this.loadSettingsForm();
    if (tabName === 'users') this.loadUsers();
  },

  // مساعدة ترويسة التوكن المحمي
  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Auth.getToken()}`
    };
  },

  // -------------------------------------------------------------
  // 1. الإحصائيات العامة
  // -------------------------------------------------------------
  async loadDashboardStats() {
    try {
      const res = await fetch('/api/admin/dashboard-stats', {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        document.getElementById('admin-stat-shops-active').textContent = s.shops.active;
        document.getElementById('admin-stat-shops-expired').textContent = s.shops.expired;
        document.getElementById('admin-stat-projects-active').textContent = s.projects.active;
        document.getElementById('admin-stat-projects-expired').textContent = s.projects.expired;
        document.getElementById('admin-stat-services-active').textContent = s.services.active;
        document.getElementById('admin-stat-services-expired').textContent = s.services.expired;
        document.getElementById('admin-stat-users-total').textContent = s.totalUsers;
      }
    } catch (e) {
      console.error('Stats error:', e);
    }
  },

  // -------------------------------------------------------------
  // رفع الصور المباشر
  // -------------------------------------------------------------
  async handleImageUpload(file, inputId, previewId) {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    try {
      showToast('جاري رفع الصورة...', 'info');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Auth.getToken()}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById(inputId).value = data.url;
        const preview = document.getElementById(previewId);
        if (preview) {
          preview.src = data.url;
          preview.style.display = 'block';
        }
        showToast('تم رفع الصورة بنجاح!', 'success');
      } else {
        showToast(data.message || 'فشل رفع الصورة', 'error');
      }
    } catch (e) {
      showToast('خطأ أثناء رفع الصورة', 'error');
    }
  },

  // -------------------------------------------------------------
  // 2. إدارة المحلات (Shops CRUD)
  // -------------------------------------------------------------
  async loadShops() {
    try {
      const res = await fetch('/api/admin/shops', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        this.shops = data.shops;
        this.renderShopsTable(this.shops);
      }
    } catch (e) {
      console.error('Error loading admin shops:', e);
    }
  },

  renderShopsTable(list) {
    const tbody = document.getElementById('admin-shops-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;">لا توجد محلات مسجلة بعد. انقر على "إضافة محل جديد".</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(shop => {
      let statusHtml = '';
      if (shop.is_expired) {
        statusHtml = `<span class="status-badge expired"><i class="fa-solid fa-clock"></i> منتهي (يختفي من الموقع)</span>`;
      } else if (shop.is_hidden) {
        statusHtml = `<span class="status-badge hidden"><i class="fa-solid fa-eye-slash"></i> مخفي يدوياً</span>`;
      } else {
        statusHtml = `<span class="status-badge active"><i class="fa-solid fa-check"></i> نشط (${shop.days_remaining} يوم متبقٍ)</span>`;
      }

      return `
        <tr>
          <td><img src="${shop.image_url || '/assets/saee-logo.png'}" class="item-thumb-sm" onerror="this.src='/assets/saee-logo.png'"></td>
          <td><strong>${shop.name}</strong><br><small style="color:var(--text-muted);">${(shop.description || '').substring(0, 45)}...</small></td>
          <td><i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> ${shop.governorate}</td>
          <td>${shop.subscription_months} شهر<br><small style="color:var(--text-light);">${new Date(shop.subscription_end).toLocaleDateString('ar-JO')}</small></td>
          <td>${statusHtml}</td>
          <td>
            <div class="table-actions">
              <button class="btn-action-sm btn-action-toggle" onclick="AdminApp.toggleHideShop(${shop.id})" title="${shop.is_hidden ? 'إظهار في الموقع' : 'إخفاء من الموقع'}">
                <i class="fa-solid ${shop.is_hidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${shop.is_hidden ? 'إظهار' : 'إخفاء'}
              </button>
              <button class="btn-action-sm btn-action-renew" onclick="AdminApp.openRenewModal('shop', ${shop.id}, '${shop.name}')" title="تجديد الاشتراك">
                <i class="fa-solid fa-rotate-right"></i> تجديد
              </button>
              <button class="btn-action-sm btn-action-edit" onclick="AdminApp.openEditShopModal(${shop.id})" title="تعديل">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn-action-sm btn-action-delete" onclick="AdminApp.deleteShop(${shop.id})" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddShopModal() {
    document.getElementById('shop-modal-title').textContent = 'إضافة محل جديد';
    document.getElementById('shop-id').value = '';
    document.getElementById('shop-name').value = '';
    document.getElementById('shop-desc').value = '';
    document.getElementById('shop-gov').value = '';
    document.getElementById('shop-image-url').value = '';
    document.getElementById('shop-insta').value = '';
    document.getElementById('shop-face').value = '';
    document.getElementById('shop-phone').value = '';
    document.getElementById('shop-months-group').style.display = 'block';
    document.getElementById('shop-months').value = '1';
    document.getElementById('shop-image-preview').style.display = 'none';

    document.getElementById('admin-shop-modal').classList.add('active');
  },

  openEditShopModal(id) {
    const shop = this.shops.find(s => s.id === id);
    if (!shop) return;

    document.getElementById('shop-modal-title').textContent = 'تعديل بيانات المحل';
    document.getElementById('shop-id').value = shop.id;
    document.getElementById('shop-name').value = shop.name;
    document.getElementById('shop-desc').value = shop.description || '';
    document.getElementById('shop-gov').value = shop.governorate;
    document.getElementById('shop-image-url').value = shop.image_url || '';
    document.getElementById('shop-insta').value = shop.instagram_url || '';
    document.getElementById('shop-face').value = shop.facebook_url || '';
    document.getElementById('shop-phone').value = shop.phone || '';
    document.getElementById('shop-months-group').style.display = 'none'; // مدة الاشتراك تعدل عبر التجديد

    const preview = document.getElementById('shop-image-preview');
    if (shop.image_url) {
      preview.src = shop.image_url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    document.getElementById('admin-shop-modal').classList.add('active');
  },

  async saveShop(e) {
    e.preventDefault();
    const id = document.getElementById('shop-id').value;
    const isEdit = !!id;

    const payload = {
      name: document.getElementById('shop-name').value.trim(),
      description: document.getElementById('shop-desc').value.trim(),
      governorate: document.getElementById('shop-gov').value.trim(),
      image_url: document.getElementById('shop-image-url').value.trim(),
      instagram_url: document.getElementById('shop-insta').value.trim(),
      facebook_url: document.getElementById('shop-face').value.trim(),
      phone: document.getElementById('shop-phone').value.trim(),
      subscription_months: document.getElementById('shop-months').value
    };

    const url = isEdit ? `/api/admin/shops/${id}` : '/api/admin/shops';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('admin-shop-modal').classList.remove('active');
        await this.loadShops();
        App.loadShops(); // تحديث الواجهة الرئيسية
      } else {
        showToast(data.message || 'فشلت العملية', 'error');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  },

  async toggleHideShop(id) {
    try {
      const res = await fetch(`/api/admin/shops/${id}/toggle-hide`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await this.loadShops();
        App.loadShops();
      }
    } catch (e) {
      showToast('فشل تغيير حالة الظهور', 'error');
    }
  },

  async deleteShop(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المحل نهائياً؟')) return;
    try {
      const res = await fetch(`/api/admin/shops/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await this.loadShops();
        App.loadShops();
      }
    } catch (e) {
      showToast('فشل حذف المحل', 'error');
    }
  },

  // -------------------------------------------------------------
  // 3. إدارة المشاريع (Projects CRUD)
  // -------------------------------------------------------------
  async loadProjects() {
    try {
      const res = await fetch('/api/admin/projects', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        this.projects = data.projects;
        this.renderProjectsTable(this.projects);
      }
    } catch (e) {
      console.error('Error loading projects:', e);
    }
  },

  renderProjectsTable(list) {
    const tbody = document.getElementById('admin-projects-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;">لا توجد مشاريع مسجلة بعد. انقر على "إضافة مشروع جديد".</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(proj => {
      let statusHtml = '';
      if (proj.is_expired) {
        statusHtml = `<span class="status-badge expired"><i class="fa-solid fa-clock"></i> منتهي (يختفي من الموقع)</span>`;
      } else if (proj.is_hidden) {
        statusHtml = `<span class="status-badge hidden"><i class="fa-solid fa-eye-slash"></i> مخفي يدوياً</span>`;
      } else {
        statusHtml = `<span class="status-badge active"><i class="fa-solid fa-check"></i> نشط (${proj.days_remaining} يوم متبقٍ)</span>`;
      }

      return `
        <tr>
          <td><img src="${proj.image_url || '/assets/saee-logo.png'}" class="item-thumb-sm" onerror="this.src='/assets/saee-logo.png'"></td>
          <td><strong>${proj.name}</strong><br><small style="color:var(--text-muted);">${(proj.description || '').substring(0, 45)}...</small></td>
          <td>${proj.subscription_months} شهر<br><small style="color:var(--text-light);">${new Date(proj.subscription_end).toLocaleDateString('ar-JO')}</small></td>
          <td>${statusHtml}</td>
          <td>
            <div class="table-actions">
              <button class="btn-action-sm btn-action-toggle" onclick="AdminApp.toggleHideProject(${proj.id})" title="${proj.is_hidden ? 'إظهار في الموقع' : 'إخفاء من الموقع'}">
                <i class="fa-solid ${proj.is_hidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${proj.is_hidden ? 'إظهار' : 'إخفاء'}
              </button>
              <button class="btn-action-sm btn-action-renew" onclick="AdminApp.openRenewModal('project', ${proj.id}, '${proj.name}')" title="تجديد الاشتراك">
                <i class="fa-solid fa-rotate-right"></i> تجديد
              </button>
              <button class="btn-action-sm btn-action-edit" onclick="AdminApp.openEditProjectModal(${proj.id})" title="تعديل">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn-action-sm btn-action-delete" onclick="AdminApp.deleteProject(${proj.id})" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddProjectModal() {
    document.getElementById('project-modal-title').textContent = 'إضافة مشروع جديد';
    document.getElementById('project-id').value = '';
    document.getElementById('project-name').value = '';
    document.getElementById('project-desc').value = '';
    document.getElementById('project-image-url').value = '';
    document.getElementById('project-insta').value = '';
    document.getElementById('project-face').value = '';
    document.getElementById('project-months-group').style.display = 'block';
    document.getElementById('project-months').value = '1';
    document.getElementById('project-image-preview').style.display = 'none';

    document.getElementById('admin-project-modal').classList.add('active');
  },

  openEditProjectModal(id) {
    const proj = this.projects.find(p => p.id === id);
    if (!proj) return;

    document.getElementById('project-modal-title').textContent = 'تعديل بيانات المشروع';
    document.getElementById('project-id').value = proj.id;
    document.getElementById('project-name').value = proj.name;
    document.getElementById('project-desc').value = proj.description || '';
    document.getElementById('project-image-url').value = proj.image_url || '';
    document.getElementById('project-insta').value = proj.instagram_url || '';
    document.getElementById('project-face').value = proj.facebook_url || '';
    document.getElementById('project-months-group').style.display = 'none';

    const preview = document.getElementById('project-image-preview');
    if (proj.image_url) {
      preview.src = proj.image_url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    document.getElementById('admin-project-modal').classList.add('active');
  },

  async saveProject(e) {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const isEdit = !!id;

    const payload = {
      name: document.getElementById('project-name').value.trim(),
      description: document.getElementById('project-desc').value.trim(),
      image_url: document.getElementById('project-image-url').value.trim(),
      instagram_url: document.getElementById('project-insta').value.trim(),
      facebook_url: document.getElementById('project-face').value.trim(),
      subscription_months: document.getElementById('project-months').value
    };

    const url = isEdit ? `/api/admin/projects/${id}` : '/api/admin/projects';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('admin-project-modal').classList.remove('active');
        await this.loadProjects();
        App.loadProjects();
      } else {
        showToast(data.message || 'فشلت العملية', 'error');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  },

  async toggleHideProject(id) {
    try {
      const res = await fetch(`/api/admin/projects/${id}/toggle-hide`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await this.loadProjects();
        App.loadProjects();
      }
    } catch (e) {
      showToast('فشل تغيير حالة الظهور', 'error');
    }
  },

  async deleteProject(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المشروع نهائياً؟')) return;
    try {
      const res = await fetch(`/api/admin/projects/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await this.loadProjects();
        App.loadProjects();
      }
    } catch (e) {
      showToast('فشل حذف المشروع', 'error');
    }
  },

  // -------------------------------------------------------------
  // 4. إدارة خدمات تهمك (Services CRUD)
  // -------------------------------------------------------------
  async loadServices() {
    try {
      const res = await fetch('/api/admin/services', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        this.services = data.services;
        this.renderServicesTable(this.services);
      }
    } catch (e) {
      console.error('Error loading services:', e);
    }
  },

  renderServicesTable(list) {
    const tbody = document.getElementById('admin-services-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;">لا توجد خدمات مسجلة بعد. انقر على "إضافة خدمة جديدة".</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(serv => {
      let statusHtml = '';
      if (serv.is_expired) {
        statusHtml = `<span class="status-badge expired"><i class="fa-solid fa-clock"></i> منتهي (يختفي من الموقع)</span>`;
      } else if (serv.is_hidden) {
        statusHtml = `<span class="status-badge hidden"><i class="fa-solid fa-eye-slash"></i> مخفي يدوياً</span>`;
      } else {
        statusHtml = `<span class="status-badge active"><i class="fa-solid fa-check"></i> نشط (${serv.days_remaining} يوم متبقٍ)</span>`;
      }

      return `
        <tr>
          <td><strong>${serv.service_name}</strong><br><small style="color:var(--text-muted);">${(serv.description || '').substring(0, 45)}...</small></td>
          <td><i class="fa-solid fa-user-tie" style="color:var(--gold-dark);"></i> ${serv.provider_name}</td>
          <td>${serv.subscription_months} شهر<br><small style="color:var(--text-light);">${new Date(serv.subscription_end).toLocaleDateString('ar-JO')}</small></td>
          <td>${statusHtml}</td>
          <td>
            <div class="table-actions">
              <button class="btn-action-sm btn-action-toggle" onclick="AdminApp.toggleHideService(${serv.id})" title="${serv.is_hidden ? 'إظهار في الموقع' : 'إخفاء من الموقع'}">
                <i class="fa-solid ${serv.is_hidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${serv.is_hidden ? 'إظهار' : 'إخفاء'}
              </button>
              <button class="btn-action-sm btn-action-renew" onclick="AdminApp.openRenewModal('service', ${serv.id}, '${serv.service_name}')" title="تجديد الاشتراك">
                <i class="fa-solid fa-rotate-right"></i> تجديد
              </button>
              <button class="btn-action-sm btn-action-edit" onclick="AdminApp.openEditServiceModal(${serv.id})" title="تعديل">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn-action-sm btn-action-delete" onclick="AdminApp.deleteService(${serv.id})" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddServiceModal() {
    document.getElementById('service-modal-title').textContent = 'إضافة خدمة جديدة';
    document.getElementById('service-id').value = '';
    document.getElementById('service-name').value = '';
    document.getElementById('service-provider').value = '';
    document.getElementById('service-desc').value = '';
    document.getElementById('service-insta').value = '';
    document.getElementById('service-face').value = '';
    document.getElementById('service-phone').value = '';
    document.getElementById('service-months-group').style.display = 'block';
    document.getElementById('service-months').value = '1';

    document.getElementById('admin-service-modal').classList.add('active');
  },

  openEditServiceModal(id) {
    const serv = this.services.find(s => s.id === id);
    if (!serv) return;

    document.getElementById('service-modal-title').textContent = 'تعديل بيانات الخدمة';
    document.getElementById('service-id').value = serv.id;
    document.getElementById('service-name').value = serv.service_name;
    document.getElementById('service-provider').value = serv.provider_name;
    document.getElementById('service-desc').value = serv.description || '';
    document.getElementById('service-insta').value = serv.instagram_url || '';
    document.getElementById('service-face').value = serv.facebook_url || '';
    document.getElementById('service-phone').value = serv.phone || '';
    document.getElementById('service-months-group').style.display = 'none';

    document.getElementById('admin-service-modal').classList.add('active');
  },

  async saveService(e) {
    e.preventDefault();
    const id = document.getElementById('service-id').value;
    const isEdit = !!id;

    const payload = {
      service_name: document.getElementById('service-name').value.trim(),
      provider_name: document.getElementById('service-provider').value.trim(),
      description: document.getElementById('service-desc').value.trim(),
      instagram_url: document.getElementById('service-insta').value.trim(),
      facebook_url: document.getElementById('service-face').value.trim(),
      phone: document.getElementById('service-phone').value.trim(),
      subscription_months: document.getElementById('service-months').value
    };

    const url = isEdit ? `/api/admin/services/${id}` : '/api/admin/services';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('admin-service-modal').classList.remove('active');
        await this.loadServices();
        App.loadServices();
      } else {
        showToast(data.message || 'فشلت العملية', 'error');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  },

  async toggleHideService(id) {
    try {
      const res = await fetch(`/api/admin/services/${id}/toggle-hide`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await this.loadServices();
        App.loadServices();
      }
    } catch (e) {
      showToast('فشل تغيير حالة الظهور', 'error');
    }
  },

  async deleteService(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الخدمة نهائياً؟')) return;
    try {
      const res = await fetch(`/api/admin/services/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await this.loadServices();
        App.loadServices();
      }
    } catch (e) {
      showToast('فشل حذف الخدمة', 'error');
    }
  },

  // -------------------------------------------------------------
  // نافذة تجديد الاشتراك الموحدة (Renewal Modal)
  // -------------------------------------------------------------
  openRenewModal(type, id, name) {
    document.getElementById('renew-item-type').value = type;
    document.getElementById('renew-item-id').value = id;
    document.getElementById('renew-item-name').textContent = name;
    document.getElementById('renew-months').value = '1';
    document.getElementById('admin-renew-modal').classList.add('active');
  },

  async submitRenew(e) {
    e.preventDefault();
    const type = document.getElementById('renew-item-type').value;
    const id = document.getElementById('renew-item-id').value;
    const months = document.getElementById('renew-months').value;

    let endpoint = '';
    if (type === 'shop') endpoint = `/api/admin/shops/${id}/renew`;
    if (type === 'project') endpoint = `/api/admin/projects/${id}/renew`;
    if (type === 'service') endpoint = `/api/admin/services/${id}/renew`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ months })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('admin-renew-modal').classList.remove('active');
        if (type === 'shop') { await this.loadShops(); App.loadShops(); }
        if (type === 'project') { await this.loadProjects(); App.loadProjects(); }
        if (type === 'service') { await this.loadServices(); App.loadServices(); }
      } else {
        showToast(data.message || 'فشل التجديد', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  },

  // -------------------------------------------------------------
  // 5. إعدادات روابط التواصل وزر الاستفسار
  // -------------------------------------------------------------
  async loadSettingsForm() {
    try {
      const res = await fetch('/api/public/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        document.getElementById('setting-whatsapp').value = data.settings.whatsapp_number || '';
        document.getElementById('setting-instagram').value = data.settings.instagram_url || '';
        document.getElementById('setting-inquiry-msg').value = data.settings.inquiry_whatsapp_text || '';
      }
    } catch (e) {
      console.error('Settings load error:', e);
    }
  },

  async saveSettings() {
    const payload = {
      whatsapp_number: document.getElementById('setting-whatsapp').value.trim(),
      instagram_url: document.getElementById('setting-instagram').value.trim(),
      inquiry_whatsapp_text: document.getElementById('setting-inquiry-msg').value.trim()
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await App.loadSettings();
      } else {
        showToast(data.message || 'فشل حفظ الإعدادات', 'error');
      }
    } catch (e) {
      showToast('خطأ أثناء حفظ الإعدادات', 'error');
    }
  },

  // -------------------------------------------------------------
  // 6. إدارة المستخدمين (50,000+ حساب)
  // -------------------------------------------------------------
  async loadUsers() {
    const searchTerm = (document.getElementById('admin-users-search')?.value || '').trim();
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchTerm)}&limit=100`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        this.users = data.users;
        document.getElementById('admin-users-total-badge').textContent = `إجمالي الحسابات: ${data.total}`;
        this.renderUsersTable(this.users);
      }
    } catch (e) {
      console.error('Users load error:', e);
    }
  },

  renderUsersTable(list) {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;">لا يوجد مستخدمين مطابقين للبحث.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(u => `
      <tr>
        <td>#${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td><code>${u.email}</code></td>
        <td>
          <span class="status-badge ${u.role === 'admin' ? 'hidden' : 'active'}">
            ${u.role === 'admin' ? '⭐ مدير النظام' : 'مستخدم'}
          </span>
        </td>
        <td><small style="color:var(--text-light);">${new Date(u.created_at).toLocaleString('ar-JO')}</small></td>
      </tr>
    `).join('');
  }
};

window.AdminApp = AdminApp;
