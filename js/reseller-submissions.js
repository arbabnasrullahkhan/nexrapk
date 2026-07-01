/* js/reseller-submissions.js */
window.NexraSubmissions = {
    db: null,
    auth: null,
    user: null,
    coverBase64: null,
    selectedType: null,
    currentStep: 1,

    init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(user => {
            if (user) {
                this.user = user;
                this.verifyRole(user.uid);
            } else {
                window.location.href = '/user/auth-gate.html?redirect=/reseller/submissions.html';
            }
        });
    },

    async verifyRole(uid) {
        try {
            const doc = await this.db.collection('users').doc(uid).get();
            if (doc.exists && doc.data().role === 'reseller') {
                document.getElementById('ts-guard').style.display = 'none';
                document.getElementById('ts-main').removeAttribute('hidden');
                this.loadMySubmissions();
            } else {
                document.getElementById('ts-guard').style.display = 'none';
                document.getElementById('ts-denied').style.display = 'flex';
            }
        } catch(e) {
            console.error(e);
        }
    },

    selectType(type, element) {
        this.selectedType = type;
        document.querySelectorAll('.sub-type-card').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');
        
        document.getElementById('sub-next-1').removeAttribute('disabled');
    },

    goToStep(step) {
        // Validation before proceeding
        if (step === 2 && !this.selectedType) {
            return NexraApp.showToast('Please select a submission type.', 'error');
        }
        if (step === 3) {
            const title = document.getElementById('sub-title').value.trim();
            const desc = document.getElementById('sub-desc-editor').innerHTML.trim();
            if (!title || !desc || desc === '<br>') {
                return NexraApp.showToast('Title and Description are required.', 'error');
            }
        }
        if (step === 4) {
            if (!this.coverBase64) {
                return NexraApp.showToast('Please upload a cover image.', 'error');
            }
            this.renderReviewSummary();
        }

        // Switch panels
        for (let i = 1; i <= 4; i++) {
            document.getElementById(`sub-panel-${i}`).style.display = (i === step) ? 'block' : 'none';
        }
        this.currentStep = step;
    },

    richFormat(command) {
        document.execCommand(command, false, null);
        document.getElementById('sub-desc-editor').focus();
    },

    processCover(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            return NexraApp.showToast('Only image files are allowed.', 'error');
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Scale to responsive dimensions (max 800px width)
                const MAX_W = 800;
                let w = img.width;
                let h = img.height;
                if (w > MAX_W) {
                    h = Math.floor((MAX_W / w) * h);
                    w = MAX_W;
                }
                
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                
                // Add brand watermark overlay
                ctx.save();
                ctx.font = 'bold 20px "Space Grotesk", sans-serif';
                ctx.fillStyle = 'rgba(255, 74, 23, 0.6)'; // Brand main orange semi-transparent
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 4;
                ctx.fillText('NEXRA PARTNER SECURE UPLOAD', 20, h - 20);
                ctx.restore();

                this.coverBase64 = canvas.toDataURL('image/jpeg', 0.8);
                
                document.getElementById('sub-cover-img').src = this.coverBase64;
                document.getElementById('sub-cover-preview').style.display = 'block';
                document.getElementById('sub-cover-drop').style.display = 'none';
                
                NexraApp.showToast('Cover image compressed and watermarked.', 'success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    removeCover() {
        this.coverBase64 = null;
        document.getElementById('sub-cover-preview').style.display = 'none';
        document.getElementById('sub-cover-drop').style.display = 'flex';
        document.getElementById('sub-cover-file').value = '';
    },

    renderReviewSummary() {
        const title = document.getElementById('sub-title').value.trim();
        const typeName = this.selectedType.toUpperCase();
        
        document.getElementById('sub-review-summary').innerHTML = `
            <div style="text-align:left; display:flex; flex-direction:column; gap:16px;">
                <div style="text-align:center;">
                    <img src="${this.coverBase64}" style="max-width:100%; max-height:200px; border-radius:12px; border:1px solid var(--glass-border);">
                </div>
                <div><strong>Submission Type:</strong> <span class="badge" style="background:var(--brand-main);color:#fff;">${typeName}</span></div>
                <div><strong>Title:</strong> ${title}</div>
                <div><strong>Description:</strong></div>
                <div style="background:var(--bg-elevated); padding:16px; border-radius:8px; font-size:14px; max-height:150px; overflow-y:auto; border:1px solid var(--glass-border);">
                    ${document.getElementById('sub-desc-editor').innerHTML}
                </div>
            </div>
        `;
    },

    async publish() {
        const title = document.getElementById('sub-title').value.trim();
        const desc = document.getElementById('sub-desc-editor').innerHTML.trim();
        const btn = document.getElementById('sub-publish-btn');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        const payload = {
            type: this.selectedType,
            title: title,
            description: desc,
            coverImage: this.coverBase64,
            status: 'pending',
            resellerId: this.user.uid,
            resellerName: this.user.displayName || 'Nexra Partner',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await this.db.collection('submissions').add(payload);
            
            NexraApp.showToast('Submission uploaded for verification!', 'success');
            
            // Reset wizard
            document.getElementById('sub-title').value = '';
            document.getElementById('sub-desc-editor').innerHTML = '';
            this.removeCover();
            this.selectedType = null;
            document.querySelectorAll('.sub-type-card').forEach(el => el.classList.remove('active'));
            document.getElementById('sub-next-1').setAttribute('disabled', '');
            this.goToStep(1);

            this.loadMySubmissions();
        } catch(e) {
            console.error(e);
            NexraApp.showToast('Submission upload failed.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rocket"></i> Submit for Review';
        }
    },

    async loadMySubmissions() {
        const container = document.getElementById('sub-submissions-grid');
        try {
            const snap = await this.db.collection('submissions')
                .where('resellerId', '==', this.user.uid)
                .get();
            
            if (snap.empty) {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-300);"><i class="fa-solid fa-folder-open" style="font-size:32px;margin-bottom:12px;opacity:0.5;"></i><p>No submissions found.</p></div>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const d = doc.data();
                let statusBadge = `<span class="badge" style="background:#fbbf24;color:#000;">PENDING</span>`;
                if(d.status === 'approved') statusBadge = `<span class="badge" style="background:#10b981;color:#fff;">APPROVED</span>`;
                if(d.status === 'rejected') statusBadge = `<span class="badge" style="background:#ef4444;color:#fff;">REJECTED</span>`;

                html += `
                    <div class="sub-card">
                        <div class="sub-card-header">
                            <img src="${d.coverImage}" class="sub-card-img" alt="cover">
                            <div class="sub-card-badge">${d.type.toUpperCase()}</div>
                        </div>
                        <div class="sub-card-body" style="padding:16px;">
                            <h3 class="tech-font" style="font-size:16px; margin-bottom:8px; color:var(--text-100);">${d.title}</h3>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                                ${statusBadge}
                                <small style="color:var(--text-300);">${d.createdAt ? new Date(d.createdAt.toMillis()).toLocaleDateString() : 'Just now'}</small>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch(e) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--danger);">Failed to load submissions.</div>';
        }
    }
};
