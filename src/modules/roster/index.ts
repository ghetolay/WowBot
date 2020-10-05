import { Guild, TextChannel } from 'discord.js';
import { logger } from '../../logger';
import { EventManager, FeedbackError } from '../../utils/eventManager';
import { isTextChannel } from '../../utils/utils';
import { RosterManager } from './rosterManager';
import { RosterMessage } from './rostermessage';

EventManager.getEventManager().registerCommand('roster', async(m) => {
    if (isTextChannel(m.message.channel)) {
        const title = m.reader.getString();
        if (title != null && title.length > 0) {
            const rosterMsg = await RosterMessage.create(m.message.channel, title);

            if (m.reader.getString() === 'default') {
                RosterManager.getRosterManager().setDefaultRoster(rosterMsg.id);
            }
        } else {
            throw new FeedbackError('no title find');
        }
    }
});

export function onGuildInit(g: Guild) {
    const channel = g.channels.cache.find(c => c.name === 'test-bot' && isTextChannel(c));

    if (channel != null) {
        return RosterMessage.load(channel as TextChannel)
            .then(v => v.forEach(rm => logger.info('loaded roster message: ', rm.title)));
    }
}
