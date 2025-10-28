const axios = require('axios');

const BINANCE_BASE_URL = 'https://fapi.binance.com';
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const binanceClient = axios.create({
    baseURL: BINANCE_BASE_URL,
    timeout: 10000
});

const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
if (BINANCE_API_KEY) {
    binanceClient.interceptors.request.use(config => {
        config.headers = config.headers ?? {};
        config.headers['X-MBX-APIKEY'] = BINANCE_API_KEY;
        return config;
    });
}

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


const fetchBinanceKlines = async ({ symbol, interval, startTime, endTime, limit }) => {
    if (!symbol) throw createHttpError(400, 'symbol query param is required for ohlcv endpoint.');
    if (!interval) throw createHttpError(400, 'interval query param is required for ohlcv endpoint.');

    const params = {
        symbol,
        interval,
        limit: clampLimit(limit)
    };

    const start = toMilliseconds(startTime);
    const end = toMilliseconds(endTime);
    if (start) params.startTime = start;
    if (end) params.endTime = end;

    const { data } = await binanceClient.get('/fapi/v1/klines', { params });

    const candles = Array.isArray(data) ? data.map(entry => ({
        openTime: entry[0],
        open: toNumber(entry[1]),
        high: toNumber(entry[2]),
        low: toNumber(entry[3]),
        close: toNumber(entry[4]),
        volume: toNumber(entry[5]),
        closeTime: entry[6],
        quoteVolume: toNumber(entry[7]),
        tradeCount: entry[8],
        takerBuyBaseVolume: toNumber(entry[9]),
        takerBuyQuoteVolume: toNumber(entry[10])
    })) : [];

    return {
        provider: 'binance',
        symbol,
        interval,
        candles
    };
};

const fetchBinanceOpenInterest = async ({ symbol, interval, startTime, endTime, limit }) => {
    if (!symbol) throw createHttpError(400, 'symbol query param is required for open-interest-history endpoint.');
    if (!interval) throw createHttpError(400, 'interval query param is required for open-interest-history endpoint.');

    const params = {
        symbol,
        period: interval,
        limit: clampLimit(limit)
    };

    const start = toMilliseconds(startTime);
    const end = toMilliseconds(endTime);
    if (start) params.startTime = start;
    if (end) params.endTime = end;

    const { data } = await binanceClient.get('/futures/data/openInterestHist', { params });
    const records = Array.isArray(data) ? data.map(entry => ({
        time: Math.floor(toNumber(entry.timestamp) / 1000),
        sumOpenInterest: toNumber(entry.sumOpenInterest),
        sumOpenInterestValue: toNumber(entry.sumOpenInterestValue)
    })).filter(item => Number.isFinite(item.time) && item.time > 0) : [];

    return {
        provider: 'binance',
        symbol,
        interval,
        records
    };
};

const fetchBinanceLiquidations = async ({ symbol, startTime, endTime, limit }) => {
    if (!symbol) throw createHttpError(400, 'symbol query param is required for liquidation-history endpoint.');
    if (!BINANCE_API_KEY) throw createHttpError(500, 'BINANCE_API_KEY environment variable is required for liquidation-history endpoint.');

    const params = {
        symbol,
        limit: clampLimit(limit)
    };

    const start = toMilliseconds(startTime);
    const end = toMilliseconds(endTime);
    if (start) params.startTime = start;
    if (end) params.endTime = end;

    const { data } = await binanceClient.get('/fapi/v1/forceOrders', { params });
    const list = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);

    const records = list.map(entry => {
        const timeMsRaw = entry.updateTime ?? entry.time ?? entry.closeTime;
        const timeMs = Number(timeMsRaw);
        const price = toNumber(entry.price ?? entry.avgPrice ?? entry.markPrice);
        const quantity = toNumber(entry.executedQty ?? entry.origQty);
        const value = toNumber(entry.cumQuote ?? entry.value ?? price * quantity);
        return {
            id: entry.orderId ?? null,
            time: Number.isFinite(timeMs) ? Math.floor(timeMs / 1000) : null,
            side: entry.side ?? entry.positionSide ?? null,
            price,
            quantity,
            value
        };
    }).filter(record => record.time && record.price > 0 && record.quantity > 0 && Number.isFinite(record.value));

    return {
        provider: 'binance',
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
                payload = await fetchBinanceKlines(params);
                break;
            case 'open-interest-history':
                payload = await fetchBinanceOpenInterest(params);
                break;
            case 'liquidation-history':
                payload = await fetchBinanceLiquidations(params);
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
