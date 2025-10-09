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
    document.getElementById('aiVerificationsToday').textContent = stats.ai_verifications_today || 0;
    document.getElementById('aiCostToday').textContent = '$' + (parseFloat(stats.ai_cost_today) || 0).toFixed(4);
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
          <optgroup label="Google (OpenRouter)">
            <option value="google/gemini-flash-1.5-8b" ${model.model_id === 'google/gemini-flash-1.5-8b' ? 'selected' : ''}>Gemini Flash 1.5 8B - Cheapest ($0.0375/$0.15)</option>
            <option value="google/gemini-pro-1.5" ${model.model_id === 'google/gemini-pro-1.5' ? 'selected' : ''}>Gemini Pro 1.5 - Balanced ($1.25/$5.00)</option>
            <option value="google/gemini-flash-1.5" ${model.model_id === 'google/gemini-flash-1.5' ? 'selected' : ''}>Gemini Flash 1.5 - Fast ($0.075/$0.30)</option>
          </optgroup>
          <optgroup label="Anthropic (OpenRouter)">
            <option value="anthropic/claude-3.5-sonnet" ${model.model_id === 'anthropic/claude-3.5-sonnet' ? 'selected' : ''}>Claude 3.5 Sonnet - Best ($3.00/$15.00)</option>
            <option value="anthropic/claude-3-opus" ${model.model_id === 'anthropic/claude-3-opus' ? 'selected' : ''}>Claude 3 Opus - Premium ($15.00/$75.00)</option>
            <option value="anthropic/claude-3-haiku" ${model.model_id === 'anthropic/claude-3-haiku' ? 'selected' : ''}>Claude 3 Haiku - Fast ($0.25/$1.25)</option>
            <option value="anthropic/claude-3-sonnet" ${model.model_id === 'anthropic/claude-3-sonnet' ? 'selected' : ''}>Claude 3 Sonnet - Balanced ($3.00/$15.00)</option>
          </optgroup>
          <optgroup label="OpenAI (OpenRouter)">
            <option value="openai/gpt-4o" ${model.model_id === 'openai/gpt-4o' ? 'selected' : ''}>GPT-4o - Latest ($2.50/$10.00)</option>
            <option value="openai/gpt-4o-mini" ${model.model_id === 'openai/gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini - Affordable ($0.15/$0.60)</option>
            <option value="openai/gpt-4-turbo" ${model.model_id === 'openai/gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo ($10.00/$30.00)</option>
            <option value="openai/gpt-3.5-turbo" ${model.model_id === 'openai/gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo - Budget ($0.50/$1.50)</option>
          </optgroup>
          <optgroup label="Meta (OpenRouter)">
            <option value="meta-llama/llama-3.1-70b-instruct" ${model.model_id === 'meta-llama/llama-3.1-70b-instruct' ? 'selected' : ''}>Llama 3.1 70B - Open Source ($0.35/$0.40)</option>
            <option value="meta-llama/llama-3.1-405b-instruct" ${model.model_id === 'meta-llama/llama-3.1-405b-instruct' ? 'selected' : ''}>Llama 3.1 405B - Largest ($2.75/$2.75)</option>
          </optgroup>
          <optgroup label="Mistral (OpenRouter)">
            <option value="mistralai/mistral-large" ${model.model_id === 'mistralai/mistral-large' ? 'selected' : ''}>Mistral Large ($2.00/$6.00)</option>
            <option value="mistralai/mistral-medium" ${model.model_id === 'mistralai/mistral-medium' ? 'selected' : ''}>Mistral Medium ($2.70/$8.10)</option>
          </optgroup>
        </select>
        <button onclick="updateModel('${model.tier}')" style="margin-top: 12px; width: 100%; padding: 12px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">Update Model for ${model.tier.toUpperCase()} Tier</button>
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
    // Google models
    'google/gemini-flash-1.5-8b': { name: 'Gemini Flash 1.5 8B', tokens: 8192, costIn: 0.0375, costOut: 0.15, context: 1000000 },
    'google/gemini-pro-1.5': { name: 'Gemini Pro 1.5', tokens: 8192, costIn: 1.25, costOut: 5.00, context: 2000000 },
    'google/gemini-flash-1.5': { name: 'Gemini Flash 1.5', tokens: 8192, costIn: 0.075, costOut: 0.30, context: 1000000 },

    // Anthropic models
    'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', tokens: 8192, costIn: 3.00, costOut: 15.00, context: 200000 },
    'anthropic/claude-3-opus': { name: 'Claude 3 Opus', tokens: 4096, costIn: 15.00, costOut: 75.00, context: 200000 },
    'anthropic/claude-3-haiku': { name: 'Claude 3 Haiku', tokens: 4096, costIn: 0.25, costOut: 1.25, context: 200000 },
    'anthropic/claude-3-sonnet': { name: 'Claude 3 Sonnet', tokens: 4096, costIn: 3.00, costOut: 15.00, context: 200000 },

    // OpenAI models
    'openai/gpt-4o': { name: 'GPT-4o', tokens: 16384, costIn: 2.50, costOut: 10.00, context: 128000 },
    'openai/gpt-4o-mini': { name: 'GPT-4o Mini', tokens: 16384, costIn: 0.15, costOut: 0.60, context: 128000 },
    'openai/gpt-4-turbo': { name: 'GPT-4 Turbo', tokens: 4096, costIn: 10.00, costOut: 30.00, context: 128000 },
    'openai/gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', tokens: 4096, costIn: 0.50, costOut: 1.50, context: 16385 },

    // Meta models
    'meta-llama/llama-3.1-70b-instruct': { name: 'Llama 3.1 70B', tokens: 8192, costIn: 0.35, costOut: 0.40, context: 131072 },
    'meta-llama/llama-3.1-405b-instruct': { name: 'Llama 3.1 405B', tokens: 8192, costIn: 2.75, costOut: 2.75, context: 131072 },

    // Mistral models
    'mistralai/mistral-large': { name: 'Mistral Large', tokens: 8192, costIn: 2.00, costOut: 6.00, context: 128000 },
    'mistralai/mistral-medium': { name: 'Mistral Medium', tokens: 8192, costIn: 2.70, costOut: 8.10, context: 32000 }
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
              <select id="setting-${key}" onchange="updateSetting('${key}')">
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
              <button onclick="updateSetting('${key}')">Save</button>
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
            <button onclick="updateSetting('${key}')">Save</button>
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
  const value = inputEl.value;
  const isDropdown = inputEl.tagName === 'SELECT';

  try {
    const response = await fetch(`${API_BASE}/admin/settings/${key}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    if (!response.ok) throw new Error('Failed to update setting');

    // Show success message
    if (isDropdown) {
      console.log(`✅ ${key} updated to: ${value}`);
      // Auto-save for dropdowns, no alert needed
    } else {
      alert(`✅ Setting updated!`);
    }
  } catch (error) {
    alert('❌ Failed to update setting');
    console.error(error);
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

// Setup filter buttons
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStudentFilter = btn.dataset.filter;
      loadStudentVerifications(currentStudentFilter);
    });
  });
});

// Event delegation for student verification action buttons
document.addEventListener('click', (e) => {
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
