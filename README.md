# NADSOC — Society Management System

**The NAD Employees Co-operative Credit Society Ltd., Karanja**

A fully online, web-based, ledger-driven cooperative credit society management system built for ~5000 members.

🚀## Tech About This Project

## This is a hobby + learning project built to:

Learn full-stack development (Frontend + Backend + Database)
Explore real-world system design (accounts, ledger, reports)
Experiment with AI-assisted development 🤖
Build something useful for an actual society system

⚠️ This project is currently under development and not production-ready.


## 🧠 Why I Built This

Instead of just making small demo apps, I wanted to:

Solve a real-world problem
Understand how large systems (like banking/finance apps) work
Learn deployment using Render + Vercel + Supabase
Practice writing clean, scalable code

## 🌍 Open Source & Contributions

This is an open-source learning project.

Beginners are welcome 🙌
Suggestions, improvements, and ideas are appreciated
Feel free to fork, explore, and contribute
🛠️ Tech Stack
Frontend: (Your stack — React / HTML / JS / Vite)
Backend: Flask (Python)
Database: Supabase (PostgreSQL)
Hosting: Render (Backend), Vercel (Frontend)

## 📈 Project Status

🚧 In development (final phase)
⏳ Expected completion: 2–3 months

## 🤝 Goal

Not just to finish the project, but to:

Learn deeply
Build something meaningful
Share knowledge with others

## Tech Stack

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Backend | Python + Flask (REST API) | Render/Railway |
| Frontend | HTML / CSS / JS | Vercel |
| Database | PostgreSQL | Supabase |
| Auth | Supabase Auth (JWT) | Supabase |

## Project Structure

```
nadsociety/
├── backend/          # Flask REST API
├── frontend/         # Static HTML/CSS/JS
├── database/         # SQL schema & migration scripts
└── project_status.md # Development progress tracker
```

## Setup

### 1. Database (Supabase)
Run the SQL files in `database/` folder in order (001 → 005) in the Supabase SQL Editor.

### 2. Backend (Railway)
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # Fill in your Supabase credentials
python app.py
```

### 3. Frontend (Vercel)
The `frontend/` folder deploys automatically via Vercel Git integration.

## Security
- JWT-based authentication via Supabase
- Role-Based Access Control (RBAC) enforced at API level
- No deletion of financial records (reversal entries only)
- Full audit trail on all financial operations
- Month locking for historical data integrity

## License
Proprietary — NAD Employees Co-operative Credit Society Ltd., Karanja
