import fs from "node:fs";
import pg from "pg";

// schema.sql = tables; api.sql = the functions the browser may call (+ auth wiring).
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
for (const file of ["schema.sql", "api.sql"]) {
  await client.query(fs.readFileSync(new URL(`../db/${file}`, import.meta.url), "utf8"));
  console.log(`applied db/${file}`);
}
await client.end();
