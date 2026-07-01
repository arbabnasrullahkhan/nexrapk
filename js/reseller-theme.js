/* js/reseller-theme.js */
window.NexraThemeStore = {
    db: null,
    auth: null,
    user: null,
    logoBase64: null,

    init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(user => {
            if (user) {
                this.user = user;
                this.verifyRole(user.uid);
            } else {
                window.location.href = '/user/auth-gate.html?redirect=/reseller/theme-store.html';
            }
        });
    },

    async verifyRole(uid) {
        try {
            const doc = await this.db.collection('users').doc(uid).get();
            if (doc.exists && doc.data().role === 'reseller') {
                document.getElementById('ts-guard').style.display = 'none';
                document.getElementById('ts-main').removeAttribute('hidden');
                
                // Display Live Store Link
                const shortUid = uid.substring(0, 8);
                document.getElementById('ts-store-url').innerText = `https://nexrapk.vercel.app/store/${shortUid}`;

                this.loadExistingData(uid);
                this.loadThemes();
            } else {
                document.getElementById('ts-guard').style.display = 'none';
                document.getElementById('ts-denied').style.display = 'flex';
            }
        } catch(e) {
            console.error(e);
        }
    },

    async loadExistingData(uid) {
        try {
            const doc = await this.db.collection('resellers').doc(uid).get();
            if (doc.exists) {
                const d = doc.data();
                document.getElementById('ts-store-name').value = d.storeName || '';
                document.getElementById('ts-seo-desc').value = d.description || '';
                document.getElementById('ts-whatsapp').value = d.whatsapp || '';
                
                if (d.logoUrl) {
                    this.logoBase64 = d.logoUrl;
                    document.getElementById('ts-logo-img').src = d.logoUrl;
                    document.getElementById('ts-logo-preview').style.display = 'block';
                    document.getElementById('ts-logo-drop').style.display = 'none';
                    document.getElementById('ts-preview-logo').src = d.logoUrl;
                }
                
                document.getElementById('ts-preview-name').innerText = d.storeName || 'Your Store Name';
                document.getElementById('ts-preview-desc').innerText = d.description || 'Store description appears here.';
            }
        } catch(e) {
            console.error(e);
        }
    },

    loadThemes() {
        // Render themes library dynamically
        const grid = document.getElementById('ts-theme-grid');
        const themes = [
            { id: 'neon_dark', name: 'Cyberpunk Neon', desc: 'Dark theme with electric purple highlights.', active: true },
            { id: 'gold_lux', name: 'Imperial Gold', desc: 'Premium gold accents for high-ticket SaaS tools.', active: false },
            { id: 'emerald', name: 'Emerald Clean', desc: 'Clean white background with rich green accents.', active: false }
        ];

        let html = '';
        themes.forEach(t => {
            html += `
                <div class="ts-theme-card ${t.active ? 'active' : ''}">
                    <div class="ts-tc-body">
                        <strong>${t.name}</strong>
                        <p style="font-size:12px; color:var(--text-300); margin-top:4px;">${t.desc}</p>
                    </div>
                    <button class="ts-btn-sm" onclick="NexraThemeStore.activateTheme('${t.id}')">
                        ${t.active ? 'Active' : 'Activate'}
                    </button>
                </div>
            `;
        });
        grid.innerHTML = html;
    },

    async activateTheme(themeId) {
        try {
            await this.db.collection('resellers').doc(this.user.uid).update({
                themeId: themeId
            });
            NexraApp.showToast('Theme updated successfully.', 'success');
            this.loadThemes();
        } catch(e) {
            NexraApp.showToast('Failed to update theme.', 'error');
        }
    },

    processLogo(event) {
        const file = event.target.files[0];
        if(!file) return;

        if(!file.type.startsWith('image/')) {
            return NexraApp.showToast('Only images are allowed.', 'error');
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Max size 200x200
                const MAX = 200;
                let w = img.width;
                let h = img.height;
                const ratio = Math.min(MAX / w, MAX / h);
                canvas.width = w * ratio;
                canvas.height = h * ratio;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                this.logoBase64 = canvas.toDataURL('image/webp', 0.85);

                document.getElementById('ts-logo-img').src = this.logoBase64;
                document.getElementById('ts-logo-preview').style.display = 'block';
                document.getElementById('ts-logo-drop').style.display = 'none';
                
                // Update live preview logo immediately
                document.getElementById('ts-preview-logo').src = this.logoBase64;
                
                NexraApp.showToast('Logo ready!', 'success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    removeLogo() {
        this.logoBase64 = null;
        document.getElementById('ts-logo-preview').style.display = 'none';
        document.getElementById('ts-logo-drop').style.display = 'flex';
        document.getElementById('ts-logo-file').value = '';
        document.getElementById('ts-preview-logo').src = '/assets/placeholder.jpg';
    },

    copyStoreLink() {
        const urlText = document.getElementById('ts-store-url').innerText;
        navigator.clipboard.writeText(urlText).then(() => {
            NexraApp.showToast('Storefront link copied to clipboard!', 'success');
        });
    },

    async saveBranding() {
        const storeName = document.getElementById('ts-store-name').value.trim();
        const desc = document.getElementById('ts-seo-desc').value.trim();
        const whatsapp = document.getElementById('ts-whatsapp').value.trim();

        if(!storeName) {
            return NexraApp.showToast('Store name is required.', 'error');
        }

        const btn = document.getElementById('ts-save-brand-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            await this.db.collection('resellers').doc(this.user.uid).set({
                storeName: storeName,
                description: desc,
                whatsapp: whatsapp,
                logoUrl: this.logoBase64,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            document.getElementById('ts-preview-name').innerText = storeName;
            document.getElementById('ts-preview-desc').innerText = desc;

            NexraApp.showToast('Branding saved successfully!', 'success');
        } catch(e) {
            console.error(e);
            NexraApp.showToast('Failed to save branding.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Branding';
        }
    }
};
