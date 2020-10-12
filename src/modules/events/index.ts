import { addMonths } from 'date-fns';
import { Guild, TextChannel } from 'discord.js';
import { EventManager, FeedbackError } from '../../utils/eventManager';
import { isProd, isTextChannel, logger } from '../../utils/utils';
import { RosterManager } from '../roster/rosterManager';
import { CalendarEvent } from './calendarEvent';

const DEFAULT_HOUR = 20;
const DEFAULT_MINUTE = 45;

//todo command to show them and define them
const default_icons = [
    'https://wow.zamimg.com/images/wow/icons/large/spell_holy_championsbond.jpg',
    'https://wow.zamimg.com/images/wow/icons/large/achievement_pvp_legion08.jpg',
    'https://wow.zamimg.com/images/wow/icons/large/achievement_bg_tophealer_eos.jpg',
    'https://wow.zamimg.com/images/wow/icons/large/spell_holy_borrowedtime.jpg',
    'https://wow.zamimg.com/images/wow/icons/large/inv_letter_20.jpg',
];

/*eslint complexity: [warn, 16]*/
EventManager.get().registerCommand('event', async m => {
    if (isTextChannel(m.message.channel)) {
        // Date
        const dateStr = m.reader.getString();
        let date: Date;

        try {
            if (
                dateStr == null ||
                dateStr.length < 2 ||
                dateStr.length > 8 ||
                dateStr.length % 2 !== 0
            ) {
                throw 'invalid date command size';
            }

            date = new Date();
            const day = parseInt(dateStr.slice(0, 2));

            if (dateStr.length > 2) {
                date.setMonth(parseInt(dateStr.slice(2, 4)) - 1, day);
            } else {
                if (day < date.getDate()) {
                    date = addMonths(date, 1);
                }
                date.setDate(day);
            }

            if (dateStr.length > 4) {
                date.setHours(parseInt(dateStr.slice(4, 6)));
                // set minutes by default to 0 or default ? not so sure. 0 atm
                date.setMinutes(dateStr.length > 6 ? parseInt(dateStr.slice(6, 8)) : 0);
            } else {
                date.setHours(DEFAULT_HOUR, DEFAULT_MINUTE);
            }

            date.setSeconds(0);
            date.setMilliseconds(0);
        } catch {
            throw new FeedbackError('Invalid date');
        }

        // roster id or name
        const rosterStr = m.reader.getString();
        const roster =
            rosterStr == null
                ? RosterManager.get().getDefaultRoster()
                : RosterManager.get().getRoster(rosterStr);
        if (roster == null)
            throw new FeedbackError('unable to find roster : ' + rosterStr || 'default roster');

        // icon
        let iconUrl = m.reader.getString() || default_icons[0];
        const iconIdx = parseInt(iconUrl);
        if (!isNaN(iconIdx)) {
            iconUrl = default_icons[Math.max(0, Math.min(default_icons.length - 1, iconIdx))];
        }

        // description
        const desc = m.reader.getString();

        await CalendarEvent.create(m.message.channel, date, roster, undefined, desc, iconUrl);
    }
});

export async function onGuildInit(g: Guild): Promise<void> {
    const channel = g.channels.cache.find(
        c => c.name.indexOf(isProd() ? 'calendar' : 'test-bot') >= 0 && isTextChannel(c)
    );

    if (channel != null) {
        const events = await CalendarEvent.load(channel as TextChannel);
        logger.info('loaded ' + events.length + ' events');
    } else {
        logger.warn('Missing calendar event channel');
    }
}
