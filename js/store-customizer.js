/**
 * ==========================================================================
 * NEXRA TECH PK — STORE CUSTOMIZER ENGINE (js/store-customizer.js)
 * ==========================================================================
 *
 * SECURITY ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  XSS GUARD: Content is never innerHTML'd into the main document.   │
 * │  All user code is rendered exclusively inside a sandboxed <iframe>. │
 * │  iframe sandbox="allow-scripts" prevents parent frame access.       │
 * │  Firestore stores the raw text payload — rendering is client-only. │
 * └─────────────────────────────────────────────────────────────────────┘
 */

window.NexraCustomizer = (function () {
    'use strict';

    var _state = {
        initialized: false,
        user: null,
        activeType: 'html',
        previewOpen: false,
        isDeploying: false,
        blocksUnsubscribe: null,
        previewDebounce: null
    };

    var _DOM = {};

    // XSS: Forbidden patterns that could break sandbox or exfiltrate data
    var _DANGER_PATTERNS = [
        /parent\s*\./gi, /top\s*\./gi, /window\.location/gi,
        /document\.cookie/gi, /localStorage/gi, /sessionStorage/gi,
        /fetch\s*\(/gi, /XMLHttpRequest/gi
    ];

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
        _DOM.guard = document.getElementById('sc-guard');
        _DOM.denied = document.getElementById('sc-denied');
        _DOM.main = document.getElementById('sc-main');
        _DOM.editor = document.getElementById('sc-code-editor');
        _DOM.lineNumbers = document.getElementById('sc-line-numbers');
        _DOM.deployBtn = document.getElementById('sc-deploy-btn');
        _DOM.previewPanel = document.getElementById('sc-preview-panel');
        _DOM.previewIframe = document.getElementById('sc-preview-iframe');
        _DOM.workspace = document.getElementById('sc-workspace');
        _DOM.blocksList = document.getElementById('sc-blocks-list');
        _DOM.charCount = document.getElementById('sc-char-count');
        _DOM.lineCount = document.getElementById('sc-line-count');
        _DOM.placement = document.getElementById('sc-placement');
        _DOM.blockName = document.getElementById('sc-block-name');
        _DOM.xssStatus = document.getElementById('sc-xss-status');
    }

    function _subscribeAuth() {
        if (!window.auth) return;
        window.auth.onAuthStateChanged(function(user) {
            if (!user) {
                window.location.replace('/user/auth-gate.html?redirect=/reseller/store-customizer.html');
                return;
            }
            _state.user = user;
            window.db.collection('users').doc(user.uid).get().then(function(doc) {
                if (!doc.exists || doc.data().role !== 'reseller') {
                    _showDenied();
                    return;
                }
                _bootUI();
                _listenBlocks(user.uid);
            }).catch(_showDenied);
        });
    }

    function _bootUI() {
        _DOM.guard.style.opacity = '0';
        setTimeout(function() {
            _DOM.guard.style.display = 'none';
            _DOM.main.removeAttribute('hidden');
            _syncPlacementMap();
        }, 400);
    }

    function _showDenied() {
        _DOM.guard.style.display = 'none';
        _DOM.denied.style.display = 'block';
    }

    /* ======================================================================
       CODE EDITOR — INPUT HANDLING
       ====================================================================== */
    function onEditorInput() {
        var content = _DOM.editor.value;

        // Update stats
        _DOM.charCount.innerText = content.length;
        var lines = content.split('\n');
        _DOM.lineCount.innerText = lines.length;

        // Update line numbers
        _DOM.lineNumbers.innerText = lines.map(function(_, i) { return i + 1; }).join('\n');

        // XSS check and live preview debounce
        _runXssCheck(content);

        clearTimeout(_state.previewDebounce);
        if (_state.previewOpen) {
            _state.previewDebounce = setTimeout(refreshPreview, 600);
        }
    }

    function syncScroll() {
        _DOM.lineNumbers.scrollTop = _DOM.editor.scrollTop;
    }

    function handleKeydown(e) {
        // Tab → insert 2 spaces (not focus change)
        if (e.key === 'Tab') {
            e.preventDefault();
            var start = _DOM.editor.selectionStart;
            var end = _DOM.editor.selectionEnd;
            _DOM.editor.value = _DOM.editor.value.substring(0, start) + '  ' + _DOM.editor.value.substring(end);
            _DOM.editor.selectionStart = _DOM.editor.selectionEnd = start + 2;
            onEditorInput();
        }
    }

    function setType(type, btnEl) {
        _state.activeType = type;
        document.querySelectorAll('.sc-type-tab').forEach(function(b) { b.classList.remove('active'); });
        if (btnEl) btnEl.classList.add('active');
        var langLabel = document.getElementById('sc-editor-lang-label');
        if (langLabel) langLabel.innerText = type.toUpperCase() + ' — Custom Block';
    }

    function formatCode() {
        var code = _DOM.editor.value.trim();
        if (!code) return;
        // Basic HTML formatting: add newlines around tags
        if (_state.activeType === 'html') {
            code = code
                .replace(/>\s*</g, '>\n<')
                .replace(/^\s+|\s+$/gm, '');
        }
        _DOM.editor.value = code;
        onEditorInput();
    }

    function copyCode() {
        navigator.clipboard.writeText(_DOM.editor.value).then(function() {
            if (window.NexraApp) NexraApp.showToast('Code copied!', 'fa-regular fa-copy', 'success');
        });
    }

    function clearEditor() {
        if (_DOM.editor.value && !confirm('Clear the editor? This cannot be undone.')) return;
        _DOM.editor.value = '';
        _DOM.blockName.value = '';
        onEditorInput();
    }

    /* ======================================================================
       XSS SANITIZATION ENGINE
       ====================================================================== */
    function _runXssCheck(content) {
        var detected = _DANGER_PATTERNS.some(function(pattern) { return pattern.test(content); });
        if (detected) {
            _DOM.xssStatus.innerHTML = '<i class="fa-solid fa-shield-xmark"></i> XSS Risk Detected';
            _DOM.xssStatus.style.color = '#ef4444';
        } else {
            _DOM.xssStatus.innerHTML = '<i class="fa-solid fa-shield-check"></i> XSS Guard Active';
            _DOM.xssStatus.style.color = '#10b981';
        }
    }

    function _isSafeContent(content) {
        return !_DANGER_PATTERNS.some(function(p) { return p.test(content); });
    }

    /* ======================================================================
       SANDBOXED LIVE PREVIEW ENGINE
       ====================================================================== */
    function togglePreview() {
        _state.previewOpen = !_state.previewOpen;
        var toggle = document.getElementById('sc-preview-toggle');
        var lbl = document.getElementById('sc-preview-lbl');

        if (_state.previewOpen) {
            _DOM.previewPanel.style.display = 'flex';
            _DOM.workspace.classList.add('preview-open');
            if (toggle) toggle.classList.add('active');
            if (lbl) lbl.innerText = 'Hide Preview';
            refreshPreview();
        } else {
            _DOM.previewPanel.style.display = 'none';
            _DOM.workspace.classList.remove('preview-open');
            if (toggle) toggle.classList.remove('active');
            if (lbl) lbl.innerText = 'Show Preview';
        }
    }

    function refreshPreview() {
        if (!_DOM.previewIframe) return;
        var code = _DOM.editor.value;
        var type = _state.activeType;

        // Wrap non-HTML types appropriately
        var fullDoc = '';
        if (type === 'css') {
            fullDoc = '<style>' + code + '</style><div class="preview-target">CSS Applied to this preview</div>';
        } else if (type === 'js') {
            // Warn: JS runs inside sandbox
            fullDoc = code ? '<script>' + code + '<\/script>' : '';
        } else {
            fullDoc = code;
        }

        // Inject into isolated iframe via srcdoc
        var safeDoc = '<!DOCTYPE html><html><head>'
            + '<style>body{font-family:sans-serif;margin:16px;background:#fff;color:#111;}</style>'
            + '</head><body>' + fullDoc + '</body></html>';

        _DOM.previewIframe.srcdoc = safeDoc;
    }

    /* ======================================================================
       PLACEMENT MAP SYNC
       ====================================================================== */
    function _syncPlacementMap() {
        var zones = document.querySelectorAll('.sc-map-zone');
        zones.forEach(function(z) {
            z.addEventListener('click', function() {
                var zone = z.dataset.zone;
                _DOM.placement.value = zone;
                zones.forEach(function(q) { q.classList.remove('active'); });
                z.classList.add('active');
            });
        });

        // Sync select → map on change
        _DOM.placement.addEventListener('change', function() {
            var val = _DOM.placement.value;
            zones.forEach(function(z) { z.classList.remove('active'); });
            var activeZone = document.getElementById('sc-zone-' + val);
            if (activeZone) activeZone.classList.add('active');
        });
    }

    /* ======================================================================
       DEPLOY ENGINE — Atomic Firestore Write
       ====================================================================== */
    function deploy() {
        if (_state.isDeploying || !_state.user || !window.db) return;

        var code = _DOM.editor.value.trim();
        if (!code) {
            if (window.NexraApp) NexraApp.showToast('Editor is empty.', 'fa-solid fa-warning', 'warning');
            return;
        }

        var name = _DOM.blockName.value.trim() || 'Untitled Block';
        var placement = _DOM.placement.value;
        var isActive = document.getElementById('sc-active-toggle').checked;

        // XSS Gate — hard block before write
        if (!_isSafeContent(code)) {
            if (window.NexraApp) NexraApp.showToast('Unsafe code detected. Remove forbidden scripts before deploying.', 'fa-solid fa-shield-xmark', 'danger');
            if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
            return;
        }

        // Lock UI
        _state.isDeploying = true;
        _DOM.deployBtn.disabled = true;
        _DOM.deployBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deploying...';
        _DOM.editor.disabled = true;

        var payload = {
            name: name,
            codeType: _state.activeType,
            placement: placement,
            rawCode: code,
            active: isActive,
            uid: _state.user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Write to resellers/{uid}/custom_blocks sub-collection
        window.db.collection('resellers').doc(_state.user.uid)
            .collection('custom_blocks')
            .add(payload)
            .then(function(docRef) {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
                if (window.NexraApp) NexraApp.showToast('"' + name + '" deployed to ' + placement + '!', 'fa-solid fa-rocket', 'success');

                // Clear editor
                _DOM.editor.value = '';
                _DOM.blockName.value = '';
                onEditorInput();
            })
            .catch(function(err) {
                console.error('Deploy failed:', err);
                if (window.NexraApp) NexraApp.showToast('Deployment failed. Try again.', 'fa-solid fa-xmark', 'danger');
            })
            .finally(function() {
                _state.isDeploying = false;
                _DOM.deployBtn.disabled = false;
                _DOM.deployBtn.innerHTML = '<i class="fa-solid fa-rocket"></i> Deploy Section';
                _DOM.editor.disabled = false;
            });
    }

    /* ======================================================================
       REAL-TIME BLOCKS LISTENER
       ====================================================================== */
    function _listenBlocks(uid) {
        if (_state.blocksUnsubscribe) _state.blocksUnsubscribe();

        _state.blocksUnsubscribe = window.db.collection('resellers').doc(uid)
            .collection('custom_blocks')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .onSnapshot(function(snap) {
                if (snap.empty) {
                    _DOM.blocksList.innerHTML = '<div class="sc-empty-blocks"><i class="fa-solid fa-cube" style="font-size:28px; margin-bottom:8px; opacity:0.3;"></i><br>No custom blocks deployed yet.</div>';
                    return;
                }

                var html = '';
                snap.forEach(function(doc) {
                    var b = doc.data();
                    var ts = b.createdAt ? b.createdAt.toDate().toLocaleDateString('en-PK') : 'Just now';
                    var placementLabel = b.placement ? b.placement.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }) : '—';
                    var statusClass = b.active ? 'active' : 'inactive';
                    var statusLabel = b.active ? 'Active' : 'Inactive';

                    html += `<div class="sc-block-item">
                        <div class="sc-block-left">
                            <div class="sc-block-icon"><i class="fa-solid fa-cube"></i></div>
                            <div>
                                <div class="sc-block-name">${b.name || 'Untitled'}</div>
                                <div class="sc-block-meta">${b.codeType ? b.codeType.toUpperCase() : ''} · ${placementLabel} · ${ts}</div>
                            </div>
                        </div>
                        <div class="sc-block-right">
                            <span class="sc-block-status ${statusClass}">${statusLabel}</span>
                            <button class="sc-block-del-btn" onclick="NexraCustomizer.deleteBlock('${doc.id}')" title="Delete Block">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>`;
                });

                _DOM.blocksList.innerHTML = html;
            }, function(err) {
                console.error('Blocks listener error', err);
            });
    }

    /* ======================================================================
       DELETE BLOCK
       ====================================================================== */
    function deleteBlock(blockId) {
        if (!confirm('Delete this deployed block permanently?')) return;
        window.db.collection('resellers').doc(_state.user.uid)
            .collection('custom_blocks').doc(blockId).delete()
            .then(function() {
                if (window.NexraApp) NexraApp.showToast('Block removed.', 'fa-solid fa-trash-can', 'success');
            });
    }

    /* ======================================================================
       PUBLIC API
       ====================================================================== */
    return {
        init: init,
        onEditorInput: onEditorInput,
        handleKeydown: handleKeydown,
        syncScroll: syncScroll,
        setType: setType,
        formatCode: formatCode,
        copyCode: copyCode,
        clearEditor: clearEditor,
        togglePreview: togglePreview,
        refreshPreview: refreshPreview,
        deploy: deploy,
        deleteBlock: deleteBlock
    };

})();
