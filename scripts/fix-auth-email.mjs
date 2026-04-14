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

// Get the parent with passcode 0000
const { data: parent } = await supabase
  .from('parents')
  .select('*')
  .eq('passcode', '0000')
  .single();

if (!parent) {
  console.error('No parent with passcode 0000 found!');
  process.exit(1);
}

// Update auth user: set email to valid format like {parent-id}@parent.local
const validEmail = `${parent.id}@parent.local`;
const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(parent.id, {
  email: validEmail,
});

if (authError) {
  console.error('Auth update error:', authError);
  process.exit(1);
}

console.log(`✅ Auth email updated: ${parent.id} -> ${authData.email}`);
console.log(`Now login will use email: ${validEmail} instead of parent.id (which is an invalid email)`);
console.log('Also need to update login page to use this email instead of parent.id');
