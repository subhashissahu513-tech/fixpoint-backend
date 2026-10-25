# FixPoint Backend API

Express.js REST backend serving the FixPoint Customer App, Technician App, and Super Admin Web.

## Features
- Dynamic Rate Card & Service Catalog Management
- Customer Bookings & Slot Allocation
- Round-Robin Automated Technician Dispatch Engine
- Technician KYC (Aadhaar & PAN verification approval)
- Technician Earnings, Commission & Profit Tracking
- CSV Rate Card Bulk Import / Export

## Quick Start (Local)
```bash
npm install
npm start
```
Server runs on port 5001 by default (or the `PORT` environment variable).

## Cloud Deployment (Render / Railway)
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Port:** Configured via `PORT` env var (automatically provided by host).
