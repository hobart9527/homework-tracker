import { createClient } from '@supabase/supabase-js';

const fs = await import('fs');
const path = await import('path');
const envPath = path.join(import.meta.dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

let supabaseUrl = null;
let anonKey = null;
let serviceRoleKey = null;
for (const line of envContent.split('\n')) {
  const [key, ...valueParts] = line.split('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = valueParts.join('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') anonKey = valueParts.join('=');
  if (key === 'SUPABASE_SERVICE_ROLE_KEY') serviceRoleKey = valueParts.join('=');
}

// Step 1: Test RPC call (what the login page does)
const anon = createClient(supabaseUrl, anonKey);
const { data: parents, error } = await anon.rpc('get_parent_by_passcode', { passcode_param: '0000' });
console.log('Step 1 - get_parent_by_passcode:', error ? error.message : `Found ${parents?.length} parent(s)`);

if (!parents || parents.length === 0) {
  console.log('❌ Step 1 failed - no parent found with passcode 0000');
  process.exit(1);
}

const parent = parents[0];
console.log('Parent ID:', parent.id);

// Step 2: Test auth sign in (what the login page does next)
const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
  email: `${parent.id}@parent.local`,
  password: '0000',
});

if (signInError) {
  console.log('❌ Step 2 failed - signInWithPassword error:', signInError.message);
  process.exit(1);
}

console.log('✅ Step 2 - auth sign in succeeded');
console.log('Login flow is working correctly!');
