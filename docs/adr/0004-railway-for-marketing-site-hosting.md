# Railway for marketing site hosting

hrizonmedia will run the Next.js and Payload application as one long-running Railway service, with Railway PostgreSQL for CMS data and a Railway Storage Bucket for media. We chose this over Vercel because Payload needs durable database and upload storage and benefits from a conventional Node process; keeping the service, database, private network, logs, and support in one provider is simpler within the initial $20-30 monthly budget, while accepting more infrastructure ownership and less frontend-specific tooling than Vercel.
