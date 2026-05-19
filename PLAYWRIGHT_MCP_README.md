# Playwright MCP Setup for Admin Panel Debugging

This directory contains a Playwright MCP (Model Context Protocol) server configured to debug and test the Velorex Music admin panel login functionality.

## 📋 Files Created

- **`playwright-mcp-server.js`** - MCP server that provides browser control tools
- **`test-admin-login.js`** - Standalone test script for admin login
- **`.vscode/settings.json`** - VS Code MCP configuration
- **`package.json`** - Node dependencies and scripts

## 🚀 Quick Start

### Option 1: Run Automated Test Script (Easiest)

Test the admin login with a visual browser:

```bash
npm run test:admin
```

This will:
1. Launch Chromium browser (visible for debugging)
2. Navigate to `http://127.0.0.1:5500/vlx-admin-2026.html`
3. Fill in credentials (`owner` / `owner123`)
4. Click the login button
5. Report success or failure
6. Keep browser open for 10 seconds so you can inspect it
7. Save a screenshot

### Option 2: Use MCP Server with VS Code

The MCP server is automatically configured in VS Code. Once VS Code recognizes it, you can use Copilot to control Playwright with commands like:

- "Launch the browser"
- "Navigate to the admin panel"
- "Test the admin login"
- "Take a screenshot"
- "Close the browser"

## 🎯 Available Tools (MCP Server)

The Playwright MCP server provides these tools:

### `launch_browser`
Launches a Chromium browser
```javascript
Parameters:
- headless (boolean): Run in headless mode (default: false for debugging)
```

### `navigate_to_admin`
Navigates to the admin panel
```javascript
Parameters:
- url (string): Admin URL (default: http://127.0.0.1:5500/vlx-admin-2026.html)
```

### `login_admin`
Tests admin login with credentials
```javascript
Parameters:
- username (string): Admin username (default: "owner")
- password (string): Admin password (default: "owner123")
```

### `screenshot`
Takes a screenshot of the current page
```javascript
Parameters:
- path (string): Path to save screenshot (optional)
```

### `check_page_status`
Checks current page state and visibility of elements

### `get_console_logs`
Retrieves console messages from the page

### `close_browser`
Closes the browser

## ⚙️ Configuration

### Make sure you have:
1. **Go Live Server running** on port 5500 with your website
   ```bash
   # In VS Code, right-click vlx-admin-2026.html and select "Open with Live Server"
   # Or manually check that http://127.0.0.1:5500/vlx-admin-2026.html is accessible
   ```

2. **Node modules installed**
   ```bash
   npm install
   ```

## 🔍 Troubleshooting

### "Cannot connect to http://127.0.0.1:5500"
- Make sure Go Live Server is running
- Check the port number (should be 5500 by default)
- Try accessing the URL manually in your browser first

### "Login still fails after correct credentials"
- Check browser console for JavaScript errors (the test script will show them)
- Verify `sessionStorage` is available (not blocked by security policies)
- Check Content Security Policy (CSP) headers in vlx-admin-2026.html
- Review the debug logs for any error messages

### "Browser won't stay open for inspection"
- The test script auto-closes after 10 seconds
- To keep it open longer, modify the timeout in `test-admin-login.js` line ~150
- Or use the MCP server manually for interactive debugging

## 📝 Example Workflow

1. Start Go Live Server:
   ```
   Right-click vlx-admin-2026.html → Open with Live Server
   ```

2. Run the test:
   ```bash
   npm run test:admin
   ```

3. Watch the browser:
   - You'll see credentials being entered
   - You'll see the login button being clicked
   - Console messages will show in the terminal
   - Screenshot will be saved for documentation

4. Check results:
   - If login succeeds: "✅ LOGIN SUCCESSFUL!"
   - If login fails: See troubleshooting section

## 🛠️ Manual Debugging with MCP

To debug interactively through VS Code Copilot:

1. Open VS Code
2. Open Copilot Chat (Ctrl+Shift+I)
3. Use natural language to control the browser:
   - "Launch the browser and navigate to the admin panel"
   - "Test the login with username owner and password owner123"
   - "Take a screenshot of the current page"

## 📊 What the Script Checks

The test script validates:
- ✅ Page loads successfully
- ✅ Login form is visible
- ✅ Credentials are entered correctly
- ✅ Login button click triggers handler
- ✅ Navigation to dashboard occurs (or stays on login screen)
- ✅ Console messages are captured for debugging
- ✅ Screenshots are saved for reference

## 🔐 Security Notes

- Credentials are used for **testing only**
- Browser runs locally with no external connections (except to your Go Live Server)
- Screenshots are saved locally
- No credentials are logged or transmitted

## 📚 Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [VS Code MCP Integration](https://code.visualstudio.com/docs/copilot/mcp)
