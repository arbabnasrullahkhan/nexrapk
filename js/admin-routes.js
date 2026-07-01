/* js/admin-routes.js */
window.NexraRoutesAdmin = {
    db: null,
    auth: null,
    SUPER_ADMIN_UID: 'AvwpDXKLJHcivs6pyZKmxCmV6zA3',
    routesData: {},

    async init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(user => {
            if (user) {
                if (user.uid === this.SUPER_ADMIN_UID) {
                    this.unlockEngine();
                } else {
                    this.lockdown('UNAUTHORIZED_ACCESS_LEVEL');
                }
            } else {
                window.location.href = '/user/auth-gate.html?redirect=/admin/route-manager.html';
            }
        });
    },

    lockdown(reason) {
        document.getElementById('admin-guard').innerHTML = `
            <i class="fa-solid fa-skull fa-beat" style="font-size:64px; color:#ef4444; margin-bottom:20px;"></i>
            <h2 class="tech-font" style="color:#fff;">ACCESS DENIED</h2>
            <p style="color:#ef4444;">${reason}</p>
        `;
        this.auth.signOut().then(() => {
            setTimeout(() => window.location.href = '/', 2000);
        });
    },

    async unlockEngine() {
        document.getElementById('admin-id-badge').innerText = 'SECURE CONNECTION';
        document.getElementById('admin-id-badge').className = 'badge-secure';
        
        const guard = document.getElementById('admin-guard');
        guard.style.opacity = '0';
        setTimeout(() => guard.style.display = 'none', 500);
        
        document.getElementById('admin-main').style.display = 'flex';
        this.listenRoutes();
    },

    listenRoutes() {
        this.db.collection('settings').doc('routes').onSnapshot(doc => {
            if (doc.exists) {
                this.routesData = doc.data() || {};
                this.renderTable();
            } else {
                this.routesData = {};
                this.renderTable();
            }
        });
    },

    renderTable() {
        const tbody = document.getElementById('routes-tbody');
        const keys = Object.keys(this.routesData);
        
        if(keys.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:40px;">No routes configured yet.</td></tr>`;
            return;
        }

        let html = '';
        keys.forEach(key => {
            const r = this.routesData[key];
            const statusClass = r.isActive === false ? 'inactive' : 'active';
            
            let badges = '';
            if(r.menuHeader) badges += `<span class="rm-badge">Header</span>`;
            if(r.menuDock) badges += `<span class="rm-badge">Dock</span>`;
            if(r.menuSlider) badges += `<span class="rm-badge">Off-Canvas</span>`;

            html += `
                <tr>
                    <td><div class="r-status ${statusClass}" title="${statusClass}"></div></td>
                    <td><span class="r-code">${key}</span></td>
                    <td>${r.path}</td>
                    <td><div class="r-menu-badges">${badges || '<span style="color:#64748b; font-size:12px;">Hidden</span>'}</div></td>
                    <td>
                        <div class="r-actions">
                            <button class="ra-btn" onclick="NexraRoutesAdmin.editRoute('${key}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button class="ra-btn delete" onclick="NexraRoutesAdmin.deleteRoute('${key}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    openRouteModal() {
        document.getElementById('route-form').reset();
        document.getElementById('r-doc-id').value = '';
        document.getElementById('r-key').readOnly = false;
        document.getElementById('modal-title').innerText = 'Create Route';
        document.getElementById('route-modal').style.display = 'flex';
    },

    closeRouteModal() {
        document.getElementById('route-modal').style.display = 'none';
    },

    editRoute(key) {
        const r = this.routesData[key];
        if(!r) return;

        document.getElementById('r-doc-id').value = key;
        document.getElementById('r-key').value = key;
        document.getElementById('r-key').readOnly = true; // Prevent changing key on edit for simplicity
        document.getElementById('r-path').value = r.path || '';
        
        document.getElementById('r-seo-title').value = r.seoTitle || '';
        document.getElementById('r-seo-desc').value = r.seoDesc || '';
        document.getElementById('r-seo-img').value = r.seoImg || '';
        document.getElementById('r-icon').value = r.icon || '';
        
        document.getElementById('r-menu-header').checked = r.menuHeader || false;
        document.getElementById('r-menu-dock').checked = r.menuDock || false;
        document.getElementById('r-menu-slider').checked = r.menuSlider || false;
        document.getElementById('r-is-active').checked = r.isActive !== false;

        document.getElementById('modal-title').innerText = 'Edit Route';
        document.getElementById('route-modal').style.display = 'flex';
    },

    async saveRoute() {
        const btn = document.getElementById('btn-save-route');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
        btn.disabled = true;

        const key = document.getElementById('r-key').value.trim();
        const payload = {
            path: document.getElementById('r-path').value.trim(),
            seoTitle: document.getElementById('r-seo-title').value.trim(),
            seoDesc: document.getElementById('r-seo-desc').value.trim(),
            seoImg: document.getElementById('r-seo-img').value.trim(),
            icon: document.getElementById('r-icon').value.trim(),
            menuHeader: document.getElementById('r-menu-header').checked,
            menuDock: document.getElementById('r-menu-dock').checked,
            menuSlider: document.getElementById('r-menu-slider').checked,
            isActive: document.getElementById('r-is-active').checked,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await this.db.collection('settings').doc('routes').set({
                [key]: payload
            }, { merge: true });
            
            NexraApp.showToast(`Route '${key}' saved securely.`, 'success');
            this.closeRouteModal();
        } catch(e) {
            console.error(e);
            NexraApp.showToast('Failed to save route', 'error');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    },

    async deleteRoute(key) {
        if(!confirm(`Are you sure you want to delete route '${key}'? This may break navigation.`)) return;

        try {
            await this.db.collection('settings').doc('routes').update({
                [key]: firebase.firestore.FieldValue.delete()
            });
            NexraApp.showToast(`Route deleted.`, 'success');
        } catch(e) {
            NexraApp.showToast('Failed to delete route', 'error');
        }
    }
};
