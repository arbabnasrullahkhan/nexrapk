/**
 * ==========================================================================
 * NEXRA TECH PK — AUTHENTICATION ENGINE (js/auth.js)
 * ==========================================================================
 * Namespace: window.NexraAuth
 * Pattern:   IIFE → exposes public API on window
 * Loaded:    Only on user/auth-gate.html
 * ==========================================================================
 */

window.NexraAuth = (function () {
    'use strict';

    /* ======================================================================
       PRIVATE STATE
       ====================================================================== */
    var _state = {
        initialized: false,
        redirectUrl: '/user/profile-dashboard.html',
        isProcessing: false
    };

    var _DOM = {};

    /* ======================================================================
       INIT & PRE-AUTH GUARD
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;
        console.log('[NexraAuth] Initializing Gateway...');

        _cacheDOM();
        _parseURL();
        _subscribeAuth();
    }

    function _cacheDOM() {
        _DOM.guard = document.getElementById('ag-pre-guard');
        _DOM.main = document.getElementById('ag-main');
        _DOM.cardContainer = document.getElementById('ag-card-container');
        
        _DOM.btnLogin = document.getElementById('ag-btn-login');
        _DOM.btnReg = document.getElementById('ag-btn-register');
        _DOM.btnForgot = document.getElementById('ag-btn-forgot');
    }

    function _parseURL() {
        var params = new URLSearchParams(window.location.search);
        var r = params.get('redirect');
        if (r) _state.redirectUrl = decodeURIComponent(r);
        
        // Handle referral link via URL
        var refCode = params.get('ref');
        if (refCode) {
            var regRefInput = document.getElementById('reg-ref');
            if (regRefInput) regRefInput.value = refCode;
            switchView('register');
        }
    }

    function _subscribeAuth() {
        if (!window.auth) return;
        
        // Use a slight timeout to prevent flash if redirecting instantly
        setTimeout(function() {
            window.auth.onAuthStateChanged(function (user) {
                if (user) {
                    // ALREADY AUTHENTICATED -> REDIRECT
                    window.location.replace(_state.redirectUrl);
                } else {
                    // SHOW LOGIN UI
                    _DOM.guard.style.opacity = '0';
                    setTimeout(function() { 
                        _DOM.guard.style.display = 'none'; 
                        _DOM.main.removeAttribute('hidden');
                    }, 500);
                }
            });
        }, 300);
    }

    /* ======================================================================
       UI LOGIC (VIEW SWITCHING & VALIDATION)
       ====================================================================== */
    function switchView(viewName) {
        if (!_DOM.cardContainer) return;
        _DOM.cardContainer.className = 'ag-card-container state-' + viewName;
    }

    function togglePassword(inputId, btnEl) {
        var inp = document.getElementById(inputId);
        var icon = btnEl.querySelector('i');
        if (!inp || !icon) return;
        
        if (inp.type === 'password') {
            inp.type = 'text';
            icon.className = 'fa-solid fa-eye-slash';
        } else {
            inp.type = 'password';
            icon.className = 'fa-solid fa-eye';
        }
    }

    function validateEmail(inputEl) {
        var val = inputEl.value;
        var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        var wrap = inputEl.closest('.ag-input-wrapper');
        var err = document.getElementById(inputEl.id + '-error');
        
        if (val.length > 0 && !re.test(val)) {
            if (wrap) wrap.classList.add('error');
            if (err) err.textContent = 'Please enter a valid email format.';
            return false;
        } else {
            if (wrap) wrap.classList.remove('error');
            return true;
        }
    }

    function checkPasswordStrength(val) {
        var bar = document.getElementById('ag-strength-bar');
        var txt = document.getElementById('ag-strength-text');
        if (!bar || !txt) return;

        var score = 0;
        if (val.length > 5) score += 1;
        if (val.length > 8) score += 1;
        if (/[A-Z]/.test(val)) score += 1;
        if (/[0-9]/.test(val)) score += 1;
        if (/[^A-Za-z0-9]/.test(val)) score += 1;

        bar.style.width = (score * 20) + '%';
        
        if (score === 0) { bar.style.background = 'transparent'; txt.textContent = ''; }
        else if (score <= 2) { bar.style.background = 'var(--danger)'; txt.textContent = 'Weak'; txt.style.color = 'var(--danger)'; }
        else if (score <= 4) { bar.style.background = 'var(--warning)'; txt.textContent = 'Good'; txt.style.color = 'var(--warning)'; }
        else { bar.style.background = 'var(--success)'; txt.textContent = 'Strong'; txt.style.color = 'var(--success)'; }
    }

    /* ======================================================================
       FIREBASE AUTHENTICATION EXECUTIONS
       ====================================================================== */
    function _setLoading(btnEl, isLoad) {
        _state.isProcessing = isLoad;
        if (isLoad) {
            btnEl.setAttribute('data-original', btnEl.innerHTML);
            btnEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
            btnEl.disabled = true;
        } else {
            btnEl.innerHTML = btnEl.getAttribute('data-original');
            btnEl.disabled = false;
        }
    }

    function _handleAuthError(error) {
        console.error('[NexraAuth Error]', error);
        var msg = 'Authentication failed. Please try again.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') msg = 'Invalid email or password.';
        if (error.code === 'auth/email-already-in-use') msg = 'This email is already registered. Please log in.';
        if (error.code === 'auth/weak-password') msg = 'Password is too weak. Use at least 6 characters.';
        if (error.code === 'auth/invalid-email') msg = 'Invalid email format.';
        
        if (window.NexraApp) window.NexraApp.showToast(msg, 'fa-solid fa-triangle-exclamation', 'danger');
    }

    function executeLogin(e) {
        e.preventDefault();
        if (_state.isProcessing) return;
        
        var email = document.getElementById('login-email').value.trim();
        var pass = document.getElementById('login-pass').value;
        
        if (!email || !pass) return;
        
        _setLoading(_DOM.btnLogin, true);
        
        window.auth.signInWithEmailAndPassword(email, pass)
            .then(function(userCredential) {
                // Success - onAuthStateChanged will handle redirect
            })
            .catch(function(error) {
                _setLoading(_DOM.btnLogin, false);
                _handleAuthError(error);
            });
    }

    function executeRegister(e) {
        e.preventDefault();
        if (_state.isProcessing) return;

        var name = document.getElementById('reg-name').value.trim();
        var email = document.getElementById('reg-email').value.trim();
        var pass = document.getElementById('reg-pass').value;
        var refInput = document.getElementById('reg-ref').value.trim();
        
        if (!name || !email || !pass) return;

        _setLoading(_DOM.btnReg, true);

        window.auth.createUserWithEmailAndPassword(email, pass)
            .then(function(userCredential) {
                var user = userCredential.user;
                // Update Auth Profile
                return user.updateProfile({ displayName: name }).then(function() {
                    return _buildUserDocument(user, refInput);
                });
            })
            .catch(function(error) {
                _setLoading(_DOM.btnReg, false);
                _handleAuthError(error);
            });
    }

    function executeReset(e) {
        e.preventDefault();
        if (_state.isProcessing) return;

        var email = document.getElementById('forgot-email').value.trim();
        if (!email) return;

        _setLoading(_DOM.btnForgot, true);

        window.auth.sendPasswordResetEmail(email)
            .then(function() {
                _setLoading(_DOM.btnForgot, false);
                if (window.NexraApp) window.NexraApp.showToast('Password reset link sent to your email.', 'fa-solid fa-envelope', 'success');
                switchView('login');
            })
            .catch(function(error) {
                _setLoading(_DOM.btnForgot, false);
                _handleAuthError(error);
            });
    }

    function signInWithGoogle() {
        if (_state.isProcessing || !window.auth) return;
        _state.isProcessing = true;
        
        var provider = new firebase.auth.GoogleAuthProvider();
        window.auth.signInWithPopup(provider)
            .then(function(result) {
                var user = result.user;
                var isNewUser = result.additionalUserInfo.isNewUser;
                
                if (isNewUser) {
                    return _buildUserDocument(user, '');
                } else {
                    // Existing user - onAuthStateChanged handles redirect
                }
            })
            .catch(function(error) {
                _state.isProcessing = false;
                _handleAuthError(error);
            });
    }

    /* ======================================================================
       FIRESTORE USER BUILDER
       ====================================================================== */
    function _generateRefCode() {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var res = 'NX-';
        for (var i = 0; i < 6; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return res;
    }

    function _buildUserDocument(user, appliedRef) {
        if (!window.db) return Promise.resolve();
        
        var docData = {
            displayName: user.displayName || 'Nexra Member',
            email: user.email,
            photoURL: user.photoURL || '/assets/avatar-placeholder.png',
            role: 'user',
            tier: 'Standard',
            coins: 0,
            referralCode: _generateRefCode(),
            appliedReferral: appliedRef || null,
            referralCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        return window.db.collection('users').doc(user.uid).set(docData)
            .then(function() {
                // Success - onAuthStateChanged handles redirect
            });
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        switchView: switchView,
        togglePassword: togglePassword,
        validateEmail: validateEmail,
        checkPasswordStrength: checkPasswordStrength,
        executeLogin: executeLogin,
        executeRegister: executeRegister,
        executeReset: executeReset,
        signInWithGoogle: signInWithGoogle
    };

})();
