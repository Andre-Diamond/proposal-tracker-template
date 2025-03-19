# 🚀 Project Automation with CSV Files & GitHub Actions

This repository automates the tracking of projects, transactions, and milestones using **CSV files** stored in the repository and **GitHub Actions**. The Next.js app is included for potential future developments, but the focus is on the scripts.

## Data Storage

Project data is stored in CSV files in the `data/` directory:
- `proposals.csv` - Summary of all tracked projects
- `milestones.csv` - Detailed milestone information for each project
- `transactions.csv` - Wallet transaction history
- `financials.csv` - Financial metrics and budget information

These files are automatically updated by a daily GitHub Actions workflow and committed to the repository for transparency and version control.
