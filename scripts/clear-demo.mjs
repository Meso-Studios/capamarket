// Deletes demo markets (and their votes/history) created by the seed script.
// Credits test users spent on them are refunded.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("begin");
const { rows } = await client.query(
  `select v.user_id, sum(v.credits)::int credits from votes v join questions q on q.id = v.question_id
    where q.is_demo and q.status = 'open' and v.credits > 0 group by v.user_id`,
);
for (const r of rows) {
  await client.query("update users set credits = credits + $1 where id = $2", [r.credits, r.user_id]);
  await client.query("insert into credit_ledger (user_id, delta, reason) values ($1, $2, 'refund: demo data cleared')", [r.user_id, r.credits]);
}
const del = await client.query("delete from questions where is_demo");
await client.query("commit");
console.log(`deleted ${del.rowCount} demo markets`);
await client.end();
