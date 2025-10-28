const axios = require('axios');

module.exports = async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const params = Object.fromEntries(requestUrl.searchParams.entries());
    const { endpoint, ...apiParams } = params;

    const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY;

    if (!COINALYZE_API_KEY) {
        return res.status(500).json({ error: 'API key is not configured on Vercel.' });
    }

    if (!endpoint) {
        return res.status(400).json({ error: 'API endpoint is not specified.' });
    }

    let coinalyzeUrl;
    let requestConfig = {
        headers: { 'api-key': COINALYZE_API_KEY },
        params: apiParams // Default to using all received params as query params
    };

    // Special handling for the OHLCV endpoint which uses a different URL structure
    if (endpoint === 'ohlcv') {
        const { symbols, interval } = apiParams;
        if (!symbols || !interval) {
            return res.status(400).json({ error: 'Missing required parameters for ohlcv: symbols, interval' });
        }
        
        // Build the URL with path parameters
        coinalyzeUrl = `https://api.coinalyze.net/v1/ohlcv/${interval}/${symbols}`;
        
        // Remove the params that are now in the path to avoid sending them twice
        delete requestConfig.params.symbols;
        delete requestConfig.params.interval;
        // The remaining params (from, to) will be correctly sent as a query string
    } else {
        coinalyzeUrl = `https://api.coinalyze.net/v1/${endpoint}`;
    }

    try {
        const apiResponse = await axios.get(coinalyzeUrl, requestConfig);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(apiResponse.data);

    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json({ 
                error: 'Coinalyze API Error', 
                endpoint: endpoint,
                url: coinalyzeUrl,
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