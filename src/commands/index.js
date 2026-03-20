/**
 * Command handler
 * Loads, registers, and handles slash commands
 */

import { Collection, REST, Routes, Events, ActivityType, MessageFlags } from 'discord.js';
import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Commands');
const __dirname = dirname(fileURLToPath(import.meta.url));

// Store commands
export const commands = new Collection();

/**
 * Load all commands from the commands directory
 */
export async function loadCommands() {
    const commandFiles = readdirSync(__dirname).filter(
        file => file.endsWith('.js') && file !== 'index.js'
    );

    for (const file of commandFiles) {
        const filePath = join(__dirname, file);
        const fileUrl = pathToFileURL(filePath).href;

        try {
            const command = await import(fileUrl);

            if ('data' in command && 'execute' in command) {
                commands.set(command.data.name, command);
                logger.debug(`Loaded command: ${command.data.name}`);
            } else {
                logger.warn(`Command ${file} is missing required "data" or "execute" property`);
            }
        } catch (error) {
            logger.error(`Failed to load command ${file}`, { error: error.message });
        }
    }

    logger.info(`✅ Loaded ${commands.size} commands`);
    return commands;
}

/**
 * Register slash commands with Discord API
 * @param {Client} client - Discord.js client
 */
export async function registerCommands(client) {
    if (!config.discord.clientId) {
        logger.error('DISCORD_CLIENT_ID is not set. Cannot register slash commands.');
        return;
    }

    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());

    const rest = new REST().setToken(config.discord.token);

    try {
        logger.info(`Registering ${commandData.length} slash commands...`);

        // Always register commands globally (works in all servers)
        logger.info('Registering commands globally...');
        await rest.put(
            Routes.applicationCommands(config.discord.clientId),
            { body: commandData }
        );
        logger.info(`✅ Successfully registered ${commandData.length} slash commands globally`);

        // Also register to dev guild for instant updates during development
        if (config.discord.devGuildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, config.discord.devGuildId),
                { body: commandData }
            );
            logger.info(`✅ Also registered to DEV guild ${config.discord.devGuildId} (Instant)`);
        }

    } catch (error) {
        logger.error('Failed to register slash commands', { error: error.message });
    }
}

/**
 * Set up command interaction handler
 * @param {Client} client - Discord.js client
 */
export function setupCommandHandler(client) {
    client.on(Events.InteractionCreate, async interaction => {
        // Handle Chat Input Commands
        if (interaction.isChatInputCommand()) {
            const command = commands.get(interaction.commandName);

            if (!command) {
                logger.warn(`Unknown command: ${interaction.commandName}`);
                return;
            }

            try {
                logger.debug(`Executing command: ${interaction.commandName}`, {
                    user: interaction.user.tag,
                    guild: interaction.guild?.name,
                });

                await command.execute(interaction);
            } catch (error) {
                logger.error(`Error executing command ${interaction.commandName}`, {
                    error: error.message,
                    stack: error.stack,
                });

                const errorMessage = {
                    content: '❌ There was an error executing this command.',
                    flags: MessageFlags.Ephemeral,
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        // Handle Autocomplete interactions
        else if (interaction.isAutocomplete()) {
            const command = commands.get(interaction.commandName);

            if (!command) {
                logger.warn(`Unknown autocomplete command: ${interaction.commandName}`);
                return;
            }

            try {
                if (typeof command.autocomplete === 'function') {
                    logger.debug(`Calling autocomplete for: ${interaction.commandName}`);
                    await command.autocomplete(interaction);
                } else {
                    logger.warn(`No autocomplete handler for: ${interaction.commandName}`);
                    await interaction.respond([]);
                }
            } catch (error) {
                logger.error(`Error handling autocomplete for ${interaction.commandName}`, {
                    error: error.message,
                });
            }
        }
    });

    logger.info('✅ Command handler set up');
}

/**
 * Set bot presence/activity
 * @param {Client} client - Discord.js client
 */
export function setPresence(client) {
    const activityTypes = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        COMPETING: ActivityType.Competing,
    };

    const activityType = activityTypes[config.discord.activityType] || ActivityType.Watching;

    client.user.setPresence({
        status: config.discord.status,
        activities: [
            {
                name: config.discord.activityText,
                type: activityType,
            },
        ],
    });

    logger.info(`✅ Bot presence set: ${config.discord.activityType} ${config.discord.activityText}`);
}

/**
 * Update presence with dynamic text (e.g., creator count)
 * @param {Client} client - Discord.js client
 * @param {string} text - Activity text
 */
export function updatePresence(client, text) {
    const activityTypes = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        COMPETING: ActivityType.Competing,
    };

    const activityType = activityTypes[config.discord.activityType] || ActivityType.Watching;

    client.user.setPresence({
        status: config.discord.status,
        activities: [
            {
                name: text,
                type: activityType,
            },
        ],
    });
}

export default {
    commands,
    loadCommands,
    registerCommands,
    setupCommandHandler,
    setPresence,
    updatePresence,
};
