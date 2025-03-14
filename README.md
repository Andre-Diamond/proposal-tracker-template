# 🚀 Project Automation with Google Sheets & GitHub Actions

This repository automates the tracking of projects, transactions, and milestones using **Google Sheets**, **GitHub Actions**, and **Google Apps Script**. The Next.js app is included for potential future developments, but the focus is on the scripts.

---

## 📄 Use the Google Sheets Template

Click the button below to **create a copy** of the Google Sheets template:

[![Make a Copy of the Google Sheet](https://img.shields.io/badge/Copy%20Google%20Sheet-blue?logo=google-drive)](https://docs.google.com/spreadsheets/d/1Jnt_61uwZmqYTN_I7HbhqPqCLmYU_U04WJi37Rg5zu4/copy)

Once copied, update your **Google Apps Script** as needed.

---

## 🚀 Use This Repo as a Template

Click the button below to **create your own GitHub repository** from this template:

[![Use This Template](https://img.shields.io/badge/Create%20a%20Repo-blue?logo=github)](https://github.com/treasuryguild/catalyst-tracker/generate)

After creating your repository, follow the steps below to configure GitHub Actions.

---

## 🔑 Setup GitHub Secrets

To allow the GitHub Action to sync data to Google Sheets, add the following **secrets** in your GitHub repository:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret** for each of the following:

| Secret Name | Description |
|------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL2` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY2` | Supabase Anonymous Key |
| `NEXT_PUBLIC_GOOGLE_SCRIPT_URL` | Web App URL of the Google Apps Script |
| `NEXT_PUBLIC_MILESTONES_URL` | Milestone tracking API (default: `https://milestones.projectcatalyst.io`) |
| `NEXT_PUBLIC_PROJECT_CONFIGS` | JSON string containing project configurations (example below) |
| `KOIOS_API_KEY` | API key for Koios |
| `PROJECT_IDS` | Comma-separated list of project IDs to sync |

---

## 📜 Example `NEXT_PUBLIC_PROJECT_CONFIGS`

The `NEXT_PUBLIC_PROJECT_CONFIGS` secret should be a **JSON string** containing configurations for each project:

```json
[
  ["project_1100271_wallet", "stake1u8ABC123...", "ADA wallet address for project 1100271"],
  ["project_1100271_from", "2023-01-01", "Start date for milestone funds (ISO date)"],
  ["project_1100271_to", "2025-01-01", "End date for milestone funds (ISO date)"]
]
```

---

## 🛠 How the GitHub Action Works

1. **Syncs project data** to Google Sheets via GitHub Actions.
2. **Runs daily at midnight UTC** or can be triggered manually.
3. **Pulls transactions** from Koios API and updates Google Sheets.
4. **Ensures Milestones and Proposals stay updated** in the sheet.

### **Triggering the GitHub Action Manually**
To trigger the action manually:
1. Go to your **repository** on GitHub.
2. Navigate to **Actions**.
3. Select the `Sync Project Data to Sheets` workflow.
4. Click **Run workflow**.

---

## ❓ Do I Need to Deploy the Next.js App?

🚨 **No, you don’t need to deploy the Next.js app**. The app is included for potential future development, but **this repository mainly relies on GitHub Actions, the scripts in the 'scripts' folder and Google Sheets**.

---

## 🎯 Next Steps

- [ ] **Make a Copy of the Google Sheet**  
- [ ] **Create a New Repo from This Template**  
- [ ] **Add GitHub Secrets**  
- [ ] **Manually Trigger the GitHub Action (if needed)**  
- [ ] **Customize Google Apps Script (if necessary)**  

---

🚀 Happy Automating! 🎉