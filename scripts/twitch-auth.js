/**
 * Twitch Device Code Grant Authorization Script
 * 
 * Run this ONCE to obtain a Twitch user access token for EventSub WebSocket.
 * 
 * Usage: node scripts/twitch-auth.js
 * 
 * The script will:
 * 1. Request a device code from Twitch
 * 2. Show you a URL and code to enter
 * 3. Wait for you to authorize on Twitch
 * 4. Save the token to data/twitch_user_token.json
 * 
 * After this, the bot will automatically refresh the token as needed.
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

dotenv.config({ path: resolve(projectRoot, '.env') });

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TOKEN_FILE = resolve(projectRoot, 'data', 'twitch_user_token.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in .env');
    process.exit(1);
}

async function main() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   🔐 Twitch User Token Setup (Device Code Grant)     ║');
    console.log('║                                                       ║');
    console.log('║   This is a ONE-TIME setup for EventSub WebSocket.    ║');
    console.log('║   The token will auto-refresh after this.             ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');

    // Step 1: Request device code
    console.log('📡 Requesting device code from Twitch...');

    let deviceCodeData;
    try {
        const response = await axios.post('https://id.twitch.tv/oauth2/device', null, {
            params: {
                client_id: CLIENT_ID,
                scopes: '', // stream.online doesn't require any specific scopes
            },
        });
        deviceCodeData = response.data;
    } catch (error) {
        console.error('❌ Failed to get device code:', error.response?.data || error.message);
        process.exit(1);
    }

    const { device_code, user_code, verification_uri, expires_in, interval } = deviceCodeData;

    // Step 2: Show URL and code
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║                                                       ║');
    console.log(`║   🌐 Go to: ${verification_uri.padEnd(40)} ║`);
    console.log(`║   📋 Enter code: ${user_code.padEnd(36)} ║`);
    console.log('║                                                       ║');
    console.log(`║   ⏰ Code expires in ${Math.floor(expires_in / 60)} minutes${' '.repeat(29)}║`);
    console.log('║                                                       ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('⏳ Waiting for you to authorize...');

    // Step 3: Poll for token
    const pollInterval = (interval || 5) * 1000;
    const deadline = Date.now() + expires_in * 1000;

    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollInterval));

        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    device_code: device_code,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                },
            });

            // Success!
            const { access_token, refresh_token, expires_in: tokenExpiresIn } = response.data;

            // Ensure data directory exists
            const dataDir = resolve(projectRoot, 'data');
            if (!existsSync(dataDir)) {
                mkdirSync(dataDir, { recursive: true });
            }

            // Save token
            const tokenData = {
                access_token,
                refresh_token,
                expires_at: Date.now() + tokenExpiresIn * 1000,
                saved_at: new Date().toISOString(),
            };
            writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));

            console.log('');
            console.log('✅ Authorization successful! Token saved to data/twitch_user_token.json');
            console.log(`   Token expires in: ${Math.floor(tokenExpiresIn / 3600)} hours (will auto-refresh)`);
            console.log('');
            console.log('🚀 You can now start the bot with: npm run dev');
            console.log('   EventSub will use this token for instant Twitch notifications.');
            console.log('');
            process.exit(0);

        } catch (error) {
            const errData = error.response?.data;

            if (errData?.message === 'authorization_pending') {
                // User hasn't authorized yet, keep waiting
                process.stdout.write('.');
                continue;
            }

            if (errData?.message === 'slow_down') {
                // We're polling too fast, wait longer
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (errData?.message === 'expired_token') {
                console.error('\n❌ Device code expired. Please run this script again.');
                process.exit(1);
            }

            // Unknown error
            console.error('\n❌ Error polling for token:', errData || error.message);
            process.exit(1);
        }
    }

    console.error('\n❌ Timed out waiting for authorization. Please run this script again.');
    process.exit(1);
}

main();
