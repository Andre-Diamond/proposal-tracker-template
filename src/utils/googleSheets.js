// utils/googleSheets.js
const GOOGLE_SHEETS_API_URL = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

export async function fetchSheetData(sheetName) {
  try {
    const response = await fetch(`${GOOGLE_SHEETS_API_URL}?sheet=${encodeURIComponent(sheetName)}`);
    const data = await response.json();

    if (data.status !== 'success') {
      throw new Error(data.message);
    }

    return data.data;
  } catch (error) {
    console.error(`Error fetching ${sheetName}:`, error);
    return [];
  }
}
