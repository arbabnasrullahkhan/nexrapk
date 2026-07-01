/**
 * ==========================================================================
 * NEXRA TECH PK — ACCOUNT HEALTH ENGINE (js/account-health.js)
 * ==========================================================================
 *
 * STATUS STATE MACHINE:
 * ┌──────────────┬──────────────────────────────────────────────────────┐
 * │ 'active'     │ Celebratory "Excellent Standing" state              │
 * │ 'warning'    │ Yellow pulse banner + feature status + appeal form  │
 * │ 'restricted' │ Red pulse banner + locked features + urgent form    │
 * │ 'banned'     │ Dark red severe banner + full lock + urgent form    │
 * └──────────────┴──────────────────────────────────────────────────────┘
 */

window.NexraAccountHealth = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        resellerData: null,
        unsubscribe: null,
        isSubmitting: false
    };

    /* ======================================================================
       INIT & ROLE GUARD
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;
        _subscribeAuth();
    }

    function _subscribeAuth() {
        if (!window.auth) return;
        window.auth.onAuthStateChanged(function(user) {
            if (!user) {
                window.location.replace('/user/auth-gate.html?redirect=/reseller/account-health.html');
                return;
            }
            _state.user = user;
            window.db.collection('users').doc(user.uid).get().then(function(doc) {
                if (!doc.exists || doc.data().role !== 'reseller') {
                    _showDenied();
                    return;
                }
                _bootUI();
                _attachRealtimeListener(user.uid);
            }).catch(_showDenied);
        });
    }

    function _bootUI() {
        var guard = document.getElementById('ah-guard');
        if (guard) { guard.style.opacity = '0'; setTimeout(function() { guard.style.display = 'none'; }, 400); }
        var main = document.getElementById('ah-main');
        if (main) main.removeAttribute('hidden');
    }

    function _showDenied() {
        var guard = document.getElementById('ah-guard');
        if (guard) guard.style.display = 'none';
        var denied = document.getElementById('ah-denied');
        if (denied) denied.style.display = 'block';
    }

    /* ======================================================================
       REAL-TIME FIRESTORE LISTENER — resellers/{uid}
       ====================================================================== */
    function _attachRealtimeListener(uid) {
        if (_state.unsubscribe) _state.unsubscribe();

        _state.unsubscribe = window.db.collection('resellers').doc(uid)
            .onSnapshot(function(doc) {
                var skel = document.getElementById('ah-skeleton');
                var content = document.getElementById('ah-content');

                if (skel) skel.style.display = 'none';
                if (content) content.style.display = 'block';

                if (!doc.exists) {
                    _renderNullState();
                    return;
                }

                _state.resellerData = doc.data();
                _renderHealthDashboard(_state.resellerData);
            }, function(err) {
                console.error('Health listener error', err);
            });
    }

    /* ======================================================================
       MAIN RENDER ORCHESTRATOR
       ====================================================================== */
    function _renderHealthDashboard(d) {
        var status = (d.status || 'active').toLowerCase();

        // 1. Update header status badge
        _renderStatusBadge(status);

        // 2. Dashboard KPI cards
        _renderDashboardGrid(d);

        // 3. Branch by status
        var alertZone = document.getElementById('ah-alert-zone');
        var excellentState = document.getElementById('ah-excellent-state');
        var featuresSection = document.getElementById('ah-features-section');
        var strikesSection = document.getElementById('ah-strikes-section');

        // Clear alerts
        alertZone.innerHTML = '';

        if (status === 'active') {
            if (excellentState) excellentState.style.display = 'block';
            if (featuresSection) featuresSection.style.display = 'none';
            if (strikesSection) strikesSection.style.display = 'none';
            _renderExcellentStats(d);
            _setAppealMode('general', d);
        } else {
            if (excellentState) excellentState.style.display = 'none';
            _renderAlertBanners(status, d, alertZone);
            _renderFeatureLocks(d, status);
            if (featuresSection) featuresSection.style.display = 'block';
            if (strikesSection && d.strikes && d.strikes.length) {
                strikesSection.style.display = 'block';
                _renderStrikes(d.strikes);
            }
            _setAppealMode(status, d);
        }
    }

    /* ======================================================================
       STATUS BADGE RENDER
       ====================================================================== */
    function _renderStatusBadge(status) {
        var badge = document.getElementById('ah-status-badge');
        if (!badge) return;
        var icons = { active: '✅', warning: '⚠️', restricted: '🔒', banned: '🚫' };
        var classes = { active: 'ah-status-active', warning: 'ah-status-warning', restricted: 'ah-status-restricted', banned: 'ah-status-banned' };
        var labels = { active: 'Active', warning: 'Warning Issued', restricted: 'Restricted', banned: 'Banned' };

        badge.innerHTML = '<div class="ah-status-pill ' + (classes[status] || 'ah-status-active') + '">'
            + icons[status] + ' ' + (labels[status] || status) + '</div>';
    }

    /* ======================================================================
       ALERT BANNERS
       ====================================================================== */
    function _renderAlertBanners(status, d, container) {
        var bannerClass = status === 'warning' ? 'ah-alert-warning'
                        : status === 'restricted' ? 'ah-alert-restricted'
                        : 'ah-alert-banned';

        var icon = status === 'warning' ? 'fa-triangle-exclamation'
                 : status === 'restricted' ? 'fa-lock'
                 : 'fa-circle-ban';

        var title = status === 'warning'    ? '⚠️ Policy Warning Issued'
                  : status === 'restricted' ? '🔒 Store Restricted'
                  : '🚫 Store Suspended';

        var adminNote = d.adminNote || 'Your store has been flagged. Please review the guidelines and contact support.';
        var flagDate = d.flaggedAt ? d.flaggedAt.toDate().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recently';

        container.innerHTML = '<div class="ah-alert-banner ' + bannerClass + '">'
            + '<div class="ah-alert-icon"><i class="fa-solid ' + icon + '"></i></div>'
            + '<div class="ah-alert-body">'
            + '<h3>' + title + '</h3>'
            + '<p>' + adminNote + '</p>'
            + '<div class="ah-alert-date"><i class="fa-solid fa-calendar-xmark"></i> Flagged on ' + flagDate + '</div>'
            + '</div></div>';
    }

    /* ======================================================================
       DASHBOARD KPI CARDS
       ====================================================================== */
    function _renderDashboardGrid(d) {
        var grid = document.getElementById('ah-dashboard-grid');
        if (!grid) return;

        var since = d.activatedAt ? d.activatedAt.toDate().toLocaleDateString('en-PK', { month: 'short', year: 'numeric' }) : 'N/A';
        var cards = [
            { icon: 'fa-shop', value: d.storeName || 'My Store', label: 'Store Name' },
            { icon: 'fa-chart-bar', value: (d.totalOrders || 0).toLocaleString(), label: 'Total Orders' },
            { icon: 'fa-coins', value: 'Rs. ' + ((d.totalRevenue || 0)).toLocaleString(), label: 'Revenue' },
            { icon: 'fa-calendar-check', value: since, label: 'Partner Since' }
        ];

        var html = '';
        cards.forEach(function(c, i) {
            html += '<div class="ah-dash-card" style="animation-delay:' + (i * 0.07) + 's;">'
                + '<div class="ah-dash-icon"><i class="fa-solid ' + c.icon + '"></i></div>'
                + '<div class="ah-dash-value">' + c.value + '</div>'
                + '<div class="ah-dash-label">' + c.label + '</div>'
                + '</div>';
        });
        grid.innerHTML = html;
    }

    /* ======================================================================
       FEATURE LOCK RENDERER
       ====================================================================== */
    function _renderFeatureLocks(d, status) {
        var grid = document.getElementById('ah-features-grid');
        if (!grid) return;

        var lockedFeatures = d.lockedFeatures || [];
        var allFeatures = [
            { key: 'custom_html',     icon: 'fa-code',         name: 'Custom HTML Injections', desc: 'Deploy custom banners and tracking pixels' },
            { key: 'payout',          icon: 'fa-money-bill',   name: 'Payout Withdrawals',     desc: 'Withdraw earned commissions' },
            { key: 'product_catalog', icon: 'fa-box-open',     name: 'Product Catalog',        desc: 'List and sell products on storefront' },
            { key: 'storefront',      icon: 'fa-store',        name: 'Public Storefront',      desc: 'Your public reseller URL visibility' },
            { key: 'support_channel', icon: 'fa-headset',      name: 'Priority Support',       desc: 'Direct admin escalation line' }
        ];

        var html = '';
        allFeatures.forEach(function(f) {
            var isLocked = lockedFeatures.indexOf(f.key) !== -1 || status === 'banned';
            var cls = isLocked ? 'ah-feature-locked' : 'ah-feature-active';
            var tagClass = isLocked ? 'ah-tag-locked' : 'ah-tag-active';
            var tagLabel = isLocked ? 'Locked' : 'Active';

            html += '<div class="ah-feature-row ' + cls + '">'
                + '<div class="ah-feature-left">'
                + '<div class="ah-feature-icon"><i class="fa-solid ' + f.icon + '"></i></div>'
                + '<div><div class="ah-feature-name">' + f.name + '</div><div class="ah-feature-desc">' + f.desc + '</div></div>'
                + '</div>'
                + '<span class="ah-feature-tag ' + tagClass + '">' + tagLabel + '</span>'
                + '</div>';
        });
        grid.innerHTML = html;
    }

    /* ======================================================================
       EXCELLENT STATE RENDER
       ====================================================================== */
    function _renderExcellentStats(d) {
        var statsEl = document.getElementById('ah-excellent-stats');
        if (!statsEl) return;
        var stats = [
            { value: d.totalOrders || 0, label: 'Orders' },
            { value: (d.strikes || []).length, label: 'Strikes' },
            { value: d.totalRevenue ? 'Rs.' + d.totalRevenue.toLocaleString() : 'Rs.0', label: 'Revenue' }
        ];
        statsEl.innerHTML = stats.map(function(s) {
            return '<div class="ah-exc-stat"><strong>' + s.value + '</strong><span>' + s.label + '</span></div>';
        }).join('');
    }

    /* ======================================================================
       STRIKE HISTORY RENDERER
       ====================================================================== */
    function _renderStrikes(strikes) {
        var list = document.getElementById('ah-strikes-list');
        if (!list) return;
        var html = '';
        strikes.forEach(function(s, i) {
            var date = s.date ? new Date(s.date.seconds * 1000).toLocaleDateString('en-PK') : 'Unknown';
            html += '<div class="ah-strike-item">'
                + '<div class="ah-strike-number">' + (i + 1) + '</div>'
                + '<div><div class="ah-strike-title">' + (s.title || 'Policy Violation') + '</div>'
                + '<div class="ah-strike-note">' + (s.note || '—') + '</div>'
                + '<div class="ah-strike-date"><i class="fa-solid fa-calendar"></i> ' + date + '</div></div>'
                + '</div>';
        });
        list.innerHTML = html;
    }

    /* ======================================================================
       APPEAL FORM MODE
       ====================================================================== */
    function _setAppealMode(status, d) {
        var title = document.getElementById('ah-appeal-title');
        var desc = document.getElementById('ah-appeal-desc');
        var subjectSelect = document.getElementById('ah-appeal-subject');

        if (status === 'warning' || status === 'restricted' || status === 'banned') {
            if (title) title.innerText = '⚡ Submit Appeal to Admin';
            if (desc) desc.innerText = 'Your account requires attention. Send a direct message to the Super Admin for urgent review.';
            if (subjectSelect) subjectSelect.value = 'appeal_' + status;
        } else {
            if (title) title.innerText = 'Contact Support';
            if (desc) desc.innerText = 'Your account is in great standing! Reach out for any platform questions.';
        }
    }

    function _renderNullState() {
        var grid = document.getElementById('ah-dashboard-grid');
        if (grid) grid.innerHTML = '<div style="color:var(--text-300); font-size:14px;">Store data not found.</div>';
    }

    /* ======================================================================
       APPEAL SUBMISSION ENGINE — Atomic Firestore Write
       ====================================================================== */
    function submitAppeal() {
        if (_state.isSubmitting || !_state.user || !window.db) return;

        var message = document.getElementById('ah-appeal-message').value.trim();
        var subject = document.getElementById('ah-appeal-subject').value;
        var priority = document.querySelector('input[name="ah-priority"]:checked')
            ? document.querySelector('input[name="ah-priority"]:checked').value : 'normal';

        if (message.length < 30) {
            if (window.NexraApp) NexraApp.showToast('Please write at least 30 characters.', 'fa-solid fa-warning', 'warning');
            return;
        }

        // Lock UI
        _state.isSubmitting = true;
        var btn = document.getElementById('ah-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        var payload = {
            uid: _state.user.uid,
            email: _state.user.email,
            storeName: _state.resellerData ? _state.resellerData.storeName : '—',
            subject: subject,
            message: message,
            priority: priority,
            type: 'reseller_appeal',        // ← Bypass normal queue; admin notified immediately
            status: 'open',
            storeStatus: _state.resellerData ? _state.resellerData.status : 'unknown',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        window.db.collection('tickets').add(payload).then(function() {
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            if (window.NexraApp) NexraApp.showToast('Appeal submitted! Admin notified.', 'fa-solid fa-check-circle', 'success');

            // Show submitted state
            document.getElementById('ah-appeal-form').style.display = 'none';
            document.getElementById('ah-submitted-state').style.display = 'block';
        }).catch(function(err) {
            console.error('Appeal submit failed', err);
            if (window.NexraApp) NexraApp.showToast('Submission failed. Try again.', 'fa-solid fa-xmark', 'danger');
            _state.isSubmitting = false;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit to Admin';
        });
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        submitAppeal: submitAppeal
    };

})();
