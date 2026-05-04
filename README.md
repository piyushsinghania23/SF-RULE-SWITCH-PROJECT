# Salesforce Validation Rule Manager

A full-stack assignment project that connects to a Salesforce Developer Org with OAuth 2.0, fetches Account validation rules, lets users toggle them, and deploys changes back to Salesforce.

## Tech Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Salesforce SDK: jsforce
- APIs used: OAuth 2.0, Tooling API, Metadata API

## Folder Structure

```txt
.
|- backend/
|  |- src/
|  |  `- server.js
|  |- package.json
|  `- .env.example
|- frontend/
|  |- src/
|  |  |- App.jsx
|  |  |- api.js
|  |  `- main.jsx
|  |- package.json
|  `- .env.example
|- README.md
`- package.json
```

## Assignment Features Covered

- Login with Salesforce using OAuth 2.0
- Fetch Account object validation rules
- Show table columns:
  - Rule Name
  - Error Condition Formula
  - Error Message
  - Active Status
  - Toggle Button
- Toggle one rule at a time
- Enable all / Disable all rules
- Deploy staged changes to Salesforce
- Session-based auth with proper error handling

## Salesforce Connected App Setup

1. Open Salesforce Setup in your Developer Org.
2. Go to **App Manager** -> **New Connected App**.
3. Fill basic details (name and contact email).
4. Enable OAuth Settings:
   - Callback URL: `http://localhost:5000/auth/callback`
   - Selected scopes:
     - `Access and manage your data (api)`
     - `Perform requests at any time (refresh_token, offline_access)`
5. Save the app.
6. Wait 5 to 10 minutes for app activation.
7. Copy Consumer Key and Consumer Secret.

## Environment Variables

Create `backend/.env`:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=replace-with-a-long-random-secret
SALESFORCE_CLIENT_ID=YOUR_CONNECTED_APP_CONSUMER_KEY
SALESFORCE_CLIENT_SECRET=YOUR_CONNECTED_APP_CONSUMER_SECRET
SALESFORCE_CALLBACK_URL=http://localhost:5000/auth/callback
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_API_VERSION=v61.0
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000
```

## Sample Account Validation Rules (4-5)

Create these in **Object Manager -> Account -> Validation Rules**:

1. `Annual_Revenue_Positive`
- Formula: `AnnualRevenue < 0`
- Error Message: `Annual Revenue cannot be negative.`

2. `Phone_Required_For_Customer`
- Formula: `AND(ISPICKVAL(Type, "Customer - Direct"), ISBLANK(Phone))`
- Error Message: `Phone is required for Customer - Direct accounts.`

3. `Website_Required_For_Partner`
- Formula: `AND(ISPICKVAL(Type, "Partner"), ISBLANK(Website))`
- Error Message: `Website is required for Partner accounts.`

4. `Billing_Country_Required`
- Formula: `ISBLANK(BillingCountry)`
- Error Message: `Billing Country is required.`

5. `Rating_Required`
- Formula: `ISBLANK(TEXT(Rating))`
- Error Message: `Rating is required.`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start backend + frontend:

```bash
npm run dev
```

3. Open:

- `http://localhost:5173`

## How To Test

1. Click **Login with Salesforce**.
2. Complete OAuth login and consent.
3. Click **Fetch Validation Rules**.
4. Verify rules appear with correct active/inactive status.
5. Toggle one rule and observe pending status.
6. Use **Enable All** or **Disable All**.
7. Click **Deploy Changes**.
8. Verify updates in Salesforce Validation Rules page.

## Important Notes

- If `/auth/salesforce` returns config error, check `backend/.env` values.
- Callback URL in Salesforce Connected App must exactly match `SALESFORCE_CALLBACK_URL`.
- Backend default local URL: `http://localhost:5000`
- Frontend default local URL: `http://localhost:5173`

## Main API Endpoints

- `GET /auth/salesforce`
- `GET /auth/callback`
- `GET /me`
- `GET /validation-rules`
- `POST /toggle-rule`
- `POST /deploy`
- `POST /logout`
