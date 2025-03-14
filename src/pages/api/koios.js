// pages/api/koios.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }
  
    const { endpoint } = req.query;
    const koiosUrl = `https://api.koios.rest/api/v1/${endpoint}`;
  
    try {
      const response = await fetch(koiosUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_KOIOS_API_KEY}`
        },
        body: JSON.stringify(req.body)
      });
  
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      console.error('Koios API error:', error);
      res.status(500).json({ message: 'Error fetching from Koios API' });
    }
  }