/* js/admin-ads.js */
window.NexraAdminAds = {
    db: null,
    auth: null,
    uid: null,
    currentReviewId: null,

    async init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(async user => {
            if(user) {
                this.uid = user.uid;
                await this.verifyAdmin();
            } else {
                window.location.href = '/user/auth-gate.html';
            }
        });
    },

    async verifyAdmin() {
        try {
            const doc = await this.db.collection('users').doc(this.uid).get();
            if(doc.exists && doc.data().role === 'admin') {
                document.getElementById('adm-guard').style.display = 'none';
                document.getElementById('adm-main').removeAttribute('hidden');
                this.loadDashboard();
            } else {
                document.getElementById('adm-guard').style.display = 'none';
                document.getElementById('adm-denied').style.display = 'block';
            }
        } catch(e) {
            console.error("Admin verification failed", e);
        }
    },

    loadDashboard() {
        this.listenToKPIs();
        this.listenToPending();
        this.listenToActive();
        this.listenToPlans();
        
        // Background client-side expiry evaluator
        setInterval(() => this.evaluateExpiries(), 60000); // Check every minute
    },

    listenToKPIs() {
        this.db.collection('promotions').onSnapshot(snap => {
            let rev = 0, active = 0, pending = 0;
            snap.forEach(doc => {
                const d = doc.data();
                if(d.status === 'active' || d.status === 'expired') rev += (d.price || 0);
                if(d.status === 'active') active++;
                if(d.status === 'pending') pending++;
            });
            document.getElementById('adm-total-rev').innerText = `Rs. ${rev.toLocaleString()}`;
            document.getElementById('adm-active-camp').innerText = active;
            document.getElementById('adm-pending-camp').innerText = pending;
        });
    },

    listenToPending() {
        this.db.collection('promotions').where('status','==','pending')
            .onSnapshot(snap => {
                const c = document.getElementById('adm-pending-list');
                if(snap.empty) {
                    c.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-300);">No pending requests.</div>';
                    return;
                }
                let html = '';
                snap.forEach(doc => {
                    const d = doc.data();
                    html += `
                        <div class="adm-card">
                            <div class="adm-card-info">
                                <strong>${d.productTitle}</strong>
                                <span>Plan: ${d.planName} | Rs. ${d.price} | Reseller UID: ${d.resellerId.substring(0,6)}...</span>
                            </div>
                            <button class="adm-btn-sm adm-btn-sm-review" onclick="NexraAdminAds.openReview('${doc.id}')">
                                <i class="fa-solid fa-magnifying-glass"></i> Review
                            </button>
                        </div>
                    `;
                });
                c.innerHTML = html;
            });
    },

    listenToPlans() {
        this.db.collection('settings').doc('boost_plans').collection('plans').onSnapshot(snap => {
            const c = document.getElementById('adm-plans-list');
            if(snap.empty) {
                c.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-300);">No plans configured.</div>';
                return;
            }
            let html = '';
            snap.forEach(doc => {
                const d = doc.data();
                html += `
                    <div class="adm-card" style="border-left: 4px solid ${d.active ? '#10b981' : '#ef4444'};">
                        <div class="adm-card-info">
                            <strong>${d.name} (${d.durationHours}h)</strong>
                            <span>Price: Rs. ${d.price} | Badge: ${d.badgeType}</span>
                        </div>
                        <button class="adm-btn-sm adm-btn-sm-edit" onclick="NexraAdminAds.editPlan('${doc.id}', '${d.name}', ${d.durationHours}, ${d.price}, '${d.badgeType}', ${d.active})">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                    </div>
                `;
            });
            c.innerHTML = html;
        });
    },

    listenToActive() {
        this.db.collection('promotions').where('status','in',['active','expired']).onSnapshot(snap => {
            const body = document.getElementById('adm-active-table-body');
            let html = '';
            snap.forEach(doc => {
                const d = doc.data();
                const bclass = d.status === 'active' ? 'ab-active' : 'ab-expired';
                html += `
                    <tr>
                        <td style="font-family:monospace;">${doc.id.substring(0,8)}</td>
                        <td>${d.resellerId.substring(0,6)}...</td>
                        <td>${d.productTitle}</td>
                        <td>
                            <span class="adm-badge ${bclass}">${d.status.toUpperCase()}</span><br>
                            <small style="color:var(--text-300);">${d.promotedUntil ? new Date(d.promotedUntil.toMillis()).toLocaleString() : '-'}</small>
                        </td>
                        <td>Master Catalog</td>
                        <td>
                            ${d.status === 'active' ? `<button class="adm-btn-sm" style="background:rgba(239,68,68,.1);color:var(--danger);" onclick="NexraAdminAds.revokeCampaign('${doc.id}')">Revoke</button>` : '-'}
                        </td>
                    </tr>
                `;
            });
            body.innerHTML = html;
        });
    },

    // Review & Approval Pipeline
    async openReview(promoId) {
        this.currentReviewId = promoId;
        try {
            const doc = await this.db.collection('promotions').doc(promoId).get();
            const d = doc.data();
            
            document.getElementById('adm-review-details').innerHTML = `
                <div style="margin-bottom:8px;"><strong>Product:</strong> ${d.productTitle}</div>
                <div style="margin-bottom:8px;"><strong>Plan:</strong> ${d.planName} (${d.durationHours}h)</div>
                <div style="margin-bottom:8px;"><strong>Amount Paid:</strong> Rs. ${d.price}</div>
                <div><strong>Badge:</strong> ${d.badgeType}</div>
            `;
            document.getElementById('adm-proof-img').src = d.paymentProof;
            document.getElementById('adm-review-modal').style.display = 'flex';
        } catch(e) {
            alert("Error loading proof.");
        }
    },

    async processCampaign(status) {
        if(!this.currentReviewId) return;
        try {
            const promoRef = this.db.collection('promotions').doc(this.currentReviewId);
            const promoSnap = await promoRef.get();
            const pData = promoSnap.data();

            const batch = this.db.batch();

            if(status === 'approved') {
                // Calculate expiry
                const now = new Date();
                const expiry = new Date(now.getTime() + (pData.durationHours * 60 * 60 * 1000));
                
                // Update Promotion Doc
                batch.update(promoRef, {
                    status: 'active',
                    promotedUntil: firebase.firestore.Timestamp.fromDate(expiry)
                });

                // Update Reseller Product Doc (Master Catalog injection)
                const prodRef = this.db.collection(`resellers/${pData.resellerId}/inventory`).doc(pData.productId);
                batch.update(prodRef, {
                    isPromoted: true,
                    promotedUntil: firebase.firestore.Timestamp.fromDate(expiry),
                    promoBadge: pData.badgeType
                });
            } else {
                batch.update(promoRef, { status: 'rejected' });
            }

            await batch.commit();
            alert(`Campaign successfully ${status}.`);
            this.closeModal(null, 'adm-review-modal');
        } catch(e) {
            console.error(e);
            alert("Transaction failed.");
        }
    },

    async revokeCampaign(promoId) {
        if(!confirm("Are you sure you want to revoke this active campaign?")) return;
        try {
            const promoRef = this.db.collection('promotions').doc(promoId);
            const promoSnap = await promoRef.get();
            const pData = promoSnap.data();

            const batch = this.db.batch();
            batch.update(promoRef, { status: 'expired' });

            const prodRef = this.db.collection(`resellers/${pData.resellerId}/inventory`).doc(pData.productId);
            batch.update(prodRef, {
                isPromoted: false,
                promotedUntil: firebase.firestore.FieldValue.delete(),
                promoBadge: firebase.firestore.FieldValue.delete()
            });

            await batch.commit();
        } catch(e) {
            console.error(e);
        }
    },

    // Client-Side Expiry Evaluator
    async evaluateExpiries() {
        try {
            const now = firebase.firestore.Timestamp.now();
            const snap = await this.db.collection('promotions')
                .where('status','==','active')
                .where('promotedUntil','<',now)
                .get();
            
            if(snap.empty) return;

            const batch = this.db.batch();
            snap.forEach(doc => {
                const d = doc.data();
                batch.update(doc.ref, { status: 'expired' });
                const prodRef = this.db.collection(`resellers/${d.resellerId}/inventory`).doc(d.productId);
                batch.update(prodRef, {
                    isPromoted: false,
                    promotedUntil: firebase.firestore.FieldValue.delete(),
                    promoBadge: firebase.firestore.FieldValue.delete()
                });
            });
            await batch.commit();
            console.log(`Evaluated and expired ${snap.size} campaigns.`);
        } catch(e) {
            console.error("Evaluation error", e);
        }
    },

    // Plan Management
    currentPlanId: null,
    openPlanCreator() {
        this.currentPlanId = null;
        document.getElementById('adm-plan-name').value = '';
        document.getElementById('adm-plan-duration').value = '';
        document.getElementById('adm-plan-price').value = '';
        document.getElementById('adm-plan-badge').value = 'Sponsored';
        document.getElementById('adm-plan-active').checked = true;
        document.getElementById('adm-plan-modal').style.display = 'flex';
    },

    editPlan(id, name, duration, price, badge, active) {
        this.currentPlanId = id;
        document.getElementById('adm-plan-name').value = name;
        document.getElementById('adm-plan-duration').value = duration;
        document.getElementById('adm-plan-price').value = price;
        document.getElementById('adm-plan-badge').value = badge;
        document.getElementById('adm-plan-active').checked = active;
        document.getElementById('adm-plan-modal').style.display = 'flex';
    },

    async savePlan() {
        const name = document.getElementById('adm-plan-name').value;
        const dur = parseInt(document.getElementById('adm-plan-duration').value);
        const price = parseInt(document.getElementById('adm-plan-price').value);
        const badge = document.getElementById('adm-plan-badge').value;
        const active = document.getElementById('adm-plan-active').checked;

        if(!name || !dur || isNaN(price)) return alert("Fill all fields correctly");

        const payload = { name, durationHours: dur, price, badgeType: badge, active };

        try {
            const ref = this.db.collection('settings').doc('boost_plans').collection('plans');
            if(this.currentPlanId) {
                await ref.doc(this.currentPlanId).update(payload);
            } else {
                await ref.add(payload);
            }
            this.closeModal(null, 'adm-plan-modal');
        } catch(e) {
            alert("Failed to save plan.");
        }
    },

    closeModal(e, id) {
        if(e && e.target.id !== id) return;
        document.getElementById(id).style.display = 'none';
    }
};
