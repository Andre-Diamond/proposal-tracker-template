import { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';

/**
 * API route to fetch project data from Google Sheets
 * GET /api/projects - Returns all projects
 * GET /api/projects?id=1000107 - Returns a specific project
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Initialize Google Sheets API
        let credentials;
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
            // Fallback for backward compatibility
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
        } else {
            credentials = {};
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // Check if a specific project ID is requested
        const projectId = req.query.id as string;

        // Fetch proposal data
        const proposalsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Proposals!A1:Z',
        });

        const proposalsData = proposalsResponse.data.values || [];
        const headers = proposalsData[0];
        const proposals = proposalsData.slice(1).map(row => {
            const proposal: Record<string, any> = {};
            headers.forEach((header: string, index: number) => {
                proposal[header] = row[index];
            });
            return proposal;
        });

        // Filter by project ID if specified
        const filteredProposals = projectId
            ? proposals.filter(p => p.project_id === projectId)
            : proposals;

        if (projectId && filteredProposals.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // For each project, fetch milestone and financial data
        const projectsWithDetails = await Promise.all(
            filteredProposals.map(async (proposal) => {
                // Fetch milestones
                const milestonesResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: 'Milestones!A1:Z',
                });

                const milestonesData = milestonesResponse.data.values || [];
                const milestoneHeaders = milestonesData[0];
                const milestones = milestonesData.slice(1)
                    .filter(row => row[0] === proposal.project_id)
                    .map(row => {
                        const milestone: Record<string, any> = {};
                        milestoneHeaders.forEach((header: string, index: number) => {
                            milestone[header] = row[index];
                        });
                        return milestone;
                    });

                // Fetch transactions
                const transactionsResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: 'Transactions!A1:Z',
                });

                const transactionsData = transactionsResponse.data.values || [];
                const transactionHeaders = transactionsData[0];
                const transactions = transactionsData.slice(1)
                    .filter(row => row[0] === proposal.project_id)
                    .map(row => {
                        const transaction: Record<string, any> = {};
                        transactionHeaders.forEach((header: string, index: number) => {
                            transaction[header] = row[index];
                        });
                        return transaction;
                    });

                // Fetch financials
                const financialsResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: 'Financials!A1:Z',
                });

                const financialsData = financialsResponse.data.values || [];
                const financialHeaders = financialsData[0];
                const financials = financialsData.slice(1)
                    .filter(row => row[0] === proposal.project_id)
                    .map(row => {
                        const financial: Record<string, any> = {};
                        financialHeaders.forEach((header: string, index: number) => {
                            financial[header] = row[index];
                        });
                        return financial;
                    })[0] || {};

                // Return complete project data
                return {
                    ...proposal,
                    milestones,
                    transactions,
                    financials,
                };
            })
        );

        // Return a single project or all projects
        res.status(200).json(
            projectId ? projectsWithDetails[0] : projectsWithDetails
        );

    } catch (error) {
        console.error('Error fetching project data:', error);
        res.status(500).json({
            error: 'Failed to fetch project data',
            details: error instanceof Error ? error.message : String(error)
        });
    }
} 