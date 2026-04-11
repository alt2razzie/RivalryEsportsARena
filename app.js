// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://fzsrmnexarqrlaawnhmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ'; // Replace with your actual Anon Key

// BUG FIX: Name this 'db' instead of 'supabase' to avoid the "already declared" crash
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 2. GLOBAL STATE ---
let currentUserEmail = ""; 
let currentToken = ""; 
let html5QrcodeScanner = null;
let isRegisterMode = false;

// --- 3. CORE NAVIGATION (SPA ROUTER) ---
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

// --- 4. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is already logged in
    const { data: { session } } = await db.auth.getSession();
    
    if (session && session.user) {
        currentUserEmail = session.user.email;
        refreshWalletDisplay(); 
        navigateTo('wallet');
    } else {
        navigateTo('home');
    }

    // Check if they scanned a QR code via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
        currentToken = urlParams.get('token').toUpperCase();
        
        // Auto-fill manual input just in case
        const manualInput = document.getElementById('manualTokenInput');
        if (manualInput) manualInput.value = currentToken;

        // If logged in, jump straight to scanner view to confirm extraction
        if (session && session.user) {
            navigateTo('scanner-view');
        }
    }
});

// --- 5. AUTHENTICATION LOGIC ---
function toggleAuth() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').innerText = isRegisterMode ? "RVL REGISTER" : "RVL LOGIN";
    document.getElementById('authBtn').innerText = isRegisterMode ? "CREATE PROFILE" : "INITIALIZE";
    document.getElementById('toggleText').innerText = isRegisterMode ? "Already in the system?" : "New to the arena?";
    document.querySelector('.link-red').innerText = isRegisterMode ? "Login Here" : "Register Here";
    
    document.getElementById('regFields').style.display = isRegisterMode ? "block" : "none";
    document.getElementById('forgotLink').style.display = isRegisterMode ? "none" : "block";
}

async function handleAuth() {
    const email = document.getElementById('emailOrNick').value.trim();
    const msgEl = document.getElementById('authMsg');
    
    if (!email) {
        msgEl.innerText = "ERROR: EMAIL REQUIRED.";
        msgEl.style.color = "#EF4444";
        return;
    }

    msgEl.innerText = "CONNECTING...";
    msgEl.style.color = "#9CA3AF";

    // Since we are using Passwordless OTP for maximum security
    const { data, error } = await db.auth.signInWithOtp({
        email: email,
        options: { should_create_user: isRegisterMode }
    });

    if (error) {
        msgEl.innerText = "ERROR: " + error.message.toUpperCase();
        msgEl.style.color = "#EF4444";
    } else {
        currentUserEmail = email; // Store temporarily for OTP check
        navigateTo('otp');
        document.getElementById('otpMsg').innerText = "CODE SENT TO " + email;
        document.getElementById('otpMsg').style.color = "#10B981";
    }
}

async function verifyOTP() {
    const otp = document.getElementById('otpCode').value.trim();
    const msgEl = document.getElementById('otpMsg');

    if (otp.length !== 6) {
        msgEl.innerText = "ENTER 6-DIGIT HASH.";
        msgEl.style.color = "#EF4444";
        return;
    }

    msgEl.innerText = "VERIFYING HASH...";
    msgEl.style.color = "#9CA3AF";

    const { data: { session }, error } = await db.auth.verifyOtp({
        email: currentUserEmail,
        token: otp,
        type: 'email'
    });

    if (error || !session) {
        msgEl.innerText = "ACCESS DENIED: INVALID HASH.";
        msgEl.style.color = "#EF4444";
    } else {
        currentUserEmail = session.user.email;
        refreshWalletDisplay();
        navigateTo('wallet');
        // Clear inputs
        document.getElementById('emailOrNick').value = '';
        document.getElementById('otpCode').value = '';
    }
}

async function handleLogout() {
    await db.auth.signOut();
    currentUserEmail = "";
    navigateTo('home');
}

// --- 6. WALLET & UI DISPLAY ---
async function refreshWalletDisplay() {
    if (!currentUserEmail) return;

    const { data, error } = await db.from('user_profiles').select('*').eq('email', currentUserEmail).single();
    
    if (data) {
        // Update Points
        const ptsEl = document.getElementById('valPoints');
        if (ptsEl) ptsEl.innerText = data.total_points.toFixed(1);
        
        // Update PHP Value (Assuming 1 Pt = 4 PHP)
        const phpEl = document.getElementById('valPhp');
        if (phpEl) phpEl.innerText = (data.total_points * 4).toFixed(2);
        
        // Update Nickname/RefCode (If your table has these)
        const refEl = document.getElementById('myRefCode');
        if (refEl && data.nickname) refEl.innerText = data.nickname.toUpperCase();
    }
}

// --- 7. QR SCANNER LOGIC ---
function startScanner() {
    navigateTo('scanner');
    
    // Clear old messages
    document.getElementById('scanMsg').innerText = "ALIGN QR WITHIN FRAME";
    document.getElementById('scanMsg').style.color = "#9CA3AF";

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        document.getElementById('scanMsg').innerText = "CAMERA ACCESS DENIED OR UNAVAILABLE";
        document.getElementById('scanMsg').style.color = "#EF4444";
    });
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(err => console.error("Failed to stop scanner", err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    stopScanner(); // Stop camera once successfully read
    
    // Check if the QR contains a full URL or just a token
    let tokenToProcess = decodedText;
    if (decodedText.includes('token=')) {
        const params = new URLSearchParams(decodedText.split('?')[1]);
        tokenToProcess = params.get('token');
    }

    if (tokenToProcess) {
        syncTerminal(tokenToProcess.toUpperCase());
    } else {
        document.getElementById('scanMsg').innerText = "INVALID RVL QR FORMAT.";
        document.getElementById('scanMsg').style.color = "#EF4444";
    }
}

// Manual Entry Fallback
function claimManual() {
    const manualToken = document.getElementById('manualTokenInput').value.trim().toUpperCase();
    if (manualToken) {
        syncTerminal(manualToken);
    } else {
        document.getElementById('scanMsg').innerText = "ENTER HASH FIRST.";
        document.getElementById('scanMsg').style.color = "#EF4444";
    }
}

// --- 8. SECURE DATABASE SYNC ---
async function syncTerminal(hashToken) {
    if (!currentUserEmail) {
        navigateTo('auth');
        return;
    }

    const msgEl = document.getElementById('scanMsg');
    msgEl.innerText = "ESTABLISHING SECURE LINK...";
    msgEl.style.color = "#9CA3AF";

    try {
        const { data: earnedPoints, error } = await db.rpc('claim_session_token', {
            p_user_email: currentUserEmail,
            p_token: hashToken
        });

        if (error) {
            console.error("RPC Error:", error.message);
            msgEl.innerText = error.message.includes("sufficient") ? "ERROR: HASH VOID OR EXPIRED." : "ERROR: NETWORK REJECTION.";
            msgEl.style.color = "#EF4444";
            return;
        }

        // Success Workflow
        msgEl.innerText = `SYNC COMPLETE: +${earnedPoints} PTS ADDED.`;
        msgEl.style.color = "#10B981";
        
        // Clear manual input
        document.getElementById('manualTokenInput').value = "";
        
        // Refresh wallet and jump back to wallet view after 2 seconds
        refreshWalletDisplay();
        setTimeout(() => {
            navigateTo('wallet');
        }, 2000);

    } catch (err) {
        console.error(err);
        msgEl.innerText = "CRITICAL SYSTEM FAILURE.";
        msgEl.style.color = "#EF4444";
    }
}

// --- 9. STUBS FOR EXTRA FEATURES ---
// These are placeholders so your buttons don't throw errors when clicked.
function loadLeaderboard() {
    navigateTo('leaderboard');
    document.getElementById('lbContainer').innerHTML = "<p style='color: var(--text-muted); text-align: center;'>RANKINGS SYNCING...</p>";
}

function sendResetCode() {
    document.getElementById('forgotMsg').innerText = "SYSTEM NOT CONFIGURED YET.";
    document.getElementById('forgotMsg').style.color = "#EF4444";
}

function claimStreak() {
    console.log("Streak Claim Clicked");
}
