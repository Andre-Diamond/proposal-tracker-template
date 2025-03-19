import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Initialize CsvService (reimplementing needed parts to fix module system compatibility)
class CsvService {
    private dataDir: string;
    private initialized: boolean;

    constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
        this.initialized = false;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing CSV Service:', error);
            throw error;
        }
    }

    async readCsv(fileName: string): Promise<string[][]> {
        await this.initialize();

        try {
            const filePath = path.join(this.dataDir, `${fileName}.csv`);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return [];
            }

            // Read and parse CSV
            const content = fs.readFileSync(filePath, 'utf8');
            const rows = content.split('\n').map(row =>
                // Handle quoted fields containing commas
                row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(field =>
                    field.startsWith('"') && field.endsWith('"') ?
                        field.slice(1, -1).replace(/""/g, '"') :
                        field
                ) || []
            );

            return rows;
        } catch (error) {
            console.error(`Error reading CSV file ${fileName}:`, error);
            throw error;
        }
    }
}

const csvService = new CsvService();

// Define types for our data structures
interface Record {
    project_id: string;
    [key: string]: string;
}

interface CompleteProjectData {
    // Base project properties
    [key: string]: string | Record[] | Record;
    project_id: string;
    // Relationships
    milestones: Record[];
    transactions: Record[];
    financials: Record;
}

/**
 * API route to fetch project data from CSV files
 * GET /api/projects - Returns all projects
 * GET /api/projects?id=1000107 - Returns a specific project
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check if a specific project ID is requested
        const projectId = req.query.id as string;

        // Fetch proposal data from CSV
        const proposalsData = await csvService.readCsv('Proposals');

        if (!proposalsData.length) {
            return res.status(404).json({ error: 'No project data found' });
        }

        const headers = proposalsData[0];
        const proposals: Record[] = proposalsData.slice(1).map(row => {
            const proposal: Record = { project_id: '' };
            headers.forEach((header: string, index: number) => {
                proposal[header] = row[index] || '';
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
                const milestonesData = await csvService.readCsv('Milestones');
                const milestoneHeaders = milestonesData[0];
                const milestones: Record[] = milestonesData.slice(1)
                    .filter(row => row[0] === proposal.project_id)
                    .map(row => {
                        const milestone: Record = { project_id: proposal.project_id };
                        milestoneHeaders.forEach((header: string, index: number) => {
                            milestone[header] = row[index] || '';
                        });
                        return milestone;
                    });

                // Fetch transactions
                const transactionsData = await csvService.readCsv('Transactions');
                const transactionHeaders = transactionsData[0];
                const transactions: Record[] = transactionsData.slice(1)
                    .filter(row => row[0] === proposal.project_id)
                    .map(row => {
                        const transaction: Record = { project_id: proposal.project_id };
                        transactionHeaders.forEach((header: string, index: number) => {
                            transaction[header] = row[index] || '';
                        });
                        return transaction;
                    });

                // Fetch financials
                const financialsData = await csvService.readCsv('Financials');
                const financialHeaders = financialsData[0];
                const financialsArray = financialsData.slice(1)
                    .filter(row => row[0] === proposal.project_id)
                    .map(row => {
                        const financial: Record = { project_id: proposal.project_id };
                        financialHeaders.forEach((header: string, index: number) => {
                            financial[header] = row[index] || '';
                        });
                        return financial;
                    });

                const financials: Record = financialsArray[0] || { project_id: proposal.project_id };

                // Create complete project data with proper type handling
                const projectWithDetails: CompleteProjectData = {
                    ...proposal,
                    milestones,
                    transactions,
                    financials,
                };

                return projectWithDetails;
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