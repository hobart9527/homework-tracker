import { createClient } from '@supabase/supabase-js';

const fs = await import('fs');
const path = await import('path');
const envPath = path.join(import.meta.dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

let supabaseUrl = null;
let anonKey = null;
for (const line of envContent.split('\n')) {
  const [key, ...valueParts] = line.split('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = valueParts.join('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') anonKey = valueParts.join('=');
}

// Test with ANON key like the browser client
const supabase = createClient(supabaseUrl, anonKey);

// This is exactly what the login page does
const { data: parent, error: findError } = await supabase
  .from('parents')
  .select('*')
  .eq('passcode', '0000')
  .single();

if (findError || !parent) {
  console.log('Query to find parent failed! Error:', findError?.message);
  console.log('This is why the browser shows "密码错误，请重试"');
  console.log('The RLS policy is blocking access to parents table for unauthenticated users');
} else {
  console.log('Parent found:', parent);
}
