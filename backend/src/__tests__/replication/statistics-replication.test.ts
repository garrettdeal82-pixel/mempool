import statisticsReplication from '../../replication/StatisticsReplication';

const NOW = 1790000000;
const STEP = 300;

function makeStats(rows: number, scale = 1, vsizesLength = 39, start = NOW): any[] {
  const stats: any[] = [];
  for (let i = 0; i < rows; i++) {
    stats.push({
      added: String(start - i * STEP),
      count: 1000 * scale,
      vbytes_per_second: 1000,
      total_fee: 0,
      mempool_byte_weight: 0,
      min_fee: 0.1,
      vsizes: new Array(vsizesLength).fill(100 * scale),
    });
  }
  return stats;
}

function check(results: any[][]): any[] {
  return (statisticsReplication as any).performSanityCheck(results, '/api/v1/statistics/1w');
}

describe('StatisticsReplication sanity check', () => {
  test('picks a healthy result over one that deviates', () => {
    const bad = makeStats(100, 0.5);
    const results = [makeStats(100), bad, makeStats(100), makeStats(100)];
    const picked = check(results);
    expect(picked.length).toBe(100);
    expect(picked).not.toBe(bad);
  });

  test('matches rows by slot when one result has an extra newest row', () => {
    const results = [makeStats(101, 1, 39, NOW + STEP), makeStats(100), makeStats(100), makeStats(100)];
    expect(check(results).length).toBeGreaterThan(0);
  });

  test('rejects a sparse result', () => {
    const sparse = makeStats(10);
    const picked = check([sparse, makeStats(100), makeStats(100), makeStats(100)]);
    expect(picked).not.toBe(sparse);
  });

  test('rejects a result with the old 38 band vsizes', () => {
    const old = makeStats(100, 1, 38);
    const picked = check([old, makeStats(100), makeStats(100), makeStats(100)]);
    expect(picked).not.toBe(old);
  });

  test('returns nothing when no results agree', () => {
    expect(check([makeStats(100, 1), makeStats(100, 2), makeStats(100, 4), makeStats(100, 8)])).toEqual([]);
  });
});
