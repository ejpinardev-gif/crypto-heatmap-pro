const axios = require('axios');

const BYBIT_BASE_URL = 'https://api.bybit.com';
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const bybitClient = axios.create({
    baseURL: BYBIT_BASE_URL,
    timeout: 10000
});

const createHttpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

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
    return Math.min(Math.max(Math.floor(numeric), 1), MAX_LIMIT);
};

const mapKlineInterval = (interval) => {
    const map = {
        '1m': '1',
        '5m': '5',
        '15m': '15',
        '1h': '60',
        '4h': '240',
        '1d': 'D'
    };
    return map[interval] || interval;
};

const mapOpenInterestInterval = (interval) => {
    const map = {
        '1m': '5min',
        '5m': '5min',
        '15m': '15min',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d'
    };
    return map[interval] || interval;
};

const fetchBybitKlines = async ({ symbol, interval, startTime, endTime, limit }) => {
    if (!symbol) throw createHttpError(400, 'symbol query param is required for ohlcv endpoint.');
    if (!interval) throw createHttpError(400, 'interval query param is required for ohlcv endpoint.');

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
        throw createHttpError(502, data.retMsg || `Bybit kline API responded with code ${data.retCode}`);
    }

    const list = Array.isArray(data?.result?.list) ? data.result.list : [];

    const candles = list.map(entry => {
        if (Array.isArray(entry)) {
            const [startTimeMs, open, high, low, close, volume] = entry;
            return {
                openTime: Number(startTimeMs),
                open: toNumber(open),
                high: toNumber(high),
                low: toNumber(low),
                close: toNumber(close),
                volume: toNumber(volume)
            };
        }
        const startTimeMs = Number(entry.startTime ?? entry.openTime ?? entry.t);
        return {
            openTime: startTimeMs,
            open: toNumber(entry.open ?? entry.o),
            high: toNumber(entry.high ?? entry.h),
            low: toNumber(entry.low ?? entry.l),
            close: toNumber(entry.close ?? entry.c),
            volume: toNumber(entry.volume ?? entry.v ?? entry.turnover)
        };
    }).filter(candle => Number.isFinite(candle.openTime));

    return {
        provider: 'bybit',
        symbol,
        interval,
        candles
    };
};

const fetchBybitOpenInterest = async ({ symbol, interval, startTime, endTime, limit }) => {
    if (!symbol) throw createHttpError(400, 'symbol query param is required for open-interest-history endpoint.');
    if (!interval) throw createHttpError(400, 'interval query param is required for open-interest-history endpoint.');

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
        throw createHttpError(502, data.retMsg || `Bybit open interest API responded with code ${data.retCode}`);
    }

    const list = Array.isArray(data?.result?.list) ? data.result.list : [];
    const records = list.map(entry => {
        const timestampMs = Number(entry.timestamp ?? entry.ts);
        return {
            time: Number.isFinite(timestampMs) ? Math.floor(timestampMs / 1000) : null,
            openInterest: toNumber(entry.openInterest),
            openInterestValue: toNumber(entry.openInterestValue ?? entry.value ?? 0)
        };
    }).filter(record => record.time);

    return {
        provider: 'bybit',
        symbol,
        interval,
        records
    };
};

const fetchBybitLiquidations = async ({ symbol, startTime, endTime, limit }) => {
    if (!symbol) throw createHttpError(400, 'symbol query param is required for liquidation-history endpoint.');

    const params = {
        category: 'linear',
        symbol,
        limit: clampLimit(limit)
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
            return {
                provider: 'bybit',
                symbol,
                records: []
            };
        }
        throw error;
    }

    if (data.retCode !== 0) {
        throw createHttpError(502, data.retMsg || `Bybit liquidation API responded with code ${data.retCode}`);
    }

    const list = Array.isArray(data?.result?.list) ? data.result.list : [];
    const records = list.map(entry => {
        const timestampMs = Number(entry.updatedTime ?? entry.createdTime ?? entry.ts);
        const price = toNumber(entry.price);
        const quantity = toNumber(entry.qty ?? entry.size);
        const value = toNumber(entry.value ?? price * quantity);
        return {
            id: entry.execId ?? entry.orderId ?? null,
            time: Number.isFinite(timestampMs) ? Math.floor(timestampMs / 1000) : null,
            side: entry.side ?? null,
            price,
            quantity,
            value
        };
    }).filter(record => record.time && record.price > 0 && record.quantity > 0 && Number.isFinite(record.value));

    return {
        provider: 'bybit',
        symbol,
        records
    };
};

module.exports = async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const params = Object.fromEntries(requestUrl.searchParams.entries());
    const { endpoint } = params;

    if (!endpoint) {
        return res.status(400).json({ error: 'API endpoint is not specified.' });
    }

    try {
        let payload;

        switch (endpoint) {
            case 'ohlcv':
                payload = await fetchBybitKlines(params);
                break;
            case 'open-interest-history':
                payload = await fetchBybitOpenInterest(params);
                break;
            case 'liquidation-history':
                payload = await fetchBybitLiquidations(params);
                break;
            default:
                throw createHttpError(400, `Unsupported endpoint: ${endpoint}`);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(payload);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        if (error.response) {
            return res.status(error.response.status).json({
                error: 'Upstream API Error',
                endpoint,
                details: error.response.data
            });
        }

        if (error.request) {
            return res.status(504).json({ error: 'No response from upstream API.' });
        }

        return res.status(500).json({ error: 'Internal server error.', details: error.message });
    }
};
