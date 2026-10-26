// Shared website configuration: public publishable/anon key only.
// Never use a secret/service_role key or database password.
export const publicConfig = Object.freeze({
  url: 'https://tpmunhmggkjpzsobtahr.supabase.co',
  key: 'sb_publishable_oRD4ObeySfkmOHvdxVqYUw_9OVMOpT_'
});

export function validatePublicConfig(config) {
  const url = String(config?.url || '').trim().replace(/\/$/, '');
  const key = String(config?.key || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error('Missing or invalid project URL');
  if (key.startsWith('sb_publishable_') && key.length > 20) return {url, key};
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (key.split('.').length === 3 && payload.role === 'anon') return {url, key};
  } catch {}
  throw new Error('Only a publishable or anon key is allowed');
}
