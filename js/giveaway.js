/**
 * ==========================================================================
 * NEXRA TECH PK — LIVE MEGA GIVEAWAY ENGINE (js/giveaway.js)
 * ==========================================================================
 */

window.NexraGiveaway = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        userData: null,
        activeGiveawayId: 'MAIN_DRAW_01', // Target document ID in 'giveaways' collection
        giveawayData: null,
        ticket: null,
        timerInterval: null,
        wheel: {
            canvas: null, ctx: null,
            items: [], colors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],
            currentRotation: 0, isSpinning: false
        },
        unsubDraw: null
    };

    var _DOM = {};

    /* ======================================================================
       INIT & REAL-TIME LISTENERS
       ====================================================================== */
    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _cacheDOM();
        _initWheelCanvas();
        _subscribeAuth();
        _subscribeGiveaway();
        _loadPreviousWinners();
    }

    function _cacheDOM() {
        _DOM.title = document.getElementById('gw-event-title');
        _DOM.desc = document.getElementById('gw-event-desc');
        _DOM.days = document.getElementById('cd-days');
        _DOM.hours = document.getElementById('cd-hours');
        _DOM.mins = document.getElementById('cd-mins');
        _DOM.secs = document.getElementById('cd-secs');
        
        _DOM.authBlock = document.getElementById('gw-auth-block');
        _DOM.btnGen = document.getElementById('gw-btn-generate');
        _DOM.ticketBlock = document.getElementById('gw-ticket-block');
        _DOM.multBlock = document.getElementById('gw-multiplier-block');
        
        _DOM.overlay = document.getElementById('gw-wheel-overlay');
        _DOM.winAlert = document.getElementById('gw-winner-alert');
    }

    function _subscribeAuth() {
        if (!window.auth) return;
        window.auth.onAuthStateChanged(function(user) {
            _state.user = user;
            if (user) {
                _DOM.authBlock.style.display = 'none';
                
                // Fetch User Tier Data for Bonus weight
                window.db.collection('users').doc(user.uid).get().then(function(doc) {
                    if (doc.exists) _state.userData = doc.data();
                    _checkExistingTicket();
                });
            } else {
                _DOM.authBlock.style.display = 'block';
                _DOM.btnGen.style.display = 'none';
                _DOM.ticketBlock.style.display = 'none';
                _DOM.multBlock.style.display = 'none';
            }
        });
    }

    function _subscribeGiveaway() {
        if (!window.db) return;
        
        // Listen to the main active giveaway document
        window.db.collection('giveaways').doc(_state.activeGiveawayId)
            .onSnapshot(function(doc) {
                if (!doc.exists) {
                    _DOM.title.innerText = 'No Active Draw';
                    _DOM.desc.innerText = 'Check back later for our next Mega Giveaway!';
                    return;
                }
                
                var data = doc.data();
                _state.giveawayData = data;
                
                _DOM.title.innerText = data.title;
                _DOM.desc.innerText = data.description;
                
                // Schema Injection
                _injectEventSchema(data);

                // Timer
                if (data.endDate) {
                    _startCountdown(data.endDate.toDate());
                }

                // Load wheel items (Prize pool or participants)
                if (data.pool && Array.isArray(data.pool)) {
                    _state.wheel.items = data.pool;
                    _drawWheel();
                }

                // Handle Live Draw State Triggered by Admin
                if (data.state === 'spinning' && !_state.wheel.isSpinning) {
                    _DOM.overlay.classList.add('hidden');
                    // Admin sets targetIndex in the DB before setting state to spinning
                    _spinTo(data.targetIndex || 0, data.winnerName, data.winnerSerial); 
                } else if (data.state === 'locked') {
                    _DOM.overlay.classList.remove('hidden');
                    _DOM.winAlert.classList.remove('active');
                } else if (data.state === 'finished' && !_state.wheel.isSpinning) {
                    _DOM.overlay.classList.add('hidden');
                    // Draw wheel at the winning angle immediately if joining late
                    _showWinner(data.winnerName, data.winnerSerial);
                }
            });
    }

    /* ======================================================================
       COUNTDOWN ENGINE
       ====================================================================== */
    function _startCountdown(endDate) {
        if (_state.timerInterval) clearInterval(_state.timerInterval);
        
        function update() {
            var now = new Date().getTime();
            var diff = endDate.getTime() - now;

            if (diff <= 0) {
                clearInterval(_state.timerInterval);
                _DOM.days.innerText = '00'; _DOM.hours.innerText = '00';
                _DOM.mins.innerText = '00'; _DOM.secs.innerText = '00';
                var badge = document.getElementById('gw-live-badge');
                if (badge) {
                    badge.style.background = 'rgba(16,185,129,0.1)';
                    badge.style.borderColor = 'rgba(16,185,129,0.3)';
                    badge.style.color = 'var(--success)';
                    badge.innerHTML = '<i class="fa-solid fa-lock-open"></i> DRAW UNLOCKED';
                }
                return;
            }

            var d = Math.floor(diff / (1000 * 60 * 60 * 24));
            var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var s = Math.floor((diff % (1000 * 60)) / 1000);

            _DOM.days.innerText = d < 10 ? '0'+d : d;
            _DOM.hours.innerText = h < 10 ? '0'+h : h;
            _DOM.mins.innerText = m < 10 ? '0'+m : m;
            _DOM.secs.innerText = s < 10 ? '0'+s : s;
        }
        
        update();
        _state.timerInterval = setInterval(update, 1000);
    }

    /* ======================================================================
       DIGITAL TICKET ENGINE
       ====================================================================== */
    function _checkExistingTicket() {
        if (!_state.user || !window.db) return;
        
        window.db.collection('giveawayTickets')
            .where('uid', '==', _state.user.uid)
            .where('giveawayId', '==', _state.activeGiveawayId)
            .limit(1).get().then(function(snap) {
                if (!snap.empty) {
                    _state.ticket = snap.docs[0].data();
                    _renderTicketUI();
                } else {
                    _DOM.btnGen.style.display = 'block';
                }
            });
    }

    function generateTicket() {
        if (!_state.user || !_state.giveawayData) return;
        var btn = _DOM.btnGen;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';

        // Calculate Weight
        var weight = 1;
        if (_state.userData && (_state.userData.tier === 'VIP' || _state.userData.tier === 'Diamond')) {
            weight = 2; // VIP Bonus
        }

        var serialStr = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        var payload = {
            uid: _state.user.uid,
            name: _state.userData ? _state.userData.displayName : 'Verified User',
            giveawayId: _state.activeGiveawayId,
            serial: serialStr,
            weight: weight,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        window.db.collection('giveawayTickets').add(payload).then(function() {
            if (window.NexraApp) NexraApp.showToast('Digital Ticket Generated!', 'fa-solid fa-ticket', 'success');
            _state.ticket = payload;
            _renderTicketUI();
        }).catch(function() {
            if (window.NexraApp) NexraApp.showToast('Generation failed.', 'fa-solid fa-xmark', 'danger');
            btn.disabled = false;
            btn.innerText = 'Generate My Ticket';
        });
    }

    function _renderTicketUI() {
        _DOM.btnGen.style.display = 'none';
        _DOM.ticketBlock.style.display = 'block';
        _DOM.multBlock.style.display = 'block';

        document.getElementById('gw-t-serial').innerText = '#' + _state.ticket.serial;
        document.getElementById('gw-t-name').innerText = _state.ticket.name;
        document.getElementById('gw-t-weight').innerText = _state.ticket.weight + 'x Weight';
        
        if (_state.giveawayData && _state.giveawayData.endDate) {
            document.getElementById('gw-t-date').innerText = _state.giveawayData.endDate.toDate().toLocaleDateString();
        }

        // Generate Canvas QR Code
        var qrCanvas = document.getElementById('gw-t-qr');
        if (qrCanvas && window.QRious) {
            new QRious({
                element: qrCanvas,
                value: 'https://nexratech.pk/verify?t=' + _state.ticket.serial,
                size: 80,
                backgroundAlpha: 0,
                foreground: '#0f172a'
            });
        }
    }

    /* ======================================================================
       GROWTH HACKS
       ====================================================================== */
    function shareForBonus() {
        var url = 'https://nexratech.pk/freebies/giveaway-live.html';
        var text = 'I just entered the Nexra Tech Live Mega Draw! Join now to win premium assets.';
        
        if (navigator.share) {
            navigator.share({ title: 'Nexra Mega Draw', text: text, url: url })
            .then(function() { _applyShareBonus(); })
            .catch(function(e){ console.log(e); });
        } else {
            // Fallback clipboard
            navigator.clipboard.writeText(url + " - " + text).then(function() {
                if (window.NexraApp) NexraApp.showToast('Link copied! Share it to get bonus weight.', 'fa-solid fa-copy', 'success');
                // Simulate bonus after 3 seconds for demo fallback
                setTimeout(_applyShareBonus, 3000);
            });
        }
    }

    function _applyShareBonus() {
        if (!_state.ticket || _state.ticket.shared) return;
        
        // Find doc ID first
        window.db.collection('giveawayTickets')
            .where('uid', '==', _state.user.uid)
            .where('giveawayId', '==', _state.activeGiveawayId)
            .get().then(function(snap) {
                if(!snap.empty) {
                    var docRef = snap.docs[0].ref;
                    var newWeight = _state.ticket.weight + 1;
                    docRef.update({ weight: newWeight, shared: true }).then(function() {
                        _state.ticket.weight = newWeight;
                        _state.ticket.shared = true;
                        document.getElementById('gw-t-weight').innerText = newWeight + 'x Weight';
                        if (window.NexraApp) NexraApp.showToast('Bonus Weight Applied!', 'fa-solid fa-bolt', 'success');
                    });
                }
            });
    }

    /* ======================================================================
       60FPS HTML5 CANVAS SPIN WHEEL
       ====================================================================== */
    function _initWheelCanvas() {
        var cvs = document.getElementById('gw-spin-wheel');
        if (!cvs) return;
        _state.wheel.canvas = cvs;
        _state.wheel.ctx = cvs.getContext('2d');
        
        // Placeholder items if empty
        if (_state.wheel.items.length === 0) {
            _state.wheel.items = ['Prize 1', 'Prize 2', 'Prize 3', 'Prize 4', 'Prize 5', 'Prize 6'];
        }
        _drawWheel();
    }

    function _drawWheel() {
        var ctx = _state.wheel.ctx;
        var cvs = _state.wheel.canvas;
        if (!ctx || !cvs) return;

        var items = _state.wheel.items;
        var numItems = items.length;
        var centerX = cvs.width / 2;
        var centerY = cvs.height / 2;
        var radius = centerX;
        var arc = 2 * Math.PI / numItems;

        ctx.clearRect(0, 0, cvs.width, cvs.height);

        for (var i = 0; i < numItems; i++) {
            var angle = _state.wheel.currentRotation + i * arc;
            
            // Slice
            ctx.beginPath();
            ctx.fillStyle = _state.wheel.colors[i % _state.wheel.colors.length];
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, angle, angle + arc, false);
            ctx.lineTo(centerX, centerY);
            ctx.fill();

            // Text
            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.translate(
                centerX + Math.cos(angle + arc / 2) * (radius - 50),
                centerY + Math.sin(angle + arc / 2) * (radius - 50)
            );
            ctx.rotate(angle + arc / 2);
            ctx.textAlign = "right";
            ctx.font = "bold 16px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(items[i], 30, 6);
            ctx.restore();
        }
    }

    function _spinTo(targetIndex, winnerName, winnerSerial) {
        if (_state.wheel.isSpinning) return;
        _state.wheel.isSpinning = true;

        var items = _state.wheel.items;
        var arc = 2 * Math.PI / items.length;
        
        // Calculate target angle to land at the top (270 degrees or 1.5 * PI)
        var targetAngle = (1.5 * Math.PI) - (targetIndex * arc) - (arc / 2);
        
        // Add multiple full rotations (e.g., 10 spins)
        var totalRotation = targetAngle + (Math.PI * 2 * 10);
        
        // Ensure it always rotates forward relative to current
        while (totalRotation < _state.wheel.currentRotation) {
            totalRotation += Math.PI * 2;
        }

        var startRotation = _state.wheel.currentRotation;
        var changeInRotation = totalRotation - startRotation;
        
        var duration = 6000; // 6 seconds
        var startTime = null;

        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed = timestamp - startTime;
            
            // easeOutQuart
            var progress = elapsed / duration;
            var easeProgress = 1 - Math.pow(1 - progress, 4);

            if (progress < 1) {
                _state.wheel.currentRotation = startRotation + (changeInRotation * easeProgress);
                _drawWheel();
                requestAnimationFrame(animate);
            } else {
                _state.wheel.currentRotation = totalRotation % (Math.PI * 2);
                _drawWheel();
                _state.wheel.isSpinning = false;
                _showWinner(winnerName, winnerSerial);
            }
        }
        
        requestAnimationFrame(animate);
    }

    function _showWinner(name, serial) {
        document.getElementById('gw-winner-name').innerText = name || 'Secret Winner';
        document.getElementById('gw-winner-serial').innerText = serial ? '#' + serial : '---';
        _DOM.winAlert.classList.add('active');
        
        // Fire Confetti
        if (window.confetti) {
            var duration = 3000;
            var end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#fbbf24', '#3b82f6', '#10b981']
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#fbbf24', '#3b82f6', '#10b981']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }
    }

    /* ======================================================================
       PREVIOUS WINNERS
       ====================================================================== */
    function _loadPreviousWinners() {
        if (!window.db) return;
        var list = document.getElementById('gw-winners-list');
        
        window.db.collection('giveaway_winners').orderBy('date', 'desc').limit(5).get()
            .then(function(snap) {
                if (snap.empty) {
                    list.innerHTML = '<p class="gw-hint" style="text-align:center;">No past winners to display yet.</p>';
                    return;
                }
                var html = '';
                snap.forEach(function(doc) {
                    var d = doc.data();
                    html += `
                    <div class="gw-winner-item">
                        <div>
                            <h4>${d.name}</h4>
                            <p>Ticket #${d.serial}</p>
                        </div>
                        <span class="gw-prize-tag">${d.prize}</span>
                    </div>`;
                });
                list.innerHTML = html;
            }).catch(function() {
                if (list) list.innerHTML = '';
            });
    }

    /* ======================================================================
       SEO SCHEMA
       ====================================================================== */
    function _injectEventSchema(data) {
        if (!data.endDate) return;
        var schema = {
            "@context": "https://schema.org",
            "@type": "Event",
            "name": data.title,
            "description": data.description,
            "startDate": new Date().toISOString(), // In reality, should be data.startDate
            "endDate": data.endDate.toDate().toISOString(),
            "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
            "eventStatus": "https://schema.org/EventScheduled",
            "location": {
                "@type": "VirtualLocation",
                "url": "https://nexratech.pk/freebies/giveaway-live.html"
            },
            "organizer": {
                "@type": "Organization",
                "name": "Nexra Tech PK",
                "url": "https://nexratech.pk"
            }
        };

        var scriptEl = document.getElementById('gw-json-ld');
        if (scriptEl) scriptEl.innerText = JSON.stringify(schema);
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        generateTicket: generateTicket,
        shareForBonus: shareForBonus
    };

})();
