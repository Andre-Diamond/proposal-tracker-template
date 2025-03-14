const axios = require('axios');

/**
 * Retrieves detailed transaction information for a given transaction hash.
 * Uses the tx_info endpoint with extensive parameters.
 *
 * @param {string} txHash - The transaction hash.
 * @returns {Promise<Object|null>} Detailed transaction info or null if not found.
 */
async function getTxInfo(txHash) {
  const url = "https://api.koios.rest/api/v1/tx_info";
  const data = {
    _tx_hashes: [txHash],
    _inputs: true,
    _metadata: true,
    _assets: true,
    _withdrawals: true,
    _certs: true,
    _scripts: true,
    _bytecode: true,
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KOIOS_API_KEY}`,
      },
    });
    // Assume the response.data is an array; return the first element or null.
    return response.data && response.data[0] ? response.data[0] : null;
  } catch (error) {
    console.error(`Error fetching transaction info for ${txHash}:`, error);
    throw new Error(error.message);
  }
}

/**
 * Determines if a detailed transaction is incoming for the given wallet.
 * A transaction is incoming if:
 *   - At least one output's payment_addr.bech32 equals the wallet address, and
 *   - None of the inputs' payment_addr.bech32 equal the wallet address.
 *
 * @param {Object} tx - Detailed transaction object (from getTxInfo).
 * @param {string} wallet - The project wallet bech32 address.
 * @returns {boolean} True if the transaction is incoming.
 */
function isIncomingTransaction(tx, wallet) {
  // Check outputs: must have at least one output with the wallet address.
  const outputMatches = (tx.outputs || []).some(output =>
    output.payment_addr &&
    output.payment_addr.bech32 === wallet
  );
  // Check inputs: ensure none have the wallet address.
  const inputMatches = (tx.inputs || []).some(input =>
    input.payment_addr &&
    input.payment_addr.bech32 === wallet
  );
  return outputMatches && !inputMatches;
}

/**
 * Fetches all basic transactions for a given wallet (via /address_txs),
 * then retrieves detailed transaction info for each using getTxInfo.
 * Finally, filters for incoming transactions and applies date filters.
 *
 * @param {string} wallet - The wallet address (bech32) to filter on.
 * @param {string} [startDate] - ISO date string for the start date.
 * @param {string} [endDate] - ISO date string for the end date.
 * @returns {Promise<Array>} Array of detailed incoming transactions.
 */
async function fetchWalletTransactions(wallet, startDate, endDate) {
  const addressTxUrl = "https://api.koios.rest/api/v1/address_txs";
  const basicRequestData = { _addresses: [wallet] };

  try {
    const basicResponse = await axios.post(addressTxUrl, basicRequestData, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KOIOS_API_KEY}`
      }
    });

    const basicTxs = basicResponse.data;
    if (!Array.isArray(basicTxs) || basicTxs.length === 0) {
      return [];
    }

    const detailedTxs = await Promise.all(
      basicTxs.map(async (tx) => {
        try {
          return await getTxInfo(tx.tx_hash);
        } catch (error) {
          console.error(`Skipping tx ${tx.tx_hash} due to error:`, error);
          return null;
        }
      })
    );

    // Filter valid transactions
    const validDetailedTxs = detailedTxs.filter(tx => tx !== null);

    // Filter for incoming transactions and apply metadata filtering
    const incomingTxs = validDetailedTxs.filter(tx => {
      const txDate = new Date(tx.tx_timestamp * 1000);

      // Date filtering.
      if (startDate && txDate < new Date(startDate)) return false;
      if (endDate && txDate > new Date(endDate)) return false;

      // Check for incoming transaction
      const isIncoming = isIncomingTransaction(tx, wallet);
      if (!isIncoming) return false;

      // **Check metadata for "Fund" and "Cohort"**
      const metadataMsg = tx?.metadata?.[674]?.msg;
      if (!metadataMsg || !Array.isArray(metadataMsg)) return false;

      // Ensure it contains both 'Fund' and 'Cohort'
      const metadataString = metadataMsg.join(' ').toLowerCase();
        if (metadataString.includes('fund') && 
            metadataString.includes('cohort') && 
            !metadataString.includes('test')) {
          return true;
        }
      return false;
    });

    return incomingTxs;
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    return [];
  }
}

module.exports = {
  fetchWalletTransactions
};
