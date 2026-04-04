# Rental Tracker — Setup Guide

A mobile-first PWA for tracking rental property payments and issues, stored in Google Drive.

---

## Quick start checklist

- [ ] Create Google Cloud project & enable Drive API
- [ ] Create OAuth 2.0 Client ID
- [ ] Paste Client ID into `drive.js`
- [ ] Create Google Drive folder & paste Folder ID into `drive.js`
- [ ] Share folder with rental manager
- [ ] Generate icons (run `generate-icons.html` once)
- [ ] Deploy to GitHub Pages
- [ ] Install on iPhone via Safari

---

## Owner setup (one-time, done by the primary user)

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Give it a name like "Rental Tracker" and click **Create**
4. Make sure your new project is selected in the dropdown

### Step 2 — Enable the Google Drive API

1. In the left sidebar, go to **APIs & Services → Library**
2. Search for "Google Drive API"
3. Click it, then click **Enable**

### Step 3 — Create an OAuth 2.0 Client ID

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. If prompted to configure the consent screen first:
   - Choose **External**, click Create
   - Fill in App name (e.g. "Rental Tracker"), your email address
   - Add your email under "Test users"
   - Save and continue through the remaining steps
4. Back at Create Client ID:
   - Application type: **Web application**
   - Name: "Rental Tracker"
   - Under **Authorised JavaScript origins**, click **+ Add URI** and enter:
     - `http://localhost` (for local testing)
     - Your GitHub Pages URL, e.g. `https://yourusername.github.io`
5. Click **Create**
6. A dialog will show your **Client ID** — it looks like `123456789-abc.apps.googleusercontent.com`
7. Copy it

### Step 4 — Paste the Client ID into the code

Open `drive.js` in a text editor and find this line near the top:

```javascript
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
```

Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Client ID:

```javascript
const GOOGLE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
```

### Step 5 — Create a Google Drive folder

1. Go to [drive.google.com](https://drive.google.com)
2. Click **+ New → New folder**
3. Name it `Rental Tracker Data` (the name doesn't matter technically, only the ID does)
4. Click Create

### Step 6 — Find and copy the folder ID

1. Open the folder you just created
2. Look at the URL in your browser address bar. It will look like:
   ```
   https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
   ```
3. The part after `/folders/` is the folder ID — copy it

### Step 7 — Paste the folder ID into the code

Open `drive.js` again and find:

```javascript
const SHARED_FOLDER_ID = 'YOUR_SHARED_FOLDER_ID';
```

Replace it with your folder ID:

```javascript
const SHARED_FOLDER_ID = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ';
```

### Step 8 — Share the folder with your rental manager

1. In Google Drive, right-click the `Rental Tracker Data` folder
2. Click **Share**
3. Enter the rental manager's Gmail address
4. Change the permission from Viewer to **Editor**
5. Uncheck "Notify people" if you prefer (optional)
6. Click **Share**

> The manager does not need any code changes. They just need to sign in with their own Google account when they open the app.

### Step 9 — Generate the app icons (one-time)

Icons are required for the app to install properly on your phone's home screen.

1. Open `generate-icons.html` in any web browser (just double-click the file)
2. Click each of the three download buttons:
   - **Download icon-192.png** → save to the `icons/` folder
   - **Download icon-512.png** → save to the `icons/` folder
   - **Download apple-touch-icon.png** → save to the `icons/` folder
3. You should now have these files:
   ```
   icons/
     icon-192.png
     icon-512.png
     apple-touch-icon.png
     icon.svg
   ```

### Step 10 — Deploy to GitHub Pages

1. Create a new repository at [github.com/new](https://github.com/new)
   - Name it something like `rental-tracker`
   - Set it to **Public** (required for free GitHub Pages)
2. Upload all the project files to the repository:
   - `index.html`
   - `style.css`
   - `drive.js`
   - `app.js`
   - `manifest.json`
   - `sw.js`
   - `icons/` folder (with all 4 icon files)
   - Do **not** upload `generate-icons.html` or `README.md` unless you want to
3. Go to your repository **Settings → Pages**
4. Under "Source", select **Deploy from a branch**
5. Choose branch `main` (or `master`), folder `/ (root)`, click **Save**
6. Wait about 60 seconds, then your app will be live at:
   ```
   https://yourusername.github.io/rental-tracker/
   ```
7. **Important:** Go back to Google Cloud Console → Credentials → your OAuth Client ID, and add this exact URL to **Authorised JavaScript origins** (without a trailing slash)

---

## All users (owner and rental manager)

### Step 11 — Install on iPhone

1. Open Safari on your iPhone (must be Safari, not Chrome)
2. Navigate to your GitHub Pages URL
3. Wait for the page to fully load
4. Tap the **Share** button (the box with an arrow pointing up) at the bottom of Safari
5. Scroll down in the share sheet and tap **Add to Home Screen**
6. Optionally rename it to "Rental Tracker", then tap **Add**
7. The app icon will appear on your home screen like any other app

### Step 12 — Sign in on first launch

1. Tap the app icon to open it
2. Tap **Sign in with Google**
3. Choose your Google account
4. Grant the permissions requested (Drive access)
5. The app will load your data automatically

> The owner and the rental manager each sign in with their **own** Google accounts. They both access the same data file because the owner has shared the Drive folder with the manager.

### Step 13 — Using the Sync button

The app saves automatically every time you make a change. However, if both you and the rental manager are using the app, neither of you will see the other's changes in real time.

- Tap the **↻ sync icon** in the top-right corner at any time to pull the latest data from Drive
- The sync status in the header tells you the current state:
  - **Saved ✓** — your data is up to date
  - **Saving…** — a save is in progress
  - **Sync error** — something went wrong, tap sync to retry

---

## Tenant changeover walkthrough

### Step 14 — Closing a departing tenant and adding a new one

When a tenant leaves, follow these steps to preserve all history and start fresh:

1. Go to the **Properties** tab
2. Tap the property whose tenant is leaving
3. In the property detail view, tap **End Tenancy & Add New Tenant**
4. You will see a warning: "Ending tenancy for [name]" — this is expected, it only closes their record
5. Enter the **Lease End Date** (the last day of the departing tenant's tenancy)
6. Fill in the new tenant's details:
   - New tenant name
   - Lease start date (can overlap or follow the end date)
   - Monthly rent amount
   - Deposit paid
   - Yearly rent increment % (stored for reference — e.g. enter `3` for 3%)
7. Tap **End Tenancy & Add New**

All of the departing tenant's payment history is permanently preserved and visible under "Tenancy History" in the property detail view. Those records are read-only.

### Step 15 — Reviewing past tenant history

1. Tap any property to open its detail view
2. Scroll down to find the **Tenancy History** section
3. Tap it to expand — you will see all past tenants with their dates, rent amounts, deposits, and payment counts
4. Past tenant records are clearly labelled "Historical record — read only"

---

## Data structure overview

All data is stored as a single JSON file `rental-tracker-data.json` in your shared Google Drive folder. The structure is:

```
{
  schemaVersion: 1,
  lastUpdatedBy: "Name",
  lastUpdatedAt: "ISO timestamp",
  properties: [
    {
      id, name, active,
      tenancies: [
        {
          id, tenantName, leaseStart, leaseEnd,
          monthlyRent, depositPaid, yearlyIncrementPct,
          payments: [
            { id, dueDate, amountDue, amountPaid, dateReceived, notes }
          ]
        }
      ],
      issues: [
        { id, date, description, status }
      ]
    }
  ]
}
```

Payment status is **calculated automatically** on every load — it is never stored. The status rules are:

| Condition | Status |
|-----------|--------|
| Amount paid = 0, due date not yet passed | Upcoming (grey) |
| Amount paid = 0, due date has passed | Outstanding (red) |
| Amount paid > 0 but less than amount due | Partial (amber) |
| Amount paid ≥ amount due, received after due date | Late (amber) |
| Amount paid ≥ amount due, received on or before due date | Paid (green) |

---

## Troubleshooting

**"Sign in" does nothing or shows an error**
- Check that your GitHub Pages URL is listed exactly (no trailing slash) in the Authorised JavaScript origins in Google Cloud Console
- Check that the Client ID in `drive.js` is correct

**"Sync error" after signing in**
- Check that the Folder ID in `drive.js` is correct (copy it directly from the Drive URL)
- Check that the folder is shared with the signed-in user's Google account
- Make sure the Drive API is enabled in your Google Cloud project

**The rental manager can't see the data**
- The owner must share the Google Drive folder with the manager's Gmail address with Editor access
- The manager should sign out and sign back in, then tap Sync

**App not installing on iPhone**
- Must be opened in Safari (not Chrome or Firefox)
- Must be served from HTTPS (GitHub Pages provides this automatically)
- Make sure `manifest.json` is present and the `icons/` folder has the PNG files

---

## File structure

```
rental-tracker/
├── index.html          — App shell and all modals
├── style.css           — Mobile-first styles
├── drive.js            — Google Auth & Drive API ← edit Client ID and Folder ID here
├── app.js              — Application logic and data model
├── manifest.json       — PWA manifest
├── sw.js               — Service worker
├── generate-icons.html — Run once to generate icon PNGs
└── icons/
    ├── icon.svg
    ├── icon-192.png        ← generated by generate-icons.html
    ├── icon-512.png        ← generated by generate-icons.html
    └── apple-touch-icon.png← generated by generate-icons.html
```
