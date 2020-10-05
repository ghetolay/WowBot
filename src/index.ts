import { Client } from 'discord.js';
import { logger } from './logger';
import * as config from '../config.json';
import { assertWowClassAndSpecEmojis, setEmojiGuild } from './emojis';
import { promisify } from './utils/utils';

const GUILD_PERSO_ID = '621364914006786060';

export const CLIENT = new Client();
CLIENT.login(config.BOT_TOKEN);

const modules = ['./modules/roster/index', './modules/events/index'].map(path => 
    import(path)
        .catch(e => logger.error('failed loading module', e))
);

CLIENT.on('ready', async() => {
    try {
        const perso = await CLIENT.guilds.fetch(GUILD_PERSO_ID);
        setEmojiGuild(perso);

        assertWowClassAndSpecEmojis();
    } catch (err) {
        logger.error('error perso server: ' + err);
    }

    try {   
        // do we need to fetch all guilds ? how ?
        const guilds =  CLIENT.guilds.cache.filter(g => g.id !== GUILD_PERSO_ID);;
        
        await Promise.all(modules.map(loadingModule => loadingModule
            .then(m => {
                if (typeof m.onGuildInit == 'function') {
                    return guilds.map(g => promisify(m.onGuildInit(g)));                   
                }
            })
            .catch(e => logger.error('error during module init', e))
        ));        
    } catch (e) {
        logger.error('error creating roster and event managers :', e);
    }

    logger.info('--- BOT INITIATED ---');
});

// TODO let modules finish their init before we stop process
// nodeCleanup()
