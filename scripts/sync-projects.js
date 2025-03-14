// scripts/sync-projects.js
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize constants
const MILESTONES_BASE_URL = process.env.NEXT_PUBLIC_MILESTONES_URL || 'https://milestones.projectcatalyst.io';
const projectConfigsEnv = process.env.NEXT_PUBLIC_PROJECT_CONFIGS || "[]";
console.log('Environment check:');
console.log('- MILESTONES_BASE_URL:', MILESTONES_BASE_URL);
console.log('- URL type:', typeof MILESTONES_BASE_URL);
console.log('- URL length:', MILESTONES_BASE_URL.length);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL2;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY2;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Helper to get a project configuration value from the single environment variable.
 * The env variable NEXT_PUBLIC_PROJECT_CONFIGS should be a JSON string representing an array of arrays.
 *
 * Example:
 * [
 *   ["project_1000107_wallet", "stake1u8ABC123...", "ADA wallet address for project 1000107"],
 *   ["project_1000107_from", "2024-01-01", "Start date for milestone funds..."],
 *   ["project_1000107_to", "2024-02-01", "End date for milestone funds..."]
 * ]
 *
 * @param {string|number} projectId - The project ID.
 * @param {string} keySuffix - One of "wallet", "from", or "to".
 * @returns {string|null} The value or null if not found.
 */
function getProjectEnvValue(projectId, keySuffix) {
  let configs = [];
  try {
    configs = JSON.parse(process.env.NEXT_PUBLIC_PROJECT_CONFIGS || "[]");
  } catch (e) {
    console.error("Error parsing NEXT_PUBLIC_PROJECT_CONFIGS:", e);
  }
  const key = `project_${projectId}_${keySuffix}`;
  const config = configs.find(item => item[0] === key);
  return config ? config[1] : null;
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
 * Fetches snapshot data using Supabase RPC.
 */
async function fetchSnapshotData(projectId) {
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
    data: { _project_id: projectId }
  });
  return response.data;
}

/**
 * Updates Google Sheets with provided data.
 * Now expects a payload of the form:
 * {
 *   sheet: 'Wallet Transactions', // or 'Milestones', 'Proposals', 'Config'
 *   data: [ ... ] // Array of rows to write
 * }
 */
async function updateGoogleSheets(formattedData, targetSheet) {
  const payload = {
    sheet: targetSheet,
    data: formattedData
  };
  const response = await axios.post(
    process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );
  return response.data;
}


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
    console.error('Error fetching proposal details:', error);
    throw error;
  }

  console.log(`Found proposal details for project ${projectId}:`, data);
  return data;
}

// ----------------------
// Koios Service Wrapper
// ----------------------
const { fetchWalletTransactions } = require('./koiosWrapper');

/**
 * Processes a single project.
 */
async function processProject(projectId) {
  console.log(`Processing project ${projectId}...`);
  
  try {
    const proposalDetails = await getProposalDetails(projectId);
    const milestonesLink = `${MILESTONES_BASE_URL}/projects/${projectId}`;
    console.log('Link generation details:');
    console.log('- Base URL:', MILESTONES_BASE_URL);
    console.log('- Project ID:', projectId);
    console.log('- Generated Link:', milestonesLink);
    
    // Fetch snapshot data for milestones
    const snapshotData = await fetchSnapshotData(projectId);
    console.log(`Found ${snapshotData.length} milestones for project ${projectId}`);
    
    // Process milestone data
    let formattedData = [];
    if (snapshotData.length > 0) {
      for (const snapshot of snapshotData) {
        const milestoneData = await fetchMilestoneData(projectId, snapshot.milestone);
        console.log(`Processing milestone ${snapshot.milestone} data:`, JSON.stringify(milestoneData, null, 2));
        
        formattedData.push({
          title: proposalDetails.title,
          project_id: projectId,
          milestone: snapshot.milestone,
          month: snapshot.month,
          cost: snapshot.cost,
          completion: snapshot.completion,
          budget: proposalDetails.budget,
          funds_distributed: proposalDetails.funds_distributed,
          milestones_qty: proposalDetails.milestones_qty,
          som_signoff_count: snapshot.som_signoff_count,
          poa_signoff_count: snapshot.poa_signoff_count,
          outputs_approved: milestoneData?.[0]?.som_reviews?.[0]?.outputs_approves || false,
          success_criteria_approved: milestoneData?.[0]?.som_reviews?.[0]?.success_criteria_approves || false,
          evidence_approved: milestoneData?.[0]?.som_reviews?.[0]?.evidence_approves || false,
          poa_content_approved: milestoneData?.[0]?.poas?.[0]?.poas_reviews?.[0]?.content_approved || false,
          milestones_link: milestonesLink
        });
      }
    } else {
      // For new proposals without milestone data yet
      for (let i = 1; i <= proposalDetails.milestones_qty; i++) {
        formattedData.push({
          title: proposalDetails.title,
          project_id: projectId,
          milestone: i,
          month: i,
          cost: Math.round(proposalDetails.budget / proposalDetails.milestones_qty),
          completion: 0,
          budget: proposalDetails.budget,
          funds_distributed: proposalDetails.funds_distributed,
          milestones_qty: proposalDetails.milestones_qty,
          som_signoff_count: 0,
          poa_signoff_count: 0,
          outputs_approved: false,
          success_criteria_approved: false,
          evidence_approved: false,
          poa_content_approved: false,
          milestones_link: milestonesLink
        });
      }
    }
    
    // Process wallet transactions using the single env variable.
    const wallet = getProjectEnvValue(projectId, 'wallet');
    const fromDate = getProjectEnvValue(projectId, 'from');
    const toDate = getProjectEnvValue(projectId, 'to');
    
    if (wallet) {
      console.log(`Fetching transactions for wallet ${wallet} between ${fromDate || 'beginning'} and ${toDate || 'now'}`);
      const walletTxs = await fetchWalletTransactions(wallet, fromDate, toDate);
      console.log(`Found ${walletTxs.length} transactions for wallet ${wallet}`);
      if (walletTxs.length > 0) {
        const formattedTxs = walletTxs.map(tx => ({
          project_id: projectId,
          wallet: wallet,
          tx_hash: tx.tx_hash,
          tx_timestamp: tx.tx_timestamp,  
          outputs: tx.outputs 
        }));
        await updateGoogleSheets(formattedTxs, 'Wallet Transactions');        
      }      
    } else {
      console.log(`No wallet configured for project ${projectId}`);
    }
    
    // Prepare the proposal row for the Proposals sheet.
    const remainingFunds = proposalDetails.budget - proposalDetails.funds_distributed;
    const proposalRow = {
      project_id: projectId,
      title: proposalDetails.title,
      budget: proposalDetails.budget,
      funds_distributed: proposalDetails.funds_distributed,
      remaining_funds: remainingFunds,
      milestones_qty: proposalDetails.milestones_qty,
      milestones_link: milestonesLink
    };
    
    // Return both milestone data and the proposal row.
    return {
      milestoneData: formattedData,
      proposal: proposalRow
    };
  } catch (error) {
    console.error(`Error processing project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Main function to process all projects.
 */
async function main() {
  const projectIds = (process.env.PROJECT_IDS || '1000107').split(',');
  let allFormattedData = [];
  let proposalsData = [];

  for (const projectId of projectIds) {
    try {
      const { milestoneData, proposal } = await processProject(projectId.trim());
      allFormattedData = [...allFormattedData, ...milestoneData];
      proposalsData.push([
        proposal.project_id,
        proposal.title,
        proposal.budget,
        proposal.funds_distributed,
        proposal.remaining_funds,
        proposal.milestones_qty,
        proposal.milestones_link
      ]);
    } catch (error) {
      console.error(`Failed to process project ${projectId}:`, error);
    }
  }

  // Update the Milestones sheet if any data exists.
  if (allFormattedData.length > 0) {
    try {
      const result = await updateGoogleSheets(allFormattedData, 'Milestones');
      console.log('Milestones sheet update result:', result);
    } catch (error) {
      console.error('Failed to update Milestones sheet:', error);
      process.exit(1);
    }
  }

  // Update the Proposals sheet if proposals data exists.
  if (proposalsData.length > 0) {
    try {
      const proposalsResult = await updateGoogleSheets(proposalsData, 'Proposals');
      console.log('Proposals sheet update result:', proposalsResult);
    } catch (error) {
      console.error('Failed to update Proposals sheet:', error);
      process.exit(1);
    }
  }

  // Update the Config sheet.
  let projectConfigs = [];
  try {
    projectConfigs = JSON.parse(projectConfigsEnv);
  } catch (e) {
    console.error('Error parsing NEXT_PUBLIC_PROJECT_CONFIGS:', e);
  }
  
  if (projectConfigs.length > 0) {
    try {
      const configResult = await updateGoogleSheets(projectConfigs, 'Config');
      console.log('Config sheet update result:', configResult);
    } catch (error) {
      console.error('Failed to update Config sheet:', error);
      process.exit(1);
    }
  }
  
  // NEW: Run Collaborator Allocations update after all others.
  try {
    const collabResult = await updateGoogleSheets([], 'Collaborator Allocations');
    console.log('Collaborator Allocations sheet update result:', collabResult);
  } catch (error) {
    console.error('Failed to update Collaborator Allocations sheet:', error);
    process.exit(1);
  }

  // --- NEW: Update the Dashboard ---
  try {
    const dashboardResult = await updateGoogleSheets([], 'Dashboard');
    console.log('Dashboard sheet update result:', dashboardResult);
  } catch (error) {
    console.error('Failed to update Dashboard sheet:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
