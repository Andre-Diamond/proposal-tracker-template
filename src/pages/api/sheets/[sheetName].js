// pages/api/sheets/[sheetName].js
import { fetchSheetData } from '../../../utils/googleSheets';

export default async function handler(req, res) {
  const { sheetName } = req.query;

  if (!sheetName) {
    return res.status(400).json({ error: 'Sheet name is required' });
  }

  try {
    const data = await fetchSheetData(sheetName);
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Failed to fetch data for ${sheetName}` });
  }
}
