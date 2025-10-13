// Admin Dashboard JavaScript

const API_BASE = window.location.origin + '/api';
let authToken = localStorage.getItem('adminToken');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    showDashboard();
  } else {
    showLogin();
  }

  setupEventListeners();
});

function setupEventListeners() {
  // Login form
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

// Login handler
async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');

  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.add('active');
      return;
    }

    authToken = data.token;
    localStorage.setItem('adminToken', authToken);
    localStorage.setItem('adminEmail', data.admin.email);

    showDashboard();
  } catch (error) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.add('active');
  }
}

// Logout handler
function handleLogout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminEmail');
  authToken = null;
  showLogin();
}

// Show login page
function showLogin() {
  document.getElementById('loginPage').classList.add('active');
  document.getElementById('dashboardPage').classList.remove('active');
}

// Show dashboard
async function showDashboard() {
  document.getElementById('loginPage').classList.remove('active');
  document.getElementById('dashboardPage').classList.add('active');
  document.getElementById('adminEmail').textContent = localStorage.getItem('adminEmail');

  await loadDashboardData();
}

// Load all dashboard data
async function loadDashboardData() {
  await Promise.all([
    loadStats(),
    loadModels(),
    loadUsers(),
    loadStudentVerifications('all'),
    loadFeedback('all'),
    loadSettings(),
    loadLogs()
  ]);
}

// Load stats
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/admin/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to load stats');

    const data = await response.json();
    const stats = data.stats;

    document.getElementById('totalUsers').textContent = stats.total_users || 0;
    document.getElementById('freeUsers').textContent = stats.free_users || 0;
    document.getElementById('premiumUsers').textContent = stats.premium_users || 0;
    document.getElementById('unlimitedUsers').textContent = stats.unlimited_users || 0;
    document.getElementById('managedUsers').textContent = stats.managed_users || 0;
    document.getElementById('studentUsers').textContent = stats.student_users || 0;
    document.getElementById('videosToday').textContent = stats.videos_today || 0;
    document.getElementById('costToday').textContent = '$' + (parseFloat(stats.cost_today) || 0).toFixed(2);
    document.getElementById('totalVideos').textContent = stats.total_videos || 0;
    document.getElementById('totalCost').textContent = '$' + (parseFloat(stats.total_cost) || 0).toFixed(2);
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load models
async function loadModels() {
  try {
    const response = await fetch(`${API_BASE}/admin/models`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to load models');

    const data = await response.json();
    const modelsContainer = document.getElementById('modelsList');

    modelsContainer.innerHTML = data.models.map(model => `
      <div class="model-card">
        <h3>${model.tier.toUpperCase()} Tier</h3>
        <p><strong>Current Model:</strong> ${model.model_name}</p>
        <p><strong>Model ID:</strong> <code>${model.model_id}</code></p>
        <p><strong>Max Tokens:</strong> ${model.max_output_tokens.toLocaleString()}</p>
        <p><strong>Cost:</strong> <span style="color: #10b981;">$${model.cost_per_1m_input}</span> / <span style="color: #ef4444;">$${model.cost_per_1m_output}</span> per 1M tokens</p>
        <p><strong>Context Window:</strong> ${(model.context_window / 1000).toFixed(0)}K tokens</p>
        <label for="model-${model.tier}" style="display: block; margin-top: 15px; margin-bottom: 8px; font-weight: 600;">Select New Model:</label>
        <select id="model-${model.tier}" class="model-select">
          <optgroup label="Google">
            <option value="google/gemini-2.5-flash-lite" ${model.model_id === 'google/gemini-2.5-flash-lite' ? 'selected' : ''}>Gemini 2.5 Flash Lite ($0.10/$0.40)</option>
          </optgroup>
          <optgroup label="OpenAI">
            <option value="openai/gpt-4o-mini-2024-07-18" ${model.model_id === 'openai/gpt-4o-mini-2024-07-18' ? 'selected' : ''}>GPT-4o-mini ($0.15/$0.60)</option>
          </optgroup>
          <optgroup label="Meta">
            <option value="meta-llama/llama-3.1-8b-instruct" ${model.model_id === 'meta-llama/llama-3.1-8b-instruct' ? 'selected' : ''}>Llama 3.1 8B ($0.02/$0.03)</option>
          </optgroup>
          <optgroup label="Mistral">
            <option value="mistralai/mistral-nemo" ${model.model_id === 'mistralai/mistral-nemo' ? 'selected' : ''}>Mistral Nemo ($0.02/$0.04)</option>
          </optgroup>
          <optgroup label="Anthropic">
            <option value="anthropic/claude-3.5-haiku" ${model.model_id === 'anthropic/claude-3.5-haiku' ? 'selected' : ''}>Claude 3.5 Haiku ($0.80/$4.00)</option>
          </optgroup>
        </select>
        <button class="btn-update-model" data-tier="${model.tier}" style="margin-top: 12px; width: 100%; padding: 12px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Update Model for ${model.tier.toUpperCase()} Tier</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading models:', error);
  }
}

// Update model
async function updateModel(tier) {
  const selectEl = document.getElementById(`model-${tier}`);
  const modelId = selectEl.value;

  const modelData = {
    // ONLY allowed models
    'google/gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash Lite', tokens: 8192, costIn: 0.10, costOut: 0.40, context: 1048576 },
    'openai/gpt-4o-mini-2024-07-18': { name: 'GPT-4o-mini', tokens: 16384, costIn: 0.15, costOut: 0.60, context: 128000 },
    'meta-llama/llama-3.1-8b-instruct': { name: 'Llama 3.1 8B', tokens: 8192, costIn: 0.02, costOut: 0.03, context: 131072 },
    'mistralai/mistral-nemo': { name: 'Mistral Nemo', tokens: 8192, costIn: 0.02, costOut: 0.04, context: 128000 },
    'anthropic/claude-3.5-haiku': { name: 'Claude 3.5 Haiku', tokens: 8192, costIn: 0.80, costOut: 4.00, context: 200000 }
  };

  const model = modelData[modelId];

  try {
    const response = await fetch(`${API_BASE}/admin/models/${tier}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId,
        modelName: model.name,
        maxOutputTokens: model.tokens,
        costPer1MInput: model.costIn,
        costPer1MOutput: model.costOut,
        contextWindow: model.context
      })
    });

    if (!response.ok) throw new Error('Failed to update model');

    alert(`✅ Model updated for ${tier} tier!`);
    await loadModels();
  } catch (error) {
    alert('❌ Failed to update model');
    console.error(error);
  }
}

// Load users
async function loadUsers() {
  try {
    const response = await fetch(`${API_BASE}/admin/users?limit=100`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to load users');

    const data = await response.json();
    const usersContainer = document.getElementById('usersList');

    usersContainer.innerHTML = `
      <div class="table-wrapper">
        <table class="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Tier</th>
              <th>Plan Name</th>
              <th>Status</th>
              <th>Student Verified</th>
              <th>Stripe Customer</th>
              <th>Subscription ID</th>
              <th>Period End</th>
              <th>Videos</th>
              <th>Cost</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map(user => {
              const isActive = user.subscription_status === 'active';
              const isCanceling = user.subscription_cancel_at;
              const periodEnd = user.subscription_end_date ? new Date(user.subscription_end_date) : null;
              const isExpired = periodEnd && periodEnd < new Date();
              const rowClass = isExpired ? 'user-expired' : (isActive ? 'user-active' : 'user-inactive');

              // Student verification status
              const studentVerifiedAt = user.student_verified_at ? new Date(user.student_verified_at) : null;
              const studentExpiresAt = user.student_verification_expires_at ? new Date(user.student_verification_expires_at) : null;
              const studentExpired = studentExpiresAt && studentExpiresAt < new Date();
              const isStudentVerified = user.student_verified && !studentExpired;
              const daysRemaining = studentExpiresAt && !studentExpired
                ? Math.ceil((studentExpiresAt - new Date()) / (1000 * 60 * 60 * 24))
                : 0;

              return `
                <tr class="${rowClass}">
                  <td class="email-cell">
                    <strong>${user.email || 'No email'}</strong>
                    <br><small class="user-id">${user.extension_user_id.substring(0, 20)}...</small>
                  </td>
                  <td>
                    <span class="tier-badge tier-${user.tier}">${user.tier.toUpperCase()}</span>
                  </td>
                  <td>${user.plan_name || '-'}</td>
                  <td>
                    <span class="status-badge status-${user.subscription_status || 'none'}">
                      ${(user.subscription_status || 'none').toUpperCase()}
                    </span>
                    ${isCanceling ? '<br><small class="text-warning">⚠️ Canceling</small>' : ''}
                    ${isExpired ? '<br><small class="text-expired">⏰ Expired</small>' : ''}
                  </td>
                  <td>
                    ${isStudentVerified
                      ? `<span class="status-badge status-active" title="Verified on ${studentVerifiedAt.toLocaleDateString()}">✓ Verified</span>
                         <br><small style="color: ${daysRemaining > 90 ? '#10b981' : daysRemaining > 30 ? '#f59e0b' : '#ef4444'}">
                         ${daysRemaining} days left</small>`
                      : studentExpired
                        ? `<span class="status-badge status-expired">⏰ Expired</span>
                           <br><small style="color: #ef4444">Needs reverification</small>`
                        : `<span class="status-badge status-none">✗ Not Verified</span>`
                    }
                  </td>
                  <td>
                    ${user.stripe_customer_id
                      ? `<a href="https://dashboard.stripe.com/customers/${user.stripe_customer_id}" target="_blank" class="stripe-link">${user.stripe_customer_id.substring(0, 12)}...</a>`
                      : '<span class="text-muted">-</span>'}
                  </td>
                  <td>
                    ${user.stripe_subscription_id
                      ? `<a href="https://dashboard.stripe.com/subscriptions/${user.stripe_subscription_id}" target="_blank" class="stripe-link">${user.stripe_subscription_id.substring(0, 12)}...</a>`
                      : '<span class="text-muted">-</span>'}
                  </td>
                  <td>${periodEnd ? periodEnd.toLocaleDateString() : '-'}</td>
                  <td>${user.total_videos || 0}</td>
                  <td>$${(parseFloat(user.total_cost) || 0).toFixed(2)}</td>
                  <td>${new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    ${isStudentVerified || user.student_verified
                      ? `<button class="btn-reset-status" data-user-email="${user.email}" style="background: #f59e0b; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Reset Student Status</button>`
                      : '<span style="color: #999; font-size: 12px;">-</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination-info">
        Showing ${data.users.length} of ${data.pagination?.totalUsers || data.users.length} users
      </div>
    `;
  } catch (error) {
    console.error('Error loading users:', error);
    document.getElementById('usersList').innerHTML = `
      <div class="error-message">❌ Failed to load users: ${error.message}</div>
    `;
  }
}

// Load settings
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE}/admin/settings`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to load settings');

    const data = await response.json();
    const settingsContainer = document.getElementById('settingsList');

    settingsContainer.innerHTML = Object.entries(data.settings).map(([key, setting]) => {
      // Check if this is a boolean setting (true/false value)
      const isBooleanSetting = setting.value === 'true' || setting.value === 'false';

      // Render dropdown for boolean settings
      if (isBooleanSetting) {
        return `
          <div class="setting-item">
            <label>
              <strong>${key.replace(/_/g, ' ').toUpperCase()}</strong>
              <br><small>${setting.description}</small>
            </label>
            <div class="setting-controls">
              <select id="setting-${key}" data-setting-key="${key}" class="setting-select">
                <option value="true" ${setting.value === 'true' ? 'selected' : ''}>True</option>
                <option value="false" ${setting.value === 'false' ? 'selected' : ''}>False</option>
              </select>
            </div>
          </div>
        `;
      }

      // Render password input for API keys
      if (key.includes('key') || key.includes('secret')) {
        return `
          <div class="setting-item">
            <label>
              <strong>${key.replace(/_/g, ' ').toUpperCase()}</strong>
              <br><small>${setting.description}</small>
            </label>
            <div class="setting-controls">
              <input type="password" id="setting-${key}" value="${setting.value}" placeholder="Enter API key...">
              <button class="btn-save-setting" data-setting-key="${key}">Save</button>
            </div>
          </div>
        `;
      }

      // Render text input for other settings
      return `
        <div class="setting-item">
          <label>
            <strong>${key.replace(/_/g, ' ').toUpperCase()}</strong>
            <br><small>${setting.description}</small>
          </label>
          <div class="setting-controls">
            <input type="text" id="setting-${key}" value="${setting.value}">
            <button class="btn-save-setting" data-setting-key="${key}">Save</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Update setting
async function updateSetting(key) {
  const inputEl = document.getElementById(`setting-${key}`);

  if (!inputEl) {
    console.error(`❌ Input element not found for setting: ${key}`);
    alert(`❌ Error: Could not find input field for ${key}`);
    return;
  }

  const value = inputEl.value;
  const isDropdown = inputEl.tagName === 'SELECT';

  console.log(`🔵 Updating setting: ${key}`);
  console.log(`   Value: ${value ? '(set)' : '(empty)'}`);
  console.log(`   Input type: ${inputEl.tagName}`);

  try {
    const response = await fetch(`${API_BASE}/admin/settings/${key}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    console.log(`   Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`❌ Server error:`, errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: Failed to update setting`);
    }

    const data = await response.json();
    console.log(`✅ Setting updated successfully:`, data);

    // Show success message
    if (isDropdown) {
      console.log(`✅ ${key} updated to: ${value}`);
      // Auto-save for dropdowns, no alert needed
    } else {
      alert(`✅ Setting "${key}" updated successfully!`);
      // Reload settings to show updated value
      await loadSettings();
    }
  } catch (error) {
    console.error(`❌ Error updating setting "${key}":`, error);
    alert(`❌ Failed to update setting: ${error.message}`);
  }
}

// Load logs
async function loadLogs() {
  try {
    const response = await fetch(`${API_BASE}/admin/logs?limit=50`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to load logs');

    const data = await response.json();
    const logsContainer = document.getElementById('logsList');

    logsContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Admin</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${data.logs.map(log => `
            <tr>
              <td>${new Date(log.created_at).toLocaleString()}</td>
              <td>${log.admin_email}</td>
              <td><strong>${log.action}</strong></td>
              <td>${log.details ? JSON.stringify(log.details).substring(0, 50) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error('Error loading logs:', error);
  }
}

// Switch tabs
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}Tab`).classList.add('active');
}

// ===== Student Verification Management =====

let currentStudentFilter = 'all';

// Load student verifications
async function loadStudentVerifications(status = 'pending') {
  try {
    const endpoint = status === 'pending'
      ? `${API_BASE}/students/admin/pending`
      : `${API_BASE}/students/admin/all?status=${status === 'all' ? '' : status}`;

    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    renderStudentVerifications(data.verifications);
  } catch (error) {
    console.error('Error loading student verifications:', error);
    document.getElementById('studentsList').innerHTML = `
      <div class="error-message">Failed to load verifications: ${error.message}</div>
    `;
  }
}

// Render student verifications table
function renderStudentVerifications(verifications) {
  const container = document.getElementById('studentsList');

  if (!verifications || verifications.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No ${currentStudentFilter === 'all' ? '' : currentStudentFilter} student verification requests found.</p>
      </div>
    `;
    return;
  }

  const html = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Student Name</th>
          <th>Email</th>
          <th>Email Verified</th>
          <th>University</th>
          <th>Grad Year</th>
          <th>Status</th>
          <th>AI Status</th>
          <th>AI Reason</th>
          <th>Requested</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${verifications.map(v => {
          // AI status badge logic
          let aiStatusBadge = '<span class="status-badge status-none">Not Run</span>';
          if (v.ai_status) {
            if (v.ai_status === 'approved') {
              aiStatusBadge = `<span class="status-badge status-active" title="${v.ai_reason}">✓ Approved (${v.ai_confidence}%)</span>`;
            } else if (v.ai_status === 'processing') {
              aiStatusBadge = '<span class="status-badge status-pending">⏳ Processing...</span>';
            } else if (v.ai_status === 'rejected') {
              aiStatusBadge = `<span class="status-badge status-rejected" title="${v.ai_reason}">✗ Rejected (${v.ai_confidence}%)</span>`;
            } else if (v.ai_status.startsWith('reupload')) {
              aiStatusBadge = `<span class="status-badge status-warning" title="${v.ai_reason}">⚠️ Reupload ${v.ai_status.replace('reupload_', '').toUpperCase()}</span>`;
            } else if (v.ai_status === 'failed' || v.ai_status === 'manual_review') {
              aiStatusBadge = `<span class="status-badge status-none" title="${v.ai_reason}">⚠️ ${v.ai_status === 'failed' ? 'Failed' : 'Manual Review'}</span>`;
            }
          }

          return `
          <tr>
            <td>#${v.id}</td>
            <td>${v.student_name || 'N/A'}</td>
            <td>${v.email}</td>
            <td>
              <span class="status-badge ${v.email_verified ? 'status-active' : 'status-none'}">
                ${v.email_verified ? '✓ Yes' : '✗ No'}
              </span>
            </td>
            <td>${v.university_name || 'N/A'}</td>
            <td>${v.graduation_year || 'N/A'}</td>
            <td>
              <span class="status-badge status-${v.status}">${v.status.toUpperCase()}</span>
            </td>
            <td>
              ${aiStatusBadge}
              ${v.ai_verified_at ? `<br><small>Verified: ${new Date(v.ai_verified_at).toLocaleDateString()}</small>` : ''}
              ${v.ai_cost ? `<br><small>Cost: $${parseFloat(v.ai_cost).toFixed(4)}</small>` : ''}
            </td>
            <td>
              ${v.ai_reason ? `<small style="color: #666;">${v.ai_reason}</small>` : '<span class="text-muted">-</span>'}
            </td>
            <td>${new Date(v.requested_at).toLocaleDateString()}</td>
            <td class="actions-cell">
              ${v.status === 'pending' ? `
                <button class="btn-approve" data-student-id="${v.id}">✓ Approve</button>
                <button class="btn-reject" data-student-id="${v.id}">✗ Reject</button>
                <br>
              ` : v.status === 'approved' ? `
                <span style="color: green;">✓ Approved by ${v.reviewed_by}</span>
                <br><small>Expires: ${new Date(v.expires_at).toLocaleDateString()}</small>
                <br>
              ` : `
                <span style="color: red;">✗ Rejected</span>
                <br><small>${v.rejection_reason}</small>
                <br>
                <button class="btn-approve" data-student-id="${v.id}" style="margin-top: 5px;">✓ Approve Anyway</button>
                <br>
              `}
              ${v.student_id_front_url ? `<button class="btn-view-image" data-image-url="${v.student_id_front_url}" data-title="Student ID - Front">View ID Front</button>` : ''}
              ${v.student_id_back_url ? `<button class="btn-view-image" data-image-url="${v.student_id_back_url}" data-title="Student ID - Back">View ID Back</button>` : ''}
              ${v.student_id_url ? `<button class="btn-view-image" data-image-url="${v.student_id_url}" data-title="Student ID">View ID</button>` : ''}
              <br>
              ${(v.student_id_front_url && v.student_id_back_url) ? `<button class="btn-ai-verify" data-student-id="${v.id}" style="margin-top: 5px;">🤖 ${v.ai_status ? 'Re-run' : 'Run'} AI Verification</button><br>` : ''}
              <button class="btn-delete" data-student-id="${v.id}" style="margin-top: 5px;">🗑️ Delete</button>
            </td>
          </tr>
        `;}).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// Approve student verification
async function approveStudent(id) {
  if (!confirm('Approve this student verification? They will receive student discount for 1 year.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/students/admin/approve/${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    alert('✓ Student verification approved!');

    // Reload student verifications, users, and stats to reflect the change
    await Promise.all([
      loadStudentVerifications(currentStudentFilter),
      loadUsers(),
      loadStats()
    ]);
  } catch (error) {
    console.error('Error approving verification:', error);
    alert('Error: ' + error.message);
  }
}

// Reject student verification
async function rejectStudent(id) {
  const reason = prompt('Enter rejection reason:');
  if (!reason) return;

  try {
    const response = await fetch(`${API_BASE}/students/admin/reject/${id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    alert('✗ Student verification rejected');

    // Reload student verifications and stats to reflect the change
    await Promise.all([
      loadStudentVerifications(currentStudentFilter),
      loadStats()
    ]);
  } catch (error) {
    console.error('Error rejecting verification:', error);
    alert('Error: ' + error.message);
  }
}

// Delete student verification
async function deleteStudent(id) {
  if (!confirm('⚠️ Are you sure you want to DELETE this student verification?\n\nThis will reset the user\'s verification status.\n\nThis action cannot be undone!')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/students/admin/delete/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    alert('🗑️ Student verification deleted and user status reset');

    // Reload student verifications, users, and stats to reflect the change
    await Promise.all([
      loadStudentVerifications(currentStudentFilter),
      loadUsers(),
      loadStats()
    ]);
  } catch (error) {
    console.error('Error deleting verification:', error);
    alert('Error: ' + error.message);
  }
}

// Reset user's student verification status
async function resetUserStudentStatus(email) {
  if (!confirm(`⚠️ Reset student verification status for ${email}?\n\nThis will set student_verified to false and clear verification dates.\n\nThe user will no longer have student discount access.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/students/admin/reset-user-status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    alert(`✅ Student verification status reset for ${email}`);

    // Reload users and stats to reflect the change
    await Promise.all([
      loadUsers(),
      loadStats()
    ]);
  } catch (error) {
    console.error('Error resetting user status:', error);
    alert('❌ Error: ' + error.message);
  }
}

// AI Verify student ID
async function aiVerifyStudent(id) {
  if (!confirm('Run AI verification on this student ID? This will analyze both front and back images using GPT-4o vision.')) {
    return;
  }

  try {
    // Show processing message
    alert('⏳ AI verification started. This may take 10-30 seconds...');

    const response = await fetch(`${API_BASE}/students/admin/ai-verify/${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    const result = data.ai_result;
    const cost = data.cost;

    // Show result with details
    let resultMessage = `🤖 AI Verification Complete!\n\n`;
    resultMessage += `Result: ${result.verification_result.toUpperCase()}\n`;
    resultMessage += `Confidence: ${result.confidence}%\n`;
    resultMessage += `Reason: ${result.reason}\n`;
    resultMessage += `Cost: $${cost.toFixed(4)}`;

    alert(resultMessage);
    loadStudentVerifications(currentStudentFilter);
  } catch (error) {
    console.error('Error running AI verification:', error);
    alert('❌ AI verification failed: ' + error.message);
    // Reload to show error status
    loadStudentVerifications(currentStudentFilter);
  }
}

// ===== Feedback Management =====

let currentFeedbackFilter = 'all';

// Load feedback
async function loadFeedback(filter = 'all') {
  try {
    const response = await fetch(`${API_BASE}/feedback/all`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    // Filter feedback based on selected filter
    let filteredFeedback = data.feedback;
    if (filter !== 'all') {
      if (filter === 'bug' || filter === 'feature' || filter === 'improvement' || filter === 'compliment' || filter === 'other') {
        filteredFeedback = data.feedback.filter(f => f.type === filter);
      } else {
        filteredFeedback = data.feedback.filter(f => f.status === filter);
      }
    }

    renderFeedback(filteredFeedback);
  } catch (error) {
    console.error('Error loading feedback:', error);
    document.getElementById('feedbackList').innerHTML = `
      <div class="error-message">Failed to load feedback: ${error.message}</div>
    `;
  }
}

// Render feedback table
function renderFeedback(feedback) {
  const container = document.getElementById('feedbackList');

  if (!feedback || feedback.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No ${currentFeedbackFilter === 'all' ? '' : currentFeedbackFilter} feedback found.</p>
      </div>
    `;
    return;
  }

  const typeEmojis = {
    bug: '🐛',
    feature: '💡',
    improvement: '⚡',
    compliment: '💜',
    other: '💬'
  };

  const html = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>From</th>
          <th>Message</th>
          <th>Screenshot</th>
          <th>Status</th>
          <th>Submitted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${feedback.map(f => `
          <tr>
            <td>#${f.id}</td>
            <td>
              <span style="font-size: 20px;" title="${f.type}">${typeEmojis[f.type] || '💬'}</span>
              <br><small>${f.type}</small>
            </td>
            <td>
              <strong>${f.user_email}</strong>
              <br><small class="user-id">${f.extension_user_id.substring(0, 15)}...</small>
            </td>
            <td>
              <div style="max-width: 300px; max-height: 100px; overflow: auto; white-space: pre-wrap;">
                ${f.message}
              </div>
            </td>
            <td>
              ${f.screenshot_url ? `
                <button class="btn-view-image" data-image-url="${f.screenshot_url}" data-title="Feedback Screenshot #${f.id}" style="background: #667eea; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                  📷 View Screenshot
                </button>
              ` : '<span style="color: #999; font-size: 12px;">No screenshot</span>'}
            </td>
            <td>
              <span class="status-badge status-${f.status}">${f.status.toUpperCase()}</span>
              ${f.replied_at ? `<br><small>By: ${f.replied_by}</small>` : ''}
            </td>
            <td>${new Date(f.submitted_at).toLocaleString()}</td>
            <td class="actions-cell">
              ${f.status === 'new' ? `
                <button class="btn-feedback-mark-read" data-feedback-id="${f.id}">Mark as Read</button>
                <br>
              ` : ''}
              ${f.status !== 'replied' && f.user_email !== 'Not provided' ? `
                <button class="btn-feedback-reply" data-feedback-id="${f.id}" data-user-email="${f.user_email}" data-feedback-type="${f.type}" data-feedback-message="${f.message.replace(/"/g, '&quot;')}" data-screenshot="${f.screenshot_url || ''}">Reply</button>
                <br>
              ` : ''}
              ${f.status === 'replied' ? `
                <button class="btn-feedback-view-reply" data-reply="${f.reply_message.replace(/"/g, '&quot;')}" data-replied-by="${f.replied_by}">View Reply</button>
                <br>
              ` : ''}
              <button class="btn-feedback-delete" data-feedback-id="${f.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// Mark feedback as read
async function markFeedbackAsRead(id) {
  try {
    const response = await fetch(`${API_BASE}/feedback/${id}/mark-read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to mark as read');

    await loadFeedback(currentFeedbackFilter);
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    alert('Failed to mark as read');
  }
}

// Reply to feedback - Open modal
function replyToFeedback(id, userEmail, feedbackType, feedbackMessage) {
  // Get type emoji
  const typeEmojis = {
    bug: '🐛',
    feature: '💡',
    improvement: '⚡',
    compliment: '💜',
    other: '💬'
  };

  // Populate modal
  const modal = document.getElementById('replyModal');
  document.getElementById('modalFeedbackTypeIcon').textContent = typeEmojis[feedbackType] || '💬';
  document.getElementById('modalFeedbackType').textContent = feedbackType.toUpperCase();
  document.getElementById('modalUserEmail').textContent = userEmail;
  document.getElementById('modalUserId').textContent = `Feedback #${id}`;
  document.getElementById('modalFeedbackMessage').textContent = feedbackMessage;
  document.getElementById('replyMessageInput').value = '';

  // Show modal
  modal.classList.add('active');

  // Store current feedback data for sending
  modal.dataset.feedbackId = id;
  modal.dataset.userEmail = userEmail;
  modal.dataset.feedbackType = feedbackType;
}

// Send reply from modal
async function sendReplyFromModal() {
  const modal = document.getElementById('replyModal');
  const feedbackId = modal.dataset.feedbackId;
  const userEmail = modal.dataset.userEmail;
  const replyMessage = document.getElementById('replyMessageInput').value.trim();
  const sendBtn = document.getElementById('sendReplyBtn');
  const sendBtnText = document.getElementById('sendReplyBtnText');

  if (!replyMessage) {
    alert('Please enter a reply message');
    return;
  }

  const repliedBy = localStorage.getItem('adminEmail') || 'Admin';

  // Disable button
  sendBtn.disabled = true;
  sendBtnText.textContent = 'Sending...';

  try {
    const response = await fetch(`${API_BASE}/feedback/${feedbackId}/reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        replyMessage,
        repliedBy
      })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    alert(`✅ Reply sent to ${userEmail} via Resend!`);

    // Close modal
    modal.classList.remove('active');

    // Reload feedback
    await loadFeedback(currentFeedbackFilter);

  } catch (error) {
    console.error('Error replying to feedback:', error);
    alert('Failed to send reply: ' + error.message);
  } finally {
    sendBtn.disabled = false;
    sendBtnText.textContent = 'Send Reply';
  }
}

// Close reply modal
function closeReplyModal() {
  const modal = document.getElementById('replyModal');
  modal.classList.remove('active');
  document.getElementById('replyMessageInput').value = '';
}

// Setup reply modal event listeners
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('replyModal');
  const closeBtn = document.getElementById('closeReplyModal');
  const cancelBtn = document.getElementById('cancelReplyBtn');
  const sendBtn = document.getElementById('sendReplyBtn');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeReplyModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeReplyModal);
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', sendReplyFromModal);
  }

  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeReplyModal();
      }
    });
  }
});

// View reply
function viewReply(replyMessage, repliedBy) {
  alert(`Reply by ${repliedBy}:\n\n${replyMessage}`);
}

// Delete feedback
async function deleteFeedback(id) {
  if (!confirm('Are you sure you want to delete this feedback?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/feedback/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Failed to delete feedback');

    alert('✅ Feedback deleted');
    await loadFeedback(currentFeedbackFilter);
  } catch (error) {
    console.error('Error deleting feedback:', error);
    alert('Failed to delete feedback');
  }
}

// Setup filter buttons
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Get parent container to determine which tab's filter was clicked
      const parentTab = btn.closest('.tab-content');

      if (parentTab && parentTab.id === 'studentsTab') {
        // Student verifications filter
        document.querySelectorAll('#studentsTab .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStudentFilter = btn.dataset.filter;
        loadStudentVerifications(currentStudentFilter);
      } else if (parentTab && parentTab.id === 'feedbackTab') {
        // Feedback filter
        document.querySelectorAll('#feedbackTab .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFeedbackFilter = btn.dataset.filter;
        loadFeedback(currentFeedbackFilter);
      }
    });
  });
});

// Event delegation for student verification action buttons and settings
document.addEventListener('click', (e) => {
  // Settings save button
  if (e.target.classList.contains('btn-save-setting')) {
    const settingKey = e.target.getAttribute('data-setting-key');
    if (settingKey) {
      updateSetting(settingKey);
    }
  }

  // Model update button
  if (e.target.classList.contains('btn-update-model')) {
    const tier = e.target.getAttribute('data-tier');
    if (tier) {
      updateModel(tier);
    }
  }

  // Approve button
  if (e.target.classList.contains('btn-approve')) {
    const studentId = e.target.getAttribute('data-student-id');
    if (studentId && !e.target.disabled) {
      approveStudent(parseInt(studentId));
    }
  }

  // Reject button
  if (e.target.classList.contains('btn-reject')) {
    const studentId = e.target.getAttribute('data-student-id');
    if (studentId) {
      rejectStudent(parseInt(studentId));
    }
  }

  // Delete button
  if (e.target.classList.contains('btn-delete')) {
    const studentId = e.target.getAttribute('data-student-id');
    if (studentId) {
      deleteStudent(parseInt(studentId));
    }
  }

  // View image button
  if (e.target.classList.contains('btn-view-image')) {
    const imageUrl = e.target.getAttribute('data-image-url');
    const title = e.target.getAttribute('data-title');
    if (imageUrl) {
      showImageModal(imageUrl, title);
    }
  }

  // AI Verify button
  if (e.target.classList.contains('btn-ai-verify')) {
    const studentId = e.target.getAttribute('data-student-id');
    if (studentId) {
      aiVerifyStudent(parseInt(studentId));
    }
  }

  // Reset Student Status button
  if (e.target.classList.contains('btn-reset-status')) {
    const userEmail = e.target.getAttribute('data-user-email');
    if (userEmail) {
      resetUserStudentStatus(userEmail);
    }
  }

  // Feedback Mark as Read button
  if (e.target.classList.contains('btn-feedback-mark-read')) {
    const feedbackId = e.target.getAttribute('data-feedback-id');
    if (feedbackId) {
      markFeedbackAsRead(parseInt(feedbackId));
    }
  }

  // Feedback Reply button
  if (e.target.classList.contains('btn-feedback-reply')) {
    const feedbackId = e.target.getAttribute('data-feedback-id');
    const userEmail = e.target.getAttribute('data-user-email');
    const feedbackType = e.target.getAttribute('data-feedback-type');
    const feedbackMessage = e.target.getAttribute('data-feedback-message');
    if (feedbackId && userEmail) {
      replyToFeedback(parseInt(feedbackId), userEmail, feedbackType, feedbackMessage);
    }
  }

  // Feedback View Reply button
  if (e.target.classList.contains('btn-feedback-view-reply')) {
    const replyMessage = e.target.getAttribute('data-reply');
    const repliedBy = e.target.getAttribute('data-replied-by');
    if (replyMessage) {
      viewReply(replyMessage, repliedBy);
    }
  }

  // Feedback Delete button
  if (e.target.classList.contains('btn-feedback-delete')) {
    const feedbackId = e.target.getAttribute('data-feedback-id');
    if (feedbackId) {
      deleteFeedback(parseInt(feedbackId));
    }
  }
});

// Event delegation for settings dropdowns (change event)
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('setting-select')) {
    const settingKey = e.target.getAttribute('data-setting-key');
    if (settingKey) {
      updateSetting(settingKey);
    }
  }
});

// Show image in modal
function showImageModal(imageUrl, title) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('imageModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    `;
    modal.innerHTML = `
      <div style="position: relative; max-width: 90vw; max-height: 90vh;">
        <button id="closeImageModal" style="position: absolute; top: -40px; right: 0; background: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 18px;">✕ Close</button>
        <h2 id="imageTitle" style="color: white; margin-bottom: 10px; text-align: center;"></h2>
        <img id="modalImage" style="max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
      </div>
    `;
    document.body.appendChild(modal);

    // Close button handler
    document.getElementById('closeImageModal').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  // Set image and title
  document.getElementById('modalImage').src = imageUrl;
  document.getElementById('imageTitle').textContent = title || 'Student ID';
  modal.style.display = 'flex';
}
