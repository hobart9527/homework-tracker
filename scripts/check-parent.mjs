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

// Check parent user in auth
const parentId = 'e0f39a36-415e-4439-b717-efcd7ff7bf33';
const { data: user, error } = await supabase.auth.admin.getUserById(parentId);
if (error) {
  console.error('Error:', error);
} else {
  console.log('User email:', user.user?.email);
  console.log('User phone:', user.user?.phone);
}

// Try signing in with the new email
const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: `${parentId}@parent.local`,
  password: '0000',
});

if (signInError) {
  console.log('Sign in failed:', signInError.message);
} else {
  console.log('✅ Sign in worked! Session:', !!signInData.session);
}
