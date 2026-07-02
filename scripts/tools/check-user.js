const fs = require('fs');

const configContent = fs.readFileSync('d:/dd/supabase-config.js', 'utf8');
const urlMatch = configContent.match(/window\.SUPABASE_URL = '([^']+)'/);
const keyMatch = configContent.match(/window\.SUPABASE_ANON_KEY = '([^']+)'/);

if (urlMatch && keyMatch) {
  const url = urlMatch[1];
  const anonKey = keyMatch[1];

  async function checkUser() {
    // Check Adolf's user profile
    let response = await fetch(`${url}/rest/v1/users?email=eq.adolf@gmail.com`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const users = await response.json();
    const adolf = users[0];
    console.log('Adolf User Profile:', adolf);

    if (adolf) {
      // Check Adolf's enrollments in user_courses
      response = await fetch(`${url}/rest/v1/user_courses?user_id=eq.${adolf.id}`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      const enrollments = await response.json();
      console.log('\nAdolf Enrollments in user_courses:', enrollments);
    }
  }
  checkUser();
} else {
  console.log('Could not parse config');
}
