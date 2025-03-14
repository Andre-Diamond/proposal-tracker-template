// src/pages/api/addressInfo.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAddressInfo, AddressInfoResponse } from '../../services/koios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { wallet } = req.body;
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    try {
      const data: AddressInfoResponse = await getAddressInfo(wallet);
      res.status(200).json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
