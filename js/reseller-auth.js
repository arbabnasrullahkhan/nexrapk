/**
 * ==========================================================================
 * NEXRA TECH PK — RESELLER AUTH ENGINE (js/reseller-auth.js)
 * ==========================================================================
 *
 * AUTH FLOW STATE MACHINE:
 * ┌──────────┬─────────────────────────────────────────────────────────────┐
 * │ State 0  │ User not authenticated → show login gate                    │
 * │ State 1  │ Authenticated, email NOT verified → show verify wall        │
 * │ State 2  │ Authenticated, email verified → show Reseller Key input     │
 * │ State 3  │ Key validated → elevate role → redirect to dashboard        │
 * └──────────┴─────────────────────────────────────────────────────────────┘
 */

window.NexraResellerAuth = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        adminPhone: null,      // Fetched from settings/global
        isSubmitting: false,
        verificationTimer: null
    };

    var _DOM = {};

    /* ======================================================================
       INIT
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _cacheDOM();
        _drawCanvasWatermark();
        _injectSchema();
        _fetchAdminContact();
        _subscribeAuth();
        _initParallax();
    }

    function _cacheDOM() {
        _DOM.step0 = document.getElementById('ra-step-0');
        _DOM.step1 = document.getElementById('ra-step-1');
        _DOM.step2 = document.getElementById('ra-step-2');
        _DOM.step3 = document.getElementById('ra-step-3');

        _DOM.emailDisplay = document.getElementById('ra-email-display');
        _DOM.keyInput = document.getElementById('ra-key-input');
        _DOM.validateBtn = document.getElementById('ra-validate-btn');
        _DOM.resendBtn = document.getElementById('ra-resend-btn');
        _DOM.waLink = document.getElementById('ra-whatsapp-link');

        // Progress steps
        _DOM.ps = {
            s1: document.getElementById('rp-s1'),
            s2: document.getElementById('rp-s2'),
            s3: document.getElementById('rp-s3'),
            s4: document.getElementById('rp-s4'),
            l1: document.getElementById('rpl-1'),
            l2: document.getElementById('rpl-2'),
            l3: document.getElementById('rpl-3')
        };
    }

    /* ======================================================================
       AUTH STATE MACHINE
       ====================================================================== */
    function _subscribeAuth() {
        if (!window.auth) return;
        window.auth.onAuthStateChanged(function(user) {
            _state.user = user;

            if (!user) {
                _showStep(0);
                return;
            }

            // Check if already a reseller — skip gate entirely
            window.db.collection('users').doc(user.uid).get().then(function(doc) {
                if (doc.exists && doc.data().role === 'reseller') {
                    window.location.replace('/reseller/reseller-dashboard.html');
                    return;
                }

                // Check email verification
                user.reload().then(function() {
                    if (!window.auth.currentUser.emailVerified) {
                        _showStep(1);
                        if (_DOM.emailDisplay) _DOM.emailDisplay.innerText = user.email;
                        _startVerificationPolling();
                    } else {
                        _showStep(2);
                        _buildWhatsAppLink();
                    }
                });
            }).catch(function() { _showStep(1); });
        });
    }

    /* ======================================================================
       STEP MANAGEMENT
       ====================================================================== */
    function _showStep(n) {
        var panels = [_DOM.step0, _DOM.step1, _DOM.step2, _DOM.step3];
        panels.forEach(function(p) { if (p) p.style.display = 'none'; });
        if (panels[n]) panels[n].style.display = 'flex';

        // Update progress indicator
        _updateProgress(n);
    }

    function _updateProgress(stepIdx) {
        var steps = [_DOM.ps.s1, _DOM.ps.s2, _DOM.ps.s3, _DOM.ps.s4];
        var lines = [_DOM.ps.l1, _DOM.ps.l2, _DOM.ps.l3];

        // Map n to progress array index (0→0, 1→1, 2→2, 3→3)
        steps.forEach(function(s, i) {
            if (!s) return;
            s.classList.remove('active', 'done');
            if (i < stepIdx) s.classList.add('done');
            else if (i === stepIdx) s.classList.add('active');
        });

        lines.forEach(function(l, i) {
            if (!l) return;
            l.classList.toggle('filled', i < stepIdx);
        });
    }

    /* ======================================================================
       EMAIL VERIFICATION POLLING
       ====================================================================== */
    function _startVerificationPolling() {
        clearInterval(_state.verificationTimer);
        _state.verificationTimer = setInterval(function() {
            checkVerification();
        }, 5000); // Poll every 5 seconds
    }

    function checkVerification() {
        if (!window.auth.currentUser) return;
        window.auth.currentUser.reload().then(function() {
            if (window.auth.currentUser.emailVerified) {
                clearInterval(_state.verificationTimer);
                if (window.NexraApp) NexraApp.showToast('Email verified! Enter your reseller key.', 'fa-solid fa-envelope-circle-check', 'success');
                _showStep(2);
                _buildWhatsAppLink();
            }
        });
    }

    function resendVerification() {
        if (!window.auth.currentUser) return;
        _DOM.resendBtn.disabled = true;
        _DOM.resendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        window.auth.currentUser.sendEmailVerification().then(function() {
            if (window.NexraApp) NexraApp.showToast('Verification email sent!', 'fa-solid fa-paper-plane', 'success');
        }).catch(function(err) {
            if (window.NexraApp) NexraApp.showToast('Too many requests. Wait a moment.', 'fa-solid fa-warning', 'warning');
        }).finally(function() {
            setTimeout(function() {
                _DOM.resendBtn.disabled = false;
                _DOM.resendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Resend Verification Email';
            }, 30000); // 30s cooldown
        });
    }

    /* ======================================================================
       ADMIN CONTACT & WHATSAPP DEEP-LINK
       ====================================================================== */
    function _fetchAdminContact() {
        if (!window.db) return;
        window.db.collection('settings').doc('global').get().then(function(doc) {
            if (!doc.exists) return;
            var d = doc.data();
            _state.adminPhone = d.adminWhatsapp || d.whatsapp || '923001234567';
            _buildWhatsAppLink();
        }).catch(function() {});
    }

    function _buildWhatsAppLink() {
        if (!_DOM.waLink || !_state.adminPhone) return;
        var user = _state.user;
        var userName = user ? (user.displayName || user.email) : 'a user';
        var msg = encodeURIComponent(
            'Hi, I would like to request a Nexra Tech PK Reseller Key.\n' +
            'Account: ' + userName + '\n' +
            'UID: ' + (user ? user.uid : 'Guest') + '\n\n' +
            'Please review my application. Thank you!'
        );
        _DOM.waLink.href = 'https://wa.me/' + _state.adminPhone.replace(/[^0-9]/g, '') + '?text=' + msg;
    }

    /* ======================================================================
       KEY FORMAT HELPER (Auto-hyphenate as user types)
       ====================================================================== */
    function formatKey(input) {
        var raw = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        // Format: NEXRA-XXXX-XXXX-XXXX (allow flexible formatting)
        var formatted = raw.match(/.{1,4}/g) ? raw.match(/.{1,4}/g).join('-') : raw;
        input.value = formatted;
    }

    /* ======================================================================
       RESELLER KEY VALIDATION ENGINE
       ====================================================================== */
    function validateKey() {
        if (_state.isSubmitting) return;

        var raw = _DOM.keyInput.value.trim().replace(/-/g, '').toUpperCase();
        if (raw.length < 12) {
            if (window.NexraApp) NexraApp.showToast('Please enter a valid reseller key.', 'fa-solid fa-warning', 'warning');
            _DOM.keyInput.classList.add('ra-key-error');
            setTimeout(function() { _DOM.keyInput.classList.remove('ra-key-error'); }, 600);
            return;
        }

        if (!_state.user || !window.db) return;

        // Lock UI
        _state.isSubmitting = true;
        _DOM.validateBtn.disabled = true;
        _DOM.keyInput.disabled = true;
        _DOM.validateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating...';

        // Query Firestore for matching key
        window.db.collection('reseller_keys')
            .where('key', '==', raw)
            .where('used', '==', false)
            .limit(1)
            .get()
            .then(function(snap) {
                if (snap.empty) {
                    _onKeyFailure('Invalid key or already used. Contact admin for a new one.');
                    return;
                }

                var keyDoc = snap.docs[0];
                var keyData = keyDoc.data();

                // All validations passed — atomic batch write
                _elevateToReseller(keyDoc.id, keyData);
            })
            .catch(function(err) {
                console.error("Key validation error", err);
                _onKeyFailure('Validation failed. Check your connection and try again.');
            });
    }

    /* ======================================================================
       ATOMIC ROLE ELEVATION — Firestore Batch Write
       ====================================================================== */
    function _elevateToReseller(keyDocId, keyData) {
        var uid = _state.user.uid;
        var batch = window.db.batch();

        // 1. Update user's role and bind reseller profile
        var userRef = window.db.collection('users').doc(uid);
        batch.update(userRef, {
            role: 'reseller',
            resellerProfileId: uid,
            resellerActivatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            resellerKeyId: keyDocId
        });

        // 2. Create or initialize the reseller document
        var resellerRef = window.db.collection('resellers').doc(uid);
        batch.set(resellerRef, {
            uid: uid,
            email: _state.user.email,
            storeName: (_state.user.displayName || 'My Store') + ' Store',
            status: 'active',
            markupPercentage: 10,
            activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            keyId: keyDocId
        }, { merge: true });

        // 3. Mark the key as used
        var keyRef = window.db.collection('reseller_keys').doc(keyDocId);
        batch.update(keyRef, {
            used: true,
            usedBy: uid,
            usedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.commit().then(function() {
            _onKeySuccess();
        }).catch(function(err) {
            console.error("Batch write failed", err);
            _onKeyFailure('Activation failed. Please contact support.');
        });
    }

    function _onKeySuccess() {
        _state.isSubmitting = false;

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate([40, 60, 100]);

        // Show success step
        _showStep(3);

        if (window.NexraApp) NexraApp.showToast(
            'Welcome to the Partner Network! 🎉 Activating your dashboard...',
            'fa-solid fa-rocket', 'success'
        );

        // Redirect to dashboard after 2.5 seconds
        setTimeout(function() {
            window.location.replace('/reseller/reseller-dashboard.html');
        }, 2500);
    }

    function _onKeyFailure(message) {
        _state.isSubmitting = false;
        _DOM.validateBtn.disabled = false;
        _DOM.keyInput.disabled = false;
        _DOM.validateBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Activate Partner Access';

        if (window.NexraApp) NexraApp.showToast(message, 'fa-solid fa-circle-xmark', 'danger');

        // Shake animation on input
        _DOM.keyInput.classList.add('ra-key-error');
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
        setTimeout(function() { _DOM.keyInput.classList.remove('ra-key-error'); }, 600);
    }

    /* ======================================================================
       CANVAS WATERMARK
       ====================================================================== */
    function _drawCanvasWatermark() {
        var canvas = document.getElementById('ra-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.fillStyle = 'rgba(124,58,237,0.5)';
        ctx.font = 'bold 14px Space Grotesk, sans-serif';
        ctx.save();
        ctx.rotate(-20 * Math.PI / 180);
        for (var y = -canvas.height; y < canvas.height * 2; y += 90) {
            for (var x = -canvas.width; x < canvas.width * 2; x += 260) {
                ctx.fillText('NEXRA TECH PK', x, y);
            }
        }
        ctx.restore();
    }

    /* ======================================================================
       PARALLAX MOUSE EFFECT
       ====================================================================== */
    function _initParallax() {
        var hero = document.getElementById('ra-hero');
        if (!hero) return;
        window.addEventListener('mousemove', function(e) {
            var x = (e.clientX / window.innerWidth - 0.5) * 20;
            var y = (e.clientY / window.innerHeight - 0.5) * 20;
            var particles = document.querySelectorAll('.ra-particle');
            particles.forEach(function(p, i) {
                var factor = (i + 1) * 0.6;
                p.style.transform = 'translate(' + (x * factor) + 'px, ' + (y * factor) + 'px)';
            });
        }, { passive: true });
    }

    /* ======================================================================
       JSON-LD SCHEMA
       ====================================================================== */
    function _injectSchema() {
        var schema = {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "Nexra Tech PK Reseller Program",
            "description": "Exclusive invite-only agency reseller program for Pakistan's leading SaaS ecosystem.",
            "url": "https://nexratech.pk/reseller/auth-gate.html",
            "publisher": { "@type": "Organization", "name": "Nexra Tech PK", "url": "https://nexratech.pk" }
        };
        var el = document.getElementById('ra-json-ld');
        if (el) el.innerText = JSON.stringify(schema);
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        checkVerification: checkVerification,
        resendVerification: resendVerification,
        formatKey: formatKey,
        validateKey: validateKey
    };

})();
