/**
 * ==========================================================================
 * NEXRA TECH PK — STOREFRONT ENGINE (js/storefront.js)
 * ==========================================================================
 */

window.NexraStorefront = (function () {
    'use strict';

    var _state = {
        initialized: false,
        storeId: null,
        storeData: null,
        catalog: [],
        searchTimer: null
    };

    var _DOM = {};

    /* ======================================================================
       INIT & ROUTING
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _cacheDOM();
        
        // 1. Capture ?storeId= from URL
        var params = new URLSearchParams(window.location.search);
        _state.storeId = params.get('storeId');

        if (!_state.storeId) {
            _showErrorState();
            return;
        }

        _fetchStoreProfile();
    }

    function _cacheDOM() {
        _DOM.heroSkeleton = document.getElementById('sf-hero-skeleton');
        _DOM.heroContent = document.getElementById('sf-hero-content');
        _DOM.errorState = document.getElementById('sf-error-state');
        _DOM.toolbar = document.getElementById('sf-toolbar');
        _DOM.grid = document.getElementById('sf-inventory-grid');
        _DOM.fab = document.getElementById('sf-fab-whatsapp');

        _DOM.logo = document.getElementById('sf-logo');
        _DOM.name = document.getElementById('sf-name');
        _DOM.desc = document.getElementById('sf-desc');
        _DOM.rating = document.getElementById('sf-rating');
        _DOM.searchInput = document.getElementById('sf-search-input');
    }

    /* ======================================================================
       FIRESTORE FETCH: STORE PROFILE
       ====================================================================== */
    function _fetchStoreProfile() {
        if (!window.db) return;

        window.db.collection('resellers').doc(_state.storeId).get()
            .then(function(doc) {
                if (!doc.exists) {
                    _showErrorState();
                    return;
                }
                
                var data = doc.data();
                // Ensure visibility toggle is active
                if (data.status === 'suspended') {
                    _showErrorState();
                    return;
                }

                _state.storeData = data;
                _renderHero();
                _updateSEOHead();
                _fetchInventory();
            }).catch(function(err) {
                console.error("Store fetch failed", err);
                _showErrorState();
            });
    }

    function _renderHero() {
        var d = _state.storeData;
        
        _DOM.name.innerText = d.storeName || 'Partner Store';
        _DOM.desc.innerText = d.description || 'Verified Nexra Partner';
        if (d.logoUrl) _DOM.logo.src = d.logoUrl;
        
        if (d.rating && d.reviewsCount) {
            _DOM.rating.innerText = d.rating + ' (' + d.reviewsCount + ')';
        }

        // Setup WhatsApp FAB deep-link
        if (d.whatsapp) {
            var msg = encodeURIComponent("Hi " + (d.storeName || 'Partner') + ", I'm interested in products from your Nexra Store.");
            var link = "https://wa.me/" + d.whatsapp.replace(/[^0-9]/g, '') + "?text=" + msg;
            _DOM.fab.href = link;
            _DOM.fab.style.display = 'flex';
        }

        // Swap UI
        _DOM.heroSkeleton.style.display = 'none';
        _DOM.heroContent.style.display = 'block';
        _DOM.toolbar.style.display = 'flex';
    }

    /* ======================================================================
       FIRESTORE FETCH: MASTER CATALOG + CUSTOM MARKUPS
       ====================================================================== */
    function _fetchInventory() {
        // Fetch global products where active == true
        window.db.collection('products').where('active', '==', true).limit(30).get()
            .then(function(snap) {
                var arr = [];
                var markup = _state.storeData.markupPercentage || 0; // e.g. 15 for 15%
                var hiddenIds = _state.storeData.hiddenProducts || []; // Array of product IDs this store disabled

                snap.forEach(function(doc) {
                    if (hiddenIds.includes(doc.id)) return; // Visibility toggle check

                    var prod = doc.data();
                    prod.id = doc.id;
                    
                    // Apply Agency custom markup mathematically
                    if (markup > 0 && prod.price) {
                        prod.resellerPrice = Math.round(prod.price * (1 + (markup / 100)));
                    } else {
                        prod.resellerPrice = prod.price;
                    }

                    arr.push(prod);
                });

                _state.catalog = arr;
                _renderGrid(_state.catalog);
                _injectSchema(arr);
            }).catch(function(err) {
                if (_DOM.grid) _DOM.grid.innerHTML = '<p style="text-align:center;width:100%;color:var(--danger);">Failed to load inventory.</p>';
            });
    }

    function _renderGrid(items) {
        if (!_DOM.grid) return;

        if (items.length === 0) {
            _DOM.grid.innerHTML = `
                <div class="sf-error-state" style="grid-column: 1/-1;">
                    <i class="fa-solid fa-box-open"></i>
                    <h3 class="tech-font" style="margin-bottom:8px;font-size:18px;">Inventory Empty</h3>
                    <p>No products match your search or this store has no active listings.</p>
                </div>
            `;
            return;
        }

        var html = '';
        items.forEach(function(p, i) {
            var delay = (i * 0.05) + 's';
            html += `
            <div class="sf-prod-card" style="animation-delay: ${delay}">
                <img src="${p.thumbnail || '/assets/placeholder.jpg'}" class="sf-prod-img" alt="${p.title}" loading="lazy">
                <div class="sf-prod-body">
                    <div class="sf-prod-title">${p.title}</div>
                    <div class="sf-prod-price">Rs. ${p.resellerPrice.toLocaleString()}</div>
                    <div class="sf-prod-actions">
                        <button class="sf-btn sf-btn-cart" onclick="NexraStorefront.addToCart('${p.id}')">
                            <i class="fa-solid fa-cart-plus"></i> Cart
                        </button>
                        <button class="sf-btn sf-btn-buy" onclick="NexraStorefront.buyNow('${p.id}')">
                            Buy Now
                        </button>
                    </div>
                </div>
            </div>`;
        });

        _DOM.grid.innerHTML = html;
    }

    /* ======================================================================
       INTERACTIONS: SEARCH, CART & SHARE
       ====================================================================== */
    function debounceSearch(e) {
        clearTimeout(_state.searchTimer);
        var term = e.target.value.toLowerCase();
        
        _state.searchTimer = setTimeout(function() {
            if (!term) {
                _renderGrid(_state.catalog);
                return;
            }
            
            var filtered = _state.catalog.filter(function(p) {
                return p.title.toLowerCase().includes(term);
            });
            _renderGrid(filtered);
        }, 300);
    }

    function shareStore() {
        var d = _state.storeData;
        if (!d) return;

        var url = window.location.href;
        var title = d.storeName + ' on Nexra Tech';
        var text = 'Check out my official partner store for premium digital assets!';

        if (navigator.share) {
            navigator.share({ title: title, text: text, url: url }).catch(console.error);
        } else {
            navigator.clipboard.writeText(url).then(function() {
                if (window.NexraApp) NexraApp.showToast('Store link copied!', 'fa-solid fa-link', 'success');
            });
        }
    }

    function addToCart(productId) {
        var item = _state.catalog.find(function(p) { return p.id === productId; });
        if (!item) return;

        // In a real app, this dispatches to the global Cart system
        // Crucially, it passes _state.storeId to track commission
        var payload = {
            id: item.id,
            title: item.title,
            price: item.resellerPrice,
            thumbnail: item.thumbnail,
            qty: 1,
            affiliateId: _state.storeId // Securely attach reseller tracking
        };

        console.log("Added to cart with Reseller Tracking:", payload);
        if (window.NexraApp) NexraApp.showToast(item.title + ' added to cart.', 'fa-solid fa-check', 'success');
    }

    function buyNow(productId) {
        var item = _state.catalog.find(function(p) { return p.id === productId; });
        if (!item) return;

        // Build atomic checkout payload
        var payload = {
            type: 'single_buy',
            item: { id: item.id, title: item.title, price: item.resellerPrice },
            affiliateId: _state.storeId, // Commission hook
            timestamp: new Date().getTime()
        };

        var b64Payload = btoa(encodeURIComponent(JSON.stringify(payload)));
        sessionStorage.setItem('nexra_checkout_payload', b64Payload);

        // Force checkout directly (guest or auth)
        window.location.href = '/shop/checkout.html?type=buy_now';
    }

    /* ======================================================================
       SEO & HEAD INJECTIONS
       ====================================================================== */
    function _updateSEOHead() {
        var d = _state.storeData;
        var t = d.storeName + ' | Nexra Tech PK';
        
        document.title = t;
        document.getElementById('meta-title').innerText = t;
        document.getElementById('og-title').content = t;
        document.getElementById('tw-title').content = t;

        if (d.description) {
            document.getElementById('meta-desc').content = d.description;
            document.getElementById('og-desc').content = d.description;
            document.getElementById('tw-desc').content = d.description;
        }

        if (d.logoUrl) {
            document.getElementById('og-image').content = d.logoUrl;
            document.getElementById('tw-image').content = d.logoUrl;
        }
    }

    function _injectSchema(catalogArr) {
        var d = _state.storeData;
        var schema = {
            "@context": "https://schema.org",
            "@type": "Store",
            "name": d.storeName,
            "description": d.description,
            "image": d.logoUrl,
            "parentOrganization": {
                "@type": "Organization",
                "name": "Nexra Tech PK",
                "url": "https://nexratech.pk"
            },
            "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "Products",
                "itemListElement": []
            }
        };

        catalogArr.forEach(function(p, i) {
            schema.hasOfferCatalog.itemListElement.push({
                "@type": "ListItem",
                "position": i + 1,
                "item": {
                    "@type": "Product",
                    "name": p.title,
                    "offers": {
                        "@type": "Offer",
                        "priceCurrency": "PKR",
                        "price": p.resellerPrice
                    }
                }
            });
        });

        var scriptEl = document.getElementById('sf-json-ld');
        if (scriptEl) scriptEl.innerText = JSON.stringify(schema);
    }

    function _showErrorState() {
        if (_DOM.heroSkeleton) _DOM.heroSkeleton.style.display = 'none';
        if (_DOM.heroContent) _DOM.heroContent.style.display = 'none';
        if (_DOM.toolbar) _DOM.toolbar.style.display = 'none';
        if (_DOM.grid) _DOM.grid.style.display = 'none';
        
        if (_DOM.errorState) _DOM.errorState.style.display = 'block';
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        debounceSearch: debounceSearch,
        shareStore: shareStore,
        addToCart: addToCart,
        buyNow: buyNow
    };

})();
