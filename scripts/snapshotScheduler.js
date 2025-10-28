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

const parseArgs = () => {
  const args = process.argv.slice(2);
  return args.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, ...rest] = arg.slice(2).split('=');
    acc[key] = rest.length ? rest.join('=') : true;
    return acc;
  }, {});
};

const toMs = (value, fallbackMinutes) => {
  if (value === undefined || value === null) {
    return fallbackMinutes * 60 * 1000;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackMinutes * 60 * 1000;
  }
  // value is minutes unless explicitly suffixed with s for seconds or ms
  if (typeof value === 'string') {
    if (value.endsWith('ms')) return Math.max(1000, Number(value.slice(0, -2)));
    if (value.endsWith('s')) return Math.max(1000, Number(value.slice(0, -1)) * 1000);
    if (value.endsWith('m')) return Math.max(60_000, Number(value.slice(0, -1)) * 60_000);
  }
  return Math.max(60_000, numeric * 60_000);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseSymbolList = (value) => {
  if (!value) return null;
  const list = value.split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
  return list.length ? Array.from(new Set(list)) : null;
};

const main = async () => {
  const args = parseArgs();
  const intervalMs = toMs(args.interval ?? process.env.SNAPSHOT_SCHEDULE_INTERVAL ?? 5, 5);
  const symbolList =
    parseSymbolList(args.symbols || process.env.SNAPSHOT_SYMBOLS) ||
    (args.symbol || process.env.SNAPSHOT_SYMBOL
      ? [String(args.symbol || process.env.SNAPSHOT_SYMBOL).toUpperCase()]
      : DEFAULT_SYMBOLS);

  const interval = args.marketInterval || process.env.SNAPSHOT_INTERVAL;
  const limit = args.limit ? Number(args.limit) : undefined;
  const startTime = args.startTime || process.env.SNAPSHOT_START;
  const endTime = args.endTime || process.env.SNAPSHOT_END;

  console.log(`[scheduler] starting snapshot loop every ${Math.round(intervalMs / 1000)}s`);
  console.log(`[scheduler] tracking symbols: ${symbolList.join(', ')}`);

  while (true) {
    const startedAt = Date.now();
    try {
      for (const symbol of symbolList) {
        await captureSnapshot({
          symbol,
          interval,
          limit,
          startTime,
          endTime,
          verbose: true
        });
      }
    } catch (error) {
      console.error('[scheduler] snapshot failed:', error.message);
    }

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, intervalMs - elapsed);
    if (wait > 0) {
      await sleep(wait);
    }
  }
};

if (require.main === module) {
  main().catch(error => {
    console.error('[scheduler] fatal error:', error);
    process.exitCode = 1;
  });
}
