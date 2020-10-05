import { TextChannel, Snowflake, Channel, Message } from 'discord.js';
import { format, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import emojiStrip from 'emoji-strip';
import { CLIENT } from '../index';
import { URL } from 'url';
export { CLIENT };

export const PREFIX = "!";
export const BLANK = '\u200b';
export const NOBREAK_SPACE = '\u00a0';
//bigger space
export const EMQUAD = '\u2000';

// when we need guard, like filter functions
export function notNull<T>(v: T | undefined | null): v is T {
    return v != null;
}

export function promisify<T>(v: T | Promise<T>): Promise<T> {
    return isPromise(v) ? v : Promise.resolve(v);
}

export function promisifyFnCall<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
        return promisify(fn());
    } catch(e) {
        return Promise.reject(e);
    }
}

export function isPromise<T>(p: Promise<T> | any): p is Promise<T> {
    return p != null && typeof p.then === 'function';
}

export function getMember(channel: TextChannel, userId: Snowflake) {
    // TODO if not in channel, warn about the fact user is not permitted on channel anymore
    return (channel.members.get(userId) || channel.guild.members.cache.get(userId));
}

export function getMemberName(channel: TextChannel, userId: Snowflake) {
    // TODO maybe keep displayname on the url link so if we don't find member anymore we use that
    return getMember(channel, userId)?.displayName;
}

export function isTextChannel(channel: Channel): channel is TextChannel{
    return channel.type === 'text';
}

export function link(message: Message) {
    // TODO handle when reference is null and '@me' instead of guildID when it's a DM
    return `http://discordapp.com/channels/${message.reference?.guildID || message.guild?.id}/${message.reference?.channelID || message.channel.id}/${message.reference?.messageID || message.id}`;
}

export function formatList(list: string[], separator = ', ') {
    return list.reduce((c, p) => c + p + separator, '').slice(0, -separator.length);
}

/** 
 * return value formatted based on n and objective
 * if n != objective : underline
 * if n >= objective : bold
 * if n < objective  : italic
 * */ 
export function formatObjective(value: string | number, n: number, objective: number) {
    let str = value + '';

    if (n != objective) {
        str = '__' + str + '__';
    }
    
    if (n < objective) {
        str = '*' + str + '*';
    } else {
        str = '**' + str + '**';
    }

    return str;
}

export function capitalize(str: string) {
    return str[0].toUpperCase() + str.slice(1);
}

export function clear(str: string) {
    // TODO benchmark emojiStrip this may be too good for our needs and so probably too slow
    return emojiStrip(str.trim());
}

export function localStartWith(str1: string, str2: string) {
    let smallest, biggest;
    if (str1.length < str2.length) {
        smallest = str1;
        biggest = str2;
    } else {
        smallest = str2;
        biggest = str1;
    }

    return biggest.slice(0, smallest.length).localeCompare(smallest, ['fr', 'en'], {usage: 'search', ignorePunctuation: true, sensitivity: 'base'}) === 0;
}

export function formatDate(date: Date | number) {
    // capitalize day of week and month (not default in french)
    return capitalize(format(date, "EEEE dd ", {locale: fr})) + capitalize(format(date, "MMMM HH'h'mm", {locale: fr}));
}

export function parseDate(dateStr: string) {
    const parsedDate = parse(dateStr, "EEEE dd MMMM HH'h'mm", new Date(), {locale: fr});
    return isNaN(parsedDate as any) ? null : parsedDate;
}

export function formatPlayer(channel: TextChannel, playerId: string, data: {[key: string]: (string | string[])} = {}, bold = false) {
     // TODO handle playerId is wrong/absent
     let playerStr = `[${getMemberName(channel, playerId) || 'unknown'}](${encodeToUrl(playerId, undefined, data)})`;
     if (bold) playerStr = '**' + playerStr + '**';

     return playerStr;
}

export interface UrlEncodedData {
    id: string, 
    pathData: string[],
    paramData: { 
        [k: string]: string[]
    }
}

export function encodeToUrl(id: string, pathData?: string[], paramData?: {[key: string]: (string | string[])}) {
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

export function decodeUrl(urlStr: string) {
    const url = new URL(urlStr);
    const { searchParams } = url;

    const result: UrlEncodedData = {
        id: url.hostname,
        pathData: url.pathname.split('/').filter(v => v.length > 0),
        paramData: {},
    };

    for (const k of searchParams.keys()) {
       if (result.paramData[k] !== undefined) {
           continue;
       }

       result.paramData[k] = searchParams.getAll(k);
    }

    return result;
}
