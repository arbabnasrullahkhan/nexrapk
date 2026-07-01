/* js/search-results.js */
window.NexraSearch = {
    db: null,
    currentQuery: '',
    results: {
        products: [],
        blogs: [],
        freebies: []
    },
    activeTab: 'all',

    async init() {
        this.db = firebase.firestore();
        
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q');
        
        if (q && q.trim() !== '') {
            this.currentQuery = q.trim().toLowerCase();
            document.getElementById('sr-input').value = q;
            document.getElementById('sr-query-text').innerText = `"${q}"`;
            await this.performSearch();
        } else {
            // No query provided
            document.getElementById('sr-query-text').innerText = '...';
            document.getElementById('sr-grid').style.display = 'none';
            document.getElementById('sr-empty').style.display = 'flex';
        }
    },

    executeNewSearch() {
        const val = document.getElementById('sr-input').value.trim();
        if(val) {
            window.location.href = `/discovery/search-results.html?q=${encodeURIComponent(val)}`;
        }
    },

    async performSearch() {
        try {
            // Because Firestore lacks native wildcard/substring search across multiple fields,
            // we will fetch recent items and filter locally for this approximation engine.
            // For production with large datasets, Algolia or Typesense integration is required.

            const [prodSnap, blogSnap, freeSnap] = await Promise.all([
                this.db.collection('products').limit(50).get(),
                this.db.collection('blogs').limit(50).get(),
                this.db.collection('freebies').limit(50).get()
            ]);

            this.results.products = this.filterLocally(prodSnap, this.currentQuery, 'product');
            this.results.blogs = this.filterLocally(blogSnap, this.currentQuery, 'blog');
            this.results.freebies = this.filterLocally(freeSnap, this.currentQuery, 'freebie');

            this.updateCounts();
            this.renderGrid();

        } catch(e) {
            console.error("Search failed:", e);
            NexraApp.showToast('Search engine error. Please try again.', 'error');
            document.getElementById('sr-grid').innerHTML = '';
        }
    },

    filterLocally(snapshot, query, type) {
        let matches = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            const searchableText = `${d.title || ''} ${d.description || ''} ${d.keywords ? d.keywords.join(' ') : ''}`.toLowerCase();
            if (searchableText.includes(query)) {
                matches.push({ id: doc.id, type: type, ...d });
            }
        });
        return matches;
    },

    updateCounts() {
        document.getElementById('count-prod').innerText = this.results.products.length;
        document.getElementById('count-blog').innerText = this.results.blogs.length;
        document.getElementById('count-free').innerText = this.results.freebies.length;
    },

    switchTab(tabName) {
        this.activeTab = tabName;
        
        // Update tab styling
        document.querySelectorAll('.sr-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.sr-tab[data-filter="${tabName}"]`).classList.add('active');

        this.renderGrid();
    },

    renderGrid() {
        const grid = document.getElementById('sr-grid');
        const empty = document.getElementById('sr-empty');
        
        let displayData = [];
        
        if (this.activeTab === 'all') {
            displayData = [...this.results.products, ...this.results.blogs, ...this.results.freebies];
        } else {
            displayData = this.results[this.activeTab] || [];
        }

        if (displayData.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }

        grid.style.display = 'grid';
        empty.style.display = 'none';

        let html = '';
        displayData.forEach(item => {
            let badgeClass = '';
            let badgeText = '';
            let link = '#';

            if (item.type === 'product') {
                badgeClass = 'b-prod'; badgeText = 'SaaS Tool'; link = `/shop/product-detail.html?id=${item.id}`;
            } else if (item.type === 'blog') {
                badgeClass = 'b-blog'; badgeText = 'Article'; link = `/academy/article.html?id=${item.id}`;
            } else if (item.type === 'freebie') {
                badgeClass = 'b-free'; badgeText = 'Freebie'; link = `/freebies/freebie-detail.html?id=${item.id}`;
            }

            const img = item.coverBase64 || item.image || '/assets/placeholder-box.png';

            html += `
                <a href="${link}" class="sr-card">
                    <img src="${img}" class="sc-img" loading="lazy">
                    <div class="sc-body">
                        <span class="sc-badge ${badgeClass}">${badgeText}</span>
                        <div class="sc-title">${item.title || 'Untitled'}</div>
                        <div class="sc-desc">${item.description || 'No description available.'}</div>
                    </div>
                </a>
            `;
        });

        grid.innerHTML = html;
    }
};
