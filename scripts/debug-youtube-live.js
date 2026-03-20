
import { initDatabase, closeDatabase } from '../src/database/index.js';
import { creators } from '../src/database/queries.js';
import { fetchChannelRSS, getVideoDetails } from '../src/services/youtube.js';
import config from '../src/config/index.js';
import { writeFileSync } from 'fs';

async function main() {
    let report = '';
    const log = (msg) => {
        console.log(msg);
        report += msg + '\n';
    };

    log('--- YOUTUBE DEBUGGER (TOP 5 CHECK) ---');

    try {
        await initDatabase();

        const ytCreators = await creators.getAllByPlatform('youtube');
        log(`Found ${ytCreators.length} YouTube creators in DB.`);

        for (const creator of ytCreators) {
            log(`\nChecking ${creator.display_name} (${creator.external_id})...`);

            // 1. Check RSS
            log('  Fetching RSS feed...');
            const rssEntries = await fetchChannelRSS(creator.external_id);
            log(`  RSS returned ${rssEntries.length} entries.`);

            if (rssEntries.length > 0) {
                // Check top 5 entries
                const latestEntries = rssEntries.slice(0, 5);
                log(`  Checking Top ${latestEntries.length} RSS entries...`);

                const videosToCheck = latestEntries.map(e => e['yt:videoId']);
                log(`  Video IDs to check: ${videosToCheck.join(', ')}`);

                // Log titles for context
                latestEntries.forEach((e, i) => {
                    log(`    RSS[${i}]: ${e.title} (${e['yt:videoId']})`);
                });

                try {
                    const details = await getVideoDetails(videosToCheck);

                    for (const video of details) {
                        const liveDetails = video.liveStreamingDetails;
                        const isLive = liveDetails?.actualStartTime && !liveDetails?.actualEndTime;

                        log(`    API Result for [${video.id}]:`);
                        log(`      Title: ${video.snippet.title}`);
                        log(`      Live Status: ${isLive ? 'LIVE 🔴' : 'OFFLINE ⚫'}`);
                        if (liveDetails) {
                            if (liveDetails.actualStartTime) log(`      actualStartTime: ${liveDetails.actualStartTime}`);
                            if (liveDetails.actualEndTime) log(`      actualEndTime: ${liveDetails.actualEndTime}`);
                            if (!liveDetails.actualEndTime && liveDetails.actualStartTime) log(`      (Stream is currently LIVE)`);
                        } else {
                            log(`      No liveStreamingDetails (Regular Video)`);
                        }
                    }

                    if (details.length === 0) {
                        log(`    ⚠️ No video details returned from API for these IDs!`);
                    }
                } catch (e) {
                    log(`    ⚠️ API Check Failed: ${e.message}`);
                }
            } else {
                log('  ⚠️ RSS is empty! Bot cannot see any videos.');
            }
        }

        writeFileSync('youtube-debug.log', report);
        log('\n✅ Report saved to youtube-debug.log');

    } catch (error) {
        console.error('Error:', error);
        try {
            writeFileSync('youtube-debug.log', report + '\nError: ' + error.message);
        } catch (e) { }
    } finally {
        await closeDatabase();
        process.exit(0);
    }
}

main();
