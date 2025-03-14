// src/pages/api/assetInfo.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAssetInfo, AssetInfoResponse } from '../../services/koios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { transformedArray } = req.body;

    // Validate that transformedArray is an array of strings
    if (!transformedArray || !Array.isArray(transformedArray)) {
      return res.status(400).json({ message: 'Invalid asset list. Expected an array of asset identifiers.' });
    }

    try {
      const data: AssetInfoResponse = await getAssetInfo(transformedArray);
      res.status(200).json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
