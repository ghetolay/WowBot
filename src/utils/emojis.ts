import { Guild, GuildEmoji, Emoji } from 'discord.js';
import { logger } from './utils';
import { WowSpec, WowClass, WowClasses, WowClasseNames, WowSpecs, WowSpecId } from '../model';

export const emojis: { [name: string]: GuildEmoji | string } = {};

let emojiGuild: Guild;
export function setEmojiGuild(guild: Guild): void {
    if (emojiGuild != null) throw 'EmojiGuild already set';
    emojiGuild = guild;
}

export function assertWowClassAndSpecEmojis(): void {
    // todo fetch ??
    const emojiCollection = emojiGuild.emojis.cache;

    const notFound: string[] = [];

    const checkEmoji = (emojiName: string) => {
        const lowercase = emojiName.toLowerCase();
        const emoji = emojiCollection.find(e => e.name === lowercase);
        if (emoji == null) {
            notFound.push(lowercase);
        }

        return emoji;
    };

    // check classes
    for (const className in WowClasses) {
        const wowClass: WowClass = WowClasses[className as WowClasseNames];
        checkEmoji(wowClass.emojiName);
    }

    // check specs
    for (const specName in WowSpecs) {
        const spec: WowSpec = WowSpecs[specName as WowSpecId];
        checkEmoji(spec.emojiName);
    }

    if (notFound.length > 0) {
        throw 'Emojis not found: ' + notFound.reduce((prev, curr) => prev + curr + ', ', '');
    }
}

export function getSpecEmoji(spec: WowSpec): GuildEmoji | undefined {
    if (emojiGuild != null) {
        const emojiName = spec.emojiName.toLowerCase();
        const emoji = emojiGuild.emojis.cache.find(e => e.name === emojiName);

        if (emoji != null) {
            return emoji;
        }
        // TODO put warn back once all emoji are done
        // logger.warn('Emoji not found: ' + emojiName);
    } else {
        logger.warn('Emoji guild not set yet');
    }
}

// TODO just keep a map of emoji name to spec ?
export function getSpecFromEmoji(emoji: Emoji | string): WowSpec | undefined {
    const emojiId = (emoji as Emoji).id || emoji;

    for (const specName in WowSpecs) {
        const spec: WowSpec = WowSpecs[specName as WowSpecId];

        if (getSpecEmoji(spec)?.id === emojiId) {
            return spec;
        }
    }
}
