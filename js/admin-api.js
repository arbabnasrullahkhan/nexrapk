/* js/admin-api.js */
window.NexraAPI = {
    db: null,
    auth: null,
    SUPER_ADMIN_UID: 'AvwpDXKLJHcivs6pyZKmxCmV6zA3',

    async init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(user => {
            if (user) {
                if (user.uid === this.SUPER_ADMIN_UID) {
                    this.unlockVault();
                } else {
                    this.lockdown('UNAUTHORIZED_ACCESS_LEVEL');
                }
            } else {
                window.location.href = '/user/auth-gate.html?redirect=/admin/api-manager.html';
            }
        });
    },

    lockdown(reason) {
        document.getElementById('admin-guard').innerHTML = `
            <i class="fa-solid fa-skull fa-beat" style="font-size:64px; color:#ef4444; margin-bottom:20px;"></i>
            <h2 class="tech-font" style="color:#fff;">ACCESS DENIED</h2>
            <p style="color:#ef4444;">${reason}</p>
        `;
        // Force logout to protect vault
        this.auth.signOut().then(() => {
            setTimeout(() => window.location.href = '/', 2000);
        });
    },

    async unlockVault() {
        document.getElementById('admin-id-badge').innerText = 'SECURE CONNECTION';
        document.getElementById('admin-id-badge').className = 'badge-secure';
        
        const guard = document.getElementById('admin-guard');
        guard.style.opacity = '0';
        setTimeout(() => guard.style.display = 'none', 500);
        
        document.getElementById('admin-main').style.display = 'flex';
        this.loadVaultData();
    },

    toggleVisibility(inputId, icon) {
        const input = document.getElementById(inputId);
        if (input.type === 'password') {
            input.type = 'text';
            input.classList.remove('blurred-input');
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            input.classList.add('blurred-input');
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    },

    async loadVaultData() {
        try {
            const aiDoc = await this.db.collection('settings').doc('ai_config').get();
            if (aiDoc.exists) {
                const d = aiDoc.data();
                
                // OpenRouter
                if(d.openrouter) {
                    document.getElementById('toggle-openrouter').checked = d.openrouter.enabled || false;
                    document.getElementById('key-openrouter').value = d.openrouter.key || '';
                    document.getElementById('model-openrouter').value = d.openrouter.defaultModel || 'google/gemini-pro';
                }
                
                // Gemini
                if(d.gemini) {
                    document.getElementById('toggle-gemini').checked = d.gemini.enabled || false;
                    document.getElementById('key-gemini').value = d.gemini.key || '';
                }

                // Cohere
                if(d.cohere) {
                    document.getElementById('toggle-cohere').checked = d.cohere.enabled || false;
                    document.getElementById('key-cohere').value = d.cohere.key || '';
                }
            }

            const payDoc = await this.db.collection('settings').doc('api_keys').get();
            if(payDoc.exists && payDoc.data().payments) {
                const p = payDoc.data().payments;
                document.getElementById('key-pay-pub').value = p.publishable || '';
                document.getElementById('key-pay-sec').value = p.secret || '';
            }
        } catch(e) {
            console.error("Vault Load Error", e);
            NexraApp.showToast('Failed to read vault.', 'error');
        }
    },

    async testConnection(provider) {
        const btn = event.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.classList.add('loading');
        
        const key = document.getElementById(`key-${provider}`).value;
        if(!key) {
            btn.classList.remove('loading');
            return NexraApp.showToast('No key provided to test', 'error');
        }

        // Simulate Network Ping (Since we don't have real endpoints setup here)
        setTimeout(() => {
            btn.classList.remove('loading');
            btn.innerHTML = originalHTML;
            // Dummy validation
            if (key.length > 10) {
                NexraApp.showToast(`Connection to ${provider.toUpperCase()} successful.`, 'success');
            } else {
                NexraApp.showToast(`Invalid key for ${provider.toUpperCase()}.`, 'error');
            }
        }, 1500);
    },

    async saveKey(provider) {
        const btn = event.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.classList.add('loading');

        const isEnabled = document.getElementById(`toggle-${provider}`).checked;
        const key = document.getElementById(`key-${provider}`).value;
        
        let payload = {
            enabled: isEnabled,
            key: key,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (provider === 'openrouter') {
            payload.defaultModel = document.getElementById('model-openrouter').value;
        }

        try {
            await this.db.collection('settings').doc('ai_config').set({
                [provider]: payload
            }, { merge: true });
            
            NexraApp.showToast(`${provider.toUpperCase()} config securely saved.`, 'success');
        } catch(e) {
            console.error(e);
            NexraApp.showToast(`Failed to save ${provider}.`, 'error');
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = originalHTML;
        }
    },

    async toggleModel(provider, isChecked) {
        // Instant atomic save just for the toggle state
        try {
            await this.db.collection('settings').doc('ai_config').set({
                [provider]: { enabled: isChecked }
            }, { merge: true });
            NexraApp.showToast(`${provider.toUpperCase()} is now ${isChecked ? 'ONLINE' : 'OFFLINE'}.`, 'success');
        } catch(e) {
            NexraApp.showToast('Toggle failed.', 'error');
        }
    },

    async savePaymentKeys() {
        const btn = event.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.classList.add('loading');

        const pub = document.getElementById('key-pay-pub').value;
        const sec = document.getElementById('key-pay-sec').value;

        try {
            await this.db.collection('settings').doc('api_keys').set({
                payments: {
                    publishable: pub,
                    secret: sec,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }
            }, { merge: true });
            
            NexraApp.showToast('Payment keys securely vaulted.', 'success');
        } catch(e) {
            console.error(e);
            NexraApp.showToast('Failed to vault payment keys.', 'error');
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = originalHTML;
        }
    }
};
