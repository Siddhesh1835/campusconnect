-- ============================================
-- Campus Connect — Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT 'User',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. COMMUNITIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_emoji TEXT DEFAULT '📚',
  banner_color TEXT DEFAULT '#FF4500',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Communities are viewable by everyone" ON communities
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage communities" ON communities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 3. COMMUNITY MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view community members" ON community_members
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage community members" ON community_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can join communities" ON community_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4. POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'poll')),
  score INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view posts from their communities" ON posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM community_members 
      WHERE community_id = posts.community_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create posts in their communities" ON posts
  FOR INSERT WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM community_members 
      WHERE community_id = posts.community_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update own posts" ON posts
  FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts" ON posts
  FOR DELETE USING (auth.uid() = author_id);

-- ============================================
-- 5. POLL OPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  vote_count INT NOT NULL DEFAULT 0,
  option_index INT NOT NULL DEFAULT 0
);

ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view poll options" ON poll_options
  FOR SELECT USING (true);

CREATE POLICY "Post author can create poll options" ON poll_options
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM posts WHERE id = post_id AND author_id = auth.uid())
  );

-- ============================================
-- 6. POLL VOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view poll votes" ON poll_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can vote on polls" ON poll_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 7. POST VOTES TABLE (upvote/downvote)
-- ============================================
CREATE TABLE IF NOT EXISTS post_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE post_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view votes" ON post_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can vote" ON post_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can change their vote" ON post_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove their vote" ON post_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update post score
CREATE OR REPLACE FUNCTION update_post_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET score = score + NEW.vote_type WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE posts SET score = score - OLD.vote_type + NEW.vote_type WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET score = score - OLD.vote_type WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_post_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON post_votes
  FOR EACH ROW EXECUTE FUNCTION update_post_score();

-- ============================================
-- 8. COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments" ON comments
  FOR SELECT USING (true);

CREATE POLICY "Users can create comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own comments" ON comments
  FOR DELETE USING (auth.uid() = author_id);

-- Function to update post comment count
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- ============================================
-- 9. COMMENT VOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS comment_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comment votes" ON comment_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can vote on comments" ON comment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can change comment vote" ON comment_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove comment vote" ON comment_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update comment score
CREATE OR REPLACE FUNCTION update_comment_score()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET score = score + NEW.vote_type WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE comments SET score = score - OLD.vote_type + NEW.vote_type WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET score = score - OLD.vote_type WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON comment_votes
  FOR EACH ROW EXECUTE FUNCTION update_comment_score();

-- ============================================
-- 10. MCQ TESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS mcq_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT DEFAULT 30,
  scheduled_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mcq_tests ENABLE ROW LEVEL SECURITY;

-- Students can only see tests in their communities (NOT teachers)
CREATE POLICY "Students can view tests in their communities" ON mcq_tests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM community_members 
      WHERE community_id = mcq_tests.community_id 
      AND user_id = auth.uid()
      AND role = 'student'
    )
    OR
    auth.uid() = created_by
  );

CREATE POLICY "Teachers can create tests" ON mcq_tests
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM community_members 
      WHERE community_id = mcq_tests.community_id 
      AND user_id = auth.uid()
      AND role = 'teacher'
    )
  );

CREATE POLICY "Teachers can update own tests" ON mcq_tests
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Teachers can delete own tests" ON mcq_tests
  FOR DELETE USING (auth.uid() = created_by);

-- ============================================
-- 11. MCQ QUESTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS mcq_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES mcq_tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_index INT NOT NULL DEFAULT 0
);

ALTER TABLE mcq_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view questions for accessible tests" ON mcq_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM mcq_tests WHERE id = test_id AND (
        EXISTS (
          SELECT 1 FROM community_members 
          WHERE community_id = mcq_tests.community_id 
          AND user_id = auth.uid()
          AND role = 'student'
        )
        OR auth.uid() = mcq_tests.created_by
      )
    )
  );

CREATE POLICY "Test creators can add questions" ON mcq_questions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM mcq_tests WHERE id = test_id AND created_by = auth.uid())
  );

-- ============================================
-- 12. MCQ OPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS mcq_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES mcq_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  option_index INT NOT NULL DEFAULT 0
);

ALTER TABLE mcq_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view options" ON mcq_options
  FOR SELECT USING (true);

CREATE POLICY "Test creators can add options" ON mcq_options
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM mcq_questions q
      JOIN mcq_tests t ON t.id = q.test_id
      WHERE q.id = question_id AND t.created_by = auth.uid()
    )
  );

-- ============================================
-- 13. MCQ SUBMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS mcq_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES mcq_tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  score INT,
  total_questions INT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(test_id, student_id)
);

ALTER TABLE mcq_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own submissions" ON mcq_submissions
  FOR SELECT USING (auth.uid() = student_id OR 
    EXISTS (SELECT 1 FROM mcq_tests WHERE id = test_id AND created_by = auth.uid())
  );

CREATE POLICY "Students can submit tests" ON mcq_submissions
  FOR INSERT WITH CHECK (auth.uid() = student_id);

-- ============================================
-- SEED DATA — Sample Communities
-- ============================================
-- Uncomment and modify these after running the schema:
/*
INSERT INTO communities (name, description, icon_emoji, banner_color) VALUES
  ('BTech SY A Division', 'BTech Second Year - A Division community', '🎓', '#FF4500'),
  ('BTech SY B Division', 'BTech Second Year - B Division community', '📖', '#0079D3'),
  ('Tech Club', 'Technology and coding enthusiasts', '💻', '#00C853'),
  ('Cultural Fest', 'Annual cultural festival planning', '🎭', '#FF6D00'),
  ('Sports Council', 'Sports events and activities', '⚽', '#2979FF'),
  ('Campus Life', 'General campus announcements', '🏫', '#7C4DFF');
*/
