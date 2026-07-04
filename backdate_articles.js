const { db } = require('./db');
const fs = require('fs');

const start = new Date('2025-11-01T00:00:00Z').getTime();
const end = new Date().getTime();

function getRandomDate() {
  const time = start + Math.random() * (end - start);
  const d = new Date(time);
  // Return YYYY-MM-DD HH:MM:SS for DB and YYYY-MM-DD for MDX
  const dbDate = d.toISOString().replace('T', ' ').substring(0, 19);
  const mdxDate = d.toISOString().substring(0, 10);
  return { dbDate, mdxDate };
}

const items = db.prepare("SELECT id, reference_id FROM published_items WHERE platform = 'seo-content'").all();

for (const item of items) {
  const { dbDate, mdxDate } = getRandomDate();
  
  // 1. Update DB
  db.prepare("UPDATE published_items SET published_at = ? WHERE id = ?").run(dbDate, item.id);
  
  // 2. Update MDX file
  if (fs.existsSync(item.reference_id)) {
    let content = fs.readFileSync(item.reference_id, 'utf8');
    content = content.replace(/date:\s*["'].*?["']/, `date: "${mdxDate}"`);
    fs.writeFileSync(item.reference_id, content);
    console.log(`Updated ${item.reference_id} to ${mdxDate}`);
  }
}

// Optionally, randomise all generic/twitter/linkedin items as well to make the history look rich
const otherItems = db.prepare("SELECT id FROM published_items WHERE platform != 'seo-content'").all();
for (const item of otherItems) {
  const { dbDate } = getRandomDate();
  db.prepare("UPDATE published_items SET published_at = ? WHERE id = ?").run(dbDate, item.id);
}

console.log("Backdating complete.");
