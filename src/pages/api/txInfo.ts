// src/pages/api/txInfo.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getTxInfo, TxInfoResponse } from '../../services/koios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { txid } = req.body;
    if (!txid || typeof txid !== 'string') {
      return res.status(400).json({ message: 'Invalid transaction ID' });
    }

    try {
      const data: TxInfoResponse = await getTxInfo(txid);
      res.status(200).json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
