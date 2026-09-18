const fs = require('fs');

const configContent = fs.readFileSync('d:/dd/supabase-config.js', 'utf8');
const urlMatch = configContent.match(/window\.SUPABASE_URL = '([^']+)'/);
const keyMatch = configContent.match(/window\.SUPABASE_ANON_KEY = '([^']+)'/);

if (urlMatch && keyMatch) {
  const url = urlMatch[1];
  const anonKey = keyMatch[1];

  async function fetchTable(table, select = '*') {
    const response = await fetch(`${url}/rest/v1/${table}?select=${select}`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch ${table}: ${response.statusText} - ${text}`);
    }
    return response.json();
  }

  async function run() {
    try {
      const attempts = await fetchTable('student_quiz_attempts', '*');
      console.log(`\nQuiz attempts count: ${attempts.length}`);
      if (attempts.length > 0) {
        console.log('Raw sample attempt:', JSON.stringify(attempts[0], null, 2));
      }
    } catch (e) {
      console.error('Error in script execution:', e);
    }
  }

  run();
} else {
  console.log('Could not parse config');
}
