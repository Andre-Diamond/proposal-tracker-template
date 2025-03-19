// scripts/sync-projects.js
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { fetchWalletTransactions } = require('./koiosWrapper');
const csvService = require('./csvService');
const { WebhookClient } = require('discord.js');

// Load project config
const projectsConfig = require('../src/config/projects.json');

/**
 * Fetches the wallet balance in ADA
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} - The wallet balance in ADA
 */
async function fetchWalletBalance(walletAddress) {
  if (!walletAddress) {
    console.log('Wallet address not provided');
    return 0;
  }
  try {
    const response = await axios.get(`https://pool.pm/wallet/${walletAddress}?preview=true`);
    console.log('Pool.pm API Response:', response.data);
    if (response.data && typeof response.data.lovelaces === 'number') {
      return response.data.lovelaces / 1000000; // Convert lovelaces to ADA
    } else {
      console.log('Unexpected API response structure:', response.data);
      return 0;
    }
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    return 0;
  }
}

/**
 * Fetches the current ADA/USD exchange rate
 * @returns {Promise<number>} - The current ADA/USD exchange rate
 */
async function fetchAdaExchangeRate() {
  try {
    const response = await axios.get('https://api.kraken.com/0/public/Ticker?pair=ADAUSD');
    console.log('Kraken API Response:', response.data);
    if (response.data.result && response.data.result.ADAUSD) {
      return parseFloat(response.data.result.ADAUSD.c[0]);
    }
  } catch (error) {
    console.error('Error fetching from Kraken:', error);
  }
  return 0;
}

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
 * Retrieves the proposal ID from Supabase.
 */
async function getProposalId(projectId) {
  console.log(`Getting proposal ID for project ${projectId}`);

  const { data, error } = await supabase
    .from('proposals')
    .select('id')
    .eq('project_id', projectId)
    .single();

  if (error) {
    console.error('Error fetching proposal ID:', error);
    throw error;
  }

  console.log(`Found proposal ID ${data?.id} for project ${projectId}`);
  return data?.id;
}

/**
 * Fetches milestone data using Supabase.
 */
async function fetchMilestoneData(projectId, milestone) {
  const proposalId = await getProposalId(projectId);
  console.log(`Fetching milestone data for proposal ${proposalId}, milestone ${milestone}`);

  const { data, error } = await supabase
    .from('soms')
    .select(`
      month,
      cost,
      completion,
      som_reviews!inner(
        outputs_approves,
        success_criteria_approves,
        evidence_approves,
        current
      ),
      poas!inner(
        poas_reviews!inner(
          content_approved,
          current
        ),
        signoffs(created_at)
      )
    `)
    .eq('proposal_id', proposalId)
    .eq('milestone', milestone)
    .eq('som_reviews.current', true)
    .eq('poas.poas_reviews.current', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching milestone data:', error);
    throw error;
  }

  if (data?.length && data[0].poas?.length > 1) {
    const sortedPoas = [...data[0].poas].sort((a, b) => {
      const dateA = a.signoffs?.[0]?.created_at || '0';
      const dateB = b.signoffs?.[0]?.created_at || '0';
      return dateB.localeCompare(dateA);
    });
    data[0].poas = [sortedPoas[0]];
  }

  console.log('Raw milestone data:', JSON.stringify(data, null, 2));
  return data;
}

/**
 * Fetches snapshots from Supabase.
 */
async function fetchSnapshotData(proposalId) {
  console.log(`Fetching snapshot data for proposal ${proposalId}`);

  try {
    const response = await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/rpc/getproposalsnapshot`,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'public',
        'x-client-info': 'supabase-js/2.2.3'
      },
      data: { _project_id: proposalId }
    });

    return response.data || [];
  } catch (error) {
    console.error(`Error fetching snapshot data for proposal ${proposalId}:`, error);
    return [];
  }
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

  // Calculate funds left for main organization
  const totalCollaboratorFunds = collaboratorAllocations.reduce((sum, collab) => sum + collab.totalAmount, 0);
  const organizationFunds = totalBudget - totalCollaboratorFunds;

  return {
    totalBudget,
    monthlyBudget,
    months,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    collaboratorAllocations,
    organizationFunds
  };
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

    // Step 2: Fetch snapshot data
    const snapshots = await fetchSnapshotData(projectId);

    // Step 3: Process wallet transactions
    const transactions = await processWalletTransactions(wallet, projectConfig.dateRanges);

    // Step 4: Calculate monthly budget
    const financials = calculateMonthlyBudget(proposal, projectConfig);

    // Step 5: Process milestone data
    let processedMilestones = [];
    if (snapshots.length > 0) {
      for (const snapshot of snapshots) {
        const milestoneData = await fetchMilestoneData(projectId, snapshot.milestone);

        processedMilestones.push({
          title: proposal.title,
          project_id: projectId,
          milestone: snapshot.milestone,
          month: milestoneData?.[0]?.month || snapshot.milestone,
          cost: milestoneData?.[0]?.cost || Math.round(proposal.budget / proposal.milestones_qty),
          completion: milestoneData?.[0]?.completion || 0,
          budget: proposal.budget,
          funds_distributed: proposal.funds_distributed || 0,
          milestones_qty: proposal.milestones_qty,
          som_signoff_count: snapshot.som_signoff_count || 0,
          poa_signoff_count: snapshot.poa_signoff_count || 0,
          outputs_approved: milestoneData?.[0]?.som_reviews?.[0]?.outputs_approves || false,
          success_criteria_approved: milestoneData?.[0]?.som_reviews?.[0]?.success_criteria_approves || false,
          evidence_approved: milestoneData?.[0]?.som_reviews?.[0]?.evidence_approves || false,
          poa_content_approved: milestoneData?.[0]?.poas?.[0]?.poas_reviews?.[0]?.content_approved || false,
          milestones_link: `${MILESTONES_BASE_URL}/projects/${projectId}`
        });
      }
    } else {
      // For new proposals without milestone data yet
      for (let i = 1; i <= proposal.milestones_qty; i++) {
        processedMilestones.push({
          title: proposal.title,
          project_id: projectId,
          milestone: i,
          month: i,
          cost: Math.round(proposal.budget / proposal.milestones_qty),
          completion: 0,
          budget: proposal.budget,
          funds_distributed: proposal.funds_distributed || 0,
          milestones_qty: proposal.milestones_qty,
          som_signoff_count: 0,
          poa_signoff_count: 0,
          outputs_approved: false,
          success_criteria_approved: false,
          evidence_approved: false,
          poa_content_approved: false,
          milestones_link: `${MILESTONES_BASE_URL}/projects/${projectId}`
        });
      }
    }

    // Calculate total funds received
    const totalReceived = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Calculate remaining funds
    const remainingFunds = proposal.budget - totalReceived;

    // Format milestone data for CSV files
    const milestonesForSheet = processedMilestones.map(milestone => [
      milestone.title,
      milestone.project_id,
      milestone.milestone,
      milestone.month,
      milestone.cost,
      milestone.completion,
      milestone.budget,
      milestone.funds_distributed,
      milestone.milestones_qty,
      milestone.som_signoff_count || 0,
      milestone.poa_signoff_count || 0,
      milestone.outputs_approved,
      milestone.success_criteria_approved,
      milestone.evidence_approved,
      milestone.poa_content_approved
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

    // Format collaborators for CSV files
    const collaboratorsForSheet = financials.collaboratorAllocations.map(collaborator => [
      projectId,
      proposal.title,
      financials.totalBudget,
      collaborator.name,
      collaborator.totalAmount,
      financials.organizationFunds
    ]);

    // Format proposal summary for CSV files
    const proposalForSheet = [
      [
        proposal.project_id,
        proposal.title,
        proposal.budget,
        proposal.funds_distributed || 0,
        remainingFunds,
        proposal.milestones_qty,
        `${MILESTONES_BASE_URL}/projects/${projectId}`
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
      proposalForSheet,
      collaboratorsForSheet
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
  let allProposals = [];
  let allCollaborators = [];
  let processedProjects = [];

  for (const projectId of projectIds) {
    try {
      const projectData = await processProject(projectId);

      // Accumulate data for CSV files
      allMilestones = [...allMilestones, ...projectData.milestonesForSheet];
      allTransactions = [...allTransactions, ...projectData.transactionsForSheet];
      allProposals = [...allProposals, ...projectData.proposalForSheet];
      allCollaborators = [...allCollaborators, ...projectData.collaboratorsForSheet];

      processedProjects.push(projectData);

      console.log(`Successfully processed project ${projectId}`);
    } catch (error) {
      console.error(`Failed to process project ${projectId}:`, error);
    }
  }

  // Calculate global financials
  const totalBudgetAll = processedProjects.reduce((sum, project) =>
    sum + project.financials.totalBudget, 0);
  const totalReceivedAll = processedProjects.reduce((sum, project) =>
    sum + project.transactions.reduce((txSum, tx) => txSum + tx.amount, 0), 0);

  // Get organization budget settings
  const organizations = projectsConfig.globalSettings?.organizations || [];

  // Fetch current ADA/USD rate
  const adaUsdRate = await fetchAdaExchangeRate();
  console.log('Current ADA/USD rate:', adaUsdRate);

  // Create global financials report
  let globalFinancialsForSheet = [];
  for (const org of organizations) {
    const { name, realMonthlyBudget, maxMonthlyBudget, wallet } = org;

    // Fetch actual wallet balance
    const walletBalanceAda = await fetchWalletBalance(wallet);
    console.log(`Wallet balance for ${name}:`, walletBalanceAda, 'ADA');

    // Calculate USD values with 2 decimal places
    const walletBalanceUsd = Number((walletBalanceAda * adaUsdRate).toFixed(2));
    const formattedWalletBalanceAda = Number(walletBalanceAda.toFixed(2));

    // Calculate months based on actual wallet balance
    const monthsWithRealBudget = realMonthlyBudget > 0 ? Math.round(walletBalanceAda / realMonthlyBudget) : 0;
    const monthsWithMaxBudget = maxMonthlyBudget > 0 ? Math.round(walletBalanceAda / maxMonthlyBudget) : 0;

    globalFinancialsForSheet.push([
      'ALL',
      name,
      totalBudgetAll,
      realMonthlyBudget,
      monthsWithRealBudget,
      maxMonthlyBudget,
      monthsWithMaxBudget,
      totalReceivedAll,
      totalBudgetAll - totalReceivedAll,
      formattedWalletBalanceAda,
      walletBalanceUsd
    ]);
  }

  // Update CSV files with processed data
  try {
    if (allMilestones.length > 0) {
      // Define headers for the CSV files
      const milestoneHeaders = [
        'title',
        'project_id',
        'milestone',
        'month',
        'cost',
        'completion',
        'budget',
        'funds_distributed',
        'milestones_qty',
        'som_signoff_count',
        'poa_signoff_count',
        'outputs_approved',
        'success_criteria_approved',
        'evidence_approved',
        'poa_content_approved'
      ];
      await csvService.updateCsv('milestones', allMilestones, milestoneHeaders);
      console.log('Milestones CSV file updated successfully');
    }

    if (allTransactions.length > 0) {
      const transactionHeaders = ['Project ID', 'Project Title', 'Transaction Hash', 'Date', 'Amount', 'Metadata'];
      await csvService.updateCsv('transactions', allTransactions, transactionHeaders);
      console.log('Transactions CSV file updated successfully');
    }

    // Add global financials sheet
    if (globalFinancialsForSheet.length > 0) {
      const globalFinancialHeaders = [
        'Projects',
        'Organization',
        'Total Budget All Projects',
        'Real Monthly Budget',
        'Months with Real Budget',
        'Max Monthly Budget',
        'Months with Max Budget',
        'Total Received',
        'Remaining Funds',
        'Wallet Balance (ADA)',
        'Wallet Balance (USD)'
      ];
      await csvService.updateCsv('global_financials', globalFinancialsForSheet, globalFinancialHeaders);
      console.log('Global Financials CSV file updated successfully');
    }

    if (allProposals.length > 0) {
      const proposalHeaders = ['Project ID', 'Title', 'Budget', 'Funds Distributed', 'Remaining Funds', 'Milestones Quantity', 'Milestone URL'];
      await csvService.updateCsv('proposals', allProposals, proposalHeaders);
      console.log('Proposals CSV file updated successfully');
    }

    // Add collaborators sheet
    if (allCollaborators.length > 0) {
      const collaboratorHeaders = [
        'Project ID',
        'Project Title',
        'Total Budget',
        'Collaborator Name',
        'Funds Allocated to Collaborator',
        'Funds Left to Organization'
      ];
      await csvService.updateCsv('collaborators', allCollaborators, collaboratorHeaders);
      console.log('Collaborators CSV file updated successfully');
    }
  } catch (error) {
    console.error('Error updating CSV files:', error);
    await sendDiscordNotification(`⚠️ Error updating CSV files: ${error.message}`);
    process.exit(1);
  }

  // Send notification
  const totalProjects = processedProjects.length;
  const totalMilestones = processedProjects.reduce(
    (sum, project) => sum + project.milestones.length, 0
  );
  const completedMilestones = processedProjects.reduce(
    (sum, project) => sum + project.milestones.filter(m =>
      m.outputs_approved &&
      m.success_criteria_approved &&
      m.evidence_approved
    ).length, 0
  );
  const totalCollaborators = allCollaborators.length;

  const notificationMessage = `✅ Catalyst monitoring update completed!\n` +
    `- ${totalProjects} projects processed\n` +
    `- ${completedMilestones}/${totalMilestones} milestones completed\n` +
    `- ${totalCollaborators} collaborators tracked\n` +
    `- Data updated in CSV files`;

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
