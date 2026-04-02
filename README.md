# Aushiva React Template

React + Vite medicine inventory app with an Express + SQLite backend.

## Included

- Dashboard with summary cards, category donut, demand bars, and expiry alerts
- Inventory page with search, category filtering, add/edit modal, and delete action
- Scan Barcode page with manual lookup flow
- Expiry Alerts page with summary cards and filtering
- Usage Tracking and Hospital Exchange sections
- Express API + SQLite database
- Seeded medicines and exchange requests from the 1000-medicine dataset
- Login flow backed by the database

## Project Structure

- `index.html`
- `package.json`
- `vite.config.js`
- `src/main.jsx`
- `src/App.jsx`
- `src/data/seed.js`
- `backend/src/server.js`
- `backend/src/db.js`
- `src/lib/localBackend.js`
- `styles.css`

## Run

1. `npm install`
2. `npm run dev`

## Notes

- Demo login: `admin@aushiva.local` / `admin123`
- Inventory changes persist in `backend/data/aushiva.db`.
- For Gmail OTP signup, add EmailJS keys to `.env` (see `.env.example`) and create an EmailJS template with `to_email`, `to_name`, and `otp_code` variables.
