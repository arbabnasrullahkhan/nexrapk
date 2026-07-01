/**
 * ==========================================================================
 * NEXRA TECH PK — VIP TIERS ENGINE (js/vip-tiers.js)
 * ==========================================================================
 */

window.NexraVIPTiers = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        billingCycle: 'monthly', // 'monthly' | 'lifetime'
        tiers: [],
        fomoNames: ['Ahmad', 'Sarah', 'Zain', 'Fatima', 'Usman', 'Ayesha', 'Bilal', 'Hira']
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
        _fetchTiers();
        _initFOMOTicker();
    }

    function _cacheDOM() {
        _DOM.grid = document.getElementById('vt-pricing-grid');
        _DOM.slider = document.getElementById('vt-toggle-slider');
        _DOM.btnMonthly = document.getElementById('btn-monthly');
        _DOM.btnLifetime = document.getElementById('btn-lifetime');
        _DOM.tickerTrack = document.getElementById('vt-ticker-track');
    }

    function _subscribeAuth() {
        if (!window.auth) return;
        window.auth.onAuthStateChanged(function(user) {
            _state.user = user;
        });
    }

    /* ======================================================================
       FETCH PRICING DATA FROM FIRESTORE
       ====================================================================== */
    function _fetchTiers() {
        if (!window.db) return;

        window.db.collection('vip_tiers').orderBy('order', 'asc').get()
            .then(function(snap) {
                var arr = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    arr.push(d);
                });
                
                // Fallback for demo if DB is empty
                if (arr.length === 0) {
                    arr = _getFallbackTiers();
                }

                _state.tiers = arr;
                _renderGrid();
                _injectSchema(arr);
            }).catch(function(err) {
                console.error("Failed to load tiers", err);
                _state.tiers = _getFallbackTiers();
                _renderGrid();
            });
    }

    /* ======================================================================
       RENDER ENGINE & TOGGLE LOGIC
       ====================================================================== */
    function switchBilling(cycle) {
        if (_state.billingCycle === cycle) return;
        _state.billingCycle = cycle;

        if (cycle === 'monthly') {
            _DOM.slider.style.transform = 'translateX(0)';
            _DOM.btnMonthly.classList.add('active');
            _DOM.btnLifetime.classList.remove('active');
        } else {
            _DOM.slider.style.transform = 'translateX(100%)';
            _DOM.btnMonthly.classList.remove('active');
            _DOM.btnLifetime.classList.add('active');
        }

        // Re-render prices with fade effect
        if (_DOM.grid) {
            _DOM.grid.style.opacity = '0';
            setTimeout(function() {
                _renderGrid();
                _DOM.grid.style.opacity = '1';
            }, 300);
        }
    }

    function _renderGrid() {
        if (!_DOM.grid) return;

        var html = '';
        var isLifetime = _state.billingCycle === 'lifetime';

        _state.tiers.forEach(function(tier) {
            var price = isLifetime ? tier.priceLifetime : tier.priceMonthly;
            var cycleTxt = isLifetime ? '/lifetime' : '/mo';
            
            var popCls = tier.isPopular ? 'popular' : '';
            var popBadge = tier.isPopular ? '<div class="vt-popular-badge">Most Popular</div>' : '';
            
            var btnCls = tier.isPopular ? 'vt-btn-solid' : 'vt-btn-outline';
            var btnIcon = tier.isPopular ? '<i class="fa-solid fa-gem"></i> ' : '';

            var spotsHtml = tier.spotsLeft ? `<div class="vt-spots"><i class="fa-solid fa-fire"></i> Only ${tier.spotsLeft} spots left!</div>` : '';

            // Generate Perks List
            var perksHtml = '';
            if (tier.perks) {
                tier.perks.forEach(function(perk) {
                    var cls = perk.included ? '' : 'disabled';
                    var icon = perk.included ? 'fa-check' : 'fa-xmark';
                    perksHtml += `<li class="${cls}"><i class="fa-solid ${icon}"></i> ${perk.text}</li>`;
                });
            }

            html += `
            <div class="vt-card ${popCls}" style="animation: vtFadeIn 0.5s ease forwards; opacity: 0;">
                ${popBadge}
                <div class="vt-tier-name">${tier.name}</div>
                <div class="vt-tier-desc">${tier.description}</div>
                
                <div class="vt-price-wrap">
                    <span class="vt-price-currency">${tier.currency || 'Rs.'}</span>
                    <span class="vt-price-amount">${price.toLocaleString()}</span>
                    <span class="vt-price-cycle">${cycleTxt}</span>
                </div>

                ${spotsHtml}

                <ul class="vt-perks-list">
                    ${perksHtml}
                </ul>

                <button class="vt-btn ${btnCls}" onclick="NexraVIPTiers.selectTier('${tier.id}')">
                    ${btnIcon}Choose ${tier.name}
                </button>
            </div>`;
        });

        _DOM.grid.innerHTML = html;
        
        // Staggered fade in
        var cards = _DOM.grid.querySelectorAll('.vt-card');
        cards.forEach(function(c, i) {
            c.style.animationDelay = (i * 0.1) + 's';
        });
    }

    /* ======================================================================
       CHECKOUT ROUTING ENGINE
       ====================================================================== */
    function selectTier(tierId) {
        var tier = _state.tiers.find(function(t) { return t.id === tierId; });
        if (!tier) return;

        var payload = {
            type: 'subscription',
            tierId: tier.id,
            name: tier.name,
            billingCycle: _state.billingCycle,
            price: _state.billingCycle === 'lifetime' ? tier.priceLifetime : tier.priceMonthly,
            currency: tier.currency || 'PKR',
            timestamp: new Date().getTime()
        };

        var b64Payload = btoa(encodeURIComponent(JSON.stringify(payload)));
        sessionStorage.setItem('nexra_vip_payload', b64Payload);

        if (!_state.user) {
            if (window.NexraApp) NexraApp.showToast('Please login to secure your tier.', 'fa-solid fa-lock', 'warning');
            setTimeout(function() {
                window.location.href = '/user/auth-gate.html?redirect=/shop/checkout.html?type=vip';
            }, 1500);
        } else {
            if (window.NexraApp) NexraApp.showToast('Routing to secure checkout...', 'fa-solid fa-shield-halved', 'success');
            setTimeout(function() {
                window.location.href = '/shop/checkout.html?type=vip';
            }, 800);
        }
    }

    /* ======================================================================
       FOMO MICRO-INTERACTIONS
       ====================================================================== */
    function _initFOMOTicker() {
        if (!_DOM.tickerTrack) return;
        
        var html = '';
        var tiers = ['VIP', 'Gold', 'Diamond'];
        
        // Generate 15 fake records for the scrolling marquee
        for (var i = 0; i < 15; i++) {
            var name = _state.fomoNames[Math.floor(Math.random() * _state.fomoNames.length)];
            var tier = tiers[Math.floor(Math.random() * tiers.length)];
            var time = Math.floor(Math.random() * 59) + 1;
            
            html += `<div class="vt-ticker-item"><i class="fa-solid fa-bolt" style="color:#fbbf24;"></i> ${name} upgraded to ${tier} (${time}m ago)</div>`;
        }
        
        // Duplicate for seamless infinite scroll
        _DOM.tickerTrack.innerHTML = html + html;
    }

    /* ======================================================================
       SEO SCHEMA (OfferCatalog)
       ====================================================================== */
    function _injectSchema(tiers) {
        var schema = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Nexra Tech Diamond Membership",
            "description": "Premium SaaS ecosystem access with coin multipliers and unlimited downloads.",
            "offers": {
                "@type": "AggregateOffer",
                "offerCount": tiers.length * 2, // Monthly + Lifetime
                "lowPrice": Math.min.apply(null, tiers.map(function(t){ return t.priceMonthly; })),
                "highPrice": Math.max.apply(null, tiers.map(function(t){ return t.priceLifetime; })),
                "priceCurrency": "PKR"
            }
        };

        var scriptEl = document.getElementById('vt-json-ld');
        if (scriptEl) scriptEl.innerText = JSON.stringify(schema);
    }

    /* ======================================================================
       FALLBACK DEMO DATA (If Firebase is empty)
       ====================================================================== */
    function _getFallbackTiers() {
        return [
            {
                id: 'tier_vip', name: 'VIP Pass',
                description: 'Perfect for beginners starting their journey.',
                priceMonthly: 1500, priceLifetime: 15000,
                isPopular: false, spotsLeft: null,
                perks: [
                    { included: true, text: 'Access to Standard Vault' },
                    { included: true, text: '1.5x Coin Multiplier' },
                    { included: false, text: 'Private Broadcast Feed' },
                    { included: false, text: '1-on-1 Support' }
                ]
            },
            {
                id: 'tier_diamond', name: 'Diamond Hub',
                description: 'The ultimate tier for elite professionals.',
                priceMonthly: 3500, priceLifetime: 35000,
                isPopular: true, spotsLeft: 14,
                perks: [
                    { included: true, text: 'Everything in VIP' },
                    { included: true, text: 'Unlimited Premium Downloads' },
                    { included: true, text: '3.0x Maximum Coin Multiplier' },
                    { included: true, text: 'Direct Diamond Support' }
                ]
            },
            {
                id: 'tier_agency', name: 'Agency License',
                description: 'For teams and high-volume resellers.',
                priceMonthly: 9900, priceLifetime: 99000,
                isPopular: false, spotsLeft: 3,
                perks: [
                    { included: true, text: 'Full Reseller Rights' },
                    { included: true, text: '5 Sub-accounts' },
                    { included: true, text: 'API Access' },
                    { included: true, text: 'Custom White-labeling' }
                ]
            }
        ];
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        switchBilling: switchBilling,
        selectTier: selectTier
    };

})();
