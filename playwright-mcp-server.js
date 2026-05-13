#!/usr/bin/env node
/**
 * Playwright MCP Server for Velorex Admin Panel Debug
 * Allows VS Code to control Playwright for browser testing
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  TextContent,
  Image,
} = require('@modelcontextprotocol/sdk/types.js');
const { chromium } = require('playwright');
const readline = require('readline');

let browser = null;
let page = null;

const server = new Server({
  name: 'playwright-mcp',
  version: '1.0.0',
});

/**
 * List all available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'launch_browser',
        description: 'Launch Chromium browser for debugging',
        inputSchema: {
          type: 'object',
          properties: {
            headless: {
              type: 'boolean',
              description: 'Run in headless mode (default: false for debugging)',
              default: false,
            },
          },
        },
      },
      {
        name: 'navigate_to_admin',
        description: 'Navigate to the admin panel',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Admin URL to navigate to',
              default: 'http://127.0.0.1:5500/admin.html',
            },
          },
        },
      },
      {
        name: 'login_admin',
        description: 'Test admin login with credentials',
        inputSchema: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'Admin username',
              default: 'owner',
            },
            password: {
              type: 'string',
              description: 'Admin password',
              default: 'owner123',
            },
          },
        },
      },
      {
        name: 'check_page_status',
        description: 'Check current page status and get console logs',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to save screenshot (optional)',
            },
          },
        },
      },
      {
        name: 'get_console_logs',
        description: 'Get all console messages from the page',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'close_browser',
        description: 'Close the browser',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    switch (name) {
      case 'launch_browser': {
        if (browser) {
          return { content: [{ type: 'text', text: '⚠️ Browser already launched' }] };
        }
        const headless = args.headless !== false;
        browser = await chromium.launch({ headless });
        const context = await browser.newContext();
        page = await context.newPage();
        
        // Capture console messages
        page.on('console', (msg) => {
          console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Browser launched (headless: ${headless})\n📍 Ready to navigate to admin panel`,
            },
          ],
        };
      }

      case 'navigate_to_admin': {
        if (!browser || !page) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Browser not launched. Call launch_browser first.',
              },
            ],
          };
        }
        const url = args.url || 'http://127.0.0.1:5500/admin.html';
        await page.goto(url, { waitUntil: 'networkidle' });
        return {
          content: [
            {
              type: 'text',
              text: `✅ Navigated to ${url}\n📍 Login screen should be visible`,
            },
          ],
        };
      }

      case 'login_admin': {
        if (!browser || !page) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Browser not launched. Call launch_browser first.',
              },
            ],
          };
        }
        const username = args.username || 'owner';
        const password = args.password || 'owner123';

        try {
          // Fill login form
          await page.fill('#login-user', username);
          await page.fill('#login-pass', password);

          // Click login button
          await page.click('#login-submit');

          // Wait for navigation or response
          await page.waitForTimeout(2000);

          // Check if dashboard is visible
          const dashboardVisible = await page
            .locator('#admin-layout')
            .isVisible()
            .catch(() => false);

          if (dashboardVisible) {
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Login SUCCESSFUL!\n👤 User: ${username}\n📊 Admin dashboard is now visible`,
                },
              ],
            };
          } else {
            const loginStillVisible = await page
              .locator('#login-screen')
              .isVisible()
              .catch(() => false);

            if (loginStillVisible) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `❌ Login FAILED - Still on login screen\n📋 Check credentials or console logs`,
                  },
                ],
              };
            } else {
              return {
                content: [
                  {
                    type: 'text',
                    text: `⚠️ Unknown state - Admin layout not visible but login screen not visible either`,
                  },
                ],
              };
            }
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Login error: ${error.message}`,
              },
            ],
          };
        }
      }

      case 'screenshot': {
        if (!browser || !page) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ Browser not launched',
              },
            ],
          };
        }
        const screenshotPath = args.path || './screenshot.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return {
          content: [
            {
              type: 'text',
              text: `✅ Screenshot saved to ${screenshotPath}`,
            },
          ],
        };
      }

      case 'check_page_status': {
        if (!page) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ No page loaded',
              },
            ],
          };
        }

        const url = page.url();
        const title = await page.title();
        const loginVisible = await page
          .locator('#login-screen')
          .isVisible()
          .catch(() => false);
        const dashboardVisible = await page
          .locator('#admin-layout')
          .isVisible()
          .catch(() => false);

        return {
          content: [
            {
              type: 'text',
              text: `📄 Current URL: ${url}\n📑 Page Title: ${title}\n🔐 Login Screen Visible: ${loginVisible}\n📊 Dashboard Visible: ${dashboardVisible}`,
            },
          ],
        };
      }

      case 'get_console_logs': {
        if (!page) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ No page loaded',
              },
            ],
          };
        }

        const logs = [];
        page.on('console', (msg) => {
          logs.push(`[${msg.type()}] ${msg.text()}`);
        });

        // Trigger any console messages by evaluating page context
        const pageInfo = await page.evaluate(() => {
          return {
            debugMessages: window.__debugMessages || [],
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: `📋 Console Logs:\n${logs.join('\n') || 'No console messages yet'}`,
            },
          ],
        };
      }

      case 'close_browser': {
        if (browser) {
          await browser.close();
          browser = null;
          page = null;
          return {
            content: [
              {
                type: 'text',
                text: '✅ Browser closed',
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ Browser not running',
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${error.message}`,
        },
      ],
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = require('@modelcontextprotocol/sdk/server/stdio.js')
    .StdioServerTransport;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const stdio = new transport();
  await server.connect(stdio);
  console.error('🎭 Playwright MCP Server started');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
