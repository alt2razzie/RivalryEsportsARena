const CONF = { 
    URL: 'https://fzsrmnexarqrlaawnhmw.supabase.co', 
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ' // REMEMBER TO PUT YOUR KEY HERE BEFORE DEPLOYING
};

let user = null;
let userProfile = null;
let isLogin = true;
let html5QrCode = null;
let currentAuthEmail = ""; 
let pendingToken = new URLSearchParams(window.location.search).get('token');

const db = supabase.createClient(CONF.URL, CONF.KEY);

// --- NAVIGATION & UI CONTROLS ---
function navigateTo(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id + '-view').classList.add('active');
    
    if (id === 'wallet' && user) loadWallet();
    if (id === 'scanner') document.getElementById('manualTokenInput').value = "";
}

function toggleAuth() {
    isLogin = !isLogin;
    document.getElementById('authTitle').innerText = isLogin ? 'RVL LOGIN' : 'RVL REGISTER';
    document.getElementById('authBtn').innerText = isLogin ? 'INITIALIZE' : 'CREATE ID';
    document.getElementById('toggleText').innerText = isLogin ? "New to the arena?" : "Already registered?";
    
    document.getElementById('emailOrNick').placeholder = isLogin ? "EMAIL OR GAMER TAG" : "CHOOSE GAMER TAG";
    document.getElementById('regFields').style.display = isLogin ? 'none' : 'block';
    document.getElementById('forgotLink').style.display = isLogin ? 'block' : 'none';
}

// --- 1. CORE AUTHENTICATION & RECOVERY ---
async function handleAuth() {
    const primaryInput = document.getElementById('emailOrNick').value.trim();
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('authMsg');
    
    if(!primaryInput || !pass) { msg.innerText = "FILL ALL FIELDS"; msg.style.color = '#EF4444'; return; }
    
    msg.innerText = "AUTHENTICATING...";
    msg.style.color = "white";
    
    if (isLogin) {
        let loginEmail = primaryInput;
        // If no '@', assume Gamer Tag and fetch the associated email securely
        if (!primaryInput.includes('@')) {
            const { data, error } = await db.rpc('get_email_from_nickname', { p_nickname: primaryInput });
            if (data) loginEmail = data;
            else { msg.innerText = "GAMER TAG NOT FOUND"; msg.style.color = '#EF4444'; return; }
        }
        
        const res = await db.auth.signInWithPassword({ email: loginEmail, password: pass });
        if (res.error) {
            msg.innerText = res.error.message.toUpperCase();
            msg.style.color = '#EF4444';
        } else {
            user = res.data.user;
            navigateTo('wallet');
            if (pendingToken) claim(pendingToken);
        }
    } else {
        // Registration Logic with optional Referral Code
        const email = document.getElementById('regEmail').value.trim();
        const refCode = document.getElementById('refCodeInput').value.trim().toUpperCase();
        
        const res = await db.auth.signUp({ 
            email: email, password: pass, 
            options: { data: { nickname: primaryInput, referred_by: refCode } } 
        });
        
        if (res.error) {
            msg.innerText = res.error.message.toUpperCase();
            msg.style.color = '#EF4444';
        } else {
            currentAuthEmail = email;
            navigateTo('otp');
            document.getElementById('otpMsg').innerText = "OTP SENT TO EMAIL.";
            document.getElementById('otpMsg').style.color = "var(--success)";
        }
    }
}

async function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const msg = document.getElementById('otpMsg');
    
    msg.innerText = "VERIFYING..."; msg.style.color = "white";
    
    const { data, error } = await db.auth.verifyOtp({ email: currentAuthEmail, token: code, type: 'signup' });
    if (error) {
        msg.innerText = "INVALID OR EXPIRED CODE";
        msg.style.color = '#EF4444';
    } else {
        user = data.user;
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
}

// Password Recovery Logic
async function sendResetCode() {
    const email = document.getElementById('forgotEmail').value.trim();
    const msg = document.getElementById('forgotMsg');
    if(!email) { msg.innerText = "ENTER EMAIL"; msg.style.color = "#EF4444"; return; }
    
    msg.innerText = "COMMUNICATING WITH SERVER..."; msg.style.color = "white";
    currentAuthEmail = email;

    const { error } = await db.auth.resetPasswordForEmail(email);
    if (error) { msg.innerText = error.message.toUpperCase(); msg.style.color = '#EF4444'; } 
    else {
        msg.innerText = "RESET CODE SENT TO EMAIL."; msg.style.color = 'var(--success)';
        document.getElementById('resetCodeSection').style.display = 'block';
    }
}

async function submitNewPassword() {
    const code = document.getElementById('resetOtpCode').value.trim();
    const newPass = document.getElementById('newPassword').value;
    const msg = document.getElementById('forgotMsg');

    if(!code || !newPass) { msg.innerText = "FILL ALL FIELDS"; msg.style.color = "#EF4444"; return; }
    msg.innerText = "UPDATING SECURITY CREDENTIALS..."; msg.style.color = "white";

    const { error: verifyError } = await db.auth.verifyOtp({ email: currentAuthEmail, token: code, type: 'recovery' });
    if (verifyError) { msg.innerText = "INVALID RECOVERY CODE"; msg.style.color = '#EF4444'; return; }

    const { error: updateError } = await db.auth.updateUser({ password: newPass });
    if (updateError) { msg.innerText = updateError.message.toUpperCase(); msg.style.color = '#EF4444'; } 
    else {
        msg.innerText = "PASSWORD UPDATED. YOU MAY LOG IN."; msg.style.color = 'var(--success)';
        setTimeout(() => { navigateTo('auth'); }, 2000);
    }
}

// --- 2. WALLET, STREAKS & INVENTORY ---
async function loadWallet() {
    if (!user) return;
    const { data, error } = await db.from('user_profiles').select('*').eq('user_id', user.id).single();
    
    if (data) {
        userProfile = data;
        
        // FAILSAFES (|| 0) to prevent "undefined" bugs for brand new accounts
        const pts = data.total_points || 0;
        const streak = data.streak_days || 0;
        const potions = data.boost_inventory || 0;
        
        document.getElementById('valPoints').innerText = pts.toFixed(1);
        document.getElementById('valPhp').innerText = (pts * 4).toFixed(2);
        document.getElementById('myRefCode').innerText = data.referral_code || "GENERATING...";
        document.getElementById('streakCount').innerText = `${streak} DAYS`;
        document.getElementById('potionCount').innerText = `🧪 ${potions}x BOOST POTIONS`;
        
        // Daily Streak Button Logic
        const streakBtn = document.getElementById('streakBtn');
        if (data.today_play_seconds >= 14400) { // 4 Hours = 14400 Seconds
            const today = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Manila'});
            if (data.streak_claim_date !== today) {
                streakBtn.style.display = 'block';
                streakBtn.innerText = "🎁 CLAIM +2 PTS (STREAK MET)";
                streakBtn.style.background = "rgba(16, 185, 129, 0.1)";
                streakBtn.style.borderColor = "#10B981";
                streakBtn.style.color = "#10B981";
                streakBtn.disabled = false;
            } else {
                streakBtn.style.display = 'block';
                streakBtn.innerText = "✓ STREAK CLAIMED TODAY";
                streakBtn.style.background = "transparent";
                streakBtn.style.borderColor = "#334155";
                streakBtn.style.color = "#64748B";
                streakBtn.disabled = true;
            }
        } else {
            streakBtn.style.display = 'none';
        }
    }
}

async function claimStreak() {
    const { data, error } = await db.rpc('claim_streak_bonus');
    if (data) {
        document.getElementById('walletMsg').innerText = "+2 PTS STREAK BONUS ACQUIRED!";
        document.getElementById('walletMsg').style.color = "#10B981";
        loadWallet(); // Instantly refresh UI
    }
}

// --- 3. TOP 10 LEADERBOARDS ---
async function loadLeaderboard() {
    navigateTo('leaderboard');
    const lb = document.getElementById('lbContainer');
    lb.innerHTML = "<p style='text-align:center;'>LOADING RANKINGS...</p>";
    
    const { data, error } = await db.from('user_profiles').select('nickname, total_points').order('total_points', { ascending: false }).limit(10);
    
    // Failsafe for empty database
    if (error || !data || data.length === 0) {
        lb.innerHTML = "<p style='text-align:center; color:#94A3B8;'>NO RANKINGS AVAILABLE YET</p>";
        return;
    }
    
    if (data) {
        lb.innerHTML = data.map((u, i) => {
            let rankClass = "lb-row ";
            if(i === 0) rankClass += "gold";
            else if(i === 1) rankClass += "silver";
            else if(i === 2) rankClass += "bronze";

            const nick = u.nickname || "GAMER";
            const pts = u.total_points || 0;

            return `
            <div class="${rankClass}">
                <span>#${i+1} ${nick}</span>
                <span>${pts.toFixed(1)} PTS</span>
            </div>
        `}).join('');
    }
}

// --- 4. DATA EXTRACTION & POTION LOGIC ---
async function startScanner() {
    navigateTo('scanner');
    document.getElementById('scanMsg').innerText = "ALIGN QR WITHIN FRAME";
    document.getElementById('scanMsg').style.color = "white";
    
    // SECURITY GATE: Only shows the Potion box if they have > 0 potions
    const potionBox = document.getElementById('potionSection');
    const potionCheck = document.getElementById('usePotionToggle');
    potionCheck.checked = false; // Always uncheck by default
    
    if(userProfile && userProfile.boost_inventory > 0) {
        potionBox.style.display = 'block';
    } else {
        potionBox.style.display = 'none';
    }

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (text) => {
        try {
            const url = new URL(text);
            const t = url.searchParams.get("token");
            if (t) { stopScanner(); navigateTo('wallet'); claim(t); }
        } catch(e) { console.error("Invalid QR Link"); }
    }).catch(err => {
        document.getElementById('scanMsg').innerText = "CAMERA HARDWARE DENIED OR UNAVAILABLE";
        document.getElementById('scanMsg').style.color = "#EF4444";
    });
}

function stopScanner() {
    if (html5QrCode) { html5QrCode.stop().then(() => { html5QrCode = null; }); }
}

function claimManual() {
    const hash = document.getElementById('manualTokenInput').value.trim().toUpperCase();
    if (!hash) {
        document.getElementById('scanMsg').innerText = "ENTER A HASH CODE FIRST";
        document.getElementById('scanMsg').style.color = "#EF4444";
        return;
    }
    stopScanner();
    navigateTo('wallet');
    claim(hash);
}

async function claim(t) {
    const msg = document.getElementById('walletMsg');
    msg.innerText = "DECRYPTING TOKEN..."; 
    msg.style.color = "white";
    
    // Read the Potion Checkbox
    const usePotion = document.getElementById('usePotionToggle')?.checked || false;
    
    // Send token and potion status to Supabase SQL
    const { data, error } = await db.rpc('claim_reward_token', { p_token_id: t, p_use_boost: usePotion });
    
    if (error) {
        msg.innerText = "ERROR: HASH VOID OR EXPIRED."; 
        msg.style.color = '#EF4444'; 
    } else {
        msg.innerText = `DATA SYNC: +${data.toFixed(1)} PTS ACQUIRED.`; 
        msg.style.color = '#10B981'; 
        document.getElementById('usePotionToggle').checked = false; 
        loadWallet(); // Refresh Inventory & Points
    }
    window.history.replaceState({}, '', window.location.pathname);
    pendingToken = null;
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload(); 
}

// --- 5. BOOT SEQUENCE ---
window.onload = async () => {
    const { data } = await db.auth.getUser();
    if (data.user) {
        user = data.user; 
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
};

// Example of how the phone claims the points
async function claimPoints() {
    const userEmail = document.getElementById('email').value;
    const token = document.getElementById('tokenCode').value.toUpperCase();

    const { data, error } = await supabase.rpc('claim_session_token', {
        p_user_email: userEmail,
        p_token: token
    });

    if (error) {
        alert("Error: Token invalid, already claimed, or under 60 mins.");
    } else {
        alert(`Success! ${data} Points Added!`);
        // The PC will notice this happened within 30 seconds and reset itself!
    }
}
