

const SUPABASE_URL = 'https://fzsrmnexarqrlaawnhmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ'; // Replace with your actual Anon Key
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let tempGamerTag = ""; // Stores the tag while waiting for OTP
let currentUserEmail = "";

// --- Navigation ---
function navigateTo(view) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(view + '-view').style.display = 'block';
}

// --- Auth: Signup/Login ---
async function handleAuth() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const tag = document.getElementById('gamerTagInput').value.trim();
    const msgEl = document.getElementById('authMsg');
    const btn = document.getElementById('authBtn');

    btn.disabled = true;
    msgEl.innerText = "PROCESSING...";

    if (isRegisterMode) {
        // --- SECURE REGISTRATION ---
        tempGamerTag = tag;
        currentUserEmail = email;

        const { data, error } = await db.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            msgEl.innerText = "ERROR: " + error.message.toUpperCase();
            btn.disabled = false;
        } else {
            // Supabase sends OTP automatically if "Confirm Email" is ON
            navigateTo('otp');
            document.getElementById('otpMsg').innerText = "CODE SENT TO: " + email;
        }
    } else {
        // --- STANDARD LOGIN ---
        const { data, error } = await db.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            msgEl.innerText = "LOGIN FAILED: CHECK CREDENTIALS";
            btn.disabled = false;
        } else {
            currentUserEmail = email;
            refreshWalletDisplay();
            navigateTo('wallet');
        }
    }
}

// --- OTP Verification ---
async function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const msgEl = document.getElementById('otpMsg');

    const { data, error } = await db.auth.verifyOtp({
        email: currentUserEmail,
        token: code,
        type: 'signup'
    });

    if (error) {
        msgEl.innerText = "INVALID OR EXPIRED CODE.";
        msgEl.style.color = "#EF4444";
    } else {
        // NOW the user is Authenticated. We can save the Gamer Tag!
        saveProfileData(data.user.id);
    }
}

// --- Database: Create Profile Row ---
async function saveProfileData(uid) {
    const { error } = await db.from('user_profiles').insert([
        { 
            user_id: uid, 
            email: currentUserEmail, 
            nickname: tempGamerTag, 
            total_points: 0 
        }
    ]);

    if (error) {
        console.error("Profile Save Error:", error);
        // If profile exists already, just go to wallet
        navigateTo('wallet');
    } else {
        refreshWalletDisplay();
        navigateTo('wallet');
    }
}

// --- Wallet & Scanner (Standard logic) ---
async function refreshWalletDisplay() {
    const { data } = await db.from('user_profiles').select('*').eq('email', currentUserEmail).single();
    if (data) {
        document.getElementById('valPoints').innerText = data.total_points.toFixed(1);
        document.getElementById('valPhp').innerText = (data.total_points * 4).toFixed(2);
        document.getElementById('myRefCode').innerText = data.nickname.toUpperCase();
    }
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload();
}
