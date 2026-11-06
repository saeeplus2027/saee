// ==============================================================
// سعي بلس | SA'E PLUS - إدارة المصادقة والجلسات والحماية
// ==============================================================

const Auth = {
  TOKEN_KEY: 'saee_auth_token',
  USER_KEY: 'saee_auth_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    try {
      const userStr = localStorage.getItem(this.USER_KEY);
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getToken() && !!this.getUser();
  },

  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.updateUI();
  },

  logout() {
    // Clear the HttpOnly session cookie server-side as well as local client state.
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.updateUI();
    showToast('تم تسجيل الخروج بنجاح.', 'info');
    if (window.location.hash.includes('admin')) {
      window.location.hash = '#home';
    }
    setTimeout(() => window.location.reload(), 400);
  },

  updateUI() {
    const user = this.getUser();
    const authBtn = document.getElementById('btn-header-auth');
    const userGreeting = document.getElementById('header-user-name');

    if (this.isLoggedIn() && user) {
      if (authBtn) {
        // واجهة الزبائن لا تعرض اسم المدير أو أي مدخل إلى لوحة الإدارة.
        // تبقى هوية الزبون ضمن جلسة الدخول، وتبقى لوحة الإدارة على نطاقها المنفصل.
        if (user.role === 'admin') {
          authBtn.innerHTML = `
            <i class="fa-solid fa-user-lock"></i>
            <span>تسجيل الدخول</span>
          `;
          authBtn.onclick = () => openAuthModal('login');
        } else {
          authBtn.innerHTML = `
            <i class="fa-solid fa-user-circle"></i>
            <span>${user.name}</span>
            <button class="btn-logout-inline" id="btn-logout-action" title="تسجيل الخروج" style="background:none;border:none;color:var(--danger);margin-right:6px;cursor:pointer;">
              <i class="fa-solid fa-arrow-right-from-bracket"></i>
            </button>
          `;
          const logoutAction = document.getElementById('btn-logout-action');
          if (logoutAction) {
            logoutAction.onclick = (e) => {
              e.stopPropagation();
              this.logout();
            };
          }
        }
      }
    } else {
      if (authBtn) {
        authBtn.innerHTML = `
          <i class="fa-solid fa-user-lock"></i>
          <span>تسجيل الدخول / حسابي</span>
        `;
        authBtn.onclick = () => openAuthModal('login');
      }    }
  },

  // إعداد حارس النقر (Click Guard): للمستخدم غير المسجل يطلب تسجيل الدخول عند التفاعل
  setupClickGuard() {
    document.addEventListener('click', (e) => {
      if (this.isLoggedIn()) return; // إذا كان مسجل دخول لا نعيقه

      // السماح بالنقر داخل نافذة تسجيل الدخول نفسها وأزرار التحكم
      if (e.target.closest('#auth-modal') || e.target.closest('#btn-header-auth') || e.target.closest('#inquiry-modal')) {
        return;
      }

      // إذا ضغط على بطاقة، زر استفسار، تفاصيل، أو رابط تواصل
      const trigger = e.target.closest('.item-card, .btn-inquiry, .floating-inquiry-btn, .btn-card-details, .social-btn');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        openAuthModal('login', 'أهلاً بك في سعي بلس! يُرجى تسجيل الدخول أو إنشاء حساب جديد للاستفادة من كافة الخدمات والتواصل.');
      }
    }, true);
  }
};

// -------------------------------------------------------------
// إدارة نافذة المصادقة (Auth Modal)
// -------------------------------------------------------------
function openAuthModal(tab = 'login', noticeText = '') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  const noticeEl = document.getElementById('auth-notice');
  if (noticeEl) {
    if (noticeText) {
      noticeEl.textContent = noticeText;
      noticeEl.style.display = 'block';
    } else {
      noticeEl.style.display = 'none';
    }
  }

  switchAuthTab(tab);
  modal.classList.add('active');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('active');
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');
  const forgotForm = document.getElementById('form-forgot');

  const tabLoginBtn = document.getElementById('tab-btn-login');
  const tabRegisterBtn = document.getElementById('tab-btn-register');

  if (loginForm) loginForm.style.display = tab === 'login' ? 'block' : 'none';
  if (registerForm) registerForm.style.display = tab === 'register' ? 'block' : 'none';
  if (forgotForm) forgotForm.style.display = tab === 'forgot' ? 'block' : 'none';

  if (tabLoginBtn) tabLoginBtn.classList.toggle('active', tab === 'login');
  if (tabRegisterBtn) tabRegisterBtn.classList.toggle('active', tab === 'register');
}

// -------------------------------------------------------------
// معالجة نماذج الإرسال (Submit Handlers)
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  Auth.updateUI();
  Auth.setupClickGuard();

  // 1. تسجيل الدخول
  const loginForm = document.getElementById('form-login');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
          Auth.setSession(data.token, data.user);
          closeAuthModal();
          showToast(data.message, 'success');        } else {
          showToast(data.message || 'فشل تسجيل الدخول', 'error');
        }
      } catch (err) {
        showToast('حدث خطأ في الاتصال بالخادم', 'error');
      }
    });
  }

  // 2. إنشاء حساب جديد
  const regForm = document.getElementById('form-register');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const pin = document.getElementById('reg-pin').value.trim();

      if (!/^\d{4}$/.test(pin)) {
        showToast('يجب أن يتكون رمز الأمان من 4 أرقام بالضبط (مثال: 5432)', 'error');
        return;
      }

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, pin })
        });
        const data = await res.json();

        if (data.success) {
          Auth.setSession(data.token, data.user);
          closeAuthModal();
          showToast(data.message, 'success');
        } else {
          showToast(data.message || 'فشل إنشاء الحساب', 'error');
        }
      } catch (err) {
        showToast('حدث خطأ في الاتصال بالخادم', 'error');
      }
    });
  }

  // 3. نسيت كلمة المرور باستخدام رمز الـ 4 خانات
  const forgotForm = document.getElementById('form-forgot');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      const pin = document.getElementById('forgot-pin').value.trim();
      const newPassword = document.getElementById('forgot-new-password').value;

      if (!/^\d{4}$/.test(pin)) {
        showToast('يرجى إدخال رمز الأمان المكون من 4 أرقام', 'error');
        return;
      }

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pin, newPassword })
        });
        const data = await res.json();

        if (data.success) {
          showToast(data.message, 'success');
          switchAuthTab('login');
        } else {
          showToast(data.message || 'فشلت استعادة كلمة المرور', 'error');
        }
      } catch (err) {
        showToast('حدث خطأ في الاتصال بالخادم', 'error');
      }
    });
  }
});

// دالة عرض التنبيهات المدمجة (Toast)
function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.className = `toast-${type} show`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
    <span>${message}</span>
  `;

  setTimeout(() => {
    toast.className = '';
  }, 3500);
}
