/**
 * ==========================================================================
 * NEXRA TECH PK — RESELLER DASHBOARD ENGINE (js/reseller.js)
 * ==========================================================================
 */

window.NexraReseller = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        userData: null,
        markupPct: 20,
        products: []
    };

    var _DOM = {};

    /* ======================================================================
       INIT & AUTH GUARD
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _cacheDOM();
        _subscribeAuth();
    }

    function _cacheDOM() {
        _DOM.guard = document.getElementById('rs-pre-guard');
        _DOM.main = document.getElementById('rs-main');
        _DOM.agencyName = document.getElementById('rs-agency-name');
        
        // Tabs
        _DOM.panels = document.querySelectorAll('.rs-tab-panel');
        _DOM.navBtns = document.querySelectorAll('.rs-nav-btn');
    }

    function _subscribeAuth() {
        if (!window.auth || !window.db) return;
        
        window.auth.onAuthStateChanged(function(user) {
            if (!user) {
                window.location.replace('/user/auth-gate.html?redirect=/reseller/reseller-dashboard.html');
                return;
            }

            _state.user = user;
            // Verify Role
            window.db.collection('users').doc(user.uid).get().then(function(doc) {
                if (!doc.exists) {
                    window.location.replace('/home.html');
                    return;
                }
                
                var data = doc.data();
                if (data.role !== 'reseller') {
                    // Kick unauthorized users
                    window.location.replace('/home.html');
                    return;
                }

                _state.userData = data;
                _DOM.agencyName.innerText = data.storeName || data.displayName || 'Partner';
                
                // Set initial markup if saved
                if (data.storeSettings && data.storeSettings.markup) {
                    _state.markupPct = data.storeSettings.markup;
                    var mInp = document.getElementById('rs-markup-val');
                    if (mInp) mInp.value = _state.markupPct;
                }

                // Unlock UI
                _DOM.guard.style.opacity = '0';
                setTimeout(function() { 
                    _DOM.guard.style.display = 'none'; 
                    _DOM.main.removeAttribute('hidden');
                    // Load initial tab data
                    _loadOverview();
                }, 500);

                // Pre-fill store builder
                _populateStoreBuilder(data);

            }).catch(function(err) {
                console.error('Role verification failed:', err);
                window.location.replace('/home.html');
            });
        });
    }

    /* ======================================================================
       TAB NAVIGATION
       ====================================================================== */
    function switchTab(tabId, btnEl) {
        _DOM.panels.forEach(p => p.classList.remove('active'));
        _DOM.navBtns.forEach(b => b.classList.remove('active'));

        var target = document.getElementById('tab-' + tabId);
        if (target) target.classList.add('active');
        if (btnEl) btnEl.classList.add('active');

        // Lazy Load Data
        if (tabId === 'overview') _loadOverview();
        if (tabId === 'wholesale') _loadWholesale();
        if (tabId === 'keys') _loadKeys();
        if (tabId === 'wallet') _loadWallet();
    }

    /* ======================================================================
       TAB 1: OVERVIEW (Stats)
       ====================================================================== */
    function _loadOverview() {
        var grid = document.getElementById('rs-stats-grid');
        if (!grid || !window.db) return;

        // Fetch metrics (simulated real-time aggregation for UI demo)
        window.db.collection('orders').where('resellerId', '==', _state.user.uid).get()
            .then(function(snap) {
                var totalRev = 0;
                var activeLic = 0;
                snap.forEach(function(doc) {
                    var d = doc.data();
                    totalRev += d.amount || 0;
                    if (d.status === 'delivered') activeLic++;
                });

                grid.innerHTML = `
                    <div class="rs-stat-card">
                        <p>Total Revenue</p>
                        <h3>Rs. ${totalRev.toLocaleString()}</h3>
                    </div>
                    <div class="rs-stat-card">
                        <p>Active Licenses</p>
                        <h3>${activeLic}</h3>
                    </div>
                    <div class="rs-stat-card">
                        <p>Profit Margin</p>
                        <h3>${_state.markupPct}%</h3>
                    </div>
                    <div class="rs-stat-card">
                        <p>Available Balance</p>
                        <h3>Rs. ${(_state.userData.coins || 0).toLocaleString()}</h3>
                    </div>
                `;
            }).catch(function(err) {
                console.error(err);
            });
    }

    /* ======================================================================
       TAB 2: STORE BUILDER
       ====================================================================== */
    function _populateStoreBuilder(data) {
        if (data.storeName) {
            var sn = document.getElementById('rs-store-name');
            if (sn) sn.value = data.storeName;
        }
        if (data.storeWa) {
            var sw = document.getElementById('rs-store-wa');
            if (sw) sw.value = data.storeWa;
        }
        if (data.storeLogo) {
            var prev = document.getElementById('rs-logo-preview');
            if (prev) prev.innerHTML = '<img src="' + data.storeLogo + '">';
            _state.b64Logo = data.storeLogo;
        }
    }

    function handleLogoUpload(input) {
        if (!input.files || !input.files[0]) return;
        var file = input.files[0];
        
        if (file.size > 1024 * 1024) {
            if (window.NexraApp) NexraApp.showToast('File must be under 1MB', 'fa-solid fa-triangle-exclamation', 'danger');
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var MAX_W = 200; var MAX_H = 200;
                var w = img.width; var h = img.height;

                if (w > h) { if (w > MAX_W) { h *= MAX_W / w; w = MAX_W; } } 
                else { if (h > MAX_H) { w *= MAX_H / h; h = MAX_H; } }

                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                
                var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                _state.b64Logo = dataUrl;
                document.getElementById('rs-logo-preview').innerHTML = '<img src="' + dataUrl + '">';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function updateStore(e) {
        e.preventDefault();
        var name = document.getElementById('rs-store-name').value;
        var wa = document.getElementById('rs-store-wa').value;
        var btn = document.getElementById('rs-btn-store-save');

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

        window.db.collection('users').doc(_state.user.uid).update({
            storeName: name,
            storeWa: wa,
            storeLogo: _state.b64Logo || null
        }).then(function() {
            if (window.NexraApp) NexraApp.showToast('Store profile updated successfully!', 'fa-solid fa-check', 'success');
            _DOM.agencyName.innerText = name;
        }).catch(function(err) {
            if (window.NexraApp) NexraApp.showToast('Failed to update store.', 'fa-solid fa-xmark', 'danger');
        }).finally(function() {
            btn.disabled = false;
            btn.innerHTML = 'Save Store Profile';
        });
    }

    /* ======================================================================
       TAB 3: WHOLESALE INVENTORY
       ====================================================================== */
    function applyMarkup() {
        var val = document.getElementById('rs-markup-val').value;
        var num = parseInt(val, 10);
        if (isNaN(num) || num < 0) return;
        
        _state.markupPct = num;
        
        // Save to DB
        window.db.collection('users').doc(_state.user.uid).update({
            'storeSettings.markup': num
        });

        if (window.NexraApp) NexraApp.showToast('Global markup applied.', 'fa-solid fa-percent', 'success');
        _renderWholesaleGrid();
    }

    function _loadWholesale() {
        var grid = document.getElementById('rs-inventory-grid');
        if (!grid || !window.db) return;
        if (_state.products.length > 0) {
            _renderWholesaleGrid();
            return;
        }

        window.db.collection('products').limit(20).get()
            .then(function(snap) {
                var arr = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    arr.push(d);
                });
                _state.products = arr;
                _renderWholesaleGrid();
            }).catch(function() {
                grid.innerHTML = '<p class="rs-empty"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load catalog.</p>';
            });
    }

    function _renderWholesaleGrid() {
        var grid = document.getElementById('rs-inventory-grid');
        if (!grid) return;
        
        if (_state.products.length === 0) {
            grid.innerHTML = '<p class="rs-empty"><i class="fa-solid fa-box-open"></i> Catalog empty.</p>';
            return;
        }

        var html = '';
        _state.products.forEach(function(p) {
            var basePrice = p.price || 0;
            var markupAmt = basePrice * (_state.markupPct / 100);
            var finalPrice = Math.round(basePrice + markupAmt);
            var profit = finalPrice - basePrice;

            html += `
            <div class="rs-item-card">
                <img src="${p.thumbnail || '/assets/placeholder.jpg'}" class="rs-item-img">
                <div class="rs-item-info">
                    <div class="rs-item-title">${p.title}</div>
                    <div class="rs-item-prices">
                        <span>Cost: <span class="rs-price-base">Rs. ${basePrice}</span></span>
                        <span>Sell At: <span class="rs-price-reseller">Rs. ${finalPrice}</span></span>
                        <span style="color:var(--success); font-weight:700;"><i class="fa-solid fa-arrow-trend-up"></i> Profit: Rs. ${profit}</span>
                    </div>
                </div>
            </div>`;
        });
        grid.innerHTML = html;
    }

    /* ======================================================================
       TAB 4: KEY MANAGER
       ====================================================================== */
    function _loadKeys() {
        var list = document.getElementById('rs-key-list');
        if (!list || !window.db) return;

        window.db.collection('orders').where('resellerId', '==', _state.user.uid)
            .where('status', '==', 'delivered').orderBy('createdAt', 'desc').limit(15).get()
            .then(function(snap) {
                if (snap.empty) {
                    list.innerHTML = '<p class="rs-empty"><i class="fa-solid fa-key"></i> No active keys available.</p>';
                    return;
                }
                var html = '';
                snap.forEach(function(doc) {
                    var d = doc.data();
                    var key = d.licenseKey || 'PENDING-SYSTEM-GEN';
                    html += `
                    <div class="rs-key-card">
                        <div class="rs-key-meta">
                            <h4>${d.productTitle || 'Digital License'}</h4>
                            <p>Order ID: #${doc.id.substring(0,8).toUpperCase()}</p>
                        </div>
                        <div class="rs-key-actions">
                            <div class="rs-key-box">${key}</div>
                            <button class="btn btn-outline" onclick="NexraReseller.copyKey('${key}')"><i class="fa-solid fa-copy"></i></button>
                            <button class="btn btn-primary" onclick="NexraReseller.waKey('${key}', '${d.productTitle}')"><i class="fa-brands fa-whatsapp"></i> Send</button>
                        </div>
                    </div>`;
                });
                list.innerHTML = html;
            }).catch(function() {
                list.innerHTML = '<p class="rs-empty"><i class="fa-solid fa-key"></i> No keys found.</p>';
            });
    }

    function copyKey(key) {
        navigator.clipboard.writeText(key).then(function() {
            if (window.NexraApp) NexraApp.showToast('Key copied to clipboard!', 'fa-solid fa-check', 'success');
        });
    }

    function waKey(key, title) {
        var msg = "Hello! Here is your premium license key for " + title + ":\n\n*" + key + "*\n\nThank you for choosing " + (_state.userData.storeName || "us") + "!";
        var url = "https://wa.me/?text=" + encodeURIComponent(msg);
        window.open(url, '_blank');
    }

    /* ======================================================================
       TAB 5: WALLET & PAYOUTS
       ====================================================================== */
    function _loadWallet() {
        var balEl = document.getElementById('rs-avail-bal');
        if (balEl && _state.userData) {
            balEl.innerText = 'Rs. ' + (_state.userData.coins || 0).toLocaleString();
        }

        var hist = document.getElementById('rs-payout-history');
        if (!hist || !window.db) return;

        window.db.collection('payouts').where('uid', '==', _state.user.uid)
            .orderBy('createdAt', 'desc').limit(5).get()
            .then(function(snap) {
                if (snap.empty) {
                    hist.innerHTML = '<p class="rs-empty"><i class="fa-solid fa-receipt"></i> No payout history found.</p>';
                    return;
                }
                var html = '<div style="display:flex; flex-direction:column; gap:10px;">';
                snap.forEach(function(doc) {
                    var d = doc.data();
                    var statusColor = d.status === 'completed' ? 'var(--success)' : (d.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
                    html += `
                    <div style="background:var(--bg-surface); border:1px solid var(--glass-border); padding:16px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="display:block; font-size:14px;">Rs. ${d.amount.toLocaleString()}</strong>
                            <span style="font-size:12px; color:var(--text-300);">${d.method.toUpperCase()} - ${d.account}</span>
                        </div>
                        <span style="color:${statusColor}; font-size:12px; font-weight:700; text-transform:uppercase;">${d.status}</span>
                    </div>`;
                });
                html += '</div>';
                hist.innerHTML = html;
            });
    }

    function submitPayout(e) {
        e.preventDefault();
        var amt = parseInt(document.getElementById('rs-payout-amt').value, 10);
        var method = document.getElementById('rs-payout-method').value;
        var acc = document.getElementById('rs-payout-acc').value.trim();

        if (isNaN(amt) || amt < 5000) {
            if (window.NexraApp) NexraApp.showToast('Minimum withdrawal is Rs. 5000', 'fa-solid fa-triangle-exclamation', 'warning');
            return;
        }

        if (amt > (_state.userData.coins || 0)) {
            if (window.NexraApp) NexraApp.showToast('Insufficient balance.', 'fa-solid fa-xmark', 'danger');
            return;
        }

        var btn = document.getElementById('rs-btn-payout');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...';

        // Write payout request
        window.db.collection('payouts').add({
            uid: _state.user.uid,
            amount: amt,
            method: method,
            account: acc,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function() {
            // Deduct coins optimistic
            var newBal = (_state.userData.coins || 0) - amt;
            return window.db.collection('users').doc(_state.user.uid).update({ coins: newBal });
        }).then(function() {
            if (window.NexraApp) NexraApp.showToast('Payout request submitted successfully.', 'fa-solid fa-check', 'success');
            _state.userData.coins -= amt;
            document.getElementById('rs-payout-form').reset();
            _loadWallet();
        }).catch(function(err) {
            if (window.NexraApp) NexraApp.showToast('Request failed. Try again.', 'fa-solid fa-xmark', 'danger');
        }).finally(function() {
            btn.disabled = false;
            btn.innerHTML = 'Submit Request';
        });
    }

    /* ======================================================================
       TAB 6: CONTENT SUBMISSION
       ====================================================================== */
    function submitContent(e) {
        e.preventDefault();
        var type = document.getElementById('rs-content-type').value;
        var title = document.getElementById('rs-content-title').value.trim();
        var desc = document.getElementById('rs-content-desc').value.trim();
        var fileInp = document.getElementById('rs-content-img');
        
        var btn = document.getElementById('rs-btn-content');

        if (!fileInp.files || !fileInp.files[0]) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Compressing...';

        var file = fileInp.files[0];
        var reader = new FileReader();
        reader.onload = function(ev) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var MAX = 800; var w = img.width; var h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
                else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                var b64 = canvas.toDataURL('image/jpeg', 0.7);

                btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Uploading...';
                
                window.db.collection('pending_content').add({
                    uid: _state.user.uid,
                    authorName: _state.userData.storeName || _state.userData.displayName,
                    type: type,
                    title: title,
                    content: desc,
                    coverBase64: b64,
                    status: 'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(function() {
                    if (window.NexraApp) NexraApp.showToast('Content submitted for review!', 'fa-solid fa-check-double', 'success');
                    document.getElementById('rs-content-form').reset();
                }).catch(function(err) {
                    if (window.NexraApp) NexraApp.showToast('Failed to submit content.', 'fa-solid fa-xmark', 'danger');
                }).finally(function() {
                    btn.disabled = false;
                    btn.innerHTML = 'Submit for Review';
                });
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        switchTab: switchTab,
        handleLogoUpload: handleLogoUpload,
        updateStore: updateStore,
        applyMarkup: applyMarkup,
        copyKey: copyKey,
        waKey: waKey,
        submitPayout: submitPayout,
        submitContent: submitContent
    };

})();
