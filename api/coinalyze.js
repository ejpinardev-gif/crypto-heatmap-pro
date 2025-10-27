const axios = require('axios');

module.exports = async (req, res) => {
    const { endpoint, ...params } = req.query;
    const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY;

    if (!COINALYZE_API_KEY) {
        return res.status(500).json({ error: 'API key is not configured on Vercel.' });
    }

    if (!endpoint) {
        return res.status(400).json({ error: 'API endpoint is not specified.' });
    }

    const url = `https://api.coinalyze.net/v1/${endpoint}`;

    try {
        const apiResponse = await axios.get(url, {
            params: params, // axios will automatically format this into a query string
            headers: { 'api-key': COINALYZE_API_KEY }
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(apiResponse.data);

    } catch (error) {
        // Axios wraps errors, so we can get more details
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            res.status(error.response.status).json({ 
                error: 'Coinalyze API Error', 
                details: error.response.data 
            });
        } else if (error.request) {
            // The request was made but no response was received
            res.status(500).json({ error: 'No response from Coinalyze API.' });
        } else {
            // Something happened in setting up the request that triggered an Error
            res.status(500).json({ error: 'Internal server error.', details: error.message });
        }
    }
};