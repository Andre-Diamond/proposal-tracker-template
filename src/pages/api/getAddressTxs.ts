// src/pages/api/getAddressTxs.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAddressTxs, AddressTxResponse } from '../../services/koios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { wallet } = req.body;

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    try {
      const data: AddressTxResponse = await getAddressTxs(wallet);
      res.status(200).json(data);
    } catch (error: any) {
      console.error("Error fetching address transactions:", error);
      res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
