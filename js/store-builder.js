/**
 * ==========================================================================
 * NEXRA TECH PK — STORE BUILDER ENGINE (js/store-builder.js)
 * ==========================================================================
 */

window.NexraStoreBuilder = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        logoBase64: null,
        previewOpen: true
    };

    var _DOM = {};
    var _BASE_PRICE = 1000; // Reference product price for profit math

    /* ======================================================================
       INIT, ROLE GUARD & AUTH
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;
        _cacheDOM();
        _subscribeAuth();
    }

    function _cacheDOM() {
        _DOM.guard = document.getElementById('sb-guard');
        _DOM.denied = document.getElementById('sb-denied');
        _DOM.main = document.getElementById('sb-main');

        _DOM.nameInput = document.getElementById('sb-name');
        _DOM.descInput = document.getElementById('sb-desc');
        _DOM.waInput = document.getElementById('sb-whatsapp');
        _DOM.accentInput = document.getElementById('sb-accent');
        _DOM.markupInput = document.getElementById('sb-markup');
        _DOM.publishBtn = document.getElementById('sb-publish-btn');

        // Preview targets
        _DOM.prevHero = document.getElementById('sb-prev-hero');
        _DOM.prevLogo = document.getElementById('sb-prev-logo');
        _DOM.prevName = document.getElementById('sb-prev-name');
        _DOM.prevDesc = document.getElementById('sb-prev-desc');
        _DOM.prevFab = document.getElementById('sb-prev-fab');
        _DOM.urlUid = document.getElementById('sb-url-uid');
    }

    function _subscribeAuth() {
        if (!window.auth) return;
        window.auth.onAuthStateChanged(function(user) {
            if (!user) {
                window.location.replace('/user/auth-gate.html?redirect=/reseller/store-builder.html');
                return;
            }
            _state.user = user;
            _verifyRole(user.uid);
        });
    }

    function _verifyRole(uid) {
        window.db.collection('users').doc(uid).get().then(function(doc) {
            if (!doc.exists || doc.data().role !== 'reseller') {
                _showDenied();
                return;
            }
            _loadExistingData(uid);
            _bootUI();
        }).catch(function() { _showDenied(); });
    }

    function _loadExistingData(uid) {
        // Pre-fill form with any existing store data
        window.db.collection('resellers').doc(uid).get().then(function(doc) {
            if (!doc.exists) return;
            var d = doc.data();

            if (_DOM.nameInput) _DOM.nameInput.value = d.storeName || '';
            if (_DOM.descInput) _DOM.descInput.value = d.description || '';
            if (_DOM.waInput) _DOM.waInput.value = d.whatsapp || '';
            if (_DOM.accentInput) _DOM.accentInput.value = d.accentColor || '#7c3aed';
            if (_DOM.markupInput) _DOM.markupInput.value = d.markupPercentage || 10;

            if (d.logoUrl) {
                _state.logoBase64 = d.logoUrl;
                document.getElementById('sb-logo-img').src = d.logoUrl;
                document.getElementById('sb-logo-preview').style.display = 'flex';
                document.getElementById('sb-logo-drop').style.display = 'none';
            }

            liveSync();
            updateMarkup();
        }).catch(function() {});
    }

    function _bootUI() {
        _DOM.guard.style.opacity = '0';
        setTimeout(function() {
            _DOM.guard.style.display = 'none';
            _DOM.main.removeAttribute('hidden');
            _DOM.urlUid.innerText = _state.user.uid.substring(0, 8);
            liveSync();
            updateMarkup();
        }, 400);
    }

    /* ======================================================================
       LIVE PREVIEW DOM MIRROR
       ====================================================================== */
    function liveSync() {
        var name = _DOM.nameInput.value || 'Your Store Name';
        var desc = _DOM.descInput.value || 'Store description will appear here...';
        var accent = _DOM.accentInput.value;

        // Update preview elements
        if (_DOM.prevName) _DOM.prevName.innerText = name;
        if (_DOM.prevDesc) _DOM.prevDesc.innerText = desc;
        if (_DOM.prevHero) _DOM.prevHero.style.background = 'linear-gradient(135deg, ' + accent + ', ' + _darkenColor(accent) + ')';
        if (_DOM.prevFab) _DOM.prevFab.style.background = '#25D366';

        // Update accent hex display
        var hexDisplay = document.getElementById('sb-color-hex');
        if (hexDisplay) hexDisplay.innerText = accent;

        // Char counter for description
        var chars = document.getElementById('sb-desc-chars');
        if (chars) chars.innerText = _DOM.descInput.value.length;
    }

    function _darkenColor(hex) {
        // Simple hex darkener
        var c = hex.replace('#', '');
        var r = Math.max(0, parseInt(c.substring(0,2),16) - 60);
        var g = Math.max(0, parseInt(c.substring(2,4),16) - 60);
        var b = Math.max(0, parseInt(c.substring(4,6),16) - 60);
        return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
    }

    /* ======================================================================
       PROFIT MARGIN CONTROLLER
       ====================================================================== */
    function updateMarkup() {
        var markup = parseInt(_DOM.markupInput.value);
        var storePrice = Math.round(_BASE_PRICE * (1 + markup / 100));
        var profit = storePrice - _BASE_PRICE;

        document.getElementById('sb-markup-badge').innerText = markup + '%';
        document.getElementById('sb-store-price').innerText = 'Rs. ' + storePrice.toLocaleString();
        document.getElementById('sb-profit').innerText = 'Rs. ' + profit.toLocaleString();
    }

    /* ======================================================================
       ZERO-COST MEDIA ENGINE (HTML5 Canvas → Base64)
       ====================================================================== */
    function processImage(event, type) {
        var file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            if (window.NexraApp) NexraApp.showToast('Image must be under 2MB.', 'fa-solid fa-warning', 'warning');
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.getElementById('sb-canvas');
                // Compress to max 200x200 for logo
                var maxSize = 200;
                var ratio = Math.min(maxSize / img.width, maxSize / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                var base64 = canvas.toDataURL('image/webp', 0.85);
                _state.logoBase64 = base64;

                // Update preview
                document.getElementById('sb-prev-logo').src = base64;
                document.getElementById('sb-logo-img').src = base64;
                document.getElementById('sb-logo-preview').style.display = 'flex';
                document.getElementById('sb-logo-drop').style.display = 'none';
                
                if (window.NexraApp) NexraApp.showToast('Logo compressed & ready!', 'fa-solid fa-check', 'success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removeImage(type) {
        _state.logoBase64 = null;
        document.getElementById('sb-prev-logo').src = '/assets/placeholder.jpg';
        document.getElementById('sb-logo-preview').style.display = 'none';
        document.getElementById('sb-logo-drop').style.display = 'flex';
        document.getElementById('sb-logo-file').value = '';
    }

    /* ======================================================================
       PUBLISH ENGINE — Atomic Firestore Write
       ====================================================================== */
    function publish() {
        if (!_state.user || !window.db) return;

        var storeName = _DOM.nameInput.value.trim();
        if (!storeName) {
            if (window.NexraApp) NexraApp.showToast('Store name is required.', 'fa-solid fa-exclamation', 'warning');
            _DOM.nameInput.focus();
            return;
        }

        // Disable inputs & show loading state
        _DOM.publishBtn.disabled = true;
        _DOM.publishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';

        var payload = {
            storeName: storeName,
            description: _DOM.descInput.value.trim(),
            whatsapp: _DOM.waInput.value.trim(),
            accentColor: _DOM.accentInput.value,
            markupPercentage: parseInt(_DOM.markupInput.value),
            logoUrl: _state.logoBase64 || null,
            status: 'active',
            uid: _state.user.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        window.db.collection('resellers').doc(_state.user.uid).set(payload, { merge: true })
            .then(function() {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

                var link = 'nexratech.pk/reseller/storefront.html?storeId=' + _state.user.uid;
                if (window.NexraApp) NexraApp.showToast('Storefront published! ' + link, 'fa-solid fa-rocket', 'success');
                
                _DOM.publishBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Published!';
                setTimeout(function() {
                    _DOM.publishBtn.disabled = false;
                    _DOM.publishBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Publish Storefront';
                }, 4000);
            })
            .catch(function(err) {
                console.error("Publish failed:", err);
                if (window.NexraApp) NexraApp.showToast('Publish failed. Please try again.', 'fa-solid fa-xmark', 'danger');
                _DOM.publishBtn.disabled = false;
                _DOM.publishBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Publish Storefront';
            });
    }

    /* ======================================================================
       UI UTILITIES
       ====================================================================== */
    function togglePreview() {
        _state.previewOpen = !_state.previewOpen;
        var previewPane = document.getElementById('sb-preview-pane');
        var lbl = document.getElementById('sb-preview-lbl');
        var workspace = document.getElementById('sb-workspace');
        
        if (_state.previewOpen) {
            previewPane.style.display = 'flex';
            lbl.innerText = 'Hide Preview';
            if (window.innerWidth >= 992) workspace.style.gridTemplateColumns = '440px 1fr';
        } else {
            previewPane.style.display = 'none';
            lbl.innerText = 'Show Preview';
            workspace.style.gridTemplateColumns = '1fr';
        }
    }

    function _showDenied() {
        _DOM.guard.style.display = 'none';
        _DOM.denied.style.display = 'block';
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        liveSync: liveSync,
        updateMarkup: updateMarkup,
        processImage: processImage,
        removeImage: removeImage,
        publish: publish,
        togglePreview: togglePreview
    };

})();
