/* js/vip-services.js */
window.NexraVIP = {
    db: null,
    auth: null,
    currentUser: null,
    userTier: 'free',

    async init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.verifyTier(user.uid);
            } else {
                window.location.href = '/user/auth-gate.html?redirect=/vip/services.html';
            }
        });
    },

    async verifyTier(uid) {
        try {
            const userDoc = await this.db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                this.userTier = data.tier || 'free';
                
                if (this.userTier === 'VIP' || this.userTier === 'Diamond') {
                    this.unlockPortal();
                } else {
                    this.rejectAccess();
                }
            } else {
                this.rejectAccess();
            }
        } catch (e) {
            console.error("Tier verification failed", e);
            this.rejectAccess();
        }
    },

    rejectAccess() {
        NexraApp.showToast('Access Denied. VIP or Diamond tier required.', 'error');
        setTimeout(() => {
            // Assume vip-tiers.html exists based on prompt
            window.location.href = '/vip-tiers.html'; 
        }, 1500);
    },

    unlockPortal() {
        const guard = document.getElementById('vip-guard');
        guard.style.opacity = '0';
        setTimeout(() => guard.style.display = 'none', 800);
        
        document.getElementById('vip-main').style.display = 'flex';
        this.loadServices();
    },

    async loadServices() {
        const grid = document.getElementById('vs-grid');
        
        try {
            const snapshot = await this.db.collection('vip_services').where('active', '==', true).get();
            
            if (snapshot.empty) {
                grid.innerHTML = '<div style="color:#a1a1aa; text-align:center; padding:40px; width:100%;">No exclusive services currently available. Check back soon.</div>';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const s = doc.data();
                const icon = s.iconBase64 ? `<img src="${s.iconBase64}" style="width:48px; height:48px; margin-bottom:10px;">` : `<i class="fa-solid fa-gem vs-icon"></i>`;
                
                html += `
                    <div class="vs-card">
                        ${icon}
                        <div class="vs-title cinzel-font">${s.title}</div>
                        <div class="vs-desc">${s.description}</div>
                        <button class="vs-btn" onclick="NexraVIP.openModal('${doc.id}', '${s.title.replace(/'/g, "\\'")}')">
                            Request Service
                        </button>
                    </div>
                `;
            });
            grid.innerHTML = html;
            
        } catch(e) {
            console.error("Failed to load VIP services", e);
            grid.innerHTML = '<div style="color:#ef4444; text-align:center; padding:40px; width:100%;">Failed to synchronize with concierge servers.</div>';
        }
    },

    openModal(serviceId, serviceTitle) {
        document.getElementById('vm-service-id').value = serviceId;
        document.getElementById('vm-service-title').innerText = serviceTitle;
        document.getElementById('vm-uid').value = this.currentUser.uid;
        document.getElementById('vm-tier').value = this.userTier;
        document.getElementById('vm-instructions').value = '';
        
        document.getElementById('req-modal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('req-modal').style.display = 'none';
    },

    async submitRequest() {
        const btn = document.getElementById('btn-submit-req');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = 'Processing...';
        btn.classList.add('loading');

        const payload = {
            serviceId: document.getElementById('vm-service-id').value,
            uid: document.getElementById('vm-uid').value,
            tier: document.getElementById('vm-tier').value,
            instructions: document.getElementById('vm-instructions').value,
            priority: 'highest',
            status: 'open',
            type: 'vip_concierge',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await this.db.collection('tickets').add(payload);
            NexraApp.showToast('Priority Request Dispatched. An agent will contact you soon.', 'success');
            this.closeModal();
        } catch (e) {
            console.error(e);
            NexraApp.showToast('Failed to dispatch request. Please contact support.', 'error');
        } finally {
            btn.innerHTML = originalHTML;
            btn.classList.remove('loading');
        }
    }
};
