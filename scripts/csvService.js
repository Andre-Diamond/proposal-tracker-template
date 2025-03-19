const fs = require('fs');
const path = require('path');

/**
 * Handles CSV file operations for storing project data in the repository.
 * This replaces the previous approach of using Google Sheets API
 * for data storage, and instead stores data as CSV files in the repository.
 */
class CsvService {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.initialized = false;
    }

    /**
     * Initialize the CSV service by ensuring the data directory exists
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Create data directory if it doesn't exist
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            this.initialized = true;
            console.log('CSV Service initialized successfully');
        } catch (error) {
            console.error('Error initializing CSV Service:', error);
            throw error;
        }
    }

    /**
     * Convert array data to CSV format
     * 
     * @param {Array<Array<any>>} data - 2D array of values to convert to CSV
     * @returns {string} - CSV formatted string
     */
    arrayToCsv(data) {
        return data.map(row =>
            row.map(cell => {
                // Handle null or undefined values
                if (cell === null || cell === undefined) {
                    return '';
                }

                // Convert to string and escape quotes
                const cellStr = String(cell);
                const escaped = cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')
                    ? `"${cellStr.replace(/"/g, '""')}"`
                    : cellStr;

                return escaped;
            }).join(',')
        ).join('\n');
    }

    /**
     * Update a CSV file with new data
     * 
     * @param {string} fileName - Name of the CSV file to update (without extension)
     * @param {Array<Array<any>>} values - 2D array of values to write
     * @param {Array<string>} [headers] - Optional array of column headers
     * @returns {Promise<string>} - Path to the updated file
     */
    async updateCsv(fileName, values, headers = null) {
        await this.initialize();

        try {
            const filePath = path.join(this.dataDir, `${fileName}.csv`);

            // Prepare data (with headers if provided)
            let csvData = '';
            if (headers) {
                csvData = this.arrayToCsv([headers, ...values]);
            } else {
                csvData = this.arrayToCsv(values);
            }

            // Write to file
            fs.writeFileSync(filePath, csvData);

            console.log(`CSV file updated: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error(`Error updating CSV file ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Read data from a CSV file
     * 
     * @param {string} fileName - Name of the CSV file to read (without extension)
     * @returns {Promise<Array<Array<string>>>} - 2D array of values
     */
    async readCsv(fileName) {
        await this.initialize();

        try {
            const filePath = path.join(this.dataDir, `${fileName}.csv`);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return [];
            }

            // Read and parse CSV
            const content = fs.readFileSync(filePath, 'utf8');
            const rows = content.split('\n').map(row => row.split(','));

            return rows;
        } catch (error) {
            console.error(`Error reading CSV file ${fileName}:`, error);
            throw error;
        }
    }
}

module.exports = new CsvService(); 