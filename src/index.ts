import { Client } from 'discord.js';
import { assertWowClassAndSpecEmojis, setEmojiGuild } from './utils/emojis';
import { promisify, logger } from './utils/utils';
import findUp from 'find-up';

export const CLIENT = new Client();

findUp('config.json')
    .then(async configPath => {
        if (configPath === undefined) throw "can't find config.json file";

        const config = await import(configPath);
        if (config.BOT_TOKEN == null) throw 'no token found';

        CLIENT.login(config.BOT_TOKEN);

        // TODO define spec for modules and load them dynamically from a folder
        const modules = ['./modules/roster/index', './modules/events/index'].map(path =>
            import(path).catch(e => logger.error('failed loading module %s', e))
        );

        CLIENT.on('ready', async () => {
            try {
                const perso = await CLIENT.guilds.fetch(config.EMOJI_GUILD_ID);
                setEmojiGuild(perso);

                assertWowClassAndSpecEmojis();
            } catch (err) {
                logger.error('error perso server: ' + err);
            }

            try {
                // do we need to fetch all guilds ? how ?
                const guilds = CLIENT.guilds.cache.filter(g => g.id !== config.EMOJI_GUILD_ID);

                await Promise.all(
                    modules.map(loadingModule =>
                        loadingModule
                            .then(m => {
                                if (typeof m.onGuildInit == 'function') {
                                    return guilds.map(g => promisify(m.onGuildInit(g)));
                                }
                            })
                            .catch(e => logger.error('error during module init: %s', e))
                    )
                );
            } catch (e) {
                logger.error('error loading modules: %s', e);
            }

            logger.info('--- BOT INITIATED ---');
        });

        // TODO init module when bot join a new guild
    })
    .catch(e => logger.error('Unable to setup bot running: %s', e));

// TODO let modules finish their init before we stop process
// nodeCleanup()
