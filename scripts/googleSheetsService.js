const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Handles Google Sheets operations through the Google Sheets API.
 * This replaces the previous approach of using Google Apps Script
 * for data processing, and instead just uses the Google Sheets API
 * directly for reading and writing data.
 */
class GoogleSheetsService {
    constructor() {
        this.initialized = false;
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    }

    /**
     * Initialize the Google Sheets API client
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Option 1: Service Account Authentication (preferred for automated scripts)
            let auth;

            if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
                // If provided as an environment variable (for CI/CD)
                const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
                auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
                // Fallback to previous env var name for backward compatibility
                const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
                auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
                // If provided as a file path
                auth = new google.auth.GoogleAuth({
                    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else {
                throw new Error('No Google Service Account credentials provided');
            }

            const authClient = await auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            this.initialized = true;
            console.log('Google Sheets API initialized successfully');
        } catch (error) {
            console.error('Error initializing Google Sheets API:', error);
            throw error;
        }
    }

    /**
     * Append rows to a specific sheet in the spreadsheet
     * 
     * @param {string} sheetName - Name of the sheet to update
     * @param {Array<Array<any>>} values - 2D array of values to append
     * @returns {Promise<object>} - Response from the API
     */
    async appendRows(sheetName, values) {
        await this.initialize();

        try {
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: sheetName,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values,
                },
            });

            console.log(`${response.data.updates.updatedRows} rows appended to sheet: ${sheetName}`);
            return response.data;
        } catch (error) {
            console.error(`Error appending data to sheet ${sheetName}:`, error);
            throw error;
        }
    }

    /**
     * Clear a sheet and then update it with new values
     * 
     * @param {string} sheetName - Name of the sheet to update
     * @param {Array<Array<any>>} values - 2D array of values to write
     * @returns {Promise<object>} - Response from the API
     */
    async updateSheet(sheetName, values) {
        await this.initialize();

        try {
            // First clear the sheet (except header row)
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A2:Z`,
            });

            // Then update with new values
            const response = await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values,
                },
            });

            console.log(`${response.data.updatedRows} rows updated in sheet: ${sheetName}`);
            return response.data;
        } catch (error) {
            console.error(`Error updating sheet ${sheetName}:`, error);
            throw error;
        }
    }

    /**
     * Read data from a specific sheet
     * 
     * @param {string} sheetName - Name of the sheet to read
     * @returns {Promise<Array<Array<any>>>} - 2D array of values
     */
    async readSheet(sheetName) {
        await this.initialize();

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: sheetName,
            });

            return response.data.values || [];
        } catch (error) {
            console.error(`Error reading sheet ${sheetName}:`, error);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService(); 