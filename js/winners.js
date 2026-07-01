/* js/winners.js */
window.NexraWinners = {
    db: null,

    init() {
        this.db = firebase.firestore();
        this.fetchWinners();
    },

    async fetchWinners() {
        const grid = document.getElementById('win-grid');
        const empty = document.getElementById('win-empty');

        try {
            const snapshot = await this.db.collection('giveaway_winners')
                .orderBy('wonAt', 'desc')
                .limit(20)
                .get();

            if (snapshot.empty) {
                grid.style.display = 'none';
                empty.style.display = 'flex';
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const d = doc.data();
                
                // Format Date safely
                let dateStr = 'Recent';
                if(d.wonAt) {
                    const dateObj = new Date(d.wonAt.seconds * 1000);
                    dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                }

                const initial = d.winnerName ? d.winnerName.charAt(0).toUpperCase() : '?';
                const prizeImage = d.prizeImage || '/assets/placeholder-box.png';

                html += `
                    <div class="win-card">
                        <div class="wc-img-wrapper">
                            <img src="${prizeImage}" class="wc-img" loading="lazy">
                            <div class="wc-overlay"></div>
                            <div class="wc-date-badge">${dateStr}</div>
                        </div>
                        <div class="wc-body">
                            <div class="wc-prize">${d.prizeName || 'Premium SaaS Template'}</div>
                            
                            <div class="wc-winner">
                                <div class="wc-avatar">${initial}</div>
                                <div class="wc-user-info">
                                    <span class="wc-name">${d.winnerName || 'Anonymous'}</span>
                                    <span class="wc-country"><i class="fa-solid fa-earth-americas"></i> ${d.country || 'Global Community'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            grid.innerHTML = html;

        } catch (e) {
            console.error("Failed to load winners", e);
            grid.innerHTML = '<div style="color:#ef4444; padding:20px; text-align:center; grid-column: 1 / -1;">Failed to load data. Please refresh.</div>';
        }
    }
};
