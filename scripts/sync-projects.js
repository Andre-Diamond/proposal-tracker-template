// scripts/sync-projects.js
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { fetchWalletTransactions } = require('./koiosWrapper');
const csvService = require('./csvService');
const { WebhookClient } = require('discord.js');

// Load project config
const projectsConfig = require('../src/config/projects.json');

// Initialize constants
const MILESTONES_BASE_URL = process.env.NEXT_PUBLIC_MILESTONES_URL || 'https://milestones.projectcatalyst.io';
console.log('Environment check:');
console.log('- MILESTONES_BASE_URL:', MILESTONES_BASE_URL);
console.log('- URL type:', typeof MILESTONES_BASE_URL);
console.log('- URL length:', MILESTONES_BASE_URL.length);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL2;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY2;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Retrieves proposal details.
 */
async function getProposalDetails(projectId) {
  console.log(`Getting proposal details for project ${projectId}`);

  const { data, error } = await supabase
    .from('proposals')
    .select(`
      id,
      title,
      budget,
      milestones_qty,
      funds_distributed,
      project_id
    `)
    .eq('project_id', projectId)
    .single();

  if (error) {
    console.error(`Error fetching proposal details for project ${projectId}:`, error);
    return null;
  }

  return data;
}

/**
 * Fetches milestone data from the Catalystmilestones API.
 */
async function fetchMilestoneData(proposalId) {
  console.log(`Fetching milestone data for proposal ${proposalId}`);

  try {
    const endpoint = `${MILESTONES_BASE_URL}/api/milestones/${proposalId}`;
    console.log(`Making request to: ${endpoint}`);
    const response = await axios.get(endpoint);
    return response.data;
  } catch (error) {
    console.error(`Error fetching milestone data for proposal ${proposalId}:`, error);
    return null;
  }
}

/**
 * Fetches snapshots from Supabase.
 */
async function fetchSnapshotData(proposalId) {
  console.log(`Fetching snapshot data for proposal ${proposalId}`);

  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Error fetching snapshot data for proposal ${proposalId}:`, error);
    return [];
  }

  return data;
}

/**
 * Calculates monthly budget based on proposal funds.
 */
function calculateMonthlyBudget(proposal, projectConfig) {
  // Calculate total project duration in months
  const startDate = projectConfig.dateRanges?.start
    ? new Date(projectConfig.dateRanges.start)
    : new Date();

  const endDate = projectConfig.dateRanges?.end
    ? new Date(projectConfig.dateRanges.end)
    : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());

  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  // Calculate monthly budget based on total funds and duration
  const totalBudget = proposal.budget || 0;
  const monthlyBudget = months > 0 ? totalBudget / months : totalBudget;

  // Calculate collaborator amounts
  const collaboratorAllocations = projectConfig.collaborators?.map(collaborator => {
    // For new format with direct amount
    if ('amount' in collaborator) {
      const totalAmount = collaborator.amount;
      const monthlyAmount = months > 0 ? totalAmount / months : totalAmount;
      return {
        name: collaborator.name,
        totalAmount,
        monthlyAmount,
        allocation: totalBudget > 0 ? totalAmount / totalBudget : 0
      };
    }
    // For backward compatibility with allocation-based format
    else if ('allocation' in collaborator) {
      return {
        name: collaborator.name,
        allocation: collaborator.allocation,
        monthlyAmount: monthlyBudget * collaborator.allocation,
        totalAmount: totalBudget * collaborator.allocation
      };
    }
  }) || [];

  return {
    totalBudget,
    monthlyBudget,
    months,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    collaboratorAllocations
  };
}

/**
 * Processes milestone data into a format suitable for presentation.
 */
function processMilestoneData(milestoneData, proposal, snapshots) {
  if (!milestoneData || !milestoneData.milestones || !Array.isArray(milestoneData.milestones)) {
    return [];
  }

  return milestoneData.milestones.map(milestone => {
    // Find corresponding snapshot
    const snapshot = snapshots.find(snap => snap.milestone_id === milestone.id);

    // Calculate completion status
    const isCompleted = snapshot ? true : false;
    const completionDate = snapshot ? new Date(snapshot.created_at).toISOString().split('T')[0] : '';

    return {
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      isCompleted,
      completionDate,
      evidenceUrl: snapshot ? snapshot.url : ''
    };
  });
}

/**
 * Processes wallet transaction data.
 */
async function processWalletTransactions(wallet, dateRanges) {
  const startDate = dateRanges?.start || null;
  const endDate = dateRanges?.end || null;

  const transactions = await fetchWalletTransactions(wallet, startDate, endDate);

  // Process transactions to get amounts, dates, etc.
  return transactions.map(tx => {
    // Extract ADA amounts from outputs that match our wallet
    const receivedAmount = (tx.outputs || [])
      .filter(output => output.payment_addr && output.payment_addr.bech32 === wallet)
      .reduce((sum, output) => sum + (parseFloat(output.value) / 1000000), 0);

    // Extract metadata
    const metadata = tx?.metadata?.[674]?.msg || [];
    const metadataString = Array.isArray(metadata) ? metadata.join(' ') : '';

    return {
      txHash: tx.tx_hash,
      date: new Date(tx.tx_timestamp * 1000).toISOString().split('T')[0],
      amount: receivedAmount,
      metadata: metadataString
    };
  });
}

/**
 * Process a single project.
 */
async function processProject(projectId) {
  try {
    // Find project in config
    const projectConfig = projectsConfig.projects.find(p => p.project_id === projectId);
    if (!projectConfig) {
      throw new Error(`Project ID ${projectId} not found in configuration`);
    }

    // Get wallet address from config
    const wallet = projectConfig.wallet;
    if (!wallet) {
      throw new Error(`No wallet address found for project ${projectId}`);
    }

    // Step 1: Get proposal details from Supabase
    const proposal = await getProposalDetails(projectId);
    if (!proposal) {
      throw new Error(`No proposal found for project ${projectId}`);
    }

    // Step 2: Get proposal ID
    const proposalId = proposal.id;

    // Step 3: Fetch milestone data
    const milestoneData = await fetchMilestoneData(proposalId);

    // Step 4: Fetch snapshot data
    const snapshots = await fetchSnapshotData(proposalId);

    // Step 5: Process wallet transactions
    const transactions = await processWalletTransactions(wallet, projectConfig.dateRanges);

    // Step 6: Calculate monthly budget
    const financials = calculateMonthlyBudget(proposal, projectConfig);

    // Step 7: Process milestone data
    const processedMilestones = processMilestoneData(milestoneData, proposal, snapshots);

    // Calculate total funds received
    const totalReceived = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Calculate remaining funds
    const remainingFunds = proposal.budget - totalReceived;

    // Format milestone data for CSV files
    const milestonesForSheet = processedMilestones.map(milestone => [
      projectId,
      proposal.title,
      milestone.id,
      milestone.title,
      milestone.description,
      milestone.isCompleted ? 'Completed' : 'Pending',
      milestone.completionDate,
      milestone.evidenceUrl
    ]);

    // Format transactions for CSV files
    const transactionsForSheet = transactions.map(tx => [
      projectId,
      proposal.title,
      tx.txHash,
      tx.date,
      tx.amount,
      tx.metadata
    ]);

    // Format financials for CSV files
    const financialsForSheet = [
      [
        projectId,
        proposal.title,
        financials.totalBudget,
        financials.monthlyBudget,
        financials.months,
        financials.startDate,
        financials.endDate,
        totalReceived,
        remainingFunds
      ]
    ];

    // Format proposal summary for CSV files
    const proposalForSheet = [
      [
        proposal.project_id,
        proposal.title,
        proposal.budget,
        proposal.funds_distributed || 0,
        remainingFunds,
        proposal.milestones_qty,
        `${MILESTONES_BASE_URL}/proposals/${proposalId}`
      ]
    ];

    // Return all processed data
    return {
      projectId,
      proposal,
      milestones: processedMilestones,
      transactions,
      financials,
      milestonesForSheet,
      transactionsForSheet,
      financialsForSheet,
      proposalForSheet
    };
  } catch (error) {
    console.error(`Error processing project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Sends a Discord notification.
 */
async function sendDiscordNotification(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('Discord webhook URL not provided. Skipping notification.');
    return;
  }

  try {
    const webhook = new WebhookClient({ url: webhookUrl });
    await webhook.send({
      content: message,
      username: 'Catalyst Monitor Bot'
    });
    console.log('Discord notification sent successfully');
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

/**
 * Updates README.md with project data.
 */
async function updateReadme(projects) {
  try {
    const readmePath = path.join(__dirname, '..', 'README.md');
    let readmeContent = `# Cardano Catalyst Monitoring Dashboard\n\n`;
    readmeContent += `Last updated: ${new Date().toISOString().split('T')[0]}\n\n`;

    readmeContent += `## Project Summary\n\n`;
    readmeContent += `| Project ID | Title | Budget | Funds Received | Remaining | Milestones | Progress |\n`;
    readmeContent += `|------------|-------|--------|---------------|-----------|------------|----------|\n`;

    projects.forEach(project => {
      const totalMilestones = project.milestones.length;
      const completedMilestones = project.milestones.filter(m => m.isCompleted).length;
      const progressPercentage = totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

      readmeContent += `| ${project.projectId} | ${project.proposal.title} | ${project.financials.totalBudget} | `;
      readmeContent += `${project.transactions.reduce((sum, tx) => sum + tx.amount, 0)} | `;
      readmeContent += `${project.financials.totalBudget - project.transactions.reduce((sum, tx) => sum + tx.amount, 0)} | `;
      readmeContent += `${completedMilestones}/${totalMilestones} | ${progressPercentage}% |\n`;
    });

    readmeContent += `\n## Project Details\n\n`;

    projects.forEach(project => {
      readmeContent += `### ${project.proposal.title} (${project.projectId})\n\n`;

      // Milestones
      readmeContent += `#### Milestones\n\n`;
      readmeContent += `| ID | Title | Status | Completion Date |\n`;
      readmeContent += `|----|-------|--------|----------------|\n`;

      project.milestones.forEach(milestone => {
        readmeContent += `| ${milestone.id} | ${milestone.title} | `;
        readmeContent += `${milestone.isCompleted ? '✅ Completed' : '⏳ Pending'} | `;
        readmeContent += `${milestone.completionDate || '-'} |\n`;
      });

      // Financial information
      readmeContent += `\n#### Financial Information\n\n`;
      readmeContent += `- **Total Budget**: ${project.financials.totalBudget} ADA\n`;
      readmeContent += `- **Monthly Budget**: ${Math.round(project.financials.monthlyBudget)} ADA\n`;
      readmeContent += `- **Project Duration**: ${project.financials.months} months `;
      readmeContent += `(${project.financials.startDate} to ${project.financials.endDate})\n\n`;

      // Collaborator allocations
      if (project.financials.collaboratorAllocations.length > 0) {
        readmeContent += `#### Collaborator Allocations\n\n`;
        readmeContent += `| Collaborator | Monthly Amount | Total Amount |\n`;
        readmeContent += `|-------------|----------------|-------------|\n`;

        project.financials.collaboratorAllocations.forEach(collaborator => {
          readmeContent += `| ${collaborator.name} | `;
          readmeContent += `${Math.round(collaborator.monthlyAmount)} ADA | `;
          readmeContent += `${Math.round(collaborator.totalAmount)} ADA |\n`;
        });
      }

      readmeContent += `\n`;
    });

    fs.writeFileSync(readmePath, readmeContent);
    console.log('README.md updated successfully');
  } catch (error) {
    console.error('Error updating README:', error);
  }
}

/**
 * Main function to process all projects.
 */
async function main() {
  // Get project IDs from configuration
  const projectIds = projectsConfig.projects.map(p => p.project_id);
  if (projectIds.length === 0) {
    console.error('No projects found in configuration');
    process.exit(1);
  }

  console.log(`Processing ${projectIds.length} projects: ${projectIds.join(', ')}`);

  let allMilestones = [];
  let allTransactions = [];
  let allFinancials = [];
  let allProposals = [];
  let processedProjects = [];

  for (const projectId of projectIds) {
    try {
      const projectData = await processProject(projectId);

      // Accumulate data for CSV files
      allMilestones = [...allMilestones, ...projectData.milestonesForSheet];
      allTransactions = [...allTransactions, ...projectData.transactionsForSheet];
      allFinancials = [...allFinancials, ...projectData.financialsForSheet];
      allProposals = [...allProposals, ...projectData.proposalForSheet];

      processedProjects.push(projectData);

      console.log(`Successfully processed project ${projectId}`);
    } catch (error) {
      console.error(`Failed to process project ${projectId}:`, error);
    }
  }

  // Update CSV files with processed data
  try {
    if (allMilestones.length > 0) {
      // Define headers for the CSV files
      const milestoneHeaders = ['Project ID', 'Project Title', 'Milestone ID', 'Title', 'Description', 'Status', 'Completion Date', 'Evidence URL'];
      await csvService.updateCsv('milestones', allMilestones, milestoneHeaders);
      console.log('Milestones CSV file updated successfully');
    }

    if (allTransactions.length > 0) {
      const transactionHeaders = ['Project ID', 'Project Title', 'Transaction Hash', 'Date', 'Amount', 'Metadata'];
      await csvService.updateCsv('transactions', allTransactions, transactionHeaders);
      console.log('Transactions CSV file updated successfully');
    }

    if (allFinancials.length > 0) {
      const financialHeaders = ['Project ID', 'Project Title', 'Total Budget', 'Monthly Budget', 'Months', 'Start Date', 'End Date', 'Total Received', 'Remaining Funds'];
      await csvService.updateCsv('financials', allFinancials, financialHeaders);
      console.log('Financials CSV file updated successfully');
    }

    if (allProposals.length > 0) {
      const proposalHeaders = ['Project ID', 'Title', 'Budget', 'Funds Distributed', 'Remaining Funds', 'Milestones Quantity', 'Milestone URL'];
      await csvService.updateCsv('proposals', allProposals, proposalHeaders);
      console.log('Proposals CSV file updated successfully');
    }
  } catch (error) {
    console.error('Error updating CSV files:', error);
    await sendDiscordNotification(`⚠️ Error updating CSV files: ${error.message}`);
    process.exit(1);
  }

  // Update README.md
  await updateReadme(processedProjects);

  // Send notification
  const totalProjects = processedProjects.length;
  const totalMilestones = processedProjects.reduce(
    (sum, project) => sum + project.milestones.length, 0
  );
  const completedMilestones = processedProjects.reduce(
    (sum, project) => sum + project.milestones.filter(m => m.isCompleted).length, 0
  );

  const notificationMessage = `✅ Catalyst monitoring update completed!\n` +
    `- ${totalProjects} projects processed\n` +
    `- ${completedMilestones}/${totalMilestones} milestones completed\n` +
    `- Data updated in CSV files and README`;

  await sendDiscordNotification(notificationMessage);

  console.log('All processing completed successfully');
}

// Execute main function
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error in main function:', error);
    process.exit(1);
  });
}

module.exports = { processProject, main };
