const CONF = { 
    URL: 'https://fzsrmnexarqrlaawnhmw.supabase.co', 
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ' 
};

let user = null;
let isLogin = true;
let html5QrCode = null;
let pendingToken = new URLSearchParams(window.location.search).get('token');
let currentAuthEmail = ""; 

const db = supabase.createClient(CONF.URL, CONF.KEY);

function navigateTo(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id + '-view');
    if (target) target.classList.add('active');
    
    if (id === 'wallet' && user) loadWallet();
    if (id === 'scanner') document.getElementById('manualTokenInput').value = "";
}

function toggleAuth() {
    isLogin = !isLogin;
    
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('authBtn');
    const toggleText = document.getElementById('toggleText');
    const regField = document.getElementById('regUser');
    const forgotLink = document.getElementById('forgotLink');

    title.innerText = isLogin ? 'RVL LOGIN' : 'RVL REGISTER';
    btn.innerText = isLogin ? 'INITIALIZE' : 'CREATE ID';
    toggleText.innerText = isLogin ? "New to the arena?" : "Already registered?";
    
    if (regField) regField.style.display = isLogin ? 'none' : 'block';
    if (forgotLink) forgotLink.style.display = isLogin ? 'block' : 'none';
}

// --- 1. CORE AUTHENTICATION ---
async function handleAuth() {
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('authMsg');
    
    if(!email || !pass) { msg.innerText = "FILL ALL FIELDS"; msg.style.color = '#EF4444'; return; }
    
    msg.innerText = "AUTHENTICATING...";
    msg.style.color = "white";
    currentAuthEmail = email; 
    
    let res;
    if (isLogin) {
        res = await db.auth.signInWithPassword({ email, password: pass });
        if (res.error) {
            msg.innerText = res.error.message.toUpperCase();
            msg.style.color = '#EF4444';
        } else {
            user = res.data.user;
            navigateTo('wallet');
            if (pendingToken) claim(pendingToken);
        }
    } else {
        const username = document.getElementById('regUser').value;
        res = await db.auth.signUp({ email, password: pass, options: { data: { username: username } } });
        
        if (res.error) {
            msg.innerText = res.error.message.toUpperCase();
            msg.style.color = '#EF4444';
        } else {
            document.getElementById('email').value = "";
            document.getElementById('password').value = "";
            navigateTo('otp');
            document.getElementById('otpMsg').innerText = "OTP SENT TO EMAIL.";
            document.getElementById('otpMsg').style.color = "var(--success)";
        }
    }
}

// --- 2. OTP VERIFICATION ---
async function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const msg = document.getElementById('otpMsg');
    
    if(!code) { msg.innerText = "ENTER CODE"; msg.style.color = "#EF4444"; return; }
    
    msg.innerText = "VERIFYING...";
    msg.style.color = "white";

    const { data, error } = await db.auth.verifyOtp({
        email: currentAuthEmail,
        token: code,
        type: 'signup'
    });

    if (error) {
        msg.innerText = "INVALID OR EXPIRED CODE";
        msg.style.color = '#EF4444';
    } else {
        user = data.user;
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
}

// --- 3. FORGOT PASSWORD PROTOCOL ---
async function sendResetCode() {
    const email = document.getElementById('forgotEmail').value.trim();
    const msg = document.getElementById('forgotMsg');
    
    if(!email) { msg.innerText = "ENTER EMAIL"; msg.style.color = "#EF4444"; return; }
    
    msg.innerText = "COMMUNICATING WITH SERVER...";
    msg.style.color = "white";
    currentAuthEmail = email;

    const { error } = await db.auth.resetPasswordForEmail(email);

    if (error) {
        msg.innerText = error.message.toUpperCase();
        msg.style.color = '#EF4444';
    } else {
        msg.innerText = "RESET CODE SENT TO EMAIL.";
        msg.style.color = 'var(--success)';
        document.getElementById('resetCodeSection').style.display = 'block';
    }
}

async function submitNewPassword() {
    const code = document.getElementById('resetOtpCode').value.trim();
    const newPass = document.getElementById('newPassword').value;
    const msg = document.getElementById('forgotMsg');

    if(!code || !newPass) { msg.innerText = "FILL ALL FIELDS"; msg.style.color = "#EF4444"; return; }

    msg.innerText = "UPDATING SECURITY CREDENTIALS...";
    msg.style.color = "white";

    const { error: verifyError } = await db.auth.verifyOtp({ email: currentAuthEmail, token: code, type: 'recovery' });

    if (verifyError) {
        msg.innerText = "INVALID RECOVERY CODE";
        msg.style.color = '#EF4444';
        return;
    }

    const { error: updateError } = await db.auth.updateUser({ password: newPass });

    if (updateError) {
        msg.innerText = updateError.message.toUpperCase();
        msg.style.color = '#EF4444';
    } else {
        msg.innerText = "PASSWORD UPDATED. YOU MAY LOG IN.";
        msg.style.color = 'var(--success)';
        setTimeout(() => { navigateTo('auth'); }, 2000);
    }
}

// --- 4. WALLET & CLAIM PROTOCOL ---
async function loadWallet() {
    if (!user) return;
    const { data } = await db.from('user_profiles').select('total_points').eq('user_id', user.id).single();
    if (data) updateUI(data.total_points);

    db.channel('wallet-sync').on('postgres_changes', { 
        event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${user.id}` 
    }, payload => updateUI(payload.new.total_points)).subscribe();
}

function updateUI(pts) {
    document.getElementById('valPoints').innerText = pts.toFixed(1);
    document.getElementById('valPhp').innerText = (pts * 4).toFixed(2);
    
    const per = Math.min((pts / 50) * 100, 100);
    document.getElementById('bar').style.width = per + "%";
    
    const btn = document.getElementById('claimBtn');
    if (pts >= 50) {
        btn.disabled = false;
        btn.innerText = "EXTRACT ₱200 REWARD";
        btn.className = "btn btn-red"; 
    }
}

// --- 5. DATA EXTRACTION (QR & MANUAL) ---
async function startScanner() {
    navigateTo('scanner');
    document.getElementById('scanMsg').innerText = "ALIGN QR WITHIN FRAME";
    document.getElementById('scanMsg').style.color = "white";
    
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
    const manualToken = document.getElementById('manualTokenInput').value.trim().toUpperCase();
    if (!manualToken) {
        document.getElementById('scanMsg').innerText = "ENTER A HASH CODE FIRST";
        document.getElementById('scanMsg').style.color = "#EF4444";
        return;
    }
    stopScanner();
    navigateTo('wallet');
    claim(manualToken);
}

async function claim(t) {
    const msg = document.getElementById('walletMsg');
    if (msg) { msg.innerText = "DECRYPTING TOKEN..."; msg.style.color = "white"; }
    
    const { data, error } = await db.rpc('claim_reward_token', { p_token_id: t });
    
    if (error) {
        if (msg) { msg.innerText = "ERROR: HASH VOID OR EXPIRED."; msg.style.color = '#EF4444'; }
    } else {
        if (msg) { msg.innerText = `DATA SYNC: +${data.toFixed(1)} PTS ACQUIRED.`; msg.style.color = '#10B981'; }
    }
    window.history.replaceState({}, '', window.location.pathname);
    pendingToken = null;
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload(); 
}

// --- BOOT SEQUENCE ---
window.onload = async () => {
    const { data } = await db.auth.getUser();
    if (data.user) {
        user = data.user; 
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
};
