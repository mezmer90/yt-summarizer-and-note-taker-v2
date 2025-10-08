console.log('Payment success page loaded');

// Get session ID from URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session_id');
const extensionId = urlParams.get('ext_id');

console.log('Session ID:', sessionId);
console.log('Extension ID:', extensionId);

async function loadSubscriptionDetails() {
  try {
    // Check session to get extension user ID
    const sessionResponse = await fetch(`/api/stripe/check-session/${sessionId}`);
    const sessionData = await sessionResponse.json();

    if (sessionData.success && sessionData.extensionUserId) {
      // Fetch subscription details
      const subResponse = await fetch(`/api/stripe/subscription-status/${sessionData.extensionUserId}`);
      const subData = await subResponse.json();

      // Hide spinner and initial status
      const spinner = document.querySelector('.spinner');
      const redirectInfo = document.querySelector('.redirect-info');
      if (spinner) spinner.style.display = 'none';
      if (redirectInfo) redirectInfo.style.display = 'none';

      // Show plan details
      if (subData.success && subData.planName) {
        document.getElementById('planName').textContent = subData.planName;
        document.getElementById('planDetails').style.display = 'block';
      }

      // Show close message
      document.getElementById('closeMessage').style.display = 'block';

    } else {
      throw new Error('Could not retrieve subscription details');
    }
  } catch (error) {
    console.error('Error loading subscription:', error);

    // Fallback: just show generic success message
    const spinner = document.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';

    document.getElementById('status').textContent = '✅ Payment confirmed! Your subscription is now active.';
    document.getElementById('status').style.fontSize = '1.2rem';
    document.getElementById('status').style.fontWeight = '600';
    document.getElementById('status').style.color = '#10b981';

    document.getElementById('closeMessage').style.display = 'block';
  }
}

// Load subscription details
if (sessionId && extensionId) {
  loadSubscriptionDetails();
} else {
  // Fallback if missing parameters
  const spinner = document.querySelector('.spinner');
  if (spinner) spinner.style.display = 'none';
  document.getElementById('status').textContent = 'Payment successful! Please close this tab and open your extension.';
  document.getElementById('closeMessage').style.display = 'block';
}
