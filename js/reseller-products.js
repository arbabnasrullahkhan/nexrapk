/* js/reseller-products.js */
window.NexraProducts = {
    db: null,
    auth: null,
    user: null,
    activeTab: 'custom',
    productImages: [null, null, null],
    selectedCatalogProduct: null,

    init() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        
        this.auth.onAuthStateChanged(user => {
            if (user) {
                this.user = user;
                this.verifyRole(user.uid);
            } else {
                window.location.href = '/user/auth-gate.html?redirect=/reseller/product-manager.html';
            }
        });
    },

    async verifyRole(uid) {
        try {
            const doc = await this.db.collection('users').doc(uid).get();
            if (doc.exists && doc.data().role === 'reseller') {
                document.getElementById('ts-guard').style.display = 'none';
                document.getElementById('ts-main').removeAttribute('hidden');
                
                this.loadMyInventory();
                this.loadCatalog();
            } else {
                document.getElementById('ts-guard').style.display = 'none';
                document.getElementById('ts-denied').style.display = 'flex';
            }
        } catch(e) {
            console.error(e);
        }
    },

    switchTab(tab, element) {
        this.activeTab = tab;
        document.querySelectorAll('.rp-tab').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');

        document.getElementById('rp-custom-section').style.display = (tab === 'custom') ? 'block' : 'none';
        document.getElementById('rp-catalog-section').style.display = (tab === 'catalog') ? 'block' : 'none';
    },

    processImage(event, index) {
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
                
                const MAX = 400;
                let w = img.width;
                let h = img.height;
                const ratio = Math.min(MAX / w, MAX / h);
                canvas.width = w * ratio;
                canvas.height = h * ratio;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const base64 = canvas.toDataURL('image/webp', 0.8);

                this.productImages[index] = base64;
                
                // Show preview immediately
                const slot = document.getElementById(`rp-file-${index}`).parentNode;
                slot.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
                
                NexraApp.showToast('Image uploaded and optimized.', 'success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    async publishProduct() {
        const title = document.getElementById('rp-title').value.trim();
        const price = parseFloat(document.getElementById('rp-price').value);
        const desc = document.getElementById('rp-desc').value.trim();
        const category = document.getElementById('rp-category').value;

        if (!title || isNaN(price) || !desc) {
            return NexraApp.showToast('All fields are required.', 'error');
        }

        const btn = document.getElementById('rp-publish-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';

        const payload = {
            title: title,
            price: price,
            description: desc,
            category: category,
            images: this.productImages.filter(img => img !== null),
            isCustom: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await this.db.collection(`resellers/${this.user.uid}/inventory`).add(payload);
            NexraApp.showToast('Product published to storefront!', 'success');
            
            // Reset fields
            document.getElementById('rp-title').value = '';
            document.getElementById('rp-price').value = '';
            document.getElementById('rp-desc').value = '';
            this.productImages = [null, null, null];
            
            // Re-render empty photo slots
            for(let i=0; i<3; i++) {
                const inputId = `rp-file-${i}`;
                const slot = document.getElementById(inputId)?.parentNode;
                if(slot) {
                    slot.innerHTML = `<i class="fa-solid fa-plus"></i><input type="file" id="${inputId}" accept="image/*" style="display:none;" onchange="NexraProducts.processImage(event, ${i})">`;
                }
            }

            this.loadMyInventory();
        } catch(e) {
            console.error(e);
            NexraApp.showToast('Failed to publish product.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Publish Custom Product';
        }
    },

    async loadMyInventory() {
        const container = document.getElementById('rp-my-products');
        if(!container) return;

        try {
            const snap = await this.db.collection(`resellers/${this.user.uid}/inventory`).get();
            if (snap.empty) {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-300);">No products in your inventory yet.</div>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const p = doc.data();
                const cover = p.images && p.images.length > 0 ? p.images[0] : '/assets/placeholder.jpg';
                html += `
                    <div class="rp-card">
                        <img src="${cover}" class="rp-card-img" alt="${p.title}">
                        <div class="rp-card-body" style="padding:16px;">
                            <h3 class="tech-font" style="font-size:16px; color:var(--text-100); margin-bottom:4px;">${p.title}</h3>
                            <span class="rp-price" style="font-weight:700; color:var(--brand-main);">Rs. ${p.price.toLocaleString()}</span>
                            <div style="display:flex; justify-content:space-between; margin-top:12px;">
                                <button class="rp-btn-sm" style="background:rgba(239,68,68,0.1); color:var(--danger);" onclick="NexraProducts.deleteProduct('${doc.id}')">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch(e) {
            console.error(e);
        }
    },

    async deleteProduct(id) {
        if(!confirm("Delete this product from your inventory?")) return;
        try {
            await this.db.collection(`resellers/${this.user.uid}/inventory`).doc(id).delete();
            NexraApp.showToast('Product deleted.', 'success');
            this.loadMyInventory();
        } catch(e) {
            NexraApp.showToast('Failed to delete product.', 'error');
        }
    },

    async loadCatalog() {
        const container = document.getElementById('rp-catalog-list');
        if(!container) return;

        try {
            const snap = await this.db.collection('products').get();
            if (snap.empty) {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-300);">Nexra Catalog is currently empty.</div>';
                return;
            }

            this.catalogCache = [];
            snap.forEach(doc => {
                this.catalogCache.push({ id: doc.id, ...doc.data() });
            });

            this.renderCatalog(this.catalogCache);
        } catch(e) {
            console.error(e);
        }
    },

    renderCatalog(products) {
        const container = document.getElementById('rp-catalog-list');
        let html = '';
        products.forEach(p => {
            const cover = p.images && p.images.length > 0 ? p.images[0] : '/assets/placeholder.jpg';
            html += `
                <div class="rp-card">
                    <img src="${cover}" class="rp-card-img" alt="${p.title}">
                    <div class="rp-card-body" style="padding:16px;">
                        <h3 class="tech-font" style="font-size:16px; color:var(--text-100); margin-bottom:4px;">${p.title}</h3>
                        <span class="rp-price" style="font-weight:700; color:var(--brand-main);">Cost: Rs. ${p.price.toLocaleString()}</span>
                        <div style="margin-top:12px;">
                            <button class="rp-btn-sm" style="width:100%;" onclick="NexraProducts.openMarginModal('${p.id}', '${p.title}', ${p.price})">Sell This</button>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    filterCatalog(val) {
        if(!this.catalogCache) return;
        const filtered = this.catalogCache.filter(p => p.title.toLowerCase().includes(val.toLowerCase()));
        this.renderCatalog(filtered);
    },

    openMarginModal(id, title, cost) {
        this.selectedCatalogProduct = { id, title, cost };
        document.getElementById('rp-modal-title').innerText = `Configure pricing for ${title}`;
        document.getElementById('rp-modal-cost').innerText = `Rs. ${cost.toLocaleString()}`;
        
        document.getElementById('rp-markup-input').value = 200;
        this.recalcMargin();
        
        document.getElementById('rp-margin-modal').style.display = 'flex';
    },

    recalcMargin() {
        if(!this.selectedCatalogProduct) return;
        const markup = parseFloat(document.getElementById('rp-markup-input').value) || 0;
        const final = this.selectedCatalogProduct.cost + markup;
        
        document.getElementById('rp-modal-final').innerText = `Rs. ${final.toLocaleString()}`;
    },

    closeMarginModal(e) {
        if(e && e.target.id !== 'rp-margin-modal') return;
        document.getElementById('rp-margin-modal').style.display = 'none';
        this.selectedCatalogProduct = null;
    },

    async addToStore() {
        if(!this.selectedCatalogProduct) return;
        const markup = parseFloat(document.getElementById('rp-markup-input').value) || 0;
        const finalPrice = this.selectedCatalogProduct.cost + markup;

        try {
            await this.db.collection(`resellers/${this.user.uid}/inventory`).add({
                productId: this.selectedCatalogProduct.id,
                title: this.selectedCatalogProduct.title,
                price: finalPrice,
                markup: markup,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            NexraApp.showToast('Product added to storefront!', 'success');
            document.getElementById('rp-margin-modal').style.display = 'none';
            this.loadMyInventory();
        } catch(e) {
            NexraApp.showToast('Failed to add product to storefront.', 'error');
        }
    }
};
