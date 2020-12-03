import { Guild, TextChannel } from 'discord.js';
import { EventManager, FeedbackError } from '../../utils/eventManager';
import { isProd, isTextChannel, logger } from '../../utils/utils';
import { RosterManager } from './rosterManager';
import { RosterMessage } from './rostermessage';

EventManager.get().registerCommand('roster', async m => {
    if (isTextChannel(m.message.channel)) {
        const title = m.reader.getString();
        if (title != null && title.length > 0) {
            const rosterMsg = await RosterMessage.create(m.message.channel, title);

            if (m.reader.getString() === 'default') {
                RosterManager.get().setDefaultRoster(rosterMsg.id);
            }
        } else {
            throw new FeedbackError('no title found');
        }
    }
});

export async function onGuildInit(g: Guild): Promise<void> {
    const channel = g.channels.cache.find(
        c =>
            (isProd() ? c.id === '745589331623936022' : c.name.indexOf('test-bot') >= 0) &&
            isTextChannel(c)
    );

    if (channel != null) {
        (await RosterMessage.load(channel as TextChannel)).forEach(rm =>
            logger.info('loaded roster message: ' + rm.title)
        );
    } else {
        logger.warn('Missing roster channel');
    }
}
