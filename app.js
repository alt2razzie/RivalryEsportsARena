// --- CONFIGURATION ---
const SUPABASE_URL = 'https://fzsrmnexarqrlaawnhmw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c3JtbmV4YXJxcmxhYXduaG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTc3NjAsImV4cCI6MjA5MTA3Mzc2MH0.VMN_srt8MBpQBq4F3SlTZJrnubrERF4RIGHG-Qe3dRQ'; // Replace with your actual key

// Initialize Supabase
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL STATE ---
let currentUserEmail = ""; 
let currentToken = ""; // Holds the 6-digit hash

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authenticate: Get the logged-in user's session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session && session.user) {
        currentUserEmail = session.user.email;
        refreshWalletDisplay(currentUserEmail); 
    } else {
        console.warn("User not logged in. Redirect to login screen.");
        // window.location.href = "login.html"; 
    }

    // 2. Auto-Detect QR Scans: Grab the token from the URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
        currentToken = urlParams.get('token').toUpperCase();
        console.log("Token detected from QR Scan:", currentToken);
        
        // Optional: If you have a text input for manual entry, auto-fill it
        const tokenInput = document.getElementById('token-input');
        if (tokenInput) tokenInput.value = currentToken;
    }

    // 3. Attach Action to your "SYNC TERMINAL" button
    const syncBtn = document.getElementById('btn-sync-terminal');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            // Grab token from URL variable, OR from a manual input field if they typed it
            const manualInput = document.getElementById('token-input')?.value.toUpperCase();
            const finalHash = manualInput || currentToken;
            
            if (finalHash) {
                syncTerminal(finalHash);
            } else {
                showError("ERROR: NO HASH DETECTED. SCAN QR OR ENTER CODE.");
            }
        });
    }
});

// --- CORE FUNCTION: SECURE DATABASE SYNC ---
async function syncTerminal(hashToken) {
    if (!currentUserEmail) {
        showError("ERROR: WALLET NOT AUTHENTICATED.");
        return;
    }

    showStatus("ESTABLISHING SECURE LINK...");

    try {
        // Fire the secure SQL function we built
        const { data: earnedPoints, error } = await supabase.rpc('claim_session_token', {
            p_user_email: currentUserEmail,
            p_token: hashToken
        });

        // Handle Database Rejections
        if (error) {
            console.error("Supabase Rejected:", error.message);
            
            // This catches the exact SQL exception we wrote (Points < 1 or already claimed)
            if (error.message.includes("Invalid, expired, or insufficient")) {
                showError("ERROR: HASH VOID OR EXPIRED.");
            } else {
                showError("ERROR: NETWORK CONNECTION LOST.");
            }
            return;
        }

        // --- SUCCESS STATE ---
        showSuccess(`SYNC COMPLETE: +${earnedPoints} PTS ADDED.`);
        
        // Erase the token so they can't spam the button
        currentToken = "";
        if (document.getElementById('token-input')) {
            document.getElementById('token-input').value = "";
        }

        // Instantly update the giant number on their screen
        refreshWalletDisplay(currentUserEmail);

    } catch (err) {
        showError("CRITICAL SYSTEM FAILURE.");
        console.error(err);
    }
}

// --- UI HELPERS ---
function refreshWalletDisplay(email) {
    // Pull fresh data from the database to ensure the screen matches the server
    supabase.from('user_profiles').select('total_points').eq('email', email).single()
        .then(({ data, error }) => {
            if (data && document.getElementById('display-points')) {
                // Assuming you have a <span id="display-points"> for the big 275.1 number
                document.getElementById('display-points').innerText = data.total_points.toFixed(1);
                
                // Calculate Peso Value (Assuming 1 Pt = 4 Pesos based on your screenshot)
                const pesoValue = (data.total_points * 4).toFixed(2);
                const estValueEl = document.getElementById('display-est-value');
                if (estValueEl) {
                    estValueEl.innerText = `₱${pesoValue}`;
                }
            }
        });
}

// Functions to change the text above the big points number
function showError(msg) {
    const statusEl = document.getElementById('wallet-status-msg');
    if (statusEl) {
        statusEl.innerText = msg;
        statusEl.style.color = "#EF4444"; // RVL Red
    }
}

function showStatus(msg) {
    const statusEl = document.getElementById('wallet-status-msg');
    if (statusEl) {
        statusEl.innerText = msg;
        statusEl.style.color = "#9CA3AF"; // Neutral Gray
    }
}

function showSuccess(msg) {
    const statusEl = document.getElementById('wallet-status-msg');
    if (statusEl) {
        statusEl.innerText = msg;
        statusEl.style.color = "#10B981"; // Secure Green
    }
}
