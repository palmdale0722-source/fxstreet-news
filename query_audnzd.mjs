import { getDb } from './server/db.ts';
import { mt4Bars } from './drizzle/schema.ts';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

const db = await getDb();
if (!db) {
  console.log("数据库连接失败");
  process.exit(1);
}

// 查询 AUDNZD 在 2026-04-21 20:00-22:00 UTC 的数据
const result = await db
  .select()
  .from(mt4Bars)
  .where(
    and(
      eq(mt4Bars.symbol, 'AUDNZD'),
      gte(mt4Bars.barTime, '2026-04-21 20:00:00'),
      lte(mt4Bars.barTime, '2026-04-21 22:00:00')
    )
  )
  .orderBy(desc(mt4Bars.barTime));

console.log("AUDNZD 在 2026-04-21 20:00-22:00 UTC 的数据:");
console.log(JSON.stringify(result, null, 2));

process.exit(0);
