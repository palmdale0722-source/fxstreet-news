import { getDb } from './server/db.ts';
import { mt4Bars } from './drizzle/schema.ts';
import { eq, desc } from 'drizzle-orm';

const db = await getDb();
if (!db) {
  console.log("数据库连接失败");
  process.exit(1);
}

// 查询 AUDNZD 最近的 20 根 K 线
const result = await db
  .select()
  .from(mt4Bars)
  .where(eq(mt4Bars.symbol, 'AUDNZD'))
  .orderBy(desc(mt4Bars.barTime))
  .limit(20);

console.log("AUDNZD 最近 20 根 K 线数据:");
result.forEach((bar, idx) => {
  console.log(`${idx + 1}. ${bar.barTime} O:${bar.open} H:${bar.high} L:${bar.low} C:${bar.close}`);
});

process.exit(0);
