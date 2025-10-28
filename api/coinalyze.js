const axios = require('axios');

module.exports = async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const params = Object.fromEntries(requestUrl.searchParams.entries());
    const { endpoint, symbols, interval, ...apiParams } = params;

    const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY;

    if (!COINALYZE_API_KEY) {
        return res.status(500).json({ error: 'API key is not configured on Vercel.' });
    }

    if (!endpoint) {
        return res.status(400).json({ error: 'API endpoint is not specified.' });
    }

    const buildEndpointConfig = () => {
        const remainingParams = { ...apiParams };

        const ensure = (condition, message) => {
            if (!condition) {
                throw Object.assign(new Error(message), { statusCode: 400 });
            }
        };

        switch (endpoint) {
            case 'ohlcv':
                ensure(symbols, 'symbols query param is required for ohlcv endpoint.');
                ensure(interval, 'interval query param is required for ohlcv endpoint.');
                return {
                    url: `https://api.coinalyze.net/v1/ohlcv/${interval}/${symbols}`,
                    params: remainingParams
                };
            case 'open-interest-history':
                ensure(symbols, 'symbols query param is required for open-interest-history endpoint.');
                ensure(interval, 'interval query param is required for open-interest-history endpoint.');
                return {
                    url: `https://api.coinalyze.net/v1/open-interest-history/${interval}/${symbols}`,
                    params: remainingParams
                };
            case 'liquidation-history':
                ensure(symbols, 'symbols query param is required for liquidation-history endpoint.');
                if (interval) {
                    return {
                        url: `https://api.coinalyze.net/v1/liquidation-history/${interval}/${symbols}`,
                        params: remainingParams
                    };
                }
                return {
                    url: `https://api.coinalyze.net/v1/liquidation-history/${symbols}`,
                    params: remainingParams
                };
            default: {
                const paramsWithOptional = { ...remainingParams };
                if (symbols) paramsWithOptional.symbols = symbols;
                if (interval) paramsWithOptional.interval = interval;
                return {
                    url: `https://api.coinalyze.net/v1/${endpoint}`,
                    params: paramsWithOptional
                };
            }
        }
    };

    let endpointConfig;
    try {
        endpointConfig = buildEndpointConfig();
    } catch (error) {
        const status = error.statusCode || 400;
        return res.status(status).json({ error: error.message });
    }

    const requestConfig = {
        headers: { 'api-key': COINALYZE_API_KEY },
        params: endpointConfig.params
    };

    try {
        const apiResponse = await axios.get(endpointConfig.url, requestConfig);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(apiResponse.data);

    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json({
                error: 'Coinalyze API Error',
                endpoint,
                url: endpointConfig.url,
                params: requestConfig.params,
                details: error.response.data
            });
        } else if (error.request) {
            res.status(500).json({ error: 'No response from Coinalyze API.' });
        } else {
            res.status(500).json({ error: 'Internal server error.', details: error.message });
        }
    }
};
