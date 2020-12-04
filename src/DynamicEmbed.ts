import {
    GuildEmoji,
    Message,
    MessageEmbed,
    MessageManager,
    MessageReaction,
    PartialUser,
    PermissionString,
    TextChannel,
    User,
} from 'discord.js';
import { CLIENT } from '.';
import { addCleanupCallback } from './utils/gracefulexit';
import { EventManager } from './utils/eventManager';
import { BLANK, decodeUrl, encodeToUrl, sendDM, logger } from './utils/utils';

// todo move to utils ?
// need to think a bit more about stopFn usage and arguments
async function lookupMessages(
    manager: MessageManager,
    findFn: (m: Message) => boolean,
    stopFn: (lastResult?: Message, lastMessage?: Message) => boolean,
    step = 5
) {
    let collection = manager.cache;
    const results = [];

    if (!stopFn(undefined, collection.last())) {
        /*eslint no-await-in-loop: "off"*/
        do {
            const founds = await Promise.all(collection.filter(findFn).map(f => f.fetch()));
            results.push(...founds);

            if (stopFn(founds[founds.length - 1], collection.last())) break;

            collection = await manager.fetch({
                before: collection.last()?.id,
                limit: step,
            });
        } while (collection.size > 0);
    }

    return results;
}

export type ReactionListener = (r: MessageReaction, u: User | PartialUser) => boolean;

export interface EmojiReaction {
    emoji: string | GuildEmoji;
    permision?: PermissionString | number;
    role?: string;
}

interface ReactionActionListener<T extends DynamicEmbedMessage> extends EmojiReaction {
    button?: false;
    /**
     * returns true if model has changed and message needs refresh
     */
    listener: (this: T, r: MessageReaction, u: User | PartialUser, removed: boolean) => boolean;
}

interface ButtonActionListener<T extends DynamicEmbedMessage> extends EmojiReaction {
    /**
     * reactions are used as a button, only the click event matters and we constantly remove user's reactions
     */
    button: true;
    /**
     * returns true if model has changed and message needs refresh
     */
    listener: (this: T, r: MessageReaction, u: User | PartialUser) => boolean;
}

export type ReactionAction<T extends DynamicEmbedMessage> =
    | ReactionActionListener<T>
    | ButtonActionListener<T>;

function isReactionAction<T extends DynamicEmbedMessage>(
    v: ReactionAction<T> | EmojiReaction
): v is ReactionAction<T> {
    return (v as ReactionAction<T>).listener !== undefined;
}

export const enum MSG_STATUS {
    OPEN,
    CLOSE,
    VALIDATED, // event only status, shouldn't be here
    DISCONNECTED,
    ERROR,
}

export class RenderError extends Error {}

/**
 * Base class to create dynamic embed message. Dynamic meaning user can react on message or use text commands and content will update accordingly.
 * All data are encoded in the author url which is hidden by default, subclass can still choose to set an author name but be aware this will be a broken link.
 * Url is encoded as follow :
 *   http://id.type.zz/
 * id: an unique id to the message, through `id`
 * type: an unique type of message, basically a static value for each subclass through `typeId`
 * zz: const value used to detect such url
 *
 * datas are passed either as path to the url or search params, those are returned by subclasses through `encodeData()`.
 * Be aware that URL have a max length of 2048 chars so we should try to be as concise as possible
 */
export abstract class DynamicEmbedMessage {
    // data used to generate unique hostname for identification
    private static readonly ext = 'zz';
    protected abstract readonly typeId: string;

    // TODO define an immutable model properties and check it to render instead of all the boolean return and the refresh() method ?
    // protected abstract model: T;

    get id(): string {
        return this.message.id;
    }

    // TODO number is too loose, extended class should create their own MSG_STATUS enum or extend MSG_STATUS somehow
    status: number = MSG_STATUS.OPEN;
    protected errors: Error[] = [];

    protected get message(): Message {
        return this.messages[0];
    }

    protected constructor(private channel: TextChannel, private messages: Message[]) {
        EventManager.get()
            .registerToReaction(messages, this.onReaction.bind(this))
            // TODO need to cover deletion of just embed message
            .registerLifecycle(messages, () => this.destroy());

        addCleanupCallback(() => this.disconnect());
    }

    protected async destroy(): Promise<void> {
        await this.disconnect();
    }

    protected async disconnect(): Promise<void> {
        EventManager.get().unregisterToReaction(this.messages).unregisterLifecycle(this.messages);

        this.status = MSG_STATUS.DISCONNECTED;
        await this.render();
    }

    protected static async findExistingMessages(
        channel: TextChannel,
        isMessage: (type: string, id: string, message: Message) => boolean,
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean
    ): Promise<
        {
            messages: Message;
            id: string;
            pathData: string[];
            paramData: { [k: string]: string[] };
        }[]
    >;
    // do some overload for the most likely extraMsg values (0, 1, 2)
    protected static async findExistingMessages(
        channel: TextChannel,
        isMessage: (type: string, id: string, message: Message) => boolean,
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean,
        extraMsg: 0
    ): Promise<
        {
            messages: Message;
            id: string;
            pathData: string[];
            paramData: { [k: string]: string[] };
        }[]
    >;
    protected static async findExistingMessages(
        channel: TextChannel,
        isMessage: (type: string, id: string, message: Message) => boolean,
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean,
        extraMsg: 1
    ): Promise<
        {
            messages: Message[];
            id: string;
            pathData: string[];
            paramData: { [k: string]: string[] };
        }[]
    >;
    protected static async findExistingMessages(
        channel: TextChannel,
        isMessage: (type: string, id: string, message: Message) => boolean,
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean,
        extraMsg: 2
    ): Promise<
        {
            messages: Message[];
            id: string;
            pathData: string[];
            paramData: { [k: string]: string[] };
        }[]
    >;
    protected static async findExistingMessages(
        channel: TextChannel,
        isMessage: (type: string, id: string, message: Message) => boolean,
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean,
        extraMsg: number
    ): Promise<
        {
            messages: Message | Message[];
            id: string;
            pathData: string[];
            paramData: { [k: string]: string[] };
        }[]
    >;
    protected static async findExistingMessages(
        channel: TextChannel,
        isMessage: (type: string, id: string, message: Message) => boolean,
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean,
        extraMsg = 0
    ): Promise<
        {
            messages: Message | Message[];
            id: string;
            pathData: string[];
            paramData: { [k: string]: string[] };
        }[]
    > {
        const matchFn = (m: Message) => {
            if (m.embeds.length !== 1) return false;

            const embed = m.embeds[0];
            const idUrl = embed.author?.url;

            if (idUrl == null) return false;

            // I think this is faster than parsing all url with URL() or even using a small regex
            // but is it robust enough ??
            const schemeEndIdx = idUrl[4] === 's' ? 8 : 7;
            const slashIdx = idUrl.indexOf('/', schemeEndIdx);

            const [id, type, ext] = idUrl
                .slice(schemeEndIdx, slashIdx === -1 ? undefined : slashIdx)
                .split('.');
            if (ext !== DynamicEmbedMessage.ext) return false;

            return isMessage(type, id, m);
        };

        const foundMessages = await lookupMessages(channel.messages, matchFn, stop);

        const res =
            extraMsg === 0
                ? Promise.resolve(foundMessages)
                : Promise.all(
                      foundMessages.map(message =>
                          // not sure if we need both cache and force
                          channel.messages
                              .fetch({ after: message.id, limit: extraMsg }, true, true)
                              .then(fetched => {
                                  if (
                                      fetched.every(
                                          m =>
                                              m.author.id === CLIENT.user?.id && m.content === BLANK
                                      )
                                  ) {
                                      return [message, ...fetched.array() /*values()*/];
                                  }

                                  // should we throw instead or trying to recover ?
                                  logger.error('failed getting extra message for reactions');
                                  return [message];
                              })
                      )
                  );

        return (<Promise<Message[] | Message[][]>>res).then(
            (messagesGroup: (Message | Message[])[]) =>
                messagesGroup.map((messages: Message | Message[]) => {
                    // ! usage : we're sure everything exists cause of the matchFn
                    const { id, pathData, paramData } = decodeUrl(
                        (Array.isArray(messages) ? messages[0] : messages).embeds[0].author!.url!
                    );

                    return {
                        messages,
                        id: id.split('.')[0],
                        pathData,
                        paramData,
                    };
                })
        );
    }

    /*eslint @typescript-eslint/no-explicit-any: "off"*/
    private currentReactions: (EmojiReaction | ReactionAction<any>)[] = [];

    /**
     *
     * @param actions React emoji may not be in same order as action's array if some were already present on message
     */
    protected async setupReactions<T extends DynamicEmbedMessage>(
        actions: (EmojiReaction | ReactionAction<T>)[]
    ): Promise<void> {
        const reactToDo = [...actions];

        // -- clear previous reactions and keep track of which needs to be added --
        for (const m of this.messages) {
            //TODO fetch if needed

            for (const [_, r] of m.reactions.cache) {
                const actionIdx = reactToDo.findIndex(
                    a => a.emoji === r.emoji || a.emoji === r.emoji.name
                );

                if (actionIdx < 0) {
                    r.remove();
                } else {
                    const users = await r.users.fetch();

                    // we've already reacted to it => no need to react again
                    if (users.find(u => u.id === CLIENT.user?.id)) {
                        reactToDo.splice(actionIdx, 1);
                    }
                }
            }
        }

        // -- set new actions --
        this.currentReactions = [...actions];

        // -- add missing reactions splitted across messages --
        const reactionsPerMessage = Math.min(20, Math.ceil(actions.length / this.messages.length));

        let messageIdx = 0;
        for (const a of reactToDo) {
            if (this.messages[messageIdx].reactions.cache.size >= reactionsPerMessage) {
                messageIdx++;

                if (messageIdx >= this.messages.length) {
                    throw 'Not enough messages for all reactions';
                }
            }

            await this.messages[messageIdx].react(a.emoji);
        }
    }

    private onReaction(r: MessageReaction, u: User | PartialUser, removed: boolean) {
        // could the check fail ? check emoji.id (guildEmoji) or emoji.name (string) instead ?
        const reaction = this.currentReactions.find(
            a => a.emoji === r.emoji || a.emoji === r.emoji.name
        );
        if (reaction == null) return;

        if (!isReactionAction<DynamicEmbedMessage>(reaction) || (reaction.button && removed)) {
            return;
        }

        if (
            reaction.permision != null &&
            // TODO may need to fetch members
            !(<TextChannel>this.message.channel).permissionsFor(u.id)?.has(reaction.permision)
        ) {
            // TODO more information on feedback message
            sendDM(
                u,
                `You don\'t have privileges to do this action
                If you don\'t remember what you did, try harder!
                I'll try to give more information in the future`
            );
            return true;
        }

        if (reaction.listener.call(this, r, u, removed)) {
            this.render();
        }

        return reaction.button;
    }

    /*eslint class-methods-use-this: "off"*/
    protected statusColor(status: number): string | undefined {
        switch (status) {
            case MSG_STATUS.OPEN:
                return '#00ff00';
            case MSG_STATUS.VALIDATED:
                return '#0000ff';
            case MSG_STATUS.DISCONNECTED:
                return '#ffa500';
            case MSG_STATUS.ERROR:
                return '#ff0000';
            case MSG_STATUS.CLOSE:
                return '#d600ff';
        }
    }

    public refresh(): void {
        this.render().catch(e => logger.error('error rendering %s', e));
    }

    protected static renderError(message: Message, errors: Error[]): Promise<Message> {
        if (message.embeds.length < 1) throw 'no embed message';

        const msg = message.embeds[0];
        msg.setFooter(errors.reduce((str, e) => str + '\n' + e.message, '')); //TODO add an error image
        msg.setColor('#ff0000');

        return message.edit(msg);
    }

    private async render(): Promise<Message> {
        if (this.message.deleted) throw new Error('Message is deleted');

        let result;
        try {
            let msg: MessageEmbed;
            if (this.status === MSG_STATUS.ERROR) {
                return DynamicEmbedMessage.renderError(this.message, this.errors);
            }

            if (this.status === MSG_STATUS.DISCONNECTED) {
                msg = this.message.embeds[0];
            } else {
                // todo should we clone the returned message ? new MessageEmbed(this.generateMessage)
                msg = await this.generateMessage();

                const { pathData, paramData } = this.encodeData();
                msg.setAuthor(
                    msg.author?.name || BLANK,
                    msg.author?.iconURL,
                    // we're encoding message.id in the url by default, not very useful...
                    //  either force id to be defined by subclass or make it optional
                    encodeToUrl(
                        this.id + '.' + this.typeId + '.' + DynamicEmbedMessage.ext,
                        pathData,
                        paramData
                    )
                );
            }

            if (msg.footer !== null) {
                //only way to delete footer is to create a new MessageEmbed
                msg.setFooter('');
            }

            msg.setColor(this.statusColor(this.status) || this.statusColor(MSG_STATUS.ERROR)!);

            result = await this.message.edit(msg);
        } catch (e) {
            logger.error('error rendering message', e);

            if (this.status !== MSG_STATUS.ERROR) {
                this.status = MSG_STATUS.ERROR;
                // TODO need to remove this error once it's resolved
                this.errors.push(new RenderError('error rendering message'));

                // try render with error status
                return this.render();
            }

            throw e;
        }

        return result;
    }

    // We could have simply stringify and url encode any data type but afraid we would reached the limit of 2048 chars pretty fast
    // So we enforce smarter encode of data through path for unique and order specific data and search params for the rest.
    protected abstract encodeData(): {
        pathData?: string[];
        paramData?: { [name: string]: string | string[] };
    };
    protected abstract async generateMessage(): Promise<MessageEmbed>;

    // ----- Utilities -----

    /**
     * Display strings in a grid of 3 columns. Each lines will take place in at least 1 line separated from the previous one.
     * Empty array won't display anything, if you want a visually empty line you should use `BLANK_LINE`.
     * Since a title is just a value with a bold visual effect you can add titles using makrdown to bold it. /!\ If you do so,
     * be aware that title bold is slighty smaller (600) than bold done by markdown (700) so you should probably also bold the
     * title using markdown in this case.
     *
     * @param message
     * @param title Main title to set on first line
     * @param lines Array of lines to display
     */
    /*eslint complexity: [warn, 12]*/
    static add3columnFields(
        message: MessageEmbed,
        title?: string | null,
        ...lines: string[][]
    ): void {
        if (title == null && lines.length === 0) {
            return;
        }

        const columns: string[][] = [[], [], []];

        for (const lineValues of lines) {
            if (lineValues.length === 0) continue;

            for (let i = 0; i < lineValues.length; i++) {
                columns[i % 3].push(lineValues[i]);
            }

            // fill with blank to create a *newline* effect
            const size = columns[0].length;
            if (columns[1].length < size) columns[1].push(BLANK);
            if (columns[2].length < size) columns[2].push(BLANK);
        }

        message.addField(title || BLANK, columns[0].length === 0 ? BLANK : columns[0], true);
        message.addField(BLANK, columns[1].length === 0 ? BLANK : columns[1], true);
        message.addField(BLANK, columns[2].length === 0 ? BLANK : columns[2], true);
    }

    static readonly BLANK_LINE = [BLANK];
}
