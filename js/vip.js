/**
 * ==========================================================================
 * NEXRA TECH PK — VIP DIAMOND HUB ENGINE (js/vip.js)
 * ==========================================================================
 */

window.NexraVIP = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        vipTier: null,
        expiresAt: null,
        unsubscribeFeed: null
    };

    var _DOM = {};

    /* ======================================================================
       INIT & REAL-TIME AUTH GUARD
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _cacheDOM();
        _subscribeAuth();
    }

    function _cacheDOM() {
        _DOM.guard = document.getElementById('vp-pre-guard');
        _DOM.main = document.getElementById('vp-main');
        _DOM.ringFill = document.getElementById('vp-ring-fill');
        _DOM.daysLeft = document.getElementById('vp-days-left');
        _DOM.multiplierText = document.getElementById('vp-multiplier-text');
        _DOM.feedChat = document.getElementById('vp-feed-chat');
    }

    function _subscribeAuth() {
        if (!window.auth || !window.db) return;
        
        window.auth.onAuthStateChanged(function(user) {
            if (!user) {
                window.location.replace('/user/auth-gate.html?redirect=/vip/vip-dashboard.html');
                return;
            }

            _state.user = user;
            
            // Verify Tier and Expiration
            window.db.collection('users').doc(user.uid).onSnapshot(function(doc) {
                if (!doc.exists) {
                    window.location.replace('/home.html');
                    return;
                }
                
                var data = doc.data();
                var tier = data.tier || 'Free';
                
                // Allow VIP, Diamond, Gold
                if (tier !== 'VIP' && tier !== 'Diamond' && tier !== 'Gold') {
                    window.location.replace('/vip/vip-tiers.html');
                    return;
                }

                var vipObj = data.vip || {};
                var expiresAt = vipObj.expiresAt ? vipObj.expiresAt.toDate() : null;
                var now = new Date();

                // If expired, boot to tiers page
                if (!expiresAt || expiresAt < now) {
                    window.location.replace('/vip/vip-tiers.html');
                    return;
                }

                _state.vipTier = tier;
                _state.expiresAt = expiresAt;

                _renderExpirationRing(expiresAt, now);
                _setMultiplierDisplay(tier);
                
                // Unlock UI once
                if (_DOM.guard.style.display !== 'none') {
                    _DOM.guard.style.opacity = '0';
                    setTimeout(function() { 
                        _DOM.guard.style.display = 'none'; 
                        _DOM.main.removeAttribute('hidden');
                        _initBroadcastFeed();
                    }, 500);
                }
            }, function(err) {
                console.error('VIP Auth Check Failed:', err);
                window.location.replace('/home.html');
            });
        });
    }

    /* ======================================================================
       SVG RING MATH ENGINE
       ====================================================================== */
    function _renderExpirationRing(expiresAt, now) {
        var diffTime = Math.abs(expiresAt - now);
        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        _DOM.daysLeft.innerText = diffDays;

        // Assuming max is 365 days for the visual circle calculation
        var maxDays = 365;
        var percentage = Math.min((diffDays / maxDays) * 100, 100);
        
        // Circle circumference (r=44) is approx 276.46
        var circumference = 2 * Math.PI * 44;
        var offset = circumference - (percentage / 100) * circumference;
        
        if (_DOM.ringFill) {
            // Slight delay for animation effect
            setTimeout(function() {
                _DOM.ringFill.style.strokeDashoffset = offset;
                
                if (diffDays <= 7) {
                    _DOM.ringFill.style.stroke = 'var(--danger)';
                    _DOM.daysLeft.style.color = 'var(--danger)';
                } else if (diffDays <= 30) {
                    _DOM.ringFill.style.stroke = 'var(--warning)';
                    _DOM.daysLeft.style.color = 'var(--warning)';
                }
            }, 100);
        }
    }

    function _setMultiplierDisplay(tier) {
        if (!_DOM.multiplierText) return;
        var mult = '1.0x';
        if (tier === 'Gold') mult = '1.5x';
        if (tier === 'VIP') mult = '2.0x';
        if (tier === 'Diamond') mult = '3.0x';
        _DOM.multiplierText.innerText = mult;
    }

    /* ======================================================================
       TELEGRAM-STYLE BROADCAST FEED (Real-time)
       ====================================================================== */
    function _initBroadcastFeed() {
        if (_state.unsubscribeFeed) _state.unsubscribeFeed();
        
        // Listen to 'vip_broadcasts' collection ordered by timestamp
        _state.unsubscribeFeed = window.db.collection('vip_broadcasts')
            .orderBy('timestamp', 'asc')
            .limitToLast(50)
            .onSnapshot(function(snapshot) {
                if (snapshot.empty) {
                    _DOM.feedChat.innerHTML = `
                        <div class="vp-empty-feed">
                            <i class="fa-solid fa-satellite-dish"></i>
                            <p>Secure channel established.<br>Awaiting transmissions.</p>
                        </div>`;
                    return;
                }

                // First load clearing skeletons
                if (_DOM.feedChat.querySelector('.skeleton')) {
                    _DOM.feedChat.innerHTML = '';
                }

                var isScrolledToBottom = _DOM.feedChat.scrollHeight - _DOM.feedChat.clientHeight <= _DOM.feedChat.scrollTop + 50;

                snapshot.docChanges().forEach(function(change) {
                    if (change.type === 'added') {
                        var data = change.doc.data();
                        var html = _buildMessageHTML(data, change.doc.id);
                        _DOM.feedChat.insertAdjacentHTML('beforeend', html);
                    }
                    if (change.type === 'removed') {
                        var el = document.getElementById('msg-' + change.doc.id);
                        if (el) el.remove();
                    }
                });

                // Auto-scroll to bottom if they were already at the bottom or if it's the first load
                if (isScrolledToBottom || snapshot.docChanges().length > 1) {
                    _DOM.feedChat.scrollTop = _DOM.feedChat.scrollHeight;
                }
                
                _applyWatermarks();

            }, function(err) {
                console.error("Feed error:", err);
                _DOM.feedChat.innerHTML = '<p class="vp-empty-feed" style="color:var(--danger)">Encrypted connection failed.</p>';
            });
    }

    function _buildMessageHTML(data, docId) {
        var timeStr = '';
        if (data.timestamp) {
            var date = data.timestamp.toDate();
            var h = date.getHours();
            var m = date.getMinutes();
            var ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12; h = h ? h : 12; 
            m = m < 10 ? '0' + m : m;
            timeStr = h + ':' + m + ' ' + ampm;
        }

        var attachHtml = '';
        if (data.base64Image) {
            // VIP Watermark target
            attachHtml += '<img src="' + data.base64Image + '" class="vp-attach-img vp-watermark-target" crossorigin="anonymous">';
        }
        if (data.downloadLink) {
            attachHtml += '<a href="' + data.downloadLink + '" class="vp-attach-btn" target="_blank" rel="noopener"><i class="fa-solid fa-cloud-arrow-down"></i> Download Asset</a>';
        }

        return `
        <div class="vp-bubble" id="msg-${docId}">
            <div class="vp-bubble-title">
                <span><i class="fa-solid fa-user-shield"></i> ${data.senderName || 'Super Admin'}</span>
                <span class="vp-bubble-time">${timeStr}</span>
            </div>
            <div class="vp-bubble-text">${data.message || ''}</div>
            ${attachHtml}
        </div>`;
    }

    /* ======================================================================
       INVISIBLE HTML5 WATERMARKING
       ====================================================================== */
    function _applyWatermarks() {
        if (!_state.user) return;
        var uidHash = _state.user.uid.substring(0, 8);
        var imgs = document.querySelectorAll('.vp-watermark-target:not(.watermarked)');
        
        imgs.forEach(function(img) {
            // Apply a subtle visual watermark via Canvas (or just a CSS overlay for performance)
            // For true invisible watermarking, steganography in Canvas is required, 
            // but for DOM safety, we'll use a wrapper and an overlay.
            
            var wrap = document.createElement('div');
            wrap.style.position = 'relative';
            wrap.style.display = 'inline-block';
            wrap.style.width = '100%';
            wrap.style.maxWidth = '400px';

            var wm = document.createElement('div');
            wm.innerText = 'NexraID: ' + uidHash;
            wm.style.position = 'absolute';
            wm.style.bottom = '10px';
            wm.style.right = '10px';
            wm.style.color = 'rgba(255,255,255,0.15)';
            wm.style.fontSize = '10px';
            wm.style.fontFamily = 'monospace';
            wm.style.pointerEvents = 'none';
            wm.style.zIndex = '10';
            
            img.parentNode.insertBefore(wrap, img);
            wrap.appendChild(img);
            wrap.appendChild(wm);

            img.classList.add('watermarked');
        });
    }

    /* ======================================================================
       PRIORITY SUPPORT
       ====================================================================== */
    function openPrioritySupport() {
        var msg = "DIAMOND PRIORITY SUPPORT INITIATED.\n\nUID: " + _state.user.uid + "\nTier: " + _state.vipTier + "\n\nHow can we assist you today?";
        var url = "https://wa.me/?text=" + encodeURIComponent(msg);
        window.open(url, '_blank');
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        openPrioritySupport: openPrioritySupport
    };

})();
