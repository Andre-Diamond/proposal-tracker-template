import React, { useState } from 'react';

const TransactionTester = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  // Hardcoded wallet address
  const WALLET_ADDRESS = process.env.NEXT_PUBLIC_TEST_WALLET;

  async function getTxInfo(txHash) {
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

    const response = await fetch('/api/koios?endpoint=tx_info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const responseData = await response.json();
    return responseData && responseData[0] ? responseData[0] : null;
  }

  function isIncomingTransaction(tx, walletAddr) {
    const outputMatches = (tx.outputs || []).some(output =>
      output.payment_addr &&
      output.payment_addr.bech32 === walletAddr
    );
    const inputMatches = (tx.inputs || []).some(input =>
      input.payment_addr &&
      input.payment_addr.bech32 === walletAddr
    );
    return outputMatches && !inputMatches;
  }

  async function fetchWalletTransactions(walletAddr, startDateStr, endDateStr) {
    const basicRequestData = { _addresses: [walletAddr] };

    try {
      const response = await fetch('/api/koios?endpoint=address_txs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(basicRequestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const basicTxs = await response.json();
      
      console.log('Basic transactions:', basicTxs);

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

      const validDetailedTxs = detailedTxs.filter(tx => tx !== null);
      
      console.log('Detailed transactions:', validDetailedTxs);

      const incomingTxs = validDetailedTxs.filter(tx => {
        const txDate = new Date(tx.tx_timestamp * 1000);

        if (startDateStr && txDate < new Date(startDateStr)) return false;
        if (endDateStr && txDate > new Date(endDateStr)) return false;

        return isIncomingTransaction(tx, walletAddr);
      });

      console.log('Filtered incoming transactions:', incomingTxs);
      
      return incomingTxs;
    } catch (error) {
      console.error('Error fetching wallet transactions:', error);
      throw error;
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('Starting transaction fetch with parameters:', {
        wallet: WALLET_ADDRESS,
        startDate,
        endDate
      });
      
      const transactions = await fetchWalletTransactions(
        WALLET_ADDRESS,
        startDate,
        endDate
      );
      
      console.log('Final results:', transactions);
    } catch (error) {
      console.error('Error in transaction fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '20px auto', padding: '20px' }}>
      <h2>Transaction Tester</h2>
      <p style={{ marginBottom: '15px' }}>Wallet Address: {WALLET_ADDRESS}</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Start Date:
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
            </label>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              End Date:
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
            </label>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{
            padding: '10px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Fetching Transactions...' : 'Fetch Transactions'}
        </button>
      </form>
    </div>
  );
};

export default TransactionTester;