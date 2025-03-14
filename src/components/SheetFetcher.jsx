import { useState } from 'react';

export default function SheetsFetcher() {
  const sheets = ['Milestones', 'Proposals', 'Dashboard', 'Config', 'Collaborator Allocations'];
  const [loading, setLoading] = useState(null);

  const fetchSheetData = async (sheetName) => {
    setLoading(sheetName);
    try {
      const response = await fetch(`/api/sheets/${sheetName}`);
      const data = await response.json();
      console.log(`Data for ${sheetName}:`, data);
    } catch (error) {
      console.error(`Error fetching ${sheetName}:`, error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-semibold">Fetch Google Sheets Data</h2>
      {sheets.map((sheet) => (
        <button
          key={sheet}
          onClick={() => fetchSheetData(sheet)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          disabled={loading === sheet}
        >
          {loading === sheet ? `Fetching ${sheet}...` : `Fetch ${sheet}`}
        </button>
      ))}
    </div>
  );
}
