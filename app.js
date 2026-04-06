
    // ==========================================
// 1. CONFIGURATION (EDIT THESE)
// ==========================================
const CONFIG = {
    LINKS: {
        FACEBOOK: "https://facebook.com/your-rvl-page",
        SUPPORT: "https://discord.gg/your-support-link"
    },
    // IMPORTANT: Replace these with your real Supabase details!
    SUPABASE_URL: 'https://fzsrmnexarqlaawnhmw.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ',

    
    // Economy Variables
    POINTS_REQUIRED: 50,
    PHP_PER_POINT: 4
};

// Global State
let isLoginMode = true;
let currentUser = null;
let pendingToken = null;
let dbClient = null; // Renamed to avoid collision with the CDN script

// ==========================================
// 2. UI ROUTING (Safe from Database Errors)
// ==========================================
function navigateTo(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`${viewName}-view`).classList.remove('hidden');

    if (viewName === 'dashboard') {
        if (!currentUser) {
            navigateTo('auth'); 
            return;
        }
        initDashboard();
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const regElements = document.querySelectorAll('.register-only');
    
    document.getElementById('authMessage').innerHTML = ""; 
    document.getElementById('auth-title').innerText = isLoginMode ? "RVL HUB LOGIN" : "JOIN RVL HUB";
    document.getElementById('submitBtn').innerText = isLoginMode ? "Secure Login" : "Create Account";
    document.getElementById('toggleQuestion').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.querySelector('.toggle-link').innerText = isLoginMode ? "Register here" : "Sign In here";

    if (isLoginMode) {
        regElements.forEach(el => el.classList.add('hidden'));
        document.getElementById('username').removeAttribute('required');
    } else {
        regElements.forEach(el => el.classList.remove('hidden'));
        document.getElementById('username').setAttribute('required', 'true');
    }
}

// ==========================================
// 3. INITIALIZATION & DATABASE CONNECTION
// ==========================================
window.onload = async () => {
    document.getElementById('btn-follow').href = CONFIG.LINKS.FACEBOOK;
    document.getElementById('btn-support').href = CONFIG.LINKS.SUPPORT;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
        pendingToken = urlParams.get('token');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
        if (CONFIG.SUPABASE_URL.startsWith('http')) {
            // Using window.supabase from the CDN, assigning it to dbClient
            dbClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
            const { data: { user } } = await dbClient.auth.getUser();
            currentUser = user;
        } else {
            console.warn("Supabase keys missing! The UI works, but Login/Dashboard will fail.");
        }
    } catch (err) {
        console.error("Database connection error:", err);
    }

    if (pendingToken) {
        if (currentUser) {
            navigateTo('dashboard');
            claimToken(pendingToken);
        } else {
            navigateTo('auth');
        }
    } else {
        navigateTo('home');
    }
};

// ==========================================
// 4. SUPABASE AUTHENTICATION
// ==========================================
async function handleAuth() {
    if (!dbClient) {
        alert("Database not connected. Please add Supabase URL & Key in app.js");
        return;
    }

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msgDiv = document.getElementById('authMessage');
    const btn = document.getElementById('submitBtn');

    msgDiv.style.color = "#FCD34D"; 
    msgDiv.innerHTML = "Authenticating securely...";
    btn.disabled = true;

    if (isLoginMode) {
        const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
        processAuthResult(data, error, msgDiv, btn, "Access Granted!");
    } else {
        const username = document.getElementById('username').value;
        const referral = document.getElementById('referral').value;
        const { data, error } = await dbClient.auth.signUp({
            email, password, options: { data: { username, used_referral: referral || null } }
        });
        processAuthResult(data, error, msgDiv, btn, "Account created! Initializing wallet...");
    }
}

function processAuthResult(data, error, msgDiv, btn, successMsg) {
    if (error) {
        msgDiv.style.color = "#EF4444";
        msgDiv.innerHTML = "Error: " + error.message;
        btn.disabled = false;
    } else {
        msgDiv.style.color = "#10B981";
        msgDiv.innerHTML = successMsg;
        currentUser = data.user;
        
        setTimeout(() => {
            navigateTo('dashboard');
            if (pendingToken) {
                claimToken(pendingToken);
                pendingToken = null; 
            }
        }, 1000);
    }
}

async function handleLogout() {
    if (dbClient) await dbClient.auth.signOut();
    currentUser = null;
    navigateTo('home');
}

// ==========================================
// 5. DASHBOARD & ECONOMY (Real-Time)
// ==========================================
async function initDashboard() {
    if (!dbClient) return;

    const { data: profile } = await dbClient
        .from('user_profiles')
        .select('total_points')
        .eq('user_id', currentUser.id)
        .single();

    if (profile) updateWalletUI(profile.total_points);

    dbClient.channel('custom-user-profile')
        .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${currentUser.id}`
            }, (payload) => {
                const msgDiv = document.getElementById('dashboardMessage');
                msgDiv.innerHTML = "🟢 Live Sync: Balance Updated!";
                msgDiv.style.color = "#10B981";
                
                document.getElementById('pointBalance').style.color = "#10B981";
                setTimeout(() => { document.getElementById('pointBalance').style.color = "#F8FAFC"; }, 1000);
                
                updateWalletUI(payload.new.total_points);
                setTimeout(() => { if(msgDiv.innerHTML.includes("Live Sync")) msgDiv.innerHTML = ""; }, 3000);
            }
        ).subscribe();
}

async function claimToken(token) {
    if (!dbClient) return;

    const msgDiv = document.getElementById('dashboardMessage');
    msgDiv.innerHTML = "Decrypting token securely...";
    msgDiv.style.color = "#FCD34D"; 

    const { data: pointsEarned, error } = await dbClient.rpc('claim_reward_token', { p_token_id: token });

    if (error) {
        msgDiv.innerHTML = "Error: Token invalid or already claimed.";
        msgDiv.style.color = "#EF4444"; 
    } else {
        msgDiv.innerHTML = `Success! +${pointsEarned.toFixed(1)} Points added.`;
        msgDiv.style.color = "#10B981"; 
    }
    setTimeout(() => { if(!msgDiv.innerHTML.includes("Live Sync")) msgDiv.innerHTML = ""; }, 5000);
}

function updateWalletUI(points) {
    document.getElementById('pointBalance').innerText = points.toFixed(1);
    document.getElementById('phpBalance').innerText = (points * CONFIG.PHP_PER_POINT).toFixed(2);

    let progress = (points / CONFIG.POINTS_REQUIRED) * 100;
    document.getElementById('cashbackProgress').style.width = `${Math.min(progress, 100)}%`;

    const btn = document.getElementById('claimCashbackBtn');
    if (points >= CONFIG.POINTS_REQUIRED) {
        btn.disabled = false;
        btn.className = "btn btn-unlocked w-100";
        btn.innerText = "CLAIM ₱200 CASHBACK";
        btn.onclick = () => alert("Cashback Claim Initiated!");
    } else {
        btn.disabled = true;
        btn.className = "btn btn-locked w-100";
        btn.innerText = `Locked (Needs ${CONFIG.POINTS_REQUIRED} Pts)`;
    }
}
