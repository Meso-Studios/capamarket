import fs from "node:fs";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
const { rows } = await client.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by 1",
);
console.log("schema applied:", rows.map((r) => r.table_name).join(", "));
await client.end();
