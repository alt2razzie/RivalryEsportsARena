// ==========================================
// 1. CONFIGURATION (EDIT THESE)
// ==========================================
const CONFIG = {
    // Put your actual social media and support links here
    LINKS: {
        FACEBOOK: "https://facebook.com/your-rvl-page",
        SUPPORT: "https://discord.gg/your-support-link"
    },
    // Supabase Credentials
    SUPABASE_URL: 'https://fzsrmnexarqlaawnhmw.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ',
    // Economy
    POINTS_REQUIRED: 50,
    PHP_PER_POINT: 4
};

// Initialize Supabase
const supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// State Variables
let isLoginMode = true;
let currentUser = null;
let pendingToken = null; // Stores QR code token if user isn't logged in yet

// ==========================================
// 2. INITIALIZATION & ROUTING
// ==========================================
window.onload = async () => {
    // Inject the links into the HTML buttons
    document.getElementById('btn-follow').href = CONFIG.LINKS.FACEBOOK;
    document.getElementById('btn-support').href = CONFIG.LINKS.SUPPORT;

    // Check if there is a QR Token in the URL (?token=XYZ)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
        pendingToken = urlParams.get('token');
        // Clean URL so it doesn't trigger again on manual refresh
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check Auth State
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    // Decide where to send the user on load
    if (pendingToken) {
        if (currentUser) {
            navigateTo('dashboard');
            claimToken(pendingToken);
        } else {
            navigateTo('auth'); // Force login to claim
        }
    } else {
        navigateTo('home'); // Default starting view
    }
};

// Simple Router function to hide/show views
function navigateTo(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`${viewName}-view`).classList.remove('hidden');

    // If navigating to dashboard, initialize it
    if (viewName === 'dashboard') {
        if (!currentUser) {
            navigateTo('auth'); // Security block
            return;
        }
        initDashboard();
    }
}

// ==========================================
// 3. AUTHENTICATION CONTROLLER
// ==========================================
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

async function handleAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msgDiv = document.getElementById('authMessage');
    const btn = document.getElementById('submitBtn');

    msgDiv.style.color = "#FCD34D"; 
    msgDiv.innerHTML = "Authenticating securely...";
    btn.disabled = true;

    if (isLoginMode) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        processAuthResult(data, error, msgDiv, btn, "Access Granted!");
    } else {
        const username = document.getElementById('username').value;
        const referral = document.getElementById('referral').value;
        const { data, error } = await supabase.auth.signUp({
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
                pendingToken = null; // Clear it after use
            }
        }, 1000);
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    currentUser = null;
    navigateTo('home');
}

// ==========================================
// 4. DASHBOARD & ECONOMY CONTROLLER
// ==========================================
async function initDashboard() {
    // 1. Fetch Initial Wallet State
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('total_points')
        .eq('user_id', currentUser.id)
        .single();

    if (profile) updateWalletUI(profile.total_points);

    // 2. Start Real-Time Listener
    supabase.channel('custom-user-profile')
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
    const msgDiv = document.getElementById('dashboardMessage');
    msgDiv.innerHTML = "Decrypting token securely...";
    msgDiv.style.color = "#FCD34D"; 

    const { data: pointsEarned, error } = await supabase.rpc('claim_reward_token', { p_token_id: token });

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
