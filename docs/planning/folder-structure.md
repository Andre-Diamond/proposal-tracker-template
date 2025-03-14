---
layout: default
title: Folder Structure
nav_order: 2
parent: Planning
---

# Folder structure of Catalyst Tracker App (...work in progress)

```md
nextjs-catalyst-tool/
├── .github/
│   └── workflows/
│       ├── ci-cd.yml            # CI/CD pipeline, automated tests, linting, etc.
│       └── automation.yml       # GitHub Actions for data sync, deployments, etc.
├── public/
│   ├── images/                  # Static images (logos, icons, etc.)
│   └── assets/                  # Other public assets (fonts, documents, etc.)
├── src/
│   ├── components/              # Reusable React components
│   │   ├── common/              # Shared UI elements (Header, Footer, etc.)
│   │   │   ├── Header.js
│   │   │   └── Footer.js
│   │   ├── dashboard/           # Dashboard-specific components
│   │   │   ├── ProposalsDashboard.js
│   │   │   └── WalletDashboard.js
│   │   └── ui/                  # Generic UI components (Buttons, Inputs, etc.)
│   │       └── Button.js
│   ├── pages/                   # Next.js pages and API routes
│   │   ├── api/                 # API endpoints
│   │   │   ├── proposals.js     # Handles proposal-related requests
│   │   │   └── wallets.js       # Handles wallet-related requests
│   │   ├── index.js             # Landing page or main dashboard entry point
│   │   ├── proposals.js         # Page for displaying proposals
│   │   └── wallets.js           # Page for displaying wallet info
│   ├── lib/                     # Libraries and integration logic
│   │   ├── api/                 # External API integrations
│   │   │   ├── projectCatalyst.js  # Integration with Project Catalyst API
│   │   │   └── googleSheets.js     # Integration with Google Sheets API
│   │   └── utils/               # Helper functions and utilities
│   │       └── helper.js
│   ├── hooks/                   # Custom React hooks
│   │   └── useFetch.js
│   └── styles/                  # Global and component-specific styles
│       ├── globals.css         # Global CSS styles
│       └── dashboard.module.css  # Module-specific styles for dashboards
├── scripts/                     # Standalone scripts (for automation, integrations)
│   ├── fetchData.js             # Script to fetch data from external APIs
│   ├── updateGoogleSheets.js    # Script to update Google Sheets with new data
│   └── syncData.js              # Script to synchronize data between services
├── tests/                       # Automated tests
│   ├── components/              # Component-level tests
│   ├── pages/                   # Page and integration tests
│   └── api/                     # API endpoint tests
├── .env.local                   # Environment variables (local secrets and configs)
├── next.config.js               # Next.js configuration file
├── package.json                 # Project metadata and dependencies
└── README.md                    # Project documentation and setup instructions
```