// ============================================
// Campus Connect — Main App Logic (Home Page)
// ============================================

let currentUser = null;
let currentSort = 'new';
let searchQuery = '';
let userVotes = {};
let joinedCommunities = [];

// ============================================
// INITIALIZATION
// ============================================
async function initApp() {
  const session = await Auth.requireAuth();
  if (!session) return;

  currentUser = await Auth.getProfile();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // Update header
  document.getElementById('userName').textContent = currentUser.full_name;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('userAvatar').textContent = currentUser.full_name.charAt(0).toUpperCase();

  // Show teacher panel
  if (currentUser.role === 'teacher' || currentUser.role === 'admin') {
    document.getElementById('teacherPanel').classList.remove('hidden');
  }

  // Setup listeners
  setupUserMenu();
  setupSearch();
  setupSort();

  // Load data
  await loadSidebarCommunities();
  await loadFeed();
}

// ============================================
// USER MENU
// ============================================
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

// ============================================
// SEARCH
// ============================================
function setupSearch() {
  const input = document.getElementById('searchInput');
  let debounceTimer;

  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = e.target.value.trim().toLowerCase();
      loadFeed();
    }, 300);
  });
}

// ============================================
// SORT
// ============================================
function setupSort() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      loadFeed();
    });
  });
}

// ============================================
// SIDEBAR COMMUNITIES
// ============================================
async function loadSidebarCommunities() {
  joinedCommunities = await Auth.getJoinedCommunities();

  const sidebarEl = document.getElementById('sidebarCommunities');
  const rightEl = document.getElementById('rightCommunities');

  if (joinedCommunities.length === 0) {
    sidebarEl.innerHTML = '<div style="padding:var(--space-md) var(--space-lg);font-size:0.85rem;color:var(--text-secondary);">No communities yet</div>';
    rightEl.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Join communities to see them here.</p>';
    return;
  }

  const communityHTML = joinedCommunities.map(cm => `
    <div class="sidebar-community" title="${cm.communities.description || cm.communities.name}">
      <div class="sidebar-community-icon" style="background:${cm.communities.banner_color || '#FF4500'}">
        ${cm.communities.icon_emoji || '📚'}
      </div>
      <span class="sidebar-community-name">c/${cm.communities.name.replace(/\s+/g, '_')}</span>
    </div>
  `).join('');

  sidebarEl.innerHTML = communityHTML;

  // Right sidebar communities
  const rightHTML = joinedCommunities.map(cm => `
    <div style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) 0;">
      <div class="sidebar-community-icon" style="background:${cm.communities.banner_color || '#FF4500'};width:20px;height:20px;font-size:0.6rem;">
        ${cm.communities.icon_emoji || '📚'}
      </div>
      <span style="font-size:0.85rem;color:var(--text-primary);">c/${cm.communities.name.replace(/\s+/g, '_')}</span>
      <span style="font-size:0.7rem;color:var(--text-tertiary);margin-left:auto;">${cm.role}</span>
    </div>
  `).join('');

  rightEl.innerHTML = rightHTML;
}

// ============================================
// LOAD FEED
// ============================================
async function loadFeed() {
  const feedEl = document.getElementById('feedContent');

  // Get community IDs
  const communityIds = joinedCommunities.map(cm => cm.community_id);

  if (communityIds.length === 0) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div class="empty-state-title">No communities joined</div>
        <p class="empty-state-text">Ask your admin to add you to campus communities to see posts here.</p>
      </div>
    `;
    return;
  }

  // Build query
  let query = supabase
    .from('posts')
    .select(`
      *,
      profiles:author_id (id, full_name, role),
      communities:community_id (id, name, icon_emoji, banner_color)
    `)
    .in('community_id', communityIds);

  // Sort
  if (currentSort === 'new') {
    query = query.order('created_at', { ascending: false });
  } else if (currentSort === 'hot') {
    query = query.order('comment_count', { ascending: false });
  } else if (currentSort === 'top') {
    query = query.order('score', { ascending: false });
  }

  query = query.limit(50);

  const { data: posts, error } = await query;

  if (error) {
    feedEl.innerHTML = '<div class="empty-state"><div class="empty-state-title">Failed to load posts</div><p class="empty-state-text">' + escapeHTML(error.message) + '</p></div>';
    return;
  }

  // Filter by search
  let filteredPosts = posts || [];
  if (searchQuery) {
    filteredPosts = filteredPosts.filter(p =>
      p.title.toLowerCase().includes(searchQuery) ||
      (p.content || '').toLowerCase().includes(searchQuery) ||
      p.communities.name.toLowerCase().includes(searchQuery)
    );
  }

  if (filteredPosts.length === 0) {
    feedEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <div class="empty-state-title">${searchQuery ? 'No results found' : 'No posts yet'}</div>
        <p class="empty-state-text">${searchQuery ? `No posts matching "${searchQuery}"` : 'Be the first to post in your community!'}</p>
      </div>
    `;
    return;
  }

  // Get user's votes
  const postIds = filteredPosts.map(p => p.id);
  const { data: votes } = await supabase
    .from('post_votes')
    .select('post_id, vote_type')
    .eq('user_id', currentUser.id)
    .in('post_id', postIds);

  userVotes = {};
  (votes || []).forEach(v => { userVotes[v.post_id] = v.vote_type; });

  // Get poll options for poll posts
  const pollPostIds = filteredPosts.filter(p => p.type === 'poll').map(p => p.id);
  let pollOptionsMap = {};
  let userPollVotes = {};

  if (pollPostIds.length > 0) {
    const { data: pollOpts } = await supabase
      .from('poll_options')
      .select('*')
      .in('post_id', pollPostIds)
      .order('option_index');

    (pollOpts || []).forEach(opt => {
      if (!pollOptionsMap[opt.post_id]) pollOptionsMap[opt.post_id] = [];
      pollOptionsMap[opt.post_id].push(opt);
    });

    const { data: pVotes } = await supabase
      .from('poll_votes')
      .select('post_id, option_id')
      .eq('user_id', currentUser.id)
      .in('post_id', pollPostIds);

    (pVotes || []).forEach(v => { userPollVotes[v.post_id] = v.option_id; });
  }

  // Render posts
  feedEl.innerHTML = filteredPosts.map((post, i) =>
    renderPostCard(post, i, pollOptionsMap[post.id] || [], userPollVotes[post.id])
  ).join('');
}

// ============================================
// RENDER POST CARD
// ============================================
function renderPostCard(post, index, pollOptions, userPollVote) {
  const voteType = userVotes[post.id] || 0;
  const upActive = voteType === 1 ? 'active' : '';
  const downActive = voteType === -1 ? 'active' : '';
  const scoreClass = voteType === 1 ? 'upvoted' : voteType === -1 ? 'downvoted' : '';

  let bodyHTML = '';

  if (post.type === 'text' && post.content) {
    const truncated = post.content.length > 300;
    bodyHTML = `
      <div class="post-body ${truncated ? 'truncated' : ''}">${escapeHTML(post.content)}</div>
    `;
  } else if (post.type === 'poll') {
    bodyHTML = renderPollInFeed(post, pollOptions, userPollVote);
  }

  const authorRole = post.profiles?.role === 'teacher' ? ' 🧑‍🏫' : '';

  return `
    <article class="post-card" style="animation-delay:${index * 0.05}s" data-post-id="${post.id}">
      <div class="vote-column">
        <button class="vote-btn upvote ${upActive}" onclick="event.stopPropagation(); handleVote('${post.id}', 1)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
        </button>
        <span class="vote-score ${scoreClass}" id="score-${post.id}">${post.score}</span>
        <button class="vote-btn downvote ${downActive}" onclick="event.stopPropagation(); handleVote('${post.id}', -1)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-5V4H9v8H4z"/></svg>
        </button>
      </div>
      <div class="post-content" onclick="window.location.href='post.html?id=${post.id}'">
        <div class="post-meta">
          <span class="post-community">
            <span class="post-community-icon" style="background:${post.communities?.banner_color || '#FF4500'}">${post.communities?.icon_emoji || '📚'}</span>
            c/${(post.communities?.name || 'unknown').replace(/\s+/g, '_')}
          </span>
          <span class="post-meta-dot">•</span>
          <span class="post-author">Posted by u/${post.profiles?.full_name || 'Unknown'}${authorRole}</span>
          <span class="post-meta-dot">•</span>
          <span class="post-time">${Auth.timeAgo(post.created_at)}</span>
          ${post.type === 'poll' ? '<span class="post-type-badge poll">📊 Poll</span>' : ''}
        </div>
        <div class="post-title">${escapeHTML(post.title)}</div>
        ${bodyHTML}
        <div class="post-actions">
          <span class="post-action-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${post.comment_count} Comments
          </span>
          <button class="post-action-btn" onclick="event.stopPropagation(); sharePost('${post.id}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          ${currentUser && currentUser.id === post.author_id ? `
          <button class="post-action-btn" onclick="event.stopPropagation(); deletePost('${post.id}')" style="color:var(--error); margin-left:auto;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
          ` : ''}
        </div>
      </div>
    </article>
  `;
}

// ============================================
// DELETE POST
// ============================================
async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    showToast('Failed to delete post: ' + error.message, 'error');
  } else {
    showToast('Post deleted', 'success');
    loadFeed();
  }
}

// ============================================
// RENDER POLL IN FEED
// ============================================
function renderPollInFeed(post, options, userVoteOptionId) {
  const totalVotes = options.reduce((sum, o) => sum + o.vote_count, 0);
  const hasVoted = !!userVoteOptionId;

  const optionsHTML = options.map(opt => {
    const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0;
    const isSelected = userVoteOptionId === opt.id;

    return `
      <div class="poll-option ${hasVoted ? 'voted' : ''} ${isSelected ? 'selected' : ''}"
           onclick="event.stopPropagation(); ${hasVoted ? '' : `votePoll('${post.id}', '${opt.id}')`}">
        <div class="poll-option-bar" style="width:${hasVoted ? pct : 0}%"></div>
        <span class="poll-option-text">${escapeHTML(opt.option_text)}</span>
        ${hasVoted ? `<span class="poll-option-pct">${pct}%</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="poll-container" onclick="event.stopPropagation();">
      ${optionsHTML}
      <div class="poll-total">${totalVotes} votes</div>
    </div>
  `;
}

// ============================================
// HANDLE VOTE
// ============================================
async function handleVote(postId, voteType) {
  const { data: existing } = await supabase
    .from('post_votes')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', currentUser.id)
    .single();

  if (existing) {
    if (existing.vote_type === voteType) {
      // Remove vote
      await supabase.from('post_votes').delete().eq('id', existing.id);
      userVotes[postId] = 0;
    } else {
      // Change vote
      await supabase.from('post_votes').update({ vote_type: voteType }).eq('id', existing.id);
      userVotes[postId] = voteType;
    }
  } else {
    // New vote
    await supabase.from('post_votes').insert({
      post_id: postId,
      user_id: currentUser.id,
      vote_type: voteType
    });
    userVotes[postId] = voteType;
  }

  // Refresh the post's score from DB
  const { data: updatedPost } = await supabase
    .from('posts')
    .select('score')
    .eq('id', postId)
    .single();

  if (updatedPost) {
    const scoreEl = document.getElementById(`score-${postId}`);
    if (scoreEl) {
      scoreEl.textContent = updatedPost.score;
      scoreEl.className = `vote-score ${userVotes[postId] === 1 ? 'upvoted' : userVotes[postId] === -1 ? 'downvoted' : ''}`;
    }

    // Update vote button styles
    const card = document.querySelector(`[data-post-id="${postId}"]`);
    if (card) {
      const upBtn = card.querySelector('.vote-btn.upvote');
      const downBtn = card.querySelector('.vote-btn.downvote');
      upBtn.classList.toggle('active', userVotes[postId] === 1);
      downBtn.classList.toggle('active', userVotes[postId] === -1);
    }
  }
}

// ============================================
// POLL VOTE
// ============================================
async function votePoll(postId, optionId) {
  const { error: voteError } = await supabase.from('poll_votes').insert({
    post_id: postId,
    option_id: optionId,
    user_id: currentUser.id
  });

  if (voteError) {
    showToast('Failed to vote: ' + voteError.message, 'error');
    return;
  }

  // Increment vote count
  const { data: opt } = await supabase
    .from('poll_options')
    .select('vote_count')
    .eq('id', optionId)
    .single();

  await supabase
    .from('poll_options')
    .update({ vote_count: (opt?.vote_count || 0) + 1 })
    .eq('id', optionId);

  // Reload feed
  await loadFeed();
  showToast('Vote recorded!', 'success');
}

// ============================================
// SHARE POST
// ============================================
function sharePost(postId) {
  const url = `${window.location.origin}/post.html?id=${postId}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied!', 'success');
  }).catch(() => {
    showToast('Failed to copy link', 'error');
  });
}

// ============================================
// UTILITIES
// ============================================
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
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

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', initApp);
