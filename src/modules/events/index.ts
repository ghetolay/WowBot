import { addMonths } from 'date-fns';
import { Guild, TextChannel } from 'discord.js';
import { logger } from '../../logger';
import { EventManager, FeedbackError } from '../../utils/eventManager';
import { isTextChannel } from '../../utils/utils';
import { RosterManager } from '../roster/rosterManager';
import { CalendarEvent } from './calendarEvent';

const DEFAULT_HOUR = 20;
const DEFAULT_MINUTE = 45;

EventManager.getEventManager().registerCommand('event', async(m) => {
    if (isTextChannel(m.message.channel)) {
        // Date
        const dateStr = m.reader.getString();
        let date: Date;

        try {
            if (dateStr == null || dateStr.length < 2 || dateStr.length > 8 || dateStr.length%2 !== 0) {
                throw 'invalid date command size';
            }

            date = new Date();
            const day = parseInt(dateStr.slice(0, 2));

            if (dateStr.length > 2) {
                date.setMonth(parseInt(dateStr.slice(2, 4)) - 1, day);
            } else {
                if (day < date.getDate()){
                    date = addMonths(date, 1);
                }
                date.setDate(day);
            }

            if (dateStr.length > 4) {
                date.setHours(parseInt(dateStr.slice(4, 6)));
                // set minutes by default to 0 or default ? not so sure. 0 atm
                date.setMinutes(dateStr.length > 6 ? parseInt(dateStr.slice(6, 8)) : 0)
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
        const roster = rosterStr == null ? RosterManager.getRosterManager().getDefaultRoster() : RosterManager.getRosterManager().getRoster(rosterStr);
        if (roster == null) throw new FeedbackError('unable to find roster : ' + rosterStr || 'default roster');

        // description
        const desc = m.reader.getString();


        await CalendarEvent.create(m.message.channel, date, roster, undefined, desc);
    }
});

export function onGuildInit(g: Guild) {
    const channel = g.channels.cache.find(c => c.name === 'test-bot' && isTextChannel(c));

    if (channel != null) {
        return CalendarEvent.load(channel as TextChannel)
            .then(v => logger.info('loaded ' + v.length + ' events'));
    }
}