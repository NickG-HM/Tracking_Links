# Zendesk Tracking Links App

A custom Zendesk Support app that automatically detects order IDs from tickets and retrieves tracking links.

## Features

- **Auto-detection**: Automatically finds order IDs (like #141906) from ticket content, including links
- **Pre-fill**: Pre-fills the search field with detected order ID
- **Two Links**: Displays both carrier tracking link and universal search link
- **Copy Buttons**: Individual copy buttons for each link
- **Copy Both**: Button to copy both links at once

## Installation

### Prerequisites

1. Zendesk CLI tool installed
2. Node.js installed
3. Your tracking links API server running (or accessible URL)

### Steps

1. **Install Zendesk CLI** (if not already installed):
   ```bash
   npm install -g @zendesk/zcli
   ```

2. **Login to Zendesk**:
   ```bash
   zcli login
   ```

3. **Navigate to the app directory**:
   ```bash
   cd zendesk-app
   ```

4. **Package the app**:
   ```bash
   zcli apps:package
   ```

5. **Upload the app to Zendesk**:
   ```bash
   zcli apps:create
   ```
   Or update an existing app:
   ```bash
   zcli apps:update
   ```

6. **Configure the app**:
   - Go to your Zendesk Admin → Apps → Private apps
   - Find "Tracking Links" app
   - Click "Install"
   - Set the `apiBaseUrl` parameter:
     - For local development: `http://localhost:8080`
     - For production: Your deployed API URL (e.g., `https://your-api.com`)

## Configuration

The app requires one parameter in the manifest:

- **apiBaseUrl**: The base URL of your tracking links API server
  - Default: `http://localhost:8080`
  - Example: `https://your-api-domain.com`

## How It Works

1. When a ticket is opened, the app scans:
   - Ticket subject
   - Ticket description (plain text and HTML)
   - Ticket comments
   - Links in the ticket content

2. It looks for order IDs in the format `#123456` or `# 123456`

3. If found, it pre-fills the search field

4. When "Get links" is clicked, it calls your API endpoint:
   ```
   POST {apiBaseUrl}/api/links
   Body: { "orderName": "#141906" }
   ```

5. The API returns tracking links which are displayed with copy buttons

## Development

To test locally:

1. Make sure your tracking links API server is running on `http://localhost:8080`
2. Use Zendesk CLI to run the app locally:
   ```bash
   zcli apps:server
   ```
3. Install the app in your Zendesk instance using the provided URL

## File Structure

```
zendesk-app/
├── manifest.json      # App configuration
├── assets/
│   ├── iframe.html    # App UI
│   ├── iframe.css     # Styling
│   └── iframe.js      # App logic
└── README.md          # This file
```

## Troubleshooting

- **"Failed to fetch" error**: Check that your API server is running and accessible
- **Order ID not detected**: Make sure the order ID is in the format `#123456` in the ticket
- **CORS errors**: Ensure your API server allows requests from Zendesk domains

