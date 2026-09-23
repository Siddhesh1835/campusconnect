let currentUser = null;

async function initProfile() {
  const session = await Auth.requireAuth();
  if (!session) return;

  currentUser = await Auth.getProfile();
  if (!currentUser) return;

  // Header update
  document.getElementById('headerUserName').textContent = currentUser.full_name;
  document.getElementById('headerUserAvatar').textContent = currentUser.full_name.charAt(0).toUpperCase();
  setupUserMenu();

  // Profile section update
  document.getElementById('profileName').textContent = currentUser.full_name;
  document.getElementById('profileEmail').textContent = currentUser.email;
  document.getElementById('profileRole').textContent = currentUser.role.toUpperCase();
  document.getElementById('profileAvatar').textContent = currentUser.full_name.charAt(0).toUpperCase();

  await loadUserPosts();
}

async function loadUserPosts() {
  const feedEl = document.getElementById('userPostsFeed');

  const { data: posts, error } = await supabase
    .from('posts')
    .select(`
      *,
      communities:community_id (id, name, icon_emoji, banner_color)
    `)
    .eq('author_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    feedEl.innerHTML = '<div class="empty-state"><div class="empty-state-title">Failed to load posts</div><p class="empty-state-text">' + escapeHTML(error.message) + '</p></div>';
    return;
  }

  if (!posts || posts.length === 0) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <div class="empty-state-title">No posts yet</div>
        <p class="empty-state-text">You haven't created any posts.</p>
        <a href="create.html" class="btn btn-primary mt-lg">Create Post</a>
      </div>
    `;
    return;
  }

  feedEl.innerHTML = posts.map((post, i) => `
    <article class="post-card" style="animation-delay:${i * 0.05}s" onclick="window.location.href='post.html?id=${post.id}'">
      <div class="post-content" style="padding-left: var(--space-xl);">
        <div class="post-meta">
          <span class="post-community">
            <span class="post-community-icon" style="background:${post.communities?.banner_color || '#FF4500'}">${post.communities?.icon_emoji || '📚'}</span>
            c/${(post.communities?.name || 'unknown').replace(/\s+/g, '_')}
          </span>
          <span class="post-meta-dot">•</span>
          <span class="post-time">${Auth.timeAgo(post.created_at)}</span>
          <span class="post-meta-dot">•</span>
          <span class="post-time" title="${new Date(post.created_at).toLocaleString()}">Uploaded: ${new Date(post.created_at).toLocaleDateString()} ${new Date(post.created_at).toLocaleTimeString()}</span>
          ${post.type === 'poll' ? '<span class="post-type-badge poll">📊 Poll</span>' : ''}
        </div>
        <div class="post-title">${escapeHTML(post.title)}</div>
        ${post.type === 'text' && post.content ? `
          <div class="post-body ${post.content.length > 300 ? 'truncated' : ''}">${escapeHTML(post.content)}</div>
        ` : ''}
        <div class="post-actions">
          <span class="post-action-btn" style="cursor:default;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="14 9 9 14 4 9"/><path d="M4 21h16a2 2 0 0 0 2-2v-8"/></svg>
            ${post.score} Votes
          </span>
          <span class="post-action-btn" style="cursor:default;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${post.comment_count} Comments
          </span>
          <button class="post-action-btn" onclick="event.stopPropagation(); deletePost('${post.id}')" style="color:var(--error); margin-left:auto;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    showToast('Failed to delete post: ' + error.message, 'error');
  } else {
    showToast('Post deleted', 'success');
    loadUserPosts();
  }
}

function showToast(message, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
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

document.addEventListener('DOMContentLoaded', initProfile);
