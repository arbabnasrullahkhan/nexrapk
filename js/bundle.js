/**
 * ==========================================================================
 * NEXRA TECH PK — SMART BUNDLE ENGINE (js/bundle.js)
 * ==========================================================================
 */

window.NexraBundle = (function () {
    'use strict';

    var _state = {
        initialized: false,
        catalog: [],
        selectedItems: [],
        rules: { min: 3, max: 7, discountPct: 20 }
    };

    var _DOM = {};

    /* ======================================================================
       INIT
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _cacheDOM();
        _fetchCatalog();
    }

    function _cacheDOM() {
        _DOM.grid = document.getElementById('bd-catalog-grid');
        _DOM.boxList = document.getElementById('bd-selected-list');
        _DOM.boxCount = document.getElementById('bd-box-count');
        _DOM.emptyState = document.getElementById('bd-empty-state');
        
        // Progress Bar
        _DOM.progFill = document.getElementById('bd-progress-fill');
        _DOM.statText = document.getElementById('bd-status-text');
        _DOM.countText = document.getElementById('bd-count-text');
        _DOM.lockIcon = document.getElementById('bd-lock-icon');

        // Action Island
        _DOM.island = document.getElementById('bd-action-island');
        _DOM.subtotal = document.getElementById('bd-subtotal');
        _DOM.discountRow = document.getElementById('bd-discount-row');
        _DOM.discountAmt = document.getElementById('bd-discount-amt');
        _DOM.grandTotal = document.getElementById('bd-grand-total');
        _DOM.btnCheckout = document.getElementById('bd-btn-checkout');
    }

    /* ======================================================================
       CATALOG LOGIC
       ====================================================================== */
    function _fetchCatalog() {
        if (!window.db) return;
        
        // Fetch premium products
        window.db.collection('products').limit(20).get()
            .then(function(snap) {
                var arr = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    arr.push(d);
                });
                _state.catalog = arr;
                _renderCatalog();
                _injectSchema(arr);
            }).catch(function(err) {
                if (_DOM.grid) _DOM.grid.innerHTML = '<p class="bd-hint" style="grid-column:1/-1;text-align:center;">Failed to load catalog.</p>';
            });
    }

    function _renderCatalog() {
        if (!_DOM.grid) return;
        if (_state.catalog.length === 0) {
            _DOM.grid.innerHTML = '<p class="bd-hint" style="grid-column:1/-1;text-align:center;">No items available for bundling right now.</p>';
            return;
        }

        var html = '';
        _state.catalog.forEach(function(p) {
            // Check if already selected
            var isSel = _state.selectedItems.find(function(i) { return i.id === p.id; });
            var cls = isSel ? 'bd-prod-card selected' : 'bd-prod-card';

            html += `
            <div class="${cls}" id="cat-item-${p.id}" onclick="NexraBundle.addItem('${p.id}')">
                <img src="${p.thumbnail || '/assets/placeholder.jpg'}" class="bd-prod-img" alt="${p.title}" loading="lazy">
                <div class="bd-prod-info">
                    <div class="bd-prod-title">${p.title}</div>
                    <div class="bd-prod-price">Rs. ${p.price.toLocaleString()}</div>
                </div>
                <div class="bd-add-icon"><i class="fa-solid fa-plus"></i></div>
            </div>`;
        });
        _DOM.grid.innerHTML = html;
    }

    /* ======================================================================
       BUNDLE BOX INTERACTIONS
       ====================================================================== */
    function addItem(id) {
        if (_state.selectedItems.length >= _state.rules.max) {
            if (window.NexraApp) NexraApp.showToast('Maximum ' + _state.rules.max + ' items allowed.', 'fa-solid fa-box', 'warning');
            return;
        }

        var item = _state.catalog.find(function(p) { return p.id === id; });
        if (!item) return;

        // Prevent duplicates
        if (_state.selectedItems.find(function(p) { return p.id === id; })) return;

        _state.selectedItems.push(item);
        
        // Update UI
        var card = document.getElementById('cat-item-' + id);
        if (card) card.classList.add('selected');

        _renderBox();
        _updateEngine();
    }

    function removeItem(id) {
        _state.selectedItems = _state.selectedItems.filter(function(p) { return p.id !== id; });
        
        // Update UI
        var card = document.getElementById('cat-item-' + id);
        if (card) card.classList.remove('selected');

        _renderBox();
        _updateEngine();
    }

    function _renderBox() {
        if (!_DOM.boxList) return;
        
        var count = _state.selectedItems.length;
        _DOM.boxCount.innerText = count + ' Items';

        if (count === 0) {
            _DOM.boxList.innerHTML = '';
            if (_DOM.emptyState) _DOM.boxList.appendChild(_DOM.emptyState);
            return;
        }

        var html = '';
        _state.selectedItems.forEach(function(p) {
            html += `
            <div class="bd-box-item" id="box-item-${p.id}">
                <img src="${p.thumbnail || '/assets/placeholder.jpg'}" class="bd-box-img">
                <div class="bd-box-info">
                    <div class="bd-box-title">${p.title}</div>
                    <div class="bd-box-price">Rs. ${p.price.toLocaleString()}</div>
                </div>
                <button class="bd-box-remove" onclick="NexraBundle.removeItem('${p.id}')" aria-label="Remove item">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`;
        });
        _DOM.boxList.innerHTML = html;
    }

    /* ======================================================================
       MATH & PROGRESS ENGINE
       ====================================================================== */
    function _updateEngine() {
        var count = _state.selectedItems.length;
        var subtotal = 0;
        
        _state.selectedItems.forEach(function(p) { subtotal += (p.price || 0); });

        var isUnlocked = count >= _state.rules.min;
        
        // 1. Progress Bar Updates
        var pct = (count / _state.rules.max) * 100;
        if (pct > 100) pct = 100;
        _DOM.progFill.style.width = pct + '%';
        _DOM.countText.innerText = count + ' / ' + _state.rules.max;

        if (isUnlocked) {
            _DOM.progFill.classList.add('success');
            _DOM.statText.classList.add('unlocked');
            _DOM.statText.innerText = _state.rules.discountPct + '% Discount Unlocked!';
            _DOM.lockIcon.className = 'fa-solid fa-unlock unlocked';
        } else {
            _DOM.progFill.classList.remove('success');
            _DOM.statText.classList.remove('unlocked');
            var needed = _state.rules.min - count;
            _DOM.statText.innerText = 'Add ' + needed + ' more to unlock discount';
            _DOM.lockIcon.className = 'fa-solid fa-lock';
        }

        // 2. Action Island Visiblity
        if (count > 0) {
            _DOM.island.classList.add('active');
        } else {
            _DOM.island.classList.remove('active');
        }

        // 3. Math Calculations
        _DOM.subtotal.innerText = 'Rs. ' + subtotal.toLocaleString();
        
        if (isUnlocked) {
            var discountAmt = Math.round(subtotal * (_state.rules.discountPct / 100));
            var total = subtotal - discountAmt;
            
            _DOM.subtotal.classList.add('slashed');
            _DOM.discountRow.classList.add('active');
            _DOM.discountAmt.innerText = '- Rs. ' + discountAmt.toLocaleString();
            _DOM.grandTotal.innerText = 'Rs. ' + total.toLocaleString();
            
            _DOM.btnCheckout.disabled = false;
            _DOM.btnCheckout.innerHTML = '<i class="fa-solid fa-shield-check"></i> Secure Bundle (Rs. ' + total.toLocaleString() + ')';
        } else {
            _DOM.subtotal.classList.remove('slashed');
            _DOM.discountRow.classList.remove('active');
            _DOM.grandTotal.innerText = 'Rs. ' + subtotal.toLocaleString();
            
            _DOM.btnCheckout.disabled = true;
            _DOM.btnCheckout.innerHTML = '<i class="fa-solid fa-lock"></i> Add ' + (_state.rules.min - count) + ' more to checkout';
        }
    }

    /* ======================================================================
       CHECKOUT PIPELINE
       ====================================================================== */
    function proceedToCheckout() {
        var count = _state.selectedItems.length;
        if (count < _state.rules.min) return;

        // Session validation
        if (!window.auth || !window.auth.currentUser) {
            if (window.NexraApp) NexraApp.showToast('Please login to secure your bundle.', 'fa-solid fa-lock', 'warning');
            
            // Build temporary payload and save to session storage
            _saveBundleToSession();
            
            // Route to auth
            setTimeout(function() {
                window.location.href = '/user/auth-gate.html?redirect=/shop/checkout.html?type=bundle';
            }, 1500);
            return;
        }

        _DOM.btnCheckout.disabled = true;
        _DOM.btnCheckout.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';

        _saveBundleToSession();
        
        setTimeout(function() {
            window.location.href = '/shop/checkout.html?type=bundle';
        }, 800);
    }

    function _saveBundleToSession() {
        var subtotal = 0;
        _state.selectedItems.forEach(function(p) { subtotal += p.price; });
        var discountAmt = Math.round(subtotal * (_state.rules.discountPct / 100));
        var total = subtotal - discountAmt;

        var payload = {
            type: 'smart_bundle',
            items: _state.selectedItems.map(function(p) { return { id: p.id, title: p.title, price: p.price }; }),
            subtotal: subtotal,
            discountPct: _state.rules.discountPct,
            discountAmt: discountAmt,
            grandTotal: total,
            timestamp: new Date().getTime()
        };

        // Compress and encode
        var b64Payload = btoa(encodeURIComponent(JSON.stringify(payload)));
        sessionStorage.setItem('nexra_bundle_payload', b64Payload);
    }

    /* ======================================================================
       SEO SCHEMA
       ====================================================================== */
    function _injectSchema(catalogArr) {
        var schema = {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Smart Bundle Builder | Nexra Tech PK",
            "description": "Create a custom digital asset bundle. Select 3-7 items to unlock a 20% discount.",
            "mainEntity": {
                "@type": "OfferCatalog",
                "name": "Bundle Eligible Products",
                "itemListElement": []
            }
        };

        catalogArr.forEach(function(p, i) {
            schema.mainEntity.itemListElement.push({
                "@type": "ListItem",
                "position": i + 1,
                "item": {
                    "@type": "Product",
                    "name": p.title,
                    "offers": {
                        "@type": "Offer",
                        "priceCurrency": "PKR",
                        "price": p.price
                    }
                }
            });
        });

        var scriptEl = document.getElementById('bd-json-ld');
        if (scriptEl) scriptEl.innerText = JSON.stringify(schema);
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        addItem: addItem,
        removeItem: removeItem,
        proceedToCheckout: proceedToCheckout
    };

})();
