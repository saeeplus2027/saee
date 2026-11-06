// ==============================================================
// سعي بلس | SA'E PLUS - تطبيق الواجهة الأمامية والتنقل والعرض
// ==============================================================

const App = {
  currentView: 'home',
  settings: {},
  shops: [],
  projects: [],
  services: [],
  selectedGovernorate: 'الكل',

  async init() {
    this.bindEvents();
    await this.loadSettings();
    await this.loadStats();
    await this.loadGovernorates();
    await this.loadShops();
    await this.loadProjects();
    await this.loadServices();
    this.handleRoute();
  },

  bindEvents() {
    // تبديل المسارات عبر الـ Hash
    window.addEventListener('hashchange', () => this.handleRoute());

    // أزرار التنقل الرئيسية
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.getAttribute('data-view');
        window.location.hash = '#' + view;
      });
    });

    // أزرار الاستفسار والاشتراك (في الهيدر والزر العائم)
    document.querySelectorAll('#btn-hero-inquiry, .floating-inquiry-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openInquiryModal();
      });
    });

    // حقول البحث اللحظي
    const shopSearch = document.getElementById('shop-search-input');
    if (shopSearch) {
      shopSearch.addEventListener('input', () => this.filterShops());
    }

    const projSearch = document.getElementById('project-search-input');
    if (projSearch) {
      projSearch.addEventListener('input', () => this.filterProjects());
    }

    const servSearch = document.getElementById('service-search-input');
    if (servSearch) {
      servSearch.addEventListener('input', () => this.filterServices());
    }
  },

  // -------------------------------------------------------------
  // جلب إعدادات التواصل وتفعيل الروابط
  // -------------------------------------------------------------
  async loadSettings() {
    try {
      const res = await fetch('/api/public/settings');
      const data = await res.json();
      if (data.success) {
        this.settings = data.settings;
        this.updateInquiryLinks();
        this.updateSiteLogo();
      }
    } catch (e) {
      console.error('Settings load error:', e);
    }
  },

  updateSiteLogo() {
    const logoUrl = this.settings.logo_url || '/assets/saee-logo.png';
    const selectors = [
      '#site-logo', '.site-logo', '.header-logo', '.logo-img',
      '.admin-logo-img', 'img[alt*="شعار"]', 'img[alt*="سعي"]'
    ];
    const found = new Set();
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(img => {
        if (img.tagName === 'IMG' && !found.has(img)) {
          img.src = logoUrl;
          found.add(img);
        }
      });
    });
  },

  updateInquiryLinks() {
    const waNum = (this.settings.whatsapp_number || '962791234567').replace(/[^0-9]/g, '');
    const waText = encodeURIComponent(this.settings.inquiry_whatsapp_text || 'مرحباً سعي بلس، أرغب بالاستفسار والاشتراك في المنصة');
    const instaUrl = this.settings.instagram_url || 'https://instagram.com/saee_plus';

    const waLink = document.getElementById('inquiry-wa-link');
    const instaLink = document.getElementById('inquiry-insta-link');

    if (waLink) {
      waLink.href = `https://wa.me/${waNum}?text=${waText}`;
      waLink.target = '_blank';
    }
    if (instaLink) {
      instaLink.href = instaUrl;
      instaLink.target = '_blank';
    }
  },

  openInquiryModal() {
    const modal = document.getElementById('inquiry-modal');
    if (modal) {
      this.updateInquiryLinks();
      modal.classList.add('active');
    }
  },

  closeInquiryModal() {
    const modal = document.getElementById('inquiry-modal');
    if (modal) modal.classList.remove('active');
  },

  // -------------------------------------------------------------
  // جلب الإحصائيات العامة
  // -------------------------------------------------------------
  async loadStats() {
    try {
      const res = await fetch('/api/public/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        document.getElementById('stat-shops-count').textContent = s.activeShops || '0';
        document.getElementById('stat-projects-count').textContent = s.activeProjects || '0';
        document.getElementById('stat-services-count').textContent = s.activeServices || '0';
        document.getElementById('stat-users-count').textContent = s.registeredUsers || '0';
      }
    } catch (e) {
      console.error('Stats load error:', e);
    }
  },

  // -------------------------------------------------------------
  // جلب المحافظات وبناء شرائح الفلترة
  // -------------------------------------------------------------
  async loadGovernorates() {
    try {
      const res = await fetch('/api/public/governorates');
      const data = await res.json();
      const container = document.getElementById('governorates-chips');
      if (!container) return;

      container.innerHTML = `<button class="chip-btn active" data-gov="الكل">كل المحافظات</button>`;

      if (data.success && data.governorates) {
        data.governorates.forEach(gov => {
          const btn = document.createElement('button');
          btn.className = 'chip-btn';
          btn.setAttribute('data-gov', gov);
          btn.textContent = gov;
          btn.onclick = () => {
            container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.selectedGovernorate = gov;
            this.filterShops();
          };
          container.appendChild(btn);
        });

        // زر "الكل"
        const allBtn = container.querySelector('[data-gov="الكل"]');
        allBtn.onclick = () => {
          container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
          allBtn.classList.add('active');
          this.selectedGovernorate = 'الكل';
          this.filterShops();
        };
      }
    } catch (e) {
      console.error('Gov load error:', e);
    }
  },

  // -------------------------------------------------------------
  // جلب وعرض المحلات (Shops)
  // -------------------------------------------------------------
  async loadShops() {
    try {
      const res = await fetch('/api/public/shops');
      const data = await res.json();
      if (data.success) {
        this.shops = data.shops;
        this.renderShops(this.shops);
        this.renderFeaturedShops(this.shops.slice(0, 3));
      }
    } catch (e) {
      console.error('Shops load error:', e);
    }
  },

  filterShops() {
    const term = (document.getElementById('shop-search-input')?.value || '').trim().toLowerCase();
    const filtered = this.shops.filter(shop => {
      const matchGov = this.selectedGovernorate === 'الكل' || shop.governorate === this.selectedGovernorate;
      const matchText = !term ||
        (shop.name && shop.name.toLowerCase().includes(term)) ||
        (shop.description && shop.description.toLowerCase().includes(term)) ||
        (shop.governorate && shop.governorate.toLowerCase().includes(term));
      return matchGov && matchText;
    });
    this.renderShops(filtered);
  },

  renderShops(list) {
    const container = document.getElementById('shops-grid');
    if (!container) return;

    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fa-solid fa-store-slash"></i></div>
          <h3>لا توجد محلات متوفرة حالياً</h3>
          <p>جرّب اختيار محافظة أخرى أو ابحث بكلمات مختلفة.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(shop => `
      <div class="item-card" data-id="${shop.id}">
        <div class="item-card-image-wrap">
          <img class="item-card-image" src="${shop.image_url || '/assets/saee-logo.png'}" alt="${shop.name}" onerror="this.src='/assets/saee-logo.png'">
          <span class="badge-governorate"><i class="fa-solid fa-location-dot"></i> ${shop.governorate}</span>
        </div>
        <div class="item-card-body">
          <h3 class="item-card-title">${shop.name}</h3>
          <p class="item-card-desc">${shop.description || 'لا يوجد وصف متوفر.'}</p>
          <div class="item-card-footer">
            <div class="social-links-wrap">
              ${shop.instagram_url ? `<a href="${shop.instagram_url}" target="_blank" class="social-btn instagram" title="إنستغرام"><i class="fa-brands fa-instagram"></i></a>` : ''}
              ${shop.facebook_url ? `<a href="${shop.facebook_url}" target="_blank" class="social-btn facebook" title="فيسبوك"><i class="fa-brands fa-facebook-f"></i></a>` : ''}
              ${shop.phone ? `<a href="https://wa.me/${shop.phone.replace(/[^0-9]/g, '')}" target="_blank" class="social-btn phone" title="واتساب"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
            </div>
            <button class="btn-card-details" onclick="App.showDetails('shop', ${shop.id})">عرض التفاصيل</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderFeaturedShops(list) {
    const container = document.getElementById('featured-shops-grid');
    if (!container) return;
    if (!list || list.length === 0) {
      container.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);">سيتم إضافة المحلات المميزة قريباً</p>`;
      return;
    }
    container.innerHTML = list.map(shop => `
      <div class="item-card" data-id="${shop.id}">
        <div class="item-card-image-wrap">
          <img class="item-card-image" src="${shop.image_url || '/assets/saee-logo.png'}" alt="${shop.name}" onerror="this.src='/assets/saee-logo.png'">
          <span class="badge-governorate"><i class="fa-solid fa-location-dot"></i> ${shop.governorate}</span>
          <span class="badge-featured"><i class="fa-solid fa-star"></i> مميز</span>
        </div>
        <div class="item-card-body">
          <h3 class="item-card-title">${shop.name}</h3>
          <p class="item-card-desc">${shop.description || 'لا يوجد وصف متوفر.'}</p>
          <div class="item-card-footer">
            <div class="social-links-wrap">
              ${shop.instagram_url ? `<a href="${shop.instagram_url}" target="_blank" class="social-btn instagram"><i class="fa-brands fa-instagram"></i></a>` : ''}
              ${shop.facebook_url ? `<a href="${shop.facebook_url}" target="_blank" class="social-btn facebook"><i class="fa-brands fa-facebook-f"></i></a>` : ''}
            </div>
            <button class="btn-card-details" onclick="App.showDetails('shop', ${shop.id})">التفاصيل</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  // -------------------------------------------------------------
  // جلب وعرض المشاريع (Projects)
  // -------------------------------------------------------------
  async loadProjects() {
    try {
      const res = await fetch('/api/public/projects');
      const data = await res.json();
      if (data.success) {
        this.projects = data.projects;
        this.renderProjects(this.projects);
        this.renderFeaturedProjects(this.projects.slice(0, 3));
      }
    } catch (e) {
      console.error('Projects load error:', e);
    }
  },

  filterProjects() {
    const term = (document.getElementById('project-search-input')?.value || '').trim().toLowerCase();
    const filtered = this.projects.filter(p => {
      return !term ||
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.description && p.description.toLowerCase().includes(term));
    });
    this.renderProjects(filtered);
  },

  renderProjects(list) {
    const container = document.getElementById('projects-grid');
    if (!container) return;

    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fa-solid fa-diagram-project"></i></div>
          <h3>لا توجد مشاريع متوفرة حالياً</h3>
          <p>يمكنك استعراض الأقسام الأخرى أو التواصل للاشتراك في سعي بلس.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(proj => `
      <div class="item-card" data-id="${proj.id}">
        <div class="item-card-image-wrap">
          <img class="item-card-image" src="${proj.image_url || '/assets/saee-logo.png'}" alt="${proj.name}" onerror="this.src='/assets/saee-logo.png'">
          <span class="badge-featured"><i class="fa-solid fa-rocket"></i> مشروع شبابي</span>
        </div>
        <div class="item-card-body">
          <h3 class="item-card-title">${proj.name}</h3>
          <p class="item-card-desc">${proj.description || 'لا يوجد وصف متوفر لهذا المشروع.'}</p>
          <div class="item-card-footer">
            <div class="social-links-wrap">
              ${proj.instagram_url ? `<a href="${proj.instagram_url}" target="_blank" class="social-btn instagram" title="إنستغرام"><i class="fa-brands fa-instagram"></i></a>` : ''}
              ${proj.facebook_url ? `<a href="${proj.facebook_url}" target="_blank" class="social-btn facebook" title="فيسبوك"><i class="fa-brands fa-facebook-f"></i></a>` : ''}
            </div>
            <button class="btn-card-details" onclick="App.showDetails('project', ${proj.id})">عرض المشروع</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderFeaturedProjects(list) {
    const container = document.getElementById('featured-projects-grid');
    if (!container) return;
    if (!list || list.length === 0) return;

    container.innerHTML = list.map(proj => `
      <div class="item-card" data-id="${proj.id}">
        <div class="item-card-image-wrap">
          <img class="item-card-image" src="${proj.image_url || '/assets/saee-logo.png'}" alt="${proj.name}" onerror="this.src='/assets/saee-logo.png'">
          <span class="badge-featured"><i class="fa-solid fa-crown"></i> ريادي</span>
        </div>
        <div class="item-card-body">
          <h3 class="item-card-title">${proj.name}</h3>
          <p class="item-card-desc">${proj.description || 'لا يوجد وصف متوفر.'}</p>
          <div class="item-card-footer">
            <div class="social-links-wrap">
              ${proj.instagram_url ? `<a href="${proj.instagram_url}" target="_blank" class="social-btn instagram"><i class="fa-brands fa-instagram"></i></a>` : ''}
              ${proj.facebook_url ? `<a href="${proj.facebook_url}" target="_blank" class="social-btn facebook"><i class="fa-brands fa-facebook-f"></i></a>` : ''}
            </div>
            <button class="btn-card-details" onclick="App.showDetails('project', ${proj.id})">التفاصيل</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  // -------------------------------------------------------------
  // جلب وعرض خدمات تهمك (Services)
  // -------------------------------------------------------------
  async loadServices() {
    try {
      const res = await fetch('/api/public/services');
      const data = await res.json();
      if (data.success) {
        this.services = data.services;
        this.renderServices(this.services);
        this.renderFeaturedServices(this.services.slice(0, 3));
      }
    } catch (e) {
      console.error('Services load error:', e);
    }
  },

  filterServices() {
    const term = (document.getElementById('service-search-input')?.value || '').trim().toLowerCase();
    const filtered = this.services.filter(s => {
      return !term ||
        (s.service_name && s.service_name.toLowerCase().includes(term)) ||
        (s.provider_name && s.provider_name.toLowerCase().includes(term)) ||
        (s.description && s.description.toLowerCase().includes(term));
    });
    this.renderServices(filtered);
  },

  renderServices(list) {
    const container = document.getElementById('services-grid');
    if (!container) return;

    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fa-solid fa-handshake-angle"></i></div>
          <h3>لا توجد خدمات متاحة حالياً</h3>
          <p>تفضل بالتواصل معنا إذا كنت ترغب بتقديم خدمتك عبر منصة سعي بلس.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(serv => `
      <div class="item-card" data-id="${serv.id}">
        <div class="item-card-body" style="padding-top: 24px;">
          <div class="item-card-provider">
            <i class="fa-solid fa-circle-user"></i>
            <span>مقدم الخدمة: ${serv.provider_name}</span>
          </div>
          <h3 class="item-card-title">${serv.service_name}</h3>
          <p class="item-card-desc">${serv.description || 'خدمة احترافية مميزة متوفرة لمجتمع سعي بلس.'}</p>
          <div class="item-card-footer">
            <div class="social-links-wrap">
              ${serv.instagram_url ? `<a href="${serv.instagram_url}" target="_blank" class="social-btn instagram" title="إنستغرام"><i class="fa-brands fa-instagram"></i></a>` : ''}
              ${serv.facebook_url ? `<a href="${serv.facebook_url}" target="_blank" class="social-btn facebook" title="فيسبوك"><i class="fa-brands fa-facebook-f"></i></a>` : ''}
              ${serv.phone ? `<a href="https://wa.me/${serv.phone.replace(/[^0-9]/g, '')}" target="_blank" class="social-btn phone" title="واتساب"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
            </div>
            <button class="btn-card-details" onclick="App.showDetails('service', ${serv.id})">طلب الخدمة</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderFeaturedServices(list) {
    const container = document.getElementById('featured-services-grid');
    if (!container) return;
    if (!list || list.length === 0) return;

    container.innerHTML = list.map(serv => `
      <div class="item-card" data-id="${serv.id}">
        <div class="item-card-body" style="padding-top: 22px;">
          <div class="item-card-provider">
            <i class="fa-solid fa-badge-check"></i>
            <span>مقدم الخدمة: ${serv.provider_name}</span>
          </div>
          <h3 class="item-card-title">${serv.service_name}</h3>
          <p class="item-card-desc">${serv.description || 'خدمة احترافية عالية الجودة.'}</p>
          <div class="item-card-footer">
            <div class="social-links-wrap">
              ${serv.instagram_url ? `<a href="${serv.instagram_url}" target="_blank" class="social-btn instagram"><i class="fa-brands fa-instagram"></i></a>` : ''}
              ${serv.facebook_url ? `<a href="${serv.facebook_url}" target="_blank" class="social-btn facebook"><i class="fa-brands fa-facebook-f"></i></a>` : ''}
            </div>
            <button class="btn-card-details" onclick="App.showDetails('service', ${serv.id})">التفاصيل</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  // -------------------------------------------------------------
  // نافذة التفاصيل السريعة (Quick View Modal)
  // -------------------------------------------------------------
  showDetails(type, id) {
    if (!Auth.isLoggedIn()) {
      openAuthModal('login', 'يُرجى تسجيل الدخول أو إنشاء حساب لعرض التفاصيل الكاملة والتواصل.');
      return;
    }

    let item = null;
    if (type === 'shop') item = this.shops.find(x => x.id === id);
    if (type === 'project') item = this.projects.find(x => x.id === id);
    if (type === 'service') item = this.services.find(x => x.id === id);

    if (!item) return;

    const modal = document.getElementById('details-modal');
    const content = document.getElementById('details-modal-content');
    if (!modal || !content) return;

    const title = item.name || item.service_name;
    const desc = item.description || 'لا توجد تفاصيل إضافية مسجلة.';
    const img = item.image_url ? `<img src="${item.image_url}" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-bottom:16px;">` : '';
    const govBadge = item.governorate ? `<p style="font-size:13px;color:var(--primary);font-weight:700;margin-bottom:8px;"><i class="fa-solid fa-location-dot"></i> المحافظة: ${item.governorate}</p>` : '';
    const provBadge = item.provider_name ? `<p style="font-size:13px;color:var(--gold-dark);font-weight:700;margin-bottom:8px;"><i class="fa-solid fa-user-tie"></i> مقدم الخدمة: ${item.provider_name}</p>` : '';

    let links = '';
    if (item.instagram_url) {
      links += `<a href="${item.instagram_url}" target="_blank" class="btn-inquiry" style="background:#d62976;"><i class="fa-brands fa-instagram"></i> صفحة الإنستغرام</a> `;
    }
    if (item.facebook_url) {
      links += `<a href="${item.facebook_url}" target="_blank" class="btn-inquiry" style="background:#1877f2;"><i class="fa-brands fa-facebook-f"></i> صفحة الفيسبوك</a> `;
    }
    if (item.phone) {
      const cleanPhone = item.phone.replace(/[^0-9]/g, '');
      links += `<a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-inquiry" style="background:#25d366;"><i class="fa-brands fa-whatsapp"></i> تواصل عبر واتساب</a>`;
    }

    content.innerHTML = `
      ${img}
      <h2 style="font-size:22px;font-weight:900;color:var(--primary);margin-bottom:10px;">${title}</h2>
      ${govBadge}
      ${provBadge}
      <p style="font-size:14px;color:var(--text-muted);line-height:1.9;margin-bottom:20px;white-space:pre-line;">${desc}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:15px;">
        ${links || '<p style="color:var(--text-light);font-size:12px;">لا توجد روابط تواصل إضافية.</p>'}
      </div>
    `;

    modal.classList.add('active');
  },

  closeDetailsModal() {
    const modal = document.getElementById('details-modal');
    if (modal) modal.classList.remove('active');
  },

  // -------------------------------------------------------------
  // التوجيه التلقائي (Routing)
  // -------------------------------------------------------------
  handleRoute() {
    const hash = window.location.hash.replace('#', '') || 'home';

    if (hash === 'admin') {
      if (!Auth.isAdmin()) {
        showToast('يجب تسجيل الدخول كمدير للوصول إلى لوحة الأدمن', 'error');
        openAuthModal('login', 'يرجى تسجيل الدخول بحساب المدير (admin@saeeplus.com)');
        window.location.hash = '#home';
        return;
      }
      this.showView('admin');
      if (window.AdminApp) {
        window.AdminApp.init();
      }
      return;
    }

    this.showView(hash);
  },

  showView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
    } else {
      document.getElementById('view-home')?.classList.add('active');
    }

    const navLink = document.querySelector(`.nav-link[data-view="${viewName}"]`);
    if (navLink) navLink.classList.add('active');

    // إخفاء/إظهار الهيدر والفوتر إذا كانت لوحة الإدارة مفتوحة
    const isDashboard = viewName === 'admin';
    document.querySelector('.site-header').style.display = isDashboard ? 'none' : 'block';
    document.querySelector('.site-footer').style.display = isDashboard ? 'none' : 'block';
    const floatingBtn = document.querySelector('.floating-inquiry-btn');
    if (floatingBtn) floatingBtn.style.display = isDashboard ? 'none' : 'flex';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
