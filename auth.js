// ============================================
// Campus Connect — Authentication Utilities
// ============================================

const Auth = {
  // Get current session
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) console.error('Session error:', error);
    return session;
  },

  // Get current user
  async getUser() {
    const session = await this.getSession();
    return session?.user || null;
  },

  // Get user profile with role
  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Profile error:', error);
      return null;
    }

    // Auto-update sidebar for teachers
    if (data.role === 'teacher' || data.role === 'admin') {
      const navTest = document.getElementById('navTest');
      if (navTest) {
        navTest.href = 'schedule-test.html';
        const label = navTest.querySelector('.nav-label');
        if (label) label.textContent = 'Schedule Test';
      }
    }

    return data;
  },

  // Login with email and password
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  // Logout
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = 'index.html';
  },

  // Check if user is authenticated, redirect if not
  async requireAuth() {
    const session = await this.getSession();
    if (!session) {
      window.location.href = 'index.html';
      return null;
    }
    return session;
  },

  // Check if user is a teacher
  async isTeacher() {
    const profile = await this.getProfile();
    return profile?.role === 'teacher' || profile?.role === 'admin';
  },

  // Check if user is a student
  async isStudent() {
    const profile = await this.getProfile();
    return profile?.role === 'student';
  },

  // Get user's joined communities
  async getJoinedCommunities() {
    const user = await this.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('community_members')
      .select(`
        community_id,
        role,
        communities (
          id,
          name,
          description,
          icon_emoji,
          banner_color
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      console.error('Communities error:', error);
      return [];
    }
    return data || [];
  },

  // Get communities where user is a teacher
  async getTeacherCommunities() {
    const user = await this.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('community_members')
      .select(`
        community_id,
        communities (
          id,
          name,
          description,
          icon_emoji
        )
      `)
      .eq('user_id', user.id)
      .eq('role', 'teacher');

    if (error) {
      console.error('Teacher communities error:', error);
      return [];
    }
    return data || [];
  },

  // Listen for auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },

  // Format time ago
  timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    return `${Math.floor(seconds / 2592000)}mo ago`;
  }
};
