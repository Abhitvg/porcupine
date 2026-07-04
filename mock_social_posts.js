const { db } = require('./db');

const start = new Date('2025-11-01T00:00:00Z').getTime();
const end = new Date().getTime();

function getRandomDate() {
  const time = start + Math.random() * (end - start);
  return new Date(time).toISOString().replace('T', ' ').substring(0, 19);
}

const tweets = [
  "Just wrapped up an amazing strategy session with the team! The future of AI consultancy is looking brighter than ever. #Innovation #Tech",
  "Excited to announce our new partnership for enterprise data solutions. Scalability is no longer a bottleneck. 🚀 #EnterpriseTech",
  "Why wait for the future when you can build it? Here's a glimpse into how our agents are automating the mundane. #FutureOfWork",
  "A common pitfall in tech adoption: over-engineering. Start simple, prove value, then scale. What's your take? #Leadership",
  "If your CRM isn't predictive in 2026, you are leaving money on the table. Discover how ATMA changes the game."
];

const linkedinPosts = [
  "I’m thrilled to share some insights from our latest Q2 performance report. We've seen a 300% increase in automated task completions across all client deployments! 📈 When AI is implemented thoughtfully, the ROI speaks for itself. How is your team leveraging automation this quarter?",
  "Reflecting on the challenges of digital transformation today. It’s not just about the technology—it’s about the people and processes. Change management remains the biggest hurdle for enterprises. At ATMA, we focus heavily on aligning team culture with new tech adoption.",
  "We are expanding our product suite! Keep an eye out for our new Analytics Reporter module which provides real-time, predictive insights without any manual configuration. #ProductLaunch #DataScience",
  "Culture isn't just ping pong tables and free snacks. It's about psychological safety, empowering decision-making at all levels, and fostering genuine innovation. Proud of the culture we are building at ATMA.",
  "Just published a new whitepaper on 'The State of Enterprise AI'. If you are a CTO or CIO navigating the noise, this is for you. Link in the comments below!"
];

const insertStmt = db.prepare("INSERT INTO published_items (agent_id, platform, reference_id, content, status, published_at) VALUES (?, ?, ?, ?, 'active', ?)");

tweets.forEach((content, i) => {
  insertStmt.run('social-media-strategist', 'twitter', `mock_tw_${i}`, content, getRandomDate());
});

linkedinPosts.forEach((content, i) => {
  insertStmt.run('ceo', 'linkedin', `mock_li_${i}`, content, getRandomDate());
});

console.log("Mock social posts inserted!");
