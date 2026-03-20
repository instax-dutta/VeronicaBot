/**
 * Creator importer
 * Imports creators from creators.json file into the database
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import config from '../config/index.js';
import { initDatabase } from '../database/index.js';
import { bulkImportCreators, creators } from '../database/queries.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Importer');

/**
 * Load and parse creators.json file
 * @param {string} filePath - Path to creators.json
 */
function loadCreatorsFile(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`Creators file not found: ${filePath}`);
    }

    try {
        const content = readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        throw new Error(`Failed to parse creators file: ${error.message}`);
    }
}

/**
 * Validate creator entry
 */
function validateCreator(creator, platform) {
    const errors = [];

    if (platform === 'youtube') {
        if (!creator.channelId) errors.push('Missing channelId');
    } else if (platform === 'twitch') {
        if (!creator.login) errors.push('Missing login');
    }

    if (!creator.guildId) errors.push('Missing guildId');
    if (!creator.discordChannelId) errors.push('Missing discordChannelId');

    return errors;
}

/**
 * Transform creators.json format to database format
 */
function transformCreators(data) {
    const results = [];

    // Process YouTube creators
    if (data.youtube && Array.isArray(data.youtube)) {
        for (const creator of data.youtube) {
            const errors = validateCreator(creator, 'youtube');

            if (errors.length > 0) {
                logger.warn(`Skipping invalid YouTube creator`, { creator, errors });
                continue;
            }

            results.push({
                platform: 'youtube',
                externalId: creator.channelId,
                displayName: creator.displayName || creator.channelId,
                guildId: creator.guildId,
                channelId: creator.discordChannelId,
                mentionRoleId: creator.mentionRoleId || null,
            });
        }
    }

    // Process Twitch creators
    if (data.twitch && Array.isArray(data.twitch)) {
        for (const creator of data.twitch) {
            const errors = validateCreator(creator, 'twitch');

            if (errors.length > 0) {
                logger.warn(`Skipping invalid Twitch creator`, { creator, errors });
                continue;
            }

            results.push({
                platform: 'twitch',
                externalId: creator.login.toLowerCase(),
                displayName: creator.displayName || creator.login,
                guildId: creator.guildId,
                channelId: creator.discordChannelId,
                mentionRoleId: creator.mentionRoleId || null,
            });
        }
    }

    return results;
}

/**
 * Import creators from a file
 * @param {string} filePath - Path to creators.json
 */
export async function importFromFile(filePath) {
    logger.info(`Importing creators from: ${filePath}`);

    // Initialize database
    await initDatabase();

    // Load and parse file
    const data = loadCreatorsFile(filePath);

    // Transform to database format
    const creatorsData = transformCreators(data);

    if (creatorsData.length === 0) {
        logger.warn('No valid creators found in file');
        return { imported: 0, total: 0 };
    }

    // Import into database (async)
    const imported = await bulkImportCreators(creatorsData);

    logger.info(`✅ Successfully imported ${imported} creators`);

    // Print summary
    const youtubeCount = creatorsData.filter(c => c.platform === 'youtube').length;
    const twitchCount = creatorsData.filter(c => c.platform === 'twitch').length;

    logger.info(`📊 Summary:`);
    logger.info(`   YouTube: ${youtubeCount} channels`);
    logger.info(`   Twitch:  ${twitchCount} streamers`);

    return { imported, total: creatorsData.length };
}

/**
 * Export current creators to console (for verification)
 */
export async function listCreators() {
    await initDatabase();

    const youtubeCreators = await creators.getAllByPlatform('youtube');
    const twitchCreators = await creators.getAllByPlatform('twitch');

    console.log('\n=== YouTube Creators ===');
    for (const c of youtubeCreators) {
        console.log(`  ${c.display_name} (${c.external_id})`);
    }

    console.log('\n=== Twitch Creators ===');
    for (const c of twitchCreators) {
        console.log(`  ${c.display_name} (${c.external_id})`);
    }

    console.log(`\nTotal: ${youtubeCreators.length + twitchCreators.length} creators`);
}

// Run as standalone script
if (process.argv[1].includes('creators.js')) {
    const args = process.argv.slice(2);

    (async () => {
        if (args.includes('--list')) {
            await listCreators();
            process.exit(0);
        }

        // Default: import from creators.json
        const filePath = args[0] || resolve(config.paths.root, 'creators.json');

        try {
            const result = await importFromFile(filePath);
            console.log(`\nImport complete: ${result.imported}/${result.total} creators`);
            process.exit(0);
        } catch (error) {
            console.error(`\n❌ Import failed: ${error.message}`);
            process.exit(1);
        }
    })();
}

export default {
    importFromFile,
    listCreators,
};
