import { createClient } from '@supabase/supabase-js';

const fs = await import('fs');
const path = await import('path');
const envPath = path.join(import.meta.dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

let supabaseUrl = null;
let serviceRoleKey = null;
for (const line of envContent.split('\n')) {
  const [key, ...valueParts] = line.split('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = valueParts.join('=');
  if (key === 'SUPABASE_SERVICE_ROLE_KEY') serviceRoleKey = valueParts.join('=');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Create SQL function for passcode-based login
const { error } = await supabase.rpc('eval', { sql: `
-- Create a function to look up parent by passcode (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_parent_by_passcode(passcode_param TEXT)
RETURNS TABLE (id UUID, passcode TEXT, reminder_cutoff_time TEXT, auto_remind_parent BOOLEAN, auto_remind_child BOOLEAN, quiet_hours_start TEXT, quiet_hours_end TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.id, p.passcode, p.reminder_cutoff_time, p.auto_remind_parent, p.auto_remind_child, p.quiet_hours_start, p.quiet_hours_end, p.created_at
  FROM public.parents p
  WHERE p.passcode = passcode_param
  LIMIT 1
$$;
`});

if (error) {
  console.log('RPC error:', error.message);
} else {
  console.log('✅ SQL function created (or already existed)');
}

// Now test the query with anon key
const anonKey = envContent
  .split('\n')
  .find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY='))
  ?.split('=')
  .slice(1)
  .join('=');

const anonClient = createClient(supabaseUrl, anonKey);

// Try calling the function
const { data, error: rpcError } = await anonClient.rpc('get_parent_by_passcode', { passcode_param: '0000' });
if (rpcError) {
  console.log('RPC call failed:', rpcError.message);
} else {
  console.log('✅ RPC call worked! Result:', data);
}
