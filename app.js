
// --- 1. CONFIG ---
const CONF = { 
    URL: 'https://fzsrmnexarqrlaawnhmw.supabase.co', 
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ',
};

const db = supabase.createClient(CONF.URL, CONF.KEY);

// --- 2. GLOBAL STATE ---
let user = null;
let isLogin = true;
let html5QrCode = null;
let pendingToken = new URLSearchParams(window.location.search).get('token');

// --- 3. NAVIGATION ---
function navigateTo(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id + '-view');
    if (target) target.classList.add('active');
    if (id === 'wallet') loadWallet();
}

function toggleAuth() {
    isLogin = !isLogin;
    document.getElementById('authTitle').innerText = isLogin ? 'RVL Login' : 'RVL Register';
    document.getElementById('authBtn').innerText = isLogin ? 'Sign In' : 'Register';
    document.getElementById('regUser').style.display = isLogin ? 'none' : 'block';
    document.getElementById('toggleText').innerText = isLogin ? 'New player?' : 'Already registered?';
}

// --- 4. AUTH LOGIC ---
async function handleAuth() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('authMsg');
    
    msg.innerText = "Processing...";
    
    let res;
    if (isLogin) {
        res = await db.auth.signInWithPassword({ email, password: pass });
    } else {
        const username = document.getElementById('regUser').value;
        res = await db.auth.signUp({ email, password: pass, options: { data: { username } } });
    }

    if (res.error) {
        msg.innerText = res.error.message;
        msg.style.color = 'red';
    } else {
        user = res.data.user;
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
}

// --- 5. WALLET & SCANNER ---
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
    document.getElementById('bar').style.width = Math.min((pts / 50) * 100, 100) + "%";
    
    if (pts >= 50) {
        const btn = document.getElementById('claimBtn');
        btn.disabled = false;
        btn.innerText = "CLAIM ₱200";
        btn.className = "btn btn-red";
    }
}

async function startScanner() {
    navigateTo('scanner');
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (text) => {
        try {
            const url = new URL(text);
            const t = url.searchParams.get("token");
            if (t) {
                stopScanner();
                navigateTo('wallet');
                claim(t);
            }
        } catch(e) { console.error("Invalid QR"); }
    }).catch(e => console.error(e));
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => { html5QrCode = null; });
    }
}

async function claim(t) {
    const msg = document.getElementById('walletMsg');
    msg.innerText = "Claiming reward...";
    const { data, error } = await db.rpc('claim_reward_token', { p_token_id: t });
    
    if (error) {
        msg.innerText = "Error: Token invalid.";
        msg.style.color = 'red';
    } else {
        msg.innerText = `Success! +${data.toFixed(1)} Pts`;
        msg.style.color = '#10B981';
    }
    window.history.replaceState({}, '', '/RivalryEsportsArena/');
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload();
}

// Auto-check session on load
window.onload = async () => {
    const { data } = await db.auth.getUser();
    if (data.user) {
        user = data.user;
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
};
