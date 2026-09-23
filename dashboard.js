let currentUser = null;

async function initDashboard() {
  const session = await Auth.requireAuth();
  if (!session) return;

  currentUser = await Auth.getProfile();
  if (!currentUser) return;

  // Header update
  document.getElementById('headerUserName').textContent = currentUser.full_name;
  document.getElementById('headerUserAvatar').textContent = currentUser.full_name.charAt(0).toUpperCase();
  setupUserMenu();

  if (currentUser.role === 'teacher' || currentUser.role === 'admin') {
    document.getElementById('teacherDashboard').classList.remove('hidden');
    await loadTeacherDashboard();
  } else {
    document.getElementById('studentDashboard').classList.remove('hidden');
    await loadStudentDashboard();
  }
}

async function loadTeacherDashboard() {
  // Fetch tests created by the teacher
  const { data: tests, error } = await supabase
    .from('mcq_tests')
    .select(`
      *,
      communities (name)
    `)
    .eq('created_by', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  // Fetch all submissions for these tests to calculate counts
  const testIds = (tests || []).map(t => t.id);
  let submissions = [];
  if (testIds.length > 0) {
    const { data: subs } = await supabase
      .from('mcq_submissions')
      .select('test_id')
      .in('test_id', testIds);
    submissions = subs || [];
  }

  // Update Stats
  document.getElementById('tStatTotalTests').textContent = tests?.length || 0;
  document.getElementById('tStatTotalSubmissions').textContent = submissions.length;

  const tbody = document.getElementById('teacherTestsTable');
  if (!tests || tests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">You haven\'t created any tests yet. <a href="schedule-test.html">Create one</a></td></tr>';
    return;
  }

  tbody.innerHTML = tests.map(test => {
    const subsCount = submissions.filter(s => s.test_id === test.id).length;
    return `
      <tr class="test-row" onclick="viewTestSubmissions('${test.id}', '${escapeHTML(test.title)}')">
        <td><strong>${escapeHTML(test.title)}</strong></td>
        <td>${escapeHTML(test.communities?.name || 'Unknown')}</td>
        <td>${new Date(test.created_at).toLocaleDateString()}</td>
        <td>${subsCount}</td>
        <td><button class="btn btn-primary" style="padding:4px 8px; font-size:0.8rem;">View Submissions</button></td>
      </tr>
    `;
  }).join('');
}

async function viewTestSubmissions(testId, testName) {
  document.getElementById('selectedTestName').textContent = `Submissions for: ${testName}`;
  document.getElementById('testSubmissionsSection').classList.remove('hidden');
  
  const tbody = document.getElementById('submissionsTableBody');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading submissions...</td></tr>';

  const { data: subs, error } = await supabase
    .from('mcq_submissions')
    .select(`
      *,
      profiles:student_id (full_name)
    `)
    .eq('test_id', testId)
    .order('score', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-error">Error loading submissions</td></tr>';
    return;
  }

  if (!subs || subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No submissions yet for this test.</td></tr>';
    return;
  }

  tbody.innerHTML = subs.map(sub => {
    const percentage = sub.total_questions > 0 ? (sub.score / sub.total_questions) * 100 : 0;
    
    let badgeClass = 'low';
    if (percentage >= 80) badgeClass = 'high';
    else if (percentage >= 50) badgeClass = 'medium';

    return `
      <tr>
        <td>${escapeHTML(sub.profiles?.full_name || 'Unknown Student')}</td>
        <td><strong>${sub.score} / ${sub.total_questions}</strong></td>
        <td><span class="score-badge ${badgeClass}">${Math.round(percentage)}%</span></td>
        <td>${new Date(sub.submitted_at).toLocaleString()}</td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('testSubmissionsSection').scrollIntoView({ behavior: 'smooth' });
}

async function loadStudentDashboard() {
  const { data: subs, error } = await supabase
    .from('mcq_submissions')
    .select(`
      *,
      mcq_tests (title, created_by, profiles:created_by(full_name))
    `)
    .eq('student_id', currentUser.id)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  // Calculate Stats
  const totalTests = subs?.length || 0;
  let avgScore = 0;
  
  if (totalTests > 0) {
    let totalPercentage = 0;
    subs.forEach(s => {
      if (s.total_questions > 0) {
        totalPercentage += (s.score / s.total_questions) * 100;
      }
    });
    avgScore = Math.round(totalPercentage / totalTests);
  }

  document.getElementById('sStatTotalTests').textContent = totalTests;
  document.getElementById('sStatAvgScore').textContent = `${avgScore}%`;

  const tbody = document.getElementById('studentTestsTable');
  if (!subs || subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">You haven\'t taken any tests yet. <a href="test.html">Find tests</a></td></tr>';
    return;
  }

  tbody.innerHTML = subs.map(sub => {
    const percentage = sub.total_questions > 0 ? (sub.score / sub.total_questions) * 100 : 0;
    
    let badgeClass = 'low';
    if (percentage >= 80) badgeClass = 'high';
    else if (percentage >= 50) badgeClass = 'medium';

    return `
      <tr>
        <td><strong>${escapeHTML(sub.mcq_tests?.title || 'Unknown Test')}</strong></td>
        <td>${escapeHTML(sub.mcq_tests?.profiles?.full_name || 'Teacher')}</td>
        <td><strong>${sub.score} / ${sub.total_questions}</strong></td>
        <td><span class="score-badge ${badgeClass}">${Math.round(percentage)}%</span></td>
        <td>${new Date(sub.submitted_at).toLocaleDateString()}</td>
      </tr>
    `;
  }).join('');
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function setupUserMenu() {
  const trigger = document.getElementById('userMenuTrigger');
  const dropdown = document.getElementById('userDropdown');
  const menu = document.getElementById('userMenu');
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    menu.classList.remove('open');
  });
  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());
}

document.addEventListener('DOMContentLoaded', initDashboard);
