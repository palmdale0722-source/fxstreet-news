import { getDb } from './server/db.ts';

const db = await getDb();
if (!db) {
  console.log("数据库连接失败");
  process.exit(1);
}

// 查询 AUDNZD 在 2026-04-21 21:00 UTC 前后的数据
const result = await db.execute(`
  SELECT * FROM mt4_bars 
  WHERE symbol = 'AUDNZD' 
  AND barTime >= '2026-04-21 20:00:00' 
  AND barTime <= '2026-04-21 22:00:00'
  ORDER BY barTime DESC
`);

console.log("AUDNZD 在 2026-04-21 20:00-22:00 UTC 的数据:");
console.log(JSON.stringify(result, null, 2));

process.exit(0);
