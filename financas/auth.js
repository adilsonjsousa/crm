// ============================================================
// Autenticação - Proteção por Senha com Hash SHA-256
// ============================================================

(function () {
  'use strict';

  const AUTH_HASH_KEY = 'financas_auth_hash';
  const AUTH_SESSION_KEY = 'financas_auth_session';
  const SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 horas
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutos de bloqueio

  let loginAttempts = 0;
  let lockoutUntil = 0;

  // ===== Hash SHA-256 =====
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    // Salt fixo derivado do app + senha para dificultar rainbow tables
    const salted = 'financas_pessoais_v1:' + password;
    const data = encoder.encode(salted);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ===== Session Management =====
  function createSession() {
    const session = {
      token: crypto.randomUUID(),
      expiresAt: Date.now() + SESSION_DURATION_MS,
    };
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  }

  // ===== Check if password exists =====
  function hasPassword() {
    return !!localStorage.getItem(AUTH_HASH_KEY);
  }

  // ===== UI Setup =====
  function setupAuthUI() {
    const isNew = !hasPassword();
    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    const confirmGroup = document.getElementById('authConfirmGroup');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const btnAuthText = document.getElementById('btnAuthText');
    const btnReset = document.getElementById('btnResetSenha');

    if (isNew) {
      authTitle.textContent = 'Criar Acesso';
      authSubtitle.textContent = 'Defina uma senha para proteger seus dados financeiros';
      btnAuthText.textContent = 'Criar Senha';
      confirmGroup.style.display = '';
      btnReset.style.display = 'none';
    } else {
      authTitle.textContent = 'Acesso Protegido';
      authSubtitle.textContent = 'Digite sua senha para acessar suas finanças';
      btnAuthText.textContent = 'Entrar';
      confirmGroup.style.display = 'none';
      btnReset.style.display = '';
    }

    authScreen.style.display = '';
    appContainer.style.display = 'none';
  }

  function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = '';
  }

  function showError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = ''; el.textContent = ''; }, 4000);
  }

  // ===== Event Handlers =====
  function init() {
    // Check existing session
    if (getSession() && hasPassword()) {
      showApp();
      return;
    }

    setupAuthUI();

    // Form submit
    document.getElementById('formAuth').addEventListener('submit', async (e) => {
      e.preventDefault();

      // Check lockout
      if (Date.now() < lockoutUntil) {
        const secsLeft = Math.ceil((lockoutUntil - Date.now()) / 1000);
        showError(`Muitas tentativas. Aguarde ${secsLeft}s`);
        return;
      }

      const senha = document.getElementById('authSenha').value;

      if (!hasPassword()) {
        // Creating new password
        const confirm = document.getElementById('authSenhaConfirm').value;
        if (senha !== confirm) {
          showError('As senhas não coincidem');
          return;
        }
        if (senha.length < 4) {
          showError('A senha deve ter pelo menos 4 caracteres');
          return;
        }
        const hash = await hashPassword(senha);
        localStorage.setItem(AUTH_HASH_KEY, hash);
        createSession();
        showApp();
      } else {
        // Login
        const hash = await hashPassword(senha);
        const storedHash = localStorage.getItem(AUTH_HASH_KEY);

        if (hash === storedHash) {
          loginAttempts = 0;
          createSession();
          showApp();
        } else {
          loginAttempts++;
          if (loginAttempts >= MAX_ATTEMPTS) {
            lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
            loginAttempts = 0;
            showError('Muitas tentativas erradas. Bloqueado por 5 minutos');
          } else {
            showError(`Senha incorreta (${MAX_ATTEMPTS - loginAttempts} tentativas restantes)`);
          }
        }
      }
    });

    // Toggle password visibility
    document.getElementById('btnTogglePass').addEventListener('click', () => {
      const input = document.getElementById('authSenha');
      const icon = document.querySelector('#btnTogglePass i');
      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
      } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
      }
    });

    // Reset password (clears everything)
    document.getElementById('btnResetSenha').addEventListener('click', () => {
      if (confirm('ATENÇÃO: Resetar a senha irá APAGAR todos os seus dados financeiros. Deseja continuar?')) {
        if (confirm('Tem certeza absoluta? Esta ação NÃO pode ser desfeita.')) {
          localStorage.removeItem(AUTH_HASH_KEY);
          localStorage.removeItem('financas_pessoais_data');
          clearSession();
          location.reload();
        }
      }
    });

    // Logout button
    document.getElementById('btnLogout').addEventListener('click', () => {
      clearSession();
      document.getElementById('authSenha').value = '';
      setupAuthUI();
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose logout for external use
  window._auth = { clearSession };

})();
