module.exports = async (req, res) => {
    // Dynamically import node-fetch
    const fetch = (await import('node-fetch')).default;

    const { endpoint, ...params } = req.query;
    const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY;

    if (!COINALYZE_API_KEY) {
        return res.status(500).json({ error: 'API key is not configured on Vercel.' });
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

        // Pass through the status and body from Coinalyze to our frontend
        const responseBody = await apiResponse.text();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(apiResponse.status).send(responseBody);

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from Coinalyze API.', details: error.message });
    }
};