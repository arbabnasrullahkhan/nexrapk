/* js/reseller-promotions.js */
window.NexraPromotions = {
    db: null,
    auth: null,
    uid: null,
    currentStep: 1,
    selectedProduct: null,
    selectedPlan: null,
    proofBase64: null,
    plans: [],

    async init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(async user => {
            if(user) {
                this.uid = user.uid;
                await this.verifyReseller();
            } else {
                window.location.href = '/reseller/auth-gate.html';
            }
        });
    },

    async verifyReseller() {
        try {
            const doc = await this.db.collection('resellers').doc(this.uid).get();
            if(doc.exists && doc.data().status === 'active') {
                document.getElementById('promo-guard').style.display = 'none';
                document.getElementById('promo-main').removeAttribute('hidden');
                this.loadDashboard();
            } else {
                document.getElementById('promo-guard').style.display = 'none';
                document.getElementById('promo-denied').style.display = 'block';
            }
        } catch(e) {
            NexraApp.showToast('Authentication error','error');
        }
    },

    async loadDashboard() {
        this.loadKPIs();
        this.loadCampaigns();
    },

    loadKPIs() {
        // Real-time listener for campaigns to aggregate stats
        this.db.collection('promotions').where('resellerId','==',this.uid)
            .onSnapshot(snap => {
                let active = 0, spent = 0, clicks = 0, impressions = 0;
                
                snap.forEach(doc => {
                    const d = doc.data();
                    if(d.status === 'active') active++;
                    if(d.status === 'active' || d.status === 'expired') spent += d.price || 0;
                    clicks += d.clicks || 0;
                    impressions += d.impressions || 0;
                });

                document.getElementById('promo-kpi-grid').innerHTML = `
                    <div class="promo-kpi-card">
                        <div class="promo-kpi-value">${active}</div>
                        <div class="promo-kpi-label">Active Campaigns</div>
                    </div>
                    <div class="promo-kpi-card">
                        <div class="promo-kpi-value">Rs. ${spent}</div>
                        <div class="promo-kpi-label">Total Spent</div>
                    </div>
                    <div class="promo-kpi-card">
                        <div class="promo-kpi-value">${impressions}</div>
                        <div class="promo-kpi-label">Impressions</div>
                    </div>
                    <div class="promo-kpi-card">
                        <div class="promo-kpi-value">${clicks}</div>
                        <div class="promo-kpi-label">Total Clicks</div>
                    </div>
                `;

                this.renderChart(impressions, clicks);
            });
    },

    renderChart(imp, clicks) {
        // Simulated graph mapping based on totals
        const bars = document.getElementById('promo-chart-bars');
        bars.innerHTML = '';
        for(let i=0; i<7; i++) {
            const h = Math.floor(Math.random() * 60) + 20; // 20% to 80%
            bars.innerHTML += `
                <div class="promo-bar-group">
                    <div class="promo-bar" style="height:${h}%;">
                        <div class="promo-bar-tooltip">Day ${i+1}</div>
                    </div>
                </div>
            `;
        }
    },

    loadCampaigns() {
        this.db.collection('promotions').where('resellerId','==',this.uid)
            .orderBy('createdAt','desc').onSnapshot(snap => {
                let activeHTML = '', pastHTML = '';
                
                if(snap.empty) {
                    activeHTML = `<div style="text-align:center; padding:20px; color:var(--text-300);">No active campaigns.</div>`;
                    pastHTML = activeHTML;
                } else {
                    snap.forEach(doc => {
                        const d = doc.data();
                        const html = this.buildCampaignCard(d);
                        if(d.status === 'active' || d.status === 'pending') {
                            activeHTML += html;
                        } else {
                            pastHTML += html;
                        }
                    });
                    if(!activeHTML) activeHTML = `<div style="text-align:center; padding:20px; color:var(--text-300);">No active campaigns.</div>`;
                    if(!pastHTML) pastHTML = `<div style="text-align:center; padding:20px; color:var(--text-300);">No history.</div>`;
                }

                document.getElementById('promo-list-active').innerHTML = activeHTML;
                document.getElementById('promo-list-past').innerHTML = pastHTML;
            });
    },

    buildCampaignCard(data) {
        let badgeClass = 'pb-pending';
        if(data.status === 'active') badgeClass = 'pb-active';
        if(data.status === 'expired' || data.status === 'rejected') badgeClass = 'pb-expired';

        const dateStr = new Date(data.createdAt.toMillis()).toLocaleDateString();

        return `
            <div class="promo-camp-card">
                <div class="promo-camp-info">
                    <strong>${data.productTitle || 'Product Promotion'}</strong>
                    <span>Plan: ${data.planName} | Started: ${dateStr}</span>
                </div>
                <div style="display:flex; align-items:center; gap:14px;">
                    <span class="promo-badge ${badgeClass}">${data.status.toUpperCase()}</span>
                    ${data.status === 'active' ? `<button onclick="NexraPromotions.showPreview('${data.badgeType}', '${data.productTitle}', ${data.productPrice})" style="background:transparent;border:none;color:var(--brand-main);cursor:pointer;"><i class="fa-solid fa-eye"></i></button>` : ''}
                </div>
            </div>
        `;
    },

    switchTab(tab, btn) {
        document.querySelectorAll('.promo-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('promo-list-active').style.display = tab === 'active' ? 'flex' : 'none';
        document.getElementById('promo-list-past').style.display = tab === 'past' ? 'flex' : 'none';
    },

    // Builder Flow
    async openCampaignBuilder() {
        this.currentStep = 1;
        this.selectedProduct = null;
        this.selectedPlan = null;
        this.proofBase64 = null;
        
        // Reset UI
        document.querySelectorAll('.promo-step').forEach(s => s.style.display='none');
        document.getElementById('promo-step-1').style.display = 'block';
        document.getElementById('promo-proof-preview').style.display = 'none';
        document.getElementById('promo-proof-drop').style.display = 'block';
        document.getElementById('promo-submit-btn').disabled = true;
        document.getElementById('btn-next-3').disabled = true;
        
        // Load reseller inventory
        const select = document.getElementById('promo-product-select');
        select.innerHTML = '<option value="">Loading products...</option>';
        
        try {
            const snap = await this.db.collection(`resellers/${this.uid}/inventory`).get();
            if(snap.empty) {
                select.innerHTML = '<option value="">No custom products found. Add products first.</option>';
            } else {
                let opts = '<option value="">-- Select a Product --</option>';
                snap.forEach(doc => {
                    const d = doc.data();
                    opts += `<option value="${doc.id}" data-title="${d.title}" data-price="${d.price}">
                        ${d.title} (Rs. ${d.price})
                    </option>`;
                });
                select.innerHTML = opts;
            }
        } catch(e) {
            select.innerHTML = '<option value="">Error loading products.</option>';
        }

        // Load Plans from settings
        const plansGrid = document.getElementById('promo-plans-grid');
        try {
            const planSnap = await this.db.collection('settings').doc('boost_plans').collection('plans').where('active','==',true).get();
            this.plans = [];
            let planHTML = '';
            planSnap.forEach(doc => {
                const d = doc.data();
                d.id = doc.id;
                this.plans.push(d);
                planHTML += `
                    <div class="promo-plan-card" id="plan-${d.id}" onclick="NexraPromotions.selectPlan('${d.id}')">
                        <div>
                            <div class="promo-plan-duration">${d.name}</div>
                            <div style="font-size:12px; color:var(--text-300);">Badge: ${d.badgeType}</div>
                        </div>
                        <div class="promo-plan-price">Rs. ${d.price}</div>
                    </div>
                `;
            });
            plansGrid.innerHTML = planHTML || '<div style="color:var(--text-300); font-size:13px;">No plans available.</div>';
        } catch(e) {
            plansGrid.innerHTML = '<div style="color:var(--danger); font-size:13px;">Error loading plans.</div>';
        }

        document.getElementById('promo-builder-modal').style.display = 'flex';
    },

    nextStep(step) {
        if(step === 2) {
            const select = document.getElementById('promo-product-select');
            if(!select.value) return NexraApp.showToast('Please select a product','error');
            const opt = select.options[select.selectedIndex];
            this.selectedProduct = {
                id: select.value,
                title: opt.getAttribute('data-title'),
                price: parseFloat(opt.getAttribute('data-price'))
            };
        }
        if(step === 3) {
            if(!this.selectedPlan) return NexraApp.showToast('Please select a plan','error');
            
            // Build Review
            document.getElementById('promo-review-summary').innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span>Product:</span> <strong>${this.selectedProduct.title}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span>Plan:</span> <strong>${this.selectedPlan.name}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span>Amount to Pay:</span> <strong style="color:var(--brand-main); font-size:15px;">Rs. ${this.selectedPlan.price}</strong>
                </div>
            `;
            
            // Fetch Payment accounts
            this.db.collection('settings').doc('payments').get().then(doc => {
                if(doc.exists) {
                    const pd = doc.data();
                    let html = `<strong>Transfer Rs. ${this.selectedPlan.price} to:</strong><br><br>`;
                    if(pd.easypaisa_number) html += `EasyPaisa: ${pd.easypaisa_number} (${pd.easypaisa_name})<br>`;
                    if(pd.bank_account) html += `Bank: ${pd.bank_name} - ${pd.bank_account} (${pd.bank_title})`;
                    document.getElementById('promo-payment-instructions').innerHTML = html || 'No payment accounts configured.';
                }
            });
        }

        document.querySelectorAll('.promo-step').forEach(s => s.style.display='none');
        document.getElementById(`promo-step-${step}`).style.display = 'block';
        this.currentStep = step;
    },

    selectPlan(planId) {
        document.querySelectorAll('.promo-plan-card').forEach(c => c.classList.remove('selected'));
        document.getElementById(`plan-${planId}`).classList.add('selected');
        this.selectedPlan = this.plans.find(p => p.id === planId);
        document.getElementById('btn-next-3').disabled = false;
    },

    processProof(e) {
        const file = e.target.files[0];
        if(!file) return;
        if(file.size > 2 * 1024 * 1024) return NexraApp.showToast('Proof image must be under 2MB','error');

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const cvs = document.getElementById('promo-canvas');
                const ctx = cvs.getContext('2d');
                cvs.width = img.width;
                cvs.height = img.height;
                ctx.drawImage(img, 0, 0);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = '20px sans-serif';
                ctx.fillText('Nexra Boost Proof', 20, 30);
                
                this.proofBase64 = cvs.toDataURL('image/jpeg', 0.8);
                document.getElementById('promo-proof-img').src = this.proofBase64;
                document.getElementById('promo-proof-drop').style.display = 'none';
                document.getElementById('promo-proof-preview').style.display = 'block';
                document.getElementById('promo-submit-btn').disabled = false;
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    },

    removeProof() {
        this.proofBase64 = null;
        document.getElementById('promo-proof-file').value = '';
        document.getElementById('promo-proof-img').src = '';
        document.getElementById('promo-proof-preview').style.display = 'none';
        document.getElementById('promo-proof-drop').style.display = 'block';
        document.getElementById('promo-submit-btn').disabled = true;
    },

    async submitCampaign() {
        if(!this.selectedProduct || !this.selectedPlan || !this.proofBase64) return;
        const btn = document.getElementById('promo-submit-btn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        btn.disabled = true;

        try {
            await this.db.collection('promotions').add({
                resellerId: this.uid,
                productId: this.selectedProduct.id,
                productTitle: this.selectedProduct.title,
                productPrice: this.selectedProduct.price,
                planId: this.selectedPlan.id,
                planName: this.selectedPlan.name,
                price: this.selectedPlan.price,
                durationHours: this.selectedPlan.durationHours,
                badgeType: this.selectedPlan.badgeType,
                paymentProof: this.proofBase64,
                status: 'pending',
                clicks: 0,
                impressions: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            NexraApp.showToast('Boost requested! Awaiting admin approval.','success');
            this.closeBuilder();
        } catch(e) {
            NexraApp.showToast('Failed to submit request','error');
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Request';
            btn.disabled = false;
        }
    },

    closeBuilder(e) {
        if(e && e.target.id !== 'promo-builder-modal') return;
        document.getElementById('promo-builder-modal').style.display = 'none';
    },

    // Preview Matrix
    showPreview(badge, title, price) {
        document.querySelector('.promo-preview-badge').innerHTML = `<i class="fa-solid fa-bolt"></i> ${badge}`;
        document.getElementById('pp-title').innerText = title;
        document.getElementById('pp-price').innerText = `Rs. ${price}`;
        document.getElementById('promo-preview-modal').style.display = 'flex';
    },
    
    closePreview(e) {
        if(e && e.target.id !== 'promo-preview-modal') return;
        document.getElementById('promo-preview-modal').style.display = 'none';
    }
};
