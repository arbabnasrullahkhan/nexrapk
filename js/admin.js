/**
 * ==========================================================================
 * NEXRA TECH PK — ADMIN PANEL ENGINE (admin.js)
 * ==========================================================================
 * Handles:
 *  - Tab navigation
 *  - Firestore reads/writes (branding, products, announcements)
 *  - Product CRUD
 *  - Orders viewer
 *  - Toast notifications
 */

window.NexraAdmin = {

    currentPage: 'dashboard',
    unsavedChanges: false,

    /* ------------------------------------------------------------------
       TOAST
       ------------------------------------------------------------------ */
    toast: function(msg, icon = 'fa-solid fa-check', color = 'var(--adm-brand)') {
        const el = document.getElementById('adm-toast');
        if (!el) return;
        el.innerHTML = `<i class="${icon}" style="color:${color}"></i> ${msg}`;
        el.style.display = 'flex';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.style.display = 'none', 3200);
    },

    /* ------------------------------------------------------------------
       TAB NAVIGATION
       ------------------------------------------------------------------ */
    showPage: function(pageId) {
        document.querySelectorAll('.adm-page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.adm-nav-item').forEach(n => n.classList.remove('active'));
        const page = document.getElementById('page-' + pageId);
        const nav  = document.querySelector(`.adm-nav-item[data-page="${pageId}"]`);
        if (page) page.classList.add('active');
        if (nav)  nav.classList.add('active');
        const titleEl = document.getElementById('adm-topbar-title');
        if (titleEl) {
            const titles = {
                dashboard: 'Dashboard', branding: 'Branding Settings',
                announce: 'Announcement', products: 'Products',
                orders: 'Orders', settings: 'System Settings'
            };
            titleEl.innerText = titles[pageId] || 'Admin Panel';
        }
        this.currentPage = pageId;
        // Lazy load page data
        if (pageId === 'dashboard') this.loadDashboard();
        if (pageId === 'branding')  this.loadBranding();
        if (pageId === 'products')  this.loadProducts();
        if (pageId === 'orders')    this.loadOrders();
    },

    /* ------------------------------------------------------------------
       MOBILE SIDEBAR
       ------------------------------------------------------------------ */
    toggleSidebar: function() {
        const sb = document.getElementById('adm-sidebar');
        const bd = document.getElementById('adm-backdrop');
        sb.classList.toggle('open');
        bd.classList.toggle('show');
    },
    closeSidebar: function() {
        document.getElementById('adm-sidebar')?.classList.remove('open');
        document.getElementById('adm-backdrop')?.classList.remove('show');
    },

    /* ------------------------------------------------------------------
       DASHBOARD — Load stats from Firestore
       ------------------------------------------------------------------ */
    loadDashboard: async function() {
        if (!window.db) return;
        try {
            // Orders count
            const orders = await window.db.collection('orders').get();
            const el = document.getElementById('stat-orders');
            if (el) el.innerText = orders.size;

            // Products count
            const products = await window.db.collection('products').get();
            const elP = document.getElementById('stat-products');
            if (elP) elP.innerText = products.size;

        } catch(e) {
            console.warn('[Admin] Dashboard stats error:', e);
        }
    },

    /* ------------------------------------------------------------------
       BRANDING — Read/Write to Firestore settings/branding
       ------------------------------------------------------------------ */
    loadBranding: async function() {
        if (!window.db) {
            this.toast('Firestore not connected. Using local values.', 'fa-solid fa-exclamation-triangle', 'var(--adm-warning)');
            return;
        }
        try {
            const doc = await window.db.collection('settings').doc('branding').get();
            if (doc.exists) {
                const d = doc.data();
                const fields = ['siteTitle', 'announcementText', 'announcementLink', 'activeEdition'];
                fields.forEach(f => {
                    const el = document.getElementById('branding-' + f);
                    if (el && d[f]) el.value = d[f];
                });
                // Highlight active edition swatch
                if (d.activeEdition) {
                    document.querySelectorAll('.adm-swatch').forEach(sw => {
                        sw.classList.toggle('selected', sw.dataset.edition === d.activeEdition);
                    });
                }
                // Show logo previews
                if (window.NexraBrand) {
                    window.NexraBrand.activeEdition = d.activeEdition || 'beta';
                    const logoPreview = document.getElementById('branding-logo-preview');
                    if (logoPreview) logoPreview.src = window.NexraBrand.getAsset('logo');
                }
            }
        } catch(e) {
            this.toast('Could not load branding settings.', 'fa-solid fa-xmark', 'var(--adm-danger)');
        }
    },

    saveBranding: async function() {
        const data = {
            siteTitle:        document.getElementById('branding-siteTitle')?.value       || '',
            announcementText: document.getElementById('branding-announcementText')?.value || '',
            announcementLink: document.getElementById('branding-announcementLink')?.value || '',
            activeEdition:    document.getElementById('branding-activeEdition')?.value    || 'beta',
            updatedAt:        new Date().toISOString(),
        };

        if (window.db) {
            try {
                await window.db.collection('settings').doc('branding').set(data, { merge: true });
                this.toast('Branding saved & live across all pages!', 'fa-solid fa-check', 'var(--adm-success)');
            } catch(e) {
                this.toast('Save failed: ' + e.message, 'fa-solid fa-xmark', 'var(--adm-danger)');
            }
        } else {
            // Offline fallback — save to localStorage
            localStorage.setItem('nexra_branding', JSON.stringify(data));
            this.toast('Saved locally (Firebase offline).', 'fa-solid fa-hdd', 'var(--adm-warning)');
        }
    },

    selectEdition: function(edition, el) {
        document.querySelectorAll('.adm-swatch').forEach(sw => sw.classList.remove('selected'));
        el.classList.add('selected');
        const input = document.getElementById('branding-activeEdition');
        if (input) input.value = edition;
        if (window.NexraBrand) {
            window.NexraBrand.switchEdition(edition);
            const logoPreview = document.getElementById('branding-logo-preview');
            if (logoPreview) logoPreview.src = window.NexraBrand.getAsset('logo');
        }
    },

    /* ------------------------------------------------------------------
       PRODUCTS — Firestore CRUD
       ------------------------------------------------------------------ */
    loadProducts: async function() {
        const tbody = document.getElementById('products-tbody');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--adm-text-3);">
            <i class="fa-solid fa-spinner fa-spin"></i> Loading products...
        </td></tr>`;

        if (!window.db) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--adm-text-3);">Firebase not connected.</td></tr>`;
            return;
        }
        try {
            const snap = await window.db.collection('products').orderBy('createdAt', 'desc').get();
            if (snap.empty) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--adm-text-3);">
                    <i class="fa-solid fa-box-open" style="font-size:30px; display:block; margin-bottom:10px;"></i>
                    No products yet. Add your first one!
                </td></tr>`;
                return;
            }
            tbody.innerHTML = snap.docs.map(doc => {
                const d = { id: doc.id, ...doc.data() };
                return `
                <tr>
                    <td><img src="${d.image || ''}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;background:var(--adm-surface);"/></td>
                    <td><div style="font-weight:700;">${d.title || '-'}</div><div style="font-size:11px;color:var(--adm-text-3);">${d.category || ''}</div></td>
                    <td style="font-family:'Space Grotesk';font-weight:800;">Rs. ${(d.price || 0).toLocaleString()}</td>
                    <td><span class="adm-status adm-status-success">Active</span></td>
                    <td style="color:var(--adm-text-2);">${d.sold || 0}</td>
                    <td style="display:flex;gap:8px;align-items:center;">
                        <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="NexraAdmin.openProductModal('${d.id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="NexraAdmin.deleteProduct('${d.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
            }).join('');
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--adm-danger);">Error loading: ${e.message}</td></tr>`;
        }
    },

    openProductModal: function(id = null) {
        const modal = document.getElementById('product-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('pm-id').value = id || '';
            // If editing, load existing data
            if (id && window.db) {
                window.db.collection('products').doc(id).get().then(doc => {
                    if (!doc.exists) return;
                    const d = doc.data();
                    ['title','price','category','image','badge','description'].forEach(f => {
                        const el = document.getElementById('pm-' + f);
                        if (el) el.value = d[f] || '';
                    });
                });
            } else {
                // Clear form
                ['title','price','category','image','badge','description'].forEach(f => {
                    const el = document.getElementById('pm-' + f);
                    if (el) el.value = '';
                });
            }
        }
    },

    closeProductModal: function() {
        const modal = document.getElementById('product-modal');
        if (modal) modal.style.display = 'none';
    },

    saveProduct: async function() {
        const id = document.getElementById('pm-id')?.value;
        const data = {
            title:       document.getElementById('pm-title')?.value || '',
            price:       Number(document.getElementById('pm-price')?.value || 0),
            category:    document.getElementById('pm-category')?.value || '',
            image:       document.getElementById('pm-image')?.value || '',
            badge:       document.getElementById('pm-badge')?.value || '',
            description: document.getElementById('pm-description')?.value || '',
            updatedAt:   new Date().toISOString(),
        };
        if (!data.title) { this.toast('Title is required!', 'fa-solid fa-xmark', 'var(--adm-danger)'); return; }

        if (!window.db) { this.toast('Firebase not connected.', 'fa-solid fa-xmark', 'var(--adm-danger)'); return; }
        try {
            if (id) {
                await window.db.collection('products').doc(id).update(data);
                this.toast('Product updated!', 'fa-solid fa-check', 'var(--adm-success)');
            } else {
                data.createdAt = new Date().toISOString();
                data.sold = 0;
                await window.db.collection('products').add(data);
                this.toast('Product added!', 'fa-solid fa-plus', 'var(--adm-success)');
            }
            this.closeProductModal();
            this.loadProducts();
        } catch(e) {
            this.toast('Error: ' + e.message, 'fa-solid fa-xmark', 'var(--adm-danger)');
        }
    },

    deleteProduct: async function(id) {
        if (!confirm('Delete this product? This cannot be undone.')) return;
        if (!window.db) return;
        try {
            await window.db.collection('products').doc(id).delete();
            this.toast('Product deleted.', 'fa-solid fa-trash', 'var(--adm-danger)');
            this.loadProducts();
        } catch(e) {
            this.toast('Delete failed: ' + e.message, 'fa-solid fa-xmark', 'var(--adm-danger)');
        }
    },

    /* ------------------------------------------------------------------
       ORDERS — View from Firestore
       ------------------------------------------------------------------ */
    loadOrders: async function() {
        const tbody = document.getElementById('orders-tbody');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--adm-text-3);"><i class="fa-solid fa-spinner fa-spin"></i> Loading orders...</td></tr>`;

        if (!window.db) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--adm-text-3);">Firebase not connected.</td></tr>`;
            return;
        }
        try {
            const snap = await window.db.collection('orders').orderBy('createdAt', 'desc').limit(50).get();
            if (snap.empty) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--adm-text-3);"><i class="fa-solid fa-box-open" style="font-size:30px; display:block; margin-bottom:10px;"></i>No orders yet.</td></tr>`;
                return;
            }
            tbody.innerHTML = snap.docs.map(doc => {
                const d = { id: doc.id, ...doc.data() };
                const status = d.status || 'pending';
                const statusClass = status === 'delivered' ? 'adm-status-success' : status === 'pending' ? 'adm-status-warning' : 'adm-status-info';
                return `
                <tr>
                    <td style="font-family:'Space Grotesk'; font-size:11px; color:var(--adm-text-3);">#${d.id.slice(-6).toUpperCase()}</td>
                    <td>${d.customerName || d.email || 'N/A'}</td>
                    <td>${d.productTitle || d.items?.length + ' items' || '-'}</td>
                    <td style="font-family:'Space Grotesk'; font-weight:800;">Rs. ${(d.amount || 0).toLocaleString()}</td>
                    <td><span class="adm-status ${statusClass}">${status}</span></td>
                    <td style="font-size:11px; color:var(--adm-text-3);">${d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '-'}</td>
                </tr>`;
            }).join('');
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--adm-danger);">Error: ${e.message}</td></tr>`;
        }
    },

    /* ------------------------------------------------------------------
       SIGN OUT
       ------------------------------------------------------------------ */
    signOut: function() {
        if (window.auth) {
            window.auth.signOut().then(() => {
                window.location.href = '/admin/login.html';
            });
        } else {
            localStorage.removeItem('nexra_admin_authed');
            window.location.href = '/admin/login.html';
        }
    },

    /* ------------------------------------------------------------------
       INIT
       ------------------------------------------------------------------ */
    init: function() {
        // Check auth
        if (window.auth) {
            window.auth.onAuthStateChanged(user => {
                if (!user) {
                    window.location.href = '/admin/login.html';
                } else {
                    const emailEl = document.getElementById('adm-user-email');
                    if (emailEl) emailEl.innerText = user.email;
                    const avatarEl = document.getElementById('adm-avatar');
                    if (avatarEl) avatarEl.innerText = user.email[0].toUpperCase();
                }
            });
        }
        this.showPage('dashboard');
        this.loadDashboard();
    }
};

document.addEventListener('DOMContentLoaded', () => NexraAdmin.init());
