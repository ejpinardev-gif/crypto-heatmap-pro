const { captureSnapshot } = require('./captureSnapshot');

const DEFAULT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'WLDUSDT',
  'COAIUSDT',
  'GIGGLEUSDT'
];

const DEFAULT_INTERVALS = ['4h'];

const parseArgs = () => {
  const args = process.argv.slice(2);
  return args.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, ...rest] = arg.slice(2).split('=');
    acc[key] = rest.length ? rest.join('=') : true;
    return acc;
  }, {});
};

const toList = (value, fallback) => {
  if (!value) return fallback;
  const parts = String(value)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length ? Array.from(new Set(parts)) : fallback;
};

const main = async () => {
  const args = parseArgs();
  const symbols = toList(args.symbols || process.env.SNAPSHOT_SYMBOLS, DEFAULT_SYMBOLS).map(item =>
    item.toUpperCase()
  );
  const intervals = toList(args.intervals || process.env.SNAPSHOT_INTERVALS, DEFAULT_INTERVALS).map(item =>
    item.toLowerCase()
  );
  const limit = args.limit ? Number(args.limit) : undefined;
  const startTime = args.startTime || process.env.SNAPSHOT_START;
  const endTime = args.endTime || process.env.SNAPSHOT_END;

  console.log(`[capture-all] capturing ${symbols.length} symbols x ${intervals.length} intervals`);

  for (const symbol of symbols) {
    for (const interval of intervals) {
      try {
        await captureSnapshot({
          symbol,
          interval,
          limit,
          startTime,
          endTime,
          verbose: true
        });
      } catch (error) {
        console.error(
          `[capture-all] failed for ${symbol} @ ${interval}:`,
          error.message || error
        );
      }
    }
  }

  console.log('[capture-all] done');
};

if (require.main === module) {
  main().catch(error => {
    console.error('[capture-all] fatal error:', error);
    process.exitCode = 1;
  });
}
