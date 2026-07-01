/* js/vip-perks.js */
window.NexraVIPPerks = {
    auth: null,
    discountRate: 0.40, // 40% VIP Discount

    init() {
        this.auth = firebase.auth();
        this.calcROI(); // Initialize default values
    },

    calcROI() {
        const spend = document.getElementById('roi-slider').value;
        const saveAmt = spend * this.discountRate;
        const payAmt = spend - saveAmt;

        document.getElementById('roi-spend-val').innerText = '$' + spend;
        document.getElementById('roi-pay').innerText = '$' + Math.floor(payAmt);
        document.getElementById('roi-save').innerText = '$' + Math.floor(saveAmt);
    },

    initiateUpgrade() {
        const user = this.auth ? this.auth.currentUser : null;
        
        if (user) {
            // User is logged in, send them directly to the Diamond Checkout pipeline
            window.location.href = '/checkout.html?product=vip_diamond_lifetime';
        } else {
            // Unauthenticated users hit the auth gate first, then return to checkout
            NexraApp.showToast('Please authenticate to claim Diamond Status', 'info');
            setTimeout(() => {
                window.location.href = '/user/auth-gate.html?redirect=/checkout.html?product=vip_diamond_lifetime';
            }, 1500);
        }
    }
};

// Initialize immediately to bind the slider
NexraVIPPerks.init();
