
const SUPABASE_URL = 'https://fzsrmnexarqrlaawnhmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ'; // Replace with your actual Anon Key

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. GLOBAL STATE
// ==========================================
let currentUserEmail = ""; 
let currentUserId = "";
let html5QrcodeScanner = null;
let isRegisterMode = false; // Tracks if the user is on the Login or Register screen

// ==========================================
// 3. CORE NAVIGATION (SPA ROUTER)
// ==========================================
function navigateTo(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none';
    });

    // Show the target view
    const targetView = document.getElementById(viewName + '-view');
    if (targetView) {
        targetView.classList.add('active');
        targetView.style.display = 'block';
    } else {
        console.error("View not found:", viewName);
    }
}

// ==========================================
// 4. INITIALIZATION (Check if already logged in)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    
    if (session && session.user) {
        currentUserEmail = session.user.email;
        currentUserId = session.user.id;
        refreshWalletDisplay(); 
        navigateTo('wallet');
    } else {
        navigateTo('auth'); // Send to login screen
    }
});

// ==========================================
// 5. AUTHENTICATION LOGIC (Email & Password)
// ==========================================
function toggleAuth() {
    isRegisterMode = !isRegisterMode;
    
    // Update UI Titles and Buttons
    document.getElementById('authTitle').innerText = isRegisterMode ? "RVL REGISTER" : "RVL LOGIN";
    document.getElementById('authBtn').innerText = isRegisterMode ? "CREATE PROFILE" : "INITIALIZE";
    document.querySelector('.link-red').innerText = isRegisterMode ? "Login Here" : "Register Here";
    
    // Show/Hide specific inputs based on mode
    // (Assuming you have an ID 'gamerTagInput' for the Nickname box)
    const gamerTagBox = document.getElementById('gamerTagInput');
    if (gamerTagBox) gamerTagBox.style.display = isRegisterMode ? "block" : "none";
    
    document.getElementById('authMsg').innerText = ""; // Clear errors
}

async function handleAuth() {
    const gamerTag = document.getElementById('gamerTagInput').value.trim();
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const msgEl = document.getElementById('authMsg');

    // 1. Create the Secure Account
    const { data, error } = await db.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        msgEl.innerText = "AUTH ERROR: " + error.message.toUpperCase();
        return;
    }

    // 2. Connect Auth to Database (Profile Table)
    if (data.user) {
        const { error: profileError } = await db.from('user_profiles').insert([
    { 
        user_id: data.user.id, // Check if your table uses 'user_id' or just 'id'
        email: email, 
        nickname: gamerTag,
        total_points: 0 
    }
]);

        if (profileError) {
            msgEl.innerText = "DB CONNECTION ERROR: " + profileError.message;
        } else {
            msgEl.innerText = "REGISTRATION SUCCESSFUL!";
            msgEl.style.color = "#10B981";
            
            // Log them in and go to wallet
            currentUserEmail = email;
            navigateTo('wallet');
            refreshWalletDisplay();
        }
    }
}

function resetAuthButton() {
    const authBtn = document.getElementById('authBtn');
    authBtn.disabled = false;
    authBtn.innerText = isRegisterMode ? "CREATE PROFILE" : "INITIALIZE";
}

async function handleLogout() {
    await db.auth.signOut();
    currentUserEmail = "";
    currentUserId = "";
    navigateTo('auth');
}

// ==========================================
// 6. WALLET & UI DISPLAY
// ==========================================
async function refreshWalletDisplay() {
    if (!currentUserEmail) return;

    const { data, error } = await db.from('user_profiles').select('*').eq('email', currentUserEmail).single();
    
    if (data) {
        const ptsEl = document.getElementById('valPoints');
        if (ptsEl) ptsEl.innerText = data.total_points.toFixed(1);
        
        // Example: 1 Point = 4 PHP (Adjust to your actual conversion rate)
        const phpEl = document.getElementById('valPhp');
        if (phpEl) phpEl.innerText = (data.total_points * 4).toFixed(2);
        
        const refEl = document.getElementById('myRefCode');
        if (refEl && data.nickname) refEl.innerText = data.nickname.toUpperCase();
    }
}

// ==========================================
// 7. QR SCANNER LOGIC
// ==========================================
function startScanner() {
    navigateTo('scanner');
    
    const msgEl = document.getElementById('scanMsg');
    msgEl.innerText = "ALIGN QR WITHIN FRAME";
    msgEl.style.color = "#9CA3AF";

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    const config = { 
        fps: 20, 
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0 
    };

    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        msgEl.innerText = "CAMERA ACCESS DENIED OR UNAVAILABLE";
        msgEl.style.color = "#EF4444";
    });
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(err => console.error("Failed to stop scanner", err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    stopScanner(); 
    // Sends the 6-digit Hash to the Database
    syncTerminal(decodedText.toUpperCase());
}

function claimManual() {
    const manualToken = document.getElementById('manualTokenInput').value.trim().toUpperCase();
    if (manualToken.length === 6) {
        syncTerminal(manualToken);
    } else {
        document.getElementById('scanMsg').innerText = "ERROR: ENTER 6-DIGIT HASH.";
        document.getElementById('scanMsg').style.color = "#EF4444";
    }
}

// ==========================================
// 8. SECURE DATABASE SYNC (RPC CALL)
// ==========================================
async function syncTerminal(hashToken) {
    if (!currentUserEmail) {
        navigateTo('auth');
        return;
    }

    const msgEl = document.getElementById('scanMsg');
    msgEl.innerText = "ESTABLISHING SECURE LINK...";
    msgEl.style.color = "#9CA3AF";

    try {
        // Calls the Anti-Farming RPC we built in Supabase
        const { data: earnedPoints, error } = await db.rpc('claim_session_token', {
            p_user_email: currentUserEmail,
            p_token: hashToken
        });

        if (error) {
            console.error("RPC Error:", error.message);
            msgEl.innerText = "ERROR: " + error.message.toUpperCase();
            msgEl.style.color = "#EF4444";
            return;
        }

        msgEl.innerText = `SYNC COMPLETE: +${earnedPoints} PTS SECURED.`;
        msgEl.style.color = "#10B981";
        
        const manualInput = document.getElementById('manualTokenInput');
        if (manualInput) manualInput.value = "";
        
        refreshWalletDisplay();
        
        // Auto-return to wallet after success
        setTimeout(() => {
            navigateTo('wallet');
        }, 2500);

    } catch (err) {
        console.error(err);
        msgEl.innerText = "CRITICAL SYSTEM FAILURE.";
        msgEl.style.color = "#EF4444";
    }
}

// ==========================================
// 9. UI STUBS & EXTRA FEATURES
// ==========================================
function loadLeaderboard() {
    navigateTo('leaderboard');
    // You can fetch and build the leaderboard HTML here later!
    document.getElementById('lbContainer').innerHTML = "<p style='color: var(--text-muted); text-align: center;'>RANKINGS SYNCING...</p>";
}
