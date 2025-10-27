const axios = require('axios');
const { URLSearchParams } = require('url');

module.exports = async (req, res) => {
    // Manually parse query parameters from the request URL
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const params = Object.fromEntries(requestUrl.searchParams.entries());
    const { endpoint, ...apiParams } = params;

    const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY;

    if (!COINALYZE_API_KEY) {
        return res.status(500).json({ error: 'API key is not configured on Vercel.' });
    }

    if (!endpoint) {
        return res.status(400).json({ error: 'API endpoint is not specified in the request.' });
    }

    const coinalyzeUrl = `https://api.coinalyze.net/v1/${endpoint}`;

    try {
        const apiResponse = await axios.get(coinalyzeUrl, {
            params: apiParams, // Pass the extracted params to Coinalyze
            headers: { 'api-key': COINALYZE_API_KEY }
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(apiResponse.data);

    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json({ 
                error: 'Coinalyze API Error', 
                details: error.response.data 
            });
        } else if (error.request) {
            res.status(500).json({ error: 'No response from Coinalyze API.' });
        } else {
            res.status(500).json({ error: 'Internal server error.', details: error.message });
        }
    }
};