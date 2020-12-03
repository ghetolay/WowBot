import {
    TextChannel,
    Snowflake,
    Channel,
    Message,
    GuildMember,
    User,
    DMChannel,
    PartialUser,
    MessageEmbed,
} from 'discord.js';
import { format as fnsFormat, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import emojiStrip from 'emoji-strip';
import { URL } from 'url';
import { createLogger, format, transports } from 'winston';

export const PREFIX = '!';
export const BLANK = '\u200b';
export const EMQUAD = '\u2001';

/* --- Base --- */

export function isProd(): boolean {
    return process.env.NODE_ENV === 'production';
}

// when we need guard, like filter functions
export function notNull<T>(v: T | undefined | null): v is T {
    return v != null;
}

/* --- Promise --- */

export function promisify<T>(v: T | Promise<T>): Promise<T> {
    return isPromise(v) ? v : Promise.resolve(v);
}

export function promisifyFnCall<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
        return promisify(fn());
    } catch (e) {
        return Promise.reject(e);
    }
}

export function isPromise<T>(p: Promise<T> | T): p is Promise<T> {
    return p != null && typeof (p as Promise<T>).then === 'function';
}

/* --- Dicordjs related --- */

export async function getMember(
    channel: TextChannel,
    userId: Snowflake
): Promise<GuildMember | undefined> {
    // TODO if not in channel, warn about the fact user is not permitted on channel anymore
    const member = channel.members.get(userId) || channel.guild.members.cache.get(userId);
    if (member != null) return member;

    // TODO fetch for every user we don't find is too much, we need some timer on this
    const membersUpdated = await channel.guild.members.fetch();
    return membersUpdated.get(userId);
}

export async function getMemberName(
    channel: TextChannel,
    userId: Snowflake
): Promise<string | undefined> {
    // TODO maybe keep displayname on the url link so if we don't find member anymore we use that
    return (await getMember(channel, userId))?.displayName;
}

export function isTextChannel(channel: Channel): channel is TextChannel {
    return channel.type === 'text';
}

export function link(message: Message): string {
    // TODO handle when reference is null and '@me' instead of guildID when it's a DM
    return `http://discordapp.com/channels/${message.reference?.guildID || message.guild?.id}/${
        message.reference?.channelID || message.channel.id
    }/${message.reference?.messageID || message.id}`;
}

/* --- String --- */

export function formatList(list: string[], separator = ', '): string {
    return list.reduce((c, p) => c + p + separator, '').slice(0, -separator.length);
}

/**
 * return value formatted based on n and objective
 * if n != objective : underline
 * if n >= objective : bold
 * if n < objective  : italic
 * */
export function formatObjective(value: string | number, n: number, objective: number): string {
    let str = value + '';

    if (n !== objective) {
        str = '__' + str + '__';
    }

    if (n < objective) {
        str = '*' + str + '*';
    } else {
        str = '**' + str + '**';
    }

    return str;
}

/* not used
export async function formatPlayer(
    channel: TextChannel,
    playerId: string,
    data: { [key: string]: string | string[] } = {},
    bold = false
): string {
    // TODO handle playerId is wrong/absent
    let playerStr = `[${await getMemberName(channel, playerId) || 'unknown'}](${encodeToUrl(
        playerId,
        undefined,
        data
    )})`;
    if (bold) playerStr = '**' + playerStr + '**';

    return playerStr;
}
*/

export function capitalize(str: string): string {
    return str[0].toUpperCase() + str.slice(1);
}

export function clear(str: string): string {
    // TODO benchmark emojiStrip this may be too good for our needs and so probably too slow
    return emojiStrip(str.trim());
}

export function localStartWith(str1: string, str2: string): boolean {
    let smallest, biggest;
    if (str1.length < str2.length) {
        smallest = str1;
        biggest = str2;
    } else {
        smallest = str2;
        biggest = str1;
    }

    return (
        biggest.slice(0, smallest.length).localeCompare(smallest, ['fr', 'en'], {
            usage: 'search',
            ignorePunctuation: true,
            sensitivity: 'base',
        }) === 0
    );
}

/* --- Date --- */

export function formatDate(date: Date | number): string {
    // capitalize day of week and month (not default in french)
    return (
        capitalize(fnsFormat(date, 'EEEE dd ', { locale: fr })) +
        capitalize(fnsFormat(date, "MMMM HH'h'mm", { locale: fr }))
    );
}

export function parseDate(dateStr: string): Date | null {
    const parsedDate = parse(dateStr, "EEEE dd MMMM HH'h'mm", new Date(), {
        locale: fr,
    });
    return isNaN((parsedDate as unknown) as number) ? null : parsedDate;
}

/* --- URL --- */

export interface UrlEncodedData {
    id: string;
    pathData: string[];
    paramData: {
        [k: string]: string[];
    };
}

export function encodeToUrl(
    id: string,
    pathData?: string[],
    paramData?: { [key: string]: string | string[] }
): string {
    const url = new URL('http://' + id);

    if (pathData != null) {
        url.pathname = pathData.reduce((str, d) => str + (d.length > 0 ? '/' + d : ''), '');
    }

    if (paramData != null) {
        const { searchParams } = url;
        for (const k in paramData) {
            const d = paramData[k];

            if (Array.isArray(d)) {
                for (const v of d) {
                    searchParams.append(k, v);
                }
            } else {
                searchParams.set(k, d);
            }
        }
    }

    return url.href;
}

export function decodeUrl(urlStr: string): UrlEncodedData {
    const url = new URL(urlStr);
    const { searchParams } = url;

    const result: UrlEncodedData = {
        id: url.hostname,
        pathData: url.pathname
            .split('/')
            .filter(v => v.length > 0)
            .map(decodeURIComponent),
        paramData: {},
    };

    for (const k of searchParams.keys()) {
        if (result.paramData[k] !== undefined) {
            continue;
        }

        result.paramData[k] = searchParams.getAll(k).map(decodeURIComponent);
    }

    return result;
}

/* --- Logger --- */
export const logger = createLogger({
    level: 'info',
    format:
        process.env.NODE_ENV === 'production'
            ? format.combine(
                  format.timestamp({
                      format: 'YYYY/MM/DD HH:mm:ss',
                  }),
                  format.errors({ stack: true }),
                  format.splat(),
                  format.json()
              )
            : format.combine(format.colorize(), format.splat()),
    transports:
        process.env.NODE_ENV === 'production'
            ? [
                  new transports.File({
                      filename: 'error.log',
                      level: 'error',
                  }),
                  new transports.File({ filename: 'info.log' }),
              ]
            : [
                  new transports.Console({
                      format: format.combine(format.colorize(), format.simple()),
                      level: 'verbose',
                  }),
              ],
});

/* --- Fun --- */
const euralieId = '280315059127844865';

/**
 * function for fun only, customize how bot send pm's based on user
 * @param chanOrUser
 * @param msg
 */
export function sendDM(
    chanOrUser: DMChannel | User | PartialUser,
    msg: string | MessageEmbed
): Promise<Message> {
    const userId = ((chanOrUser as DMChannel).recipient || chanOrUser).id;

    let message;
    switch (userId) {
        case euralieId:
            message = '❤️' + msg + '❤️';
            break;
        default:
            message = msg;
    }

    return chanOrUser.send(message);
}
