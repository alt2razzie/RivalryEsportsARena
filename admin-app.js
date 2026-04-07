const CONF = { URL: 'https://fzsrmnexarqrlaawnhmw.supabase.co', KEY: 'YOUR_ANON_KEY' };
const db = supabase.createClient(CONF.URL, CONF.KEY);

let selectedPoints = 0;
let playerEmail = "";

function selectAmount(amt, btn) {
    selectedPoints = amt;
    document.querySelectorAll('.btn-amt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function initiateRedemption() {
    playerEmail = document.getElementById('playerEmail').value.trim();
    const msg = document.getElementById('statusMsg');

    if (!playerEmail || selectedPoints === 0) {
        msg.innerText = "INPUT EMAIL & SELECT AMOUNT";
        msg.style.color = "var(--red-primary)";
        return;
    }

    msg.innerText = "SENDING OTP TO PLAYER...";
    msg.style.color = "white";

    // Trigger an OTP to the player's email using Supabase's built-in "Magic Link/OTP" system
    const { error } = await db.auth.signInWithOtp({ email: playerEmail });

    if (error) {
        msg.innerText = "ERROR: " + error.message.toUpperCase();
        msg.style.color = "var(--red-primary)";
    } else {
        msg.innerText = "OTP SENT. AWAITING VERIFICATION.";
        msg.style.color = "var(--success)";
        document.getElementById('step1').style.display = 'none';
        document.getElementById('step2').style.display = 'block';
    }
}

async function confirmRedemption() {
    const otp = document.getElementById('adminOtp').value.trim();
    const msg = document.getElementById('statusMsg');

    msg.innerText = "VERIFYING PLAYER...";

    // 1. Verify the OTP is correct
    const { data, error: otpError } = await db.auth.verifyOtp({
        email: playerEmail,
        token: otp,
        type: 'magiclink' // Or 'signup' depending on your settings
    });

    if (otpError) {
        msg.innerText = "INVALID OTP CODE";
        msg.style.color = "var(--red-primary)";
    } else {
        // 2. OTP is correct! Now call the deduction function
        msg.innerText = "DEDUCTING POINTS...";
        const { data: claimData, error: claimError } = await db.rpc('admin_claim_points', {
            p_user_email: playerEmail,
            p_points_to_deduct: selectedPoints
        });

        if (claimError) {
            msg.innerText = claimError.message.toUpperCase();
            msg.style.color = "var(--red-primary)";
        } else {
            msg.innerText = "SUCCESS! CLAIM COMPLETE.";
            msg.style.color = "var(--success)";
            setTimeout(() => { location.reload(); }, 3000);
        }
    }
}
