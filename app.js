
const SUPABASE_URL = 'https://fzsrmnexarqrlaawnhmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ'; // Replace with your actual Anon Key
// ==========================================

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. GLOBAL STATE
// ==========================================
let currentUserEmail = ""; 
let currentUserId = "";
let tempGamerTag = ""; 
let html5QrcodeScanner = null;
let isRegisterMode = false; 

// ==========================================
// 3. CORE NAVIGATION
// ==========================================
function navigateTo(viewName) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none';
    });
    const targetView = document.getElementById(viewName + '-view');
    if (targetView) {
        targetView.classList.add('active');
        targetView.style.display = 'block';
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
        navigateTo('home'); 
    }
});

// ==========================================
// 5. AUTHENTICATION & OTP LOGIC
// ==========================================
function toggleAuth() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').innerText = isRegisterMode ? "RVL REGISTER" : "RVL LOGIN";
    document.getElementById('authBtn').innerText = isRegisterMode ? "CREATE PROFILE" : "INITIALIZE";
    document.querySelector('.link-red').innerText = isRegisterMode ? "Login Here" : "Register Here";
    
    const gamerTagBox = document.getElementById('gamerTagInput');
    if (gamerTagBox) gamerTagBox.style.display = isRegisterMode ? "block" : "none";
    document.getElementById('authMsg').innerText = ""; 
}

async function handleAuth() {
    const tag = document.getElementById('gamerTagInput') ? document.getElementById('gamerTagInput').value.trim() : "";
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    
    const msgEl = document.getElementById('authMsg');
    const authBtn = document.getElementById('authBtn');

    if (!email || !password || (isRegisterMode && !tag)) {
        msgEl.innerText = "ERROR: ALL FIELDS REQUIRED.";
        msgEl.style.color = "#EF4444";
        return;
    }

    authBtn.disabled = true;
    authBtn.innerText = "TRANSMITTING...";
    msgEl.innerText = "ESTABLISHING CONNECTION...";
    msgEl.style.color = "#9CA3AF";

    if (isRegisterMode) {
        // --- SECURE REGISTRATION FLOW ---
        tempGamerTag = tag;
        currentUserEmail = email;

        const { data, error } = await db.auth.signUp({ email: email, password: password });

        if (error) {
            msgEl.innerText = "ERROR: " + error.message.toUpperCase();
            msgEl.style.color = "#EF4444";
            resetAuthButton();
        } else {
            navigateTo('otp');
            document.getElementById('otpMsg').innerText = "CODE SENT TO: " + email.toUpperCase();
            document.getElementById('otpMsg').style.color = "#10B981";
            resetAuthButton();
        }
    } else {
        // --- LOGIN FLOW ---
        const { data, error } = await db.auth.signInWithPassword({ email: email, password: password });

        if (error) {
            msgEl.innerText = "ERROR: " + error.message.toUpperCase();
            msgEl.style.color = "#EF4444";
            resetAuthButton();
        } else {
            currentUserEmail = email;
            currentUserId = data.user.id;
            refreshWalletDisplay();
            navigateTo('wallet');
            resetAuthButton();
        }
    }
}

function resetAuthButton() {
    const authBtn = document.getElementById('authBtn');
    authBtn.disabled = false;
    authBtn.innerText = isRegisterMode ? "CREATE PROFILE" : "INITIALIZE";
}

async function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const msgEl = document.getElementById('otpMsg');

    msgEl.innerText = "VERIFYING...";
    msgEl.style.color = "#9CA3AF";

    const { data, error } = await db.auth.verifyOtp({ email: currentUserEmail, token: code, type: 'signup' });

    if (error) {
        msgEl.innerText = "ERROR: INVALID OR EXPIRED CODE.";
        msgEl.style.color = "#EF4444";
    } else {
        currentUserId = data.user.id;
        executeProfileSave(data.user.id);
    }
}

async function executeProfileSave(uid) {
    const msgEl = document.getElementById('otpMsg');
    msgEl.innerText = "CREATING PROFILE...";

    const { error: profileError } = await db.from('user_profiles').insert([
        { user_id: uid, email: currentUserEmail, nickname: tempGamerTag, total_points: 0, potions: 0 }
    ]);

    if (profileError) {
        console.error("Profile Error:", profileError);
        navigateTo('wallet'); // If it fails, they are still logged in, send to wallet
    } else {
        refreshWalletDisplay();
        navigateTo('wallet');
    }
}

async function handleLogout() {
    await db.auth.signOut();
    currentUserEmail = "";
    currentUserId = "";
    tempGamerTag = "";
    navigateTo('home');
}

// ==========================================
// 6. WALLET UI & POTION INVENTORY DISPLAY
// ==========================================
async function refreshWalletDisplay() {
    if (!currentUserEmail) return;

    const { data, error } = await db.from('user_profiles').select('*').eq('email', currentUserEmail).single();
    
    if (data) {
        // Update Points and PHP Value
        document.getElementById('valPoints').innerText = data.total_points.toFixed(1);
        document.getElementById('valPhp').innerText = (data.total_points * 4).toFixed(2);
        
        // Update Gamer Tag
        const refEl = document.getElementById('myRefCode');
        if (refEl && data.nickname) refEl.innerText = data.nickname.toUpperCase();

        // 🧪 UPDATE POTION INVENTORY UI
        // Find this line inside refreshWalletDisplay()
        const potionCount = data.potions || 0; // If potions is undefined, use 0
        const potionEl = document.getElementById('potionCount');

        if (potionEl) {
            potionEl.innerText = `🧪 ${potionCount}x BOOST POTIONS`;
        }

        // 🧪 SHOW/HIDE THE POTION CHECKBOX IN THE SCANNER
        const potionSection = document.getElementById('potionSection');
        if (potionSection) {
            if (data.potions > 0) {
                potionSection.style.display = 'block'; // Reveal the potion drink option
            } else {
                potionSection.style.display = 'none'; // Hide it if they are out of potions
                document.getElementById('usePotionToggle').checked = false; // Uncheck it automatically
            }
        }
    }
}

// ==========================================
// 7. QR SCANNER & POTION SYNC LOGIC
// ==========================================
function startScanner() {
    navigateTo('scanner');
    const msgEl = document.getElementById('scanMsg');
    msgEl.innerText = "ALIGN QR WITHIN FRAME";
    msgEl.style.color = "#9CA3AF";

    // Uncheck the potion box by default every time they open the scanner
    document.getElementById('usePotionToggle').checked = false; 

    if (!html5QrcodeScanner) html5QrcodeScanner = new Html5Qrcode("reader");

    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        { fps: 20, qrbox: { width: 280, height: 280 }, aspectRatio: 1.0 }, 
        onScanSuccess
    ).catch(err => {
        msgEl.innerText = "CAMERA ACCESS DENIED";
        msgEl.style.color = "#EF4444";
    });
}

function stopScanner() {
    if (html5QrcodeScanner) html5QrcodeScanner.stop().catch(err => console.error(err));
}

function onScanSuccess(decodedText, decodedResult) {
    stopScanner(); 
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

async function syncTerminal(hashToken) {
    if (!currentUserEmail) { navigateTo('auth'); return; }

    const msgEl = document.getElementById('scanMsg');
    
    // 🧪 Check if the player decided to drink the potion!
    const isPotionChecked = document.getElementById('usePotionToggle').checked; 

    msgEl.innerText = "ESTABLISHING SECURE LINK...";
    msgEl.style.color = "#9CA3AF";

    try {
        // Send the hash AND the potion decision to the Supabase database
        const { data: earnedPoints, error } = await db.rpc('claim_session_token', {
            p_user_email: currentUserEmail,
            p_token: hashToken,
            p_use_potion: isPotionChecked
        });

        if (error) {
            msgEl.innerText = "ERROR: " + error.message.toUpperCase();
            msgEl.style.color = "#EF4444";
            return;
        }

        // Show a special neon message if the potion worked
        if (isPotionChecked) {
            msgEl.innerText = `🧪 1.5x BOOST ACTIVE! +${earnedPoints} PTS SECURED.`;
            document.getElementById('usePotionToggle').checked = false; // Reset the box
        } else {
            msgEl.innerText = `SYNC COMPLETE: +${earnedPoints} PTS SECURED.`;
        }
        
        msgEl.style.color = "#10B981";
        document.getElementById('manualTokenInput').value = ""; // Clear manual box
        
        // Update the wallet numbers and send them back to the dashboard
        refreshWalletDisplay();
        setTimeout(() => { navigateTo('wallet'); }, 2500);

    } catch (err) {
        msgEl.innerText = "CRITICAL SYSTEM FAILURE.";
        msgEl.style.color = "#EF4444";
    }
}
