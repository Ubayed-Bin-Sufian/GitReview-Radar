import { FormEvent, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { apiUrl, supabase, supabaseConfigured } from './supabase';

type View = 'settings' | 'repos' | 'repo' | 'connectors';

interface Repo {
  id: string;
  owner: string;
  name: string;
  last_synced_at: string | null;
  last_error: string | null;
}

interface Pull {
  github_number: number;
  title: string;
  action_state: string | null;
  actionability_score: number | null;
  next_step_owner: string | null;
  ci_build_state: string | null;
  branch_staleness_days: number | null;
}

interface Issue {
  github_number: number;
  title: string;
  state: string;
  author: string;
}

const PLUGINS = [
  { id: 'slack', label: 'Slack', fields: [{ key: 'webhook_url', label: 'Webhook URL' }] },
  { id: 'discord', label: 'Discord', fields: [{ key: 'webhook_url', label: 'Webhook URL' }] },
  { id: 'telegram', label: 'Telegram', fields: [{ key: 'bot_token', label: 'Bot token' }, { key: 'chat_id', label: 'Chat id' }] },
  { id: 'gmail', label: 'Gmail', fields: [{ key: 'smtp_user', label: 'Gmail address' }, { key: 'smtp_pass', label: 'App password' }, { key: 'to', label: 'Send to' }] },
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('repos');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return <main><h1>PR-Pulse</h1><p className="error">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p></main>;
  }

  if (!session) {
    return (
      <main>
        <h1>PR-Pulse</h1>
        <form className="card" onSubmit={(event) => signIn(event, email, password, setError)}>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Sign in</button>
          <button type="button" onClick={() => signUp(email, password, setError)}>Create account</button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>PR-Pulse</h1>
      <nav>
        <button onClick={() => setView('repos')}>Repos</button>
        <button onClick={() => setView('settings')}>Settings</button>
        <button onClick={() => setView('connectors')}>Connectors</button>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      {view === 'settings' && <Settings userId={session.user.id} />}
      {view === 'repos' && <Repos onOpen={() => setView('repo')} />}
      {view === 'repo' && <RepoDetail token={session.access_token} onBack={() => setView('repos')} />}
      {view === 'connectors' && <Connectors userId={session.user.id} />}
    </main>
  );
}

function Settings({ userId }: { userId: string }) {
  const [jevKey, setJevKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.from('user_settings').select('jev_api_key, github_token').eq('user_id', userId).maybeSingle().then(({ data }) => {
      setJevKey(data?.jev_api_key || '');
      setGithubToken(data?.github_token || '');
    });
  }, [userId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from('user_settings').upsert({
      user_id: userId,
      jev_api_key: jevKey,
      github_token: githubToken,
      updated_at: new Date().toISOString(),
    });
    setMessage(error ? error.message : 'Saved. This Jev key is yours. The included credit is about $5 for one month.');
  }

  return (
    <form className="card" onSubmit={save}>
      <p className="note">Paste the Jev API key you received. Sync is the only time it is used, and unchanged pull requests are not scored again.</p>
      <label>Jev API key<input value={jevKey} onChange={(event) => setJevKey(event.target.value)} type="password" /></label>
      <label>GitHub personal access token<input value={githubToken} onChange={(event) => setGithubToken(event.target.value)} type="password" /></label>
      <button type="submit">Save</button>
      {message && <p>{message}</p>}
    </form>
  );
}

function Repos({ onOpen }: { onOpen: (repo: Repo) => void }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Repo | null>(null);

  async function load() {
    const { data, error: loadError } = await supabase.from('repositories').select('id, owner, name, last_synced_at, last_error').order('created_at');
    if (loadError) setError(loadError.message);
    setRepos(data || []);
  }

  useEffect(() => { load(); }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('repositories').insert({
      owner,
      name,
      user_id: userData.user?.id,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOwner('');
    setName('');
    await load();
  }

  if (selected) {
    return <RepoDetail repo={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <section>
      <form className="card" onSubmit={add}>
        <label>Owner<input value={owner} onChange={(event) => setOwner(event.target.value)} required /></label>
        <label>Repository<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <button type="submit">Add repo</button>
        {error && <p className="error">{error}</p>}
      </form>
      <ul>
        {repos.map((repo) => (
          <li key={repo.id}>
            <button onClick={() => { setSelected(repo); onOpen(repo); }}>{repo.owner}/{repo.name}</button>
            <span className="note"> {repo.last_synced_at ? `synced ${repo.last_synced_at}` : 'not synced'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RepoDetail({ repo, token, onBack }: { repo?: Repo; token?: string; onBack: () => void }) {
  const [current, setCurrent] = useState<Repo | null>(repo || null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!repo) {
      supabase.from('repositories').select('id, owner, name, last_synced_at, last_error').limit(1).maybeSingle().then(({ data }) => setCurrent(data));
    }
  }, [repo]);

  useEffect(() => {
    if (!current) return;
    supabase.from('pull_requests').select('github_number, title, action_state, actionability_score, next_step_owner, ci_build_state, branch_staleness_days').eq('repo_id', current.id).then(({ data }) => setPulls(data || []));
    supabase.from('issues').select('github_number, title, state, author').eq('repo_id', current.id).then(({ data }) => setIssues(data || []));
  }, [current]);

  async function syncNow() {
    if (!current) return;
    setSyncing(true);
    setError('');
    const session = token ? { access_token: token } : (await supabase.auth.getSession()).data.session;
    const response = await fetch(`${apiUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ repo_id: current.id }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message || 'Sync failed');
    }
    const { data } = await supabase.from('repositories').select('id, owner, name, last_synced_at, last_error').eq('id', current.id).single();
    setCurrent(data);
    setSyncing(false);
  }

  if (!current) return <p>Add a repository first.</p>;

  return (
    <section>
      <button onClick={onBack}>Back</button>
      <h2>{current.owner}/{current.name}</h2>
      <p className="note">{current.last_synced_at ? `Last sync ${current.last_synced_at}` : 'Not synced yet'}{current.last_error ? ` — ${current.last_error}` : ''}</p>
      <button onClick={syncNow} disabled={syncing || !apiUrl}>{syncing ? 'Syncing…' : 'Sync now'}</button>
      {!apiUrl && <p className="note">Set VITE_API_URL to enable sync.</p>}
      {error && <p className="error">{error}</p>}
      <h3>Pull requests</h3>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>State</th><th>Score</th><th>Owner</th><th>CI</th><th>Stale days</th></tr></thead>
        <tbody>
          {pulls.map((pull) => (
            <tr key={pull.github_number}>
              <td>{pull.github_number}</td>
              <td>{pull.title}</td>
              <td>{pull.action_state || '—'}</td>
              <td>{pull.actionability_score ?? '—'}</td>
              <td>{pull.next_step_owner || '—'}</td>
              <td>{pull.ci_build_state || '—'}</td>
              <td>{pull.branch_staleness_days ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Issues</h3>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>State</th><th>Author</th></tr></thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.github_number}><td>{issue.github_number}</td><td>{issue.title}</td><td>{issue.state}</td><td>{issue.author}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Connectors({ userId }: { userId: string }) {
  const [pluginId, setPluginId] = useState('slack');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Array<{ id: string; plugin_id: string; enabled: boolean }>>([]);
  const [error, setError] = useState('');
  const plugin = PLUGINS.find((item) => item.id === pluginId)!;

  async function load() {
    const { data } = await supabase.from('connectors').select('id, plugin_id, enabled').eq('user_id', userId);
    setRows(data || []);
  }

  useEffect(() => { load(); }, [userId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const { error: saveError } = await supabase.from('connectors').upsert({
      user_id: userId,
      plugin_id: pluginId,
      enabled: false,
      config,
    }, { onConflict: 'user_id,plugin_id' });
    setError(saveError ? saveError.message : '');
    await load();
  }

  async function toggle(row: { id: string; enabled: boolean }) {
    await supabase.from('connectors').update({ enabled: !row.enabled }).eq('id', row.id);
    await load();
  }

  return (
    <section>
      <p className="note">Connectors are off until you add one and turn on the daily summary.</p>
      <form className="card" onSubmit={save}>
        <label>Plugin
          <select value={pluginId} onChange={(event) => { setPluginId(event.target.value); setConfig({}); }}>
            {PLUGINS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {plugin.fields.map((field) => (
          <label key={field.key}>{field.label}
            <input value={config[field.key] || ''} onChange={(event) => setConfig({ ...config, [field.key]: event.target.value })} />
          </label>
        ))}
        <button type="submit">Add connector</button>
        {error && <p className="error">{error}</p>}
      </form>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.plugin_id}
            <label className="toggle">
              <input type="checkbox" checked={row.enabled} onChange={() => toggle(row)} />
              Daily summary
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function signIn(event: FormEvent, email: string, password: string, setError: (value: string) => void) {
  event.preventDefault();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setError(error ? error.message : '');
}

async function signUp(email: string, password: string, setError: (value: string) => void) {
  const { error } = await supabase.auth.signUp({ email, password });
  setError(error ? error.message : 'Check your email to confirm the account, then sign in.');
}
