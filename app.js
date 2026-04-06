// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONF = { 
    URL: 'https://fzsrmnexarqrlaawnhmw.supabase.co', 
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ', // Paste your key here
    FB_PAGE: 'https://facebook.com/your-page'
};

// ==========================================
// 2. GLOBAL STATE (Define these BEFORE functions)
// ==========================================
let user = null;
let isLogin = true;
let pendingToken = new URLSearchParams(window.location.search).get('token');

// Initialize the Supabase Client
const db = supabase.createClient(CONF.URL, CONF.KEY);

// ==========================================
// 3. UI & ROUTING FUNCTIONS
// ==========================================
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'wallet' && user) loadWallet();
}

function toggleAuth() {
    isLogin = !isLogin; // Now safely accessible
    
    document.getElementById('authTitle').innerText = isLogin ? 'RVL Login' : 'RVL Register';
    document.getElementById('authBtn').innerText = isLogin ? 'Sign In' : 'Register';
    document.getElementById('toggleText').innerText = isLogin ? "Don't have an account?" : "Already have an account?";
    
    const regField = document.getElementById('regUser');
    if (regField) regField.style.display = isLogin ? 'none' : 'block';
}

// ==========================================
// 4. AUTH & DATABASE LOGIC
// ==========================================
async function handleAuth() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('authMsg');
    
    msg.innerText = "Processing...";
    msg.style.color = "white";
    
    let res;
    if (isLogin) {
        res = await db.auth.signInWithPassword({ email, password: pass });
    } else {
        const userTag = document.getElementById('regUser').value;
        res = await db.auth.signUp({ 
            email, 
            password: pass, 
            options: { data: { username: userTag } } 
        });
    }

    if (res.error) { 
        msg.innerText = res.error.message; 
        msg.style.color = '#EF4444'; 
    } else { 
        user = res.data.user;
        showView('wallet');
        if (pendingToken) claim(pendingToken);
    }
}

async function loadWallet() {
    if (!user) return;
    
    const { data } = await db.from('user_profiles').select('total_points').eq('user_id', user.id).single();
    if (data) updateUI(data.total_points);
    
    // Realtime listener
    db.channel('wallet-sync')
      .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'user_profiles', 
          filter: `user_id=eq.${user.id}` 
      }, payload => updateUI(payload.new.total_points))
      .subscribe();
}

function updateUI(pts) {
    document.getElementById('valPoints').innerText = pts.toFixed(1);
    document.getElementById('valPhp').innerText = (pts * 4).toFixed(2);
    const per = Math.min((pts / 50) * 100, 100);
    document.getElementById('bar').style.width = per + "%";
    
    const btn = document.getElementById('claimBtn');
    if (pts >= 50) { 
        btn.disabled = false; 
        btn.innerText = "Claim ₱200"; 
        btn.classList.add('btn-red');
        btn.classList.remove('btn-outline');
    }
}

async function claim(t) {
    const msg = document.getElementById('walletMsg');
    msg.innerText = "Processing Scan...";
    
    const { data, error } = await db.rpc('claim_reward_token', { p_token_id: t });
    
    if (error) { 
        msg.innerText = "Token invalid or already used."; 
        msg.style.color = '#EF4444'; 
    } else { 
        msg.innerText = `Success! +${data.toFixed(1)} Pts Added.`; 
        msg.style.color = '#10B981'; 
    }
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname); 
}

async function handleLogout() { 
    await db.auth.signOut(); 
    location.reload(); 
}

// Auto-login on Page Load
window.onload = async () => {
    // Set FB Link
    document.getElementById('fb-link').href = CONF.FB_PAGE;
    
    const { data } = await db.auth.getUser();
    if (data.user) { 
        user = data.user; 
        showView('wallet');
        if (pendingToken) claim(pendingToken);
    }
};
