const CONF = { 
    URL: 'https://fzsrmnexarqrlaawnhmw.supabase.co', 
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ' 
};

let user = null;
let isLogin = true;
let html5QrCode = null;
let pendingToken = new URLSearchParams(window.location.search).get('token');

const db = supabase.createClient(CONF.URL, CONF.KEY);

function navigateTo(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id + '-view');
    if (target) target.classList.add('active');
    if (id === 'wallet' && user) loadWallet();
}

function toggleAuth() {
    isLogin = !isLogin;
    
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('authBtn');
    const toggleText = document.getElementById('toggleText');
    const regField = document.getElementById('regUser');

    title.innerText = isLogin ? 'IOS Login' : 'IOS Register';
    btn.innerText = isLogin ? 'INITIALIZE' : 'CREATE ID';
    toggleText.innerText = isLogin ? "New to the arena?" : "Already registered?";
    
    if (regField) regField.style.display = isLogin ? 'none' : 'block';
}

async function handleAuth() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('authMsg');
    
    msg.innerText = "AUTHENTICATING...";
    msg.style.color = "white";
    
    let res;
    if (isLogin) {
        res = await db.auth.signInWithPassword({ email, password: pass });
    } else {
        const username = document.getElementById('regUser').value;
        res = await db.auth.signUp({ email, password: pass, options: { data: { username: username } } });
    }

    if (res.error) {
        msg.innerText = res.error.message.toUpperCase();
        msg.style.color = '#EF4444';
    } else {
        user = res.data.user;
        navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
}

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

async function startScanner() {
    navigateTo('scanner');
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, (text) => {
        try {
            const url = new URL(text);
            const t = url.searchParams.get("token");
            if (t) {
                stopScanner(); navigateTo('wallet'); claim(t);
            }
        } catch(e) { console.error("Invalid QR Link"); }
    }).catch(err => {
        document.getElementById('scanMsg').innerText = "CAMERA HARDWARE DENIED";
        document.getElementById('scanMsg').style.color = "#EF4444";
    });
}

function stopScanner() {
    if (html5QrCode) { html5QrCode.stop().then(() => { html5QrCode = null; }); }
}

async function claim(t) {
    const msg = document.getElementById('walletMsg');
    if (msg) { msg.innerText = "DECRYPTING TOKEN..."; msg.style.color = "white"; }
    
    const { data, error } = await db.rpc('claim_reward_token', { p_token_id: t });
    
    if (error) {
        if (msg) { msg.innerText = "ERROR: TOKEN VOID OR EXPIRED."; msg.style.color = '#EF4444'; }
    } else {
        if (msg) { msg.innerText = `DATA SYNC: +${data.toFixed(1)} PTS ACQUIRED.`; msg.style.color = '#10B981'; }
    }
    window.history.replaceState({}, '', '/RivalryEsportsArena/');
    pendingToken = null;
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload(); 
}

window.onload = async () => {
    const { data } = await db.auth.getUser();
    if (data.user) {
        user = data.user; navigateTo('wallet');
        if (pendingToken) claim(pendingToken);
    }
};
