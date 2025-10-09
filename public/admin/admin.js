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
    loadStudentVerifications('pending'),
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
        <h3>${model.tier} Tier</h3>
        <p><strong>Current Model:</strong> ${model.model_name}</p>
        <p><strong>Model ID:</strong> ${model.model_id}</p>
        <p><strong>Max Tokens:</strong> ${model.max_output_tokens}</p>
        <p><strong>Cost:</strong> $${model.cost_per_1m_input}/$${model.cost_per_1m_output} per 1M tokens</p>
        <select id="model-${model.tier}" class="model-select">
          <option value="google/gemini-flash-1.5-8b">Gemini Flash 1.5 8B</option>
          <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
          <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
          <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
        </select>
        <button onclick="updateModel('${model.tier}')">Update Model</button>
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
    'google/gemini-flash-1.5-8b': { name: 'Gemini Flash 1.5 8B', tokens: 8192, costIn: 0.0375, costOut: 0.15, context: 1000000 },
    'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', tokens: 8192, costIn: 3.00, costOut: 15.00, context: 200000 },
    'anthropic/claude-3-opus': { name: 'Claude 3 Opus', tokens: 4096, costIn: 15.00, costOut: 75.00, context: 200000 },
    'anthropic/claude-3-haiku': { name: 'Claude 3 Haiku', tokens: 4096, costIn: 0.25, costOut: 1.25, context: 200000 }
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
              <th>Stripe Customer</th>
              <th>Subscription ID</th>
              <th>Period End</th>
              <th>Videos</th>
              <th>Cost</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map(user => {
              const isActive = user.subscription_status === 'active';
              const isCanceling = user.subscription_cancel_at;
              const periodEnd = user.subscription_end_date ? new Date(user.subscription_end_date) : null;
              const isExpired = periodEnd && periodEnd < new Date();
              const rowClass = isExpired ? 'user-expired' : (isActive ? 'user-active' : 'user-inactive');

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

let currentStudentFilter = 'pending';

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
          <th>University</th>
          <th>Grad Year</th>
          <th>Status</th>
          <th>Requested</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${verifications.map(v => `
          <tr>
            <td>#${v.id}</td>
            <td>${v.student_name || 'N/A'}</td>
            <td>${v.email}</td>
            <td>${v.university_name || 'N/A'}</td>
            <td>${v.graduation_year || 'N/A'}</td>
            <td>
              <span class="status-badge status-${v.status}">${v.status.toUpperCase()}</span>
            </td>
            <td>${new Date(v.requested_at).toLocaleDateString()}</td>
            <td class="actions-cell">
              ${v.status === 'pending' || v.status === 'email_pending' ? `
                <button class="btn-approve" data-student-id="${v.id}" ${v.status === 'email_pending' ? 'disabled title="Email not verified yet"' : ''}>✓ Approve</button>
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
              `}
              ${v.student_id_front_url ? `<a href="${v.student_id_front_url}" target="_blank" class="btn-view-doc">View ID Front</a>` : ''}
              ${v.student_id_back_url ? `<a href="${v.student_id_back_url}" target="_blank" class="btn-view-doc">View ID Back</a>` : ''}
              ${v.student_id_url ? `<a href="${v.student_id_url}" target="_blank" class="btn-view-doc">View ID</a>` : ''}
              <br>
              <button class="btn-delete" data-student-id="${v.id}" style="margin-top: 5px;">🗑️ Delete</button>
            </td>
          </tr>
        `).join('')}
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
    loadStudentVerifications(currentStudentFilter);
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
    loadStudentVerifications(currentStudentFilter);
  } catch (error) {
    console.error('Error rejecting verification:', error);
    alert('Error: ' + error.message);
  }
}

// Delete student verification
async function deleteStudent(id) {
  if (!confirm('⚠️ Are you sure you want to DELETE this student verification?\n\nThis action cannot be undone!\n\nUse this for testing or to remove duplicate/spam entries.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/students/admin/delete/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    alert('🗑️ Student verification deleted successfully');
    loadStudentVerifications(currentStudentFilter);
  } catch (error) {
    console.error('Error deleting verification:', error);
    alert('Error: ' + error.message);
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
    if (studentId) {
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
});
