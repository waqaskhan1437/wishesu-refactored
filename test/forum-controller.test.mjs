import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSubmitQuestion() {
  const mod = await import(`../src/controllers/forum.js?test=${Date.now()}-${Math.random()}`);
  return mod.submitQuestion;
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

class Statement {
  constructor(sql, state, args = []) {
    this.sql = sql;
    this.state = state;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.sql, this.state, args);
  }

  async first() {
    const sql = normalizeSql(this.sql);

    if (sql.includes('select question_id from forum_replies limit 1')) {
      return null;
    }

    if (sql.includes('select email from forum_questions limit 1')) {
      return null;
    }

    if (sql.includes("select id from forum_questions where email = ? and status = 'pending' limit 1")) {
      return null;
    }

    if (sql.includes("select id from forum_replies where email = ? and status = 'pending' limit 1")) {
      return null;
    }

    return null;
  }

  async all() {
    const sql = normalizeSql(this.sql);

    if (sql.includes('select id, title, slug from forum_questions order by created_at asc, id asc')) {
      return {
        results: this.state.questions
          .slice()
          .sort((left, right) => (left.created_at - right.created_at) || (left.id - right.id))
          .map((question) => ({ id: question.id, title: question.title, slug: question.slug }))
      };
    }

    return { results: [] };
  }

  async run() {
    const sql = normalizeSql(this.sql);

    if (sql.includes('create unique index') && sql.includes('idx_forum_questions_slug_unique') && sql.includes('on forum_questions(slug)')) {
      this.state.hasUniqueSlugIndex = true;
      return { success: true };
    }

    if (sql.includes('update forum_questions') && sql.includes('set slug = ?') && sql.includes('where id = ?')) {
      const [slug, updatedAt, id] = this.args;
      const question = this.state.questions.find((item) => item.id === id);
      if (question) {
        question.slug = slug;
        question.updated_at = updatedAt;
      }
      return { success: true };
    }

    if (sql.includes("insert into forum_questions (title, slug, content, name, email, status, reply_count, created_at, updated_at) values (?, ?, ?, ?, ?, 'pending', 0, ?, ?)")) {
      const [title, slug, content, name, email, createdAt, updatedAt] = this.args;
      if (this.state.questions.some((item) => item.slug === slug)) {
        throw new Error('UNIQUE constraint failed: forum_questions.slug');
      }

      this.state.questions.push({
        id: this.state.questions.length + 1,
        title,
        slug,
        content,
        name,
        email,
        status: 'pending',
        reply_count: 0,
        created_at: createdAt,
        updated_at: updatedAt
      });

      return { success: true };
    }

    return { success: true };
  }
}

function createEnv(initialQuestions = []) {
  const state = {
    questions: initialQuestions.map((question, index) => ({
      id: question.id ?? (index + 1),
      title: question.title,
      slug: question.slug,
      content: question.content || 'Existing question content',
      name: question.name || 'Existing User',
      email: question.email || `user${index + 1}@example.com`,
      status: question.status || 'approved',
      reply_count: question.reply_count || 0,
      created_at: question.created_at || (index + 1),
      updated_at: question.updated_at || (index + 1)
    })),
    hasUniqueSlugIndex: false
  };

  return {
    state,
    DB: {
      prepare(sql) {
        return new Statement(sql, state);
      }
    }
  };
}

test('submitQuestion retries with numeric suffix when slug already exists', async () => {
  const submitQuestion = await loadSubmitQuestion();
  const env = createEnv([
    { id: 1, title: 'Hello World', slug: 'hello-world' }
  ]);

  const response = await submitQuestion(env, {
    title: 'Hello World',
    content: 'This question has enough content.',
    name: 'Adeel',
    email: 'adeel@example.com'
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(env.state.questions.at(-1).slug, 'hello-world-1');
  assert.equal(env.state.hasUniqueSlugIndex, true);
});

test('submitQuestion normalizes duplicate existing slugs before inserting a new question', async () => {
  const submitQuestion = await loadSubmitQuestion();
  const env = createEnv([
    { id: 1, title: 'Same Title', slug: 'same-title', created_at: 1 },
    { id: 2, title: 'Same Title Again', slug: 'same-title', created_at: 2 }
  ]);

  const response = await submitQuestion(env, {
    title: 'Same Title',
    content: 'This is another valid forum question body.',
    name: 'Sara',
    email: 'sara@example.com'
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    env.state.questions.map((question) => question.slug),
    ['same-title', 'same-title-1', 'same-title-2']
  );
});
