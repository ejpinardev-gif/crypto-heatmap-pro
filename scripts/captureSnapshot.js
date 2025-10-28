const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BYBIT_BASE_URL = 'https://api.bybit.com';
const DEFAULT_LIMIT = 500;

const parseCliArgs = () => {
  const args = process.argv.slice(2);
  return args.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [rawKey, ...rest] = arg.slice(2).split('=');
    const key = rawKey.trim();
    const value = rest.length ? rest.join('=').trim() : true;
    if (key) acc[key] = value;
    return acc;
  }, {});
};

const mapKlineInterval = (interval) => {
  const lookup = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D'
  };
  return lookup[interval] || interval;
};

const mapOpenInterestInterval = (interval) => {
  const lookup = {
    '1m': '5min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '6h': '6h',
    '12h': '12h',
    '1d': '1d'
  };
  return lookup[interval] || interval;
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toMilliseconds = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 1e12 ? Math.floor(numeric * 1000) : Math.floor(numeric);
};

const clampLimit = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(numeric), DEFAULT_LIMIT);
};

const bybitClient = axios.create({
  baseURL: BYBIT_BASE_URL,
  timeout: 10000
});

const fetchKlines = async ({ symbol, interval, startTime, endTime, limit }) => {
  const params = {
    category: 'linear',
    symbol,
    interval: mapKlineInterval(interval),
    limit: clampLimit(limit)
  };

  const start = toMilliseconds(startTime);
  const end = toMilliseconds(endTime);
  if (start) params.start = start;
  if (end) params.end = end;

  const { data } = await bybitClient.get('/v5/market/kline', { params });
  if (data.retCode !== 0) {
    throw new Error(`Bybit kline API responded with code ${data.retCode}: ${data.retMsg}`);
  }

  const list = Array.isArray(data?.result?.list) ? data.result.list : [];
  return list.map(entry => {
    if (Array.isArray(entry)) {
      const [timestamp, open, high, low, close, volume] = entry;
      return {
        openTime: Number(timestamp),
        open: toNumber(open),
        high: toNumber(high),
        low: toNumber(low),
        close: toNumber(close),
        volume: toNumber(volume)
      };
    }
    const timestamp = Number(entry.startTime ?? entry.openTime ?? entry.t);
    return {
      openTime: timestamp,
      open: toNumber(entry.open ?? entry.o),
      high: toNumber(entry.high ?? entry.h),
      low: toNumber(entry.low ?? entry.l),
      close: toNumber(entry.close ?? entry.c),
      volume: toNumber(entry.volume ?? entry.v ?? entry.turnover)
    };
  }).filter(candle => Number.isFinite(candle.openTime));
};

const fetchOpenInterest = async ({ symbol, interval, startTime, endTime, limit }) => {
  const params = {
    category: 'linear',
    symbol,
    intervalTime: mapOpenInterestInterval(interval),
    limit: clampLimit(limit)
  };

  const start = toMilliseconds(startTime);
  const end = toMilliseconds(endTime);
  if (start) params.startTime = start;
  if (end) params.endTime = end;

  const { data } = await bybitClient.get('/v5/market/open-interest', { params });
  if (data.retCode !== 0) {
    throw new Error(`Bybit open interest API responded with code ${data.retCode}: ${data.retMsg}`);
  }

  const list = Array.isArray(data?.result?.list) ? data.result.list : [];
  return list.map(entry => {
    const timestamp = Number(entry.timestamp ?? entry.ts);
    return {
      time: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null,
      openInterest: toNumber(entry.openInterest),
      openInterestValue: toNumber(entry.openInterestValue ?? entry.value)
    };
  }).filter(record => record.time);
};

const fetchLiquidations = async ({ symbol, startTime, endTime, limit }) => {
  const params = {
    category: 'linear',
    symbol,
    limit: clampLimit(Math.min(limit, 200))
  };

  const start = toMilliseconds(startTime);
  const end = toMilliseconds(endTime);
  if (start) params.startTime = start;
  if (end) params.endTime = end;

  let data;
  try {
    ({ data } = await bybitClient.get('/v5/market/liquidation', { params }));
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return [];
    }
    throw error;
  }

  if (data.retCode !== 0) {
    throw new Error(`Bybit liquidation API responded with code ${data.retCode}: ${data.retMsg}`);
  }

  const list = Array.isArray(data?.result?.list) ? data.result.list : [];
  return list.map(entry => {
    const timestamp = Number(entry.updatedTime ?? entry.createdTime ?? entry.ts);
    const price = toNumber(entry.price);
    const quantity = toNumber(entry.qty ?? entry.size);
    const value = toNumber(entry.value ?? price * quantity);
    return {
      id: entry.execId ?? entry.orderId ?? null,
      time: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null,
      side: entry.side ?? null,
      price,
      quantity,
      value
    };
  }).filter(record => record.time && record.price > 0 && record.quantity > 0 && Number.isFinite(record.value));
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const writeSnapshot = (symbol, interval, snapshot) => {
  const baseDir = path.join(__dirname, '..', 'snapshots', symbol);
  ensureDir(baseDir);
  const fileName = `${Date.now()}_${interval}.json`;
  const filePath = path.join(baseDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filePath;
};

const captureSnapshot = async ({
  symbol = process.env.SNAPSHOT_SYMBOL || 'BTCUSDT',
  interval = process.env.SNAPSHOT_INTERVAL || '4h',
  limit = Number(process.env.SNAPSHOT_LIMIT ?? DEFAULT_LIMIT),
  startTime = process.env.SNAPSHOT_START,
  endTime = process.env.SNAPSHOT_END,
  verbose = true
} = {}) => {
  const normalizedSymbol = symbol.toUpperCase();
  const normalizedInterval = interval.toLowerCase();

  if (verbose) {
    console.log(`[snapshot] capturing data for ${normalizedSymbol} @ ${normalizedInterval}`);
  }

  const [candles, openInterest, liquidations] = await Promise.all([
    fetchKlines({ symbol: normalizedSymbol, interval: normalizedInterval, startTime, endTime, limit }),
    fetchOpenInterest({ symbol: normalizedSymbol, interval: normalizedInterval, startTime, endTime, limit }),
    fetchLiquidations({ symbol: normalizedSymbol, startTime, endTime, limit })
  ]);

  const snapshot = {
    capturedAt: new Date().toISOString(),
    symbol: normalizedSymbol,
    interval: normalizedInterval,
    provider: 'bybit',
    request: {
      limit,
      startTime: startTime ?? null,
      endTime: endTime ?? null
    },
    candles,
    openInterest,
    liquidations
  };

  const filePath = writeSnapshot(normalizedSymbol, normalizedInterval, snapshot);
  if (verbose) {
    console.log(`[snapshot] stored ${candles.length} candles, ${openInterest.length} OI points, ${liquidations.length} liquidations at ${filePath}`);
  }
  return { filePath, candles, openInterest, liquidations };
};

const main = async () => {
  const args = parseCliArgs();
  try {
    await captureSnapshot({
      symbol: args.symbol,
      interval: args.interval,
      limit: args.limit ? Number(args.limit) : undefined,
      startTime: args.startTime,
      endTime: args.endTime,
      verbose: true
    });
  } catch (error) {
    console.error('[snapshot] capture failed:', error.message);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  captureSnapshot
};
