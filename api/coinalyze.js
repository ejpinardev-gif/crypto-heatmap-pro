const fetch = require('node-fetch');

module.exports = async (req, res) => {
    const { endpoint, ...params } = req.query;
    const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY;

    if (!COINALYZE_API_KEY) {
        return res.status(500).json({ error: 'API key is not configured.' });
    }

    if (!endpoint) {
        return res.status(400).json({ error: 'API endpoint is not specified.' });
    }

    const url = new URL(`https://api.coinalyze.net/v1/${endpoint}`);
    url.search = new URLSearchParams(params).toString();

    try {
        const apiResponse = await fetch(url, {
            headers: { 'api-key': COINALYZE_API_KEY }
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            return res.status(apiResponse.status).json({ error: `Coinalyze API Error: ${errorText}` });
        }

        const data = await apiResponse.json();
        res.setHeader('Access-Control-Allow-Origin', '*'); // Allow frontend to access
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from Coinalyze API.' });
    }
};