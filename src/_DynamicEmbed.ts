import { Emoji, Message, ReactionEmoji, GuildEmoji, Constants, User, PartialUser, MessageReaction, TextChannel, ClientEvents, MessageEmbed, MessageManager } from 'discord.js';
import { addListener } from 'process';
import { parse, ParsedMessage } from 'discord-command-parser';
import { BLANK, CLIENT, PREFIX } from './utils/utils';

// todo move to utils ?
async function lookupMessage(manager: MessageManager, condition: (m: Message) => boolean, step = 10) {
    let collection = manager.cache;
    let before;
    do{
        const result = collection.find(condition);
         if(result) return await result.fetch();

        // todo setup before
        const last = collection.last();
        if (last != null) {
            before = last.id;
        }

        collection = await manager.fetch({before, limit: step});
    } while( collection.size > 0 ) 
}

export type ReactionListener = (r: MessageReaction, u: User | PartialUser) => boolean;

export interface DynamicEmbedMessageBuilder<T extends DynamicEmbedMessage, M> {
    newInstance(channel: TextChannel, m: Message[], model: any): T;
    isMessage(m: MessageEmbed): boolean;
    parseMessage(m: MessageEmbed): M;
}

export abstract class DynamicEmbedMessage {

    protected message: Message;
    private listeners: [keyof ClientEvents, (...args: any) => void][] = [];

    private addListener(event: keyof ClientEvents, filter: (...args: any) => boolean, userListener?: (...args: any) => boolean) {
        if (userListener != null) {
            const listener = (...args: any[]) => {
                if (filter.apply(this, args)) return;
                if(userListener.apply(this, args)) {
                    this.render();
                }
            };
            this.listeners.push([event, listener]);
            CLIENT.on(event, listener);
        }

    }
    
    // TODO string emoji
    /**
     * Listeners return true if we need to re-render message, e.g. model has changed
     * @param emoji 
     * @param onAdd 
     * @param onRemove 
     */
    private async addAction(emoji: GuildEmoji | ReactionEmoji, onAdd?: (r: MessageReaction, u: User | PartialUser) => boolean, onRemove?: (r: MessageReaction, u: User | PartialUser) => boolean) {
        if (onAdd == null && onRemove == null) return;
        
        const message = this.messages.find(m => m.reactions.cache.find(r => r.emoji.id === emoji.id) || m.reactions.cache.size < 20);
        if (message == null) {
            logger.error('maximum reaction reached');
            return;
        }

        const filter = (r: MessageReaction, u: User | PartialUser) => {
            // u.bot should be enough, maybe not if partial ? added r.me and u.id test to be safe
            return r.message.id !== message.id || u.bot || r.me || u.id === CLIENT.user?.id || r.emoji.id != emoji.id;
        }

        this.addListener(Constants.Events.MESSAGE_REACTION_ADD, filter, onAdd);
        this.addListener(Constants.Events.MESSAGE_REACTION_REMOVE, filter, onRemove);

        if (!message.reactions.cache.some(r => r.emoji.id === emoji.id)) {
            await message.react(emoji);
        }
    }

    // TODO only 1 litener with only 1 parsing of the message
    private addCommand(command: string, listener: (m: ParsedMessage<Message>) => boolean) {
        this.addListener(Constants.Events.MESSAGE_CREATE, (m: Message) => m.channel !== this.message.channel, (m: Message) => {
            // TODO do something if parse fails ? delete message ? do we always want that ?
            const parsed = parse(m, PREFIX);
            if (parsed.success) {
                if(parsed.command === command) {
                    return listener(parsed);
                }
            }

            return false;
        })
    }

    protected disconnect() {
        this.listeners.forEach(([e, l]) => CLIENT.off(e, l));
        this.listeners = [];
    }

    private async render() {
        return this.message.edit(this.generateMessage());
    }

    protected abstract generateMessage(): MessageEmbed;
    
    protected constructor(
        private channel: TextChannel,
        private messages: Message[],
    ) { 
        this.message = messages[0];
    }

    private static async findExistingMessages<T extends DynamicEmbedMessage, M>(channel: TextChannel, builder: DynamicEmbedMessageBuilder<T, M>, nbMsg = 1) {
        const message = await lookupMessage(channel.messages, m => m.embeds.length === 1 && builder.isMessage(m.embeds[0]));
        
        if (message != null) {
            if (nbMsg === 1) return [message];

            // not sure if we need both cache and force
            const fetched = await channel.messages.fetch({after: message.id, limit: nbMsg - 1}, true, true);
            
            if (fetched.every(m => m.author.id === CLIENT.user?.id && m.content === BLANK)) {
                return [message, ...fetched.values()];
            } else {
                logger.error('Found embed message but missing messages for reaction');
                // TODO what do we do in that case ?????
            }
        }
    }
    
    protected static async _create<T extends DynamicEmbedMessage, M>(builder: DynamicEmbedMessageBuilder<T,M>, channel: TextChannel, nbMsg = 1, lookForExistingMessage = true): Promise<T> {

        let messages: Message[] | undefined;
        let model: any | undefined;
        
        // TODO something if one of the two message is null. Delete and redo ? error ?

        if (lookForExistingMessage) {
            messages = await DynamicEmbedMessage.findExistingMessages(channel, builder, nbMsg);
        }

        
        if (messages == null) {
            messages = [];
            for (let i  = 0; i < nbMsg; i++) { 
                messages.push(await channel.send(BLANK));
            }
        } else {
            model = builder.parseMessage(messages[0].embeds[0]);
        }

        const instance = builder.newInstance(channel, messages, model);

        await instance.setupInputs((e, a, r) => instance.addAction(e, a, r), (e, l) => instance.addCommand(e, l));
        await instance.render();       

        return instance;
    }

    protected abstract async setupInputs(
        addAction: (emoji: GuildEmoji | ReactionEmoji, onAdd?: ReactionListener, onRemove?: ReactionListener) => Promise<void>,
        addCommand: (command: string, listener: (m: ParsedMessage<Message>) => boolean) => void
    ): Promise<void>;

    // ----- Utilities -----

    static add3columnFields(message: MessageEmbed, title: string | null, values: string[], values2?: string[]) {
        if (title == null && values.length == 0) {
            return;
        }
    
        const columns: string[][] = [[], [], []];
    
        const pushValues = (values: string[]) => {
            let i = 0;
            for(const v of values) {
                columns[i++%3].push(v);
            }
        };
    
        pushValues(values);
    
        if (values2 != null && values2.length > 0) {
            // fill with blank to create a *newline* effect
            const size = columns[0].length;
            for(let i = 1; i < 3; i++) {
                if (columns[i].length < size) {
                    columns[i].push(BLANK);
                }
            }
    
            pushValues(values2)
        }
    
        message.addField(title || BLANK, columns[0].length === 0 ? BLANK : columns[0], true);
        message.addField(BLANK, columns[1].length === 0 ? BLANK : columns[1], true);
        message.addField(BLANK, columns[2].length === 0 ? BLANK : columns[2], true);
    
    }

}

