/**
 * Script to force re-register slash commands
 * This clears and re-registers all commands to fix caching issues
 */

import { REST, Routes } from 'discord.js';
import { config } from '../src/config/index.js';
import { loadCommands } from '../src/commands/index.js';

async function main() {
    console.log('🔧 Force re-registering slash commands...\n');

    const rest = new REST().setToken(config.discord.token);

    try {
        // Load commands
        const commands = await loadCommands();
        const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());

        console.log(`📋 Found ${commandData.length} commands to register`);

        // Log the remove command specifically
        const removeCmd = commandData.find(c => c.name === 'remove');
        if (removeCmd) {
            console.log('\n🔍 Remove command options:');
            removeCmd.options.forEach(opt => {
                console.log(`   - ${opt.name}: autocomplete=${opt.autocomplete ?? false}`);
            });
        }

        if (config.discord.devGuildId) {
            console.log(`\n🗑️  Clearing existing guild commands...`);
            await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, config.discord.devGuildId),
                { body: [] }
            );
            console.log('✅ Cleared!');

            console.log(`\n📤 Re-registering ${commandData.length} commands to guild ${config.discord.devGuildId}...`);
            await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, config.discord.devGuildId),
                { body: commandData }
            );
            console.log('✅ Commands registered!');
        } else {
            console.log('⚠️  No DEV_GUILD_ID set, registering globally...');
            await rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: commandData }
            );
            console.log('✅ Commands registered globally (may take up to 1 hour)');
        }

        console.log('\n🎉 Done! Restart your bot and try /remove again.');
        console.log('💡 Tip: Also press Ctrl+R in Discord to reload the client.');

    } catch (error) {
        console.error('❌ Error:', error);
    }

    process.exit(0);
}

main();
