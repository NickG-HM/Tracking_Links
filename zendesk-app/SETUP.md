# Quick Setup Guide for Zendesk Tracking Links App

## Step 1: Install Zendesk CLI

```bash
npm install -g @zendesk/zcli
```

## Step 2: Login to Zendesk

```bash
zcli login
```

Enter your Zendesk subdomain and credentials when prompted.

## Step 3: Package and Upload the App

Navigate to the zendesk-app directory:

```bash
cd zendesk-app
```

Package the app:

```bash
zcli apps:package
```

Upload to Zendesk:

```bash
zcli apps:create
```

## Step 4: Install the App in Zendesk

1. Go to your Zendesk Admin panel
2. Navigate to: **Apps** → **Private apps**
3. Find "Tracking Links" in the list
4. Click **Install**
5. When prompted for `apiBaseUrl`, enter:
   - For local testing: `http://localhost:8080`
   - For production: Your deployed API URL

## Step 5: Test the App

1. Open any ticket in Zendesk
2. Look for the "Tracking Links" app in the right sidebar
3. The app should automatically detect order IDs like `#141906` from the ticket
4. Click "Get links" to retrieve tracking information

## Troubleshooting

### App doesn't appear in sidebar
- Make sure the app is installed and enabled
- Check that you're viewing a ticket (the app only appears in ticket sidebar)

### "Failed to fetch" error
- Verify your API server is running
- Check the `apiBaseUrl` setting in app configuration
- Ensure CORS is properly configured on your API server

### Order ID not detected
- Make sure the order ID is in format `#123456` or `# 123456`
- Check that the order ID appears in ticket subject, description, or comments

