import { Message, GuildEmoji, User, PartialUser, MessageReaction, TextChannel, MessageEmbed, MessageManager, PermissionString } from 'discord.js';
import { BLANK, CLIENT, decodeUrl, encodeToUrl } from './utils/utils';
import { EventManager } from './utils/eventManager';
import { addCleanupCallback } from './gracefulexit';
import { logger } from './logger';


// todo move to utils ?
// need to think a bit more about stopCondition usage and arguments
async function lookupMessages(manager: MessageManager, findFn: (m: Message) => boolean, stopFn: (lastResult?: Message, lastMessage?: Message) => boolean, step = 5) {
    let collection = manager.cache;
    const results = [];

    if (!stopFn(undefined, collection.last())) {
        do {
            const founds = await Promise.all(
                collection
                    .filter(findFn)
                    .map(f => f.fetch())
            );
            results.push(...founds);

            if (stopFn(founds[founds.length - 1], collection.last())) break;

            collection = await manager.fetch({before: collection.last()?.id, limit: step});
        } while( collection.size > 0 ) 
    }

    return results;
}

export type ReactionListener = (r: MessageReaction, u: User | PartialUser) => boolean;

interface BaseActionListener {
    emoji: string | GuildEmoji;
    permision?: PermissionString,
    role?: string;
}

interface ReactionActionListener<T extends DynamicEmbedMessage> extends BaseActionListener {
    button?: false,
    /**
     * returns true if model has changed and message needs refresh
     */
    listener: (this: T, r: MessageReaction, u: User | PartialUser, removed: boolean) => boolean; 
}

interface ButtonActionListener<T extends DynamicEmbedMessage> extends BaseActionListener {
    /**
     * reactions are used as a button, only the click event matters and we constantly remove user's reactions
     */
    button: true,
    /**
     * returns true if model has changed and message needs refresh
     */
    listener: (this: T, r: MessageReaction, u: User | PartialUser) => boolean; 
}

export type ReactionAction<T extends DynamicEmbedMessage> = ReactionActionListener<T> | ButtonActionListener<T>;

export const enum STATUS {
    OPEN,
    CLOSE,
    DISCONNECTED,
    ERROR,
}

export class RenderError extends Error { }

export abstract class DynamicEmbedMessage {

    // data used to generate unique hostname for identification
    private static readonly ext = 'zz';
    protected abstract readonly typeId: string;

    // TODO define an immutable model properties and check it to render instead of all the boolean return and the refresh() method ?
    // protected abstract model: T;
    
    get id() {
        return this.message.id;
    }

    // TODO number is too loose, extended class should create their own STATUS enum or extend STATUS somehow
    status: number = STATUS.OPEN;
    protected errors: Error[] = [];

    protected get message() {
        return this.messages[0];
    };
   
    protected constructor(
        private channel: TextChannel,
        private messages: Message[],
    ) { 
        EventManager.getEventManager()
            .registerToReaction(messages, this.onReaction.bind(this))
            // TODO need to cover deletion of just embed message
            .registerLifecycle(messages, () => this.destroy())

        addCleanupCallback(() => this.disconnect());
    }

    protected async destroy() {
       await this.disconnect();
    }

    protected async disconnect() {
        EventManager.getEventManager()
            .unregisterToReaction(this.messages)
            .unregisterLifecycle(this.messages)
        
        this.status = STATUS.DISCONNECTED;
        await this.render();
    }

    protected static async findExistingMessages(
        channel: TextChannel, 
        isMessage: (type: string, id: string, message: Message) => boolean, 
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean): Promise<{messages: Message, id: string, pathData: string[], paramData: {[k: string]: string[]}}[]> 
    // do some overload for the most likely extraMsg values (0, 1, 2)
    protected static async findExistingMessages(
        channel: TextChannel, 
        isMessage: (type: string, id: string, message: Message) => boolean, 
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean,
        extraMsg: 0): Promise<{messages: Message, id: string, pathData: string[], paramData: {[k: string]: string[]}}[]>;
    protected static async findExistingMessages(
        channel: TextChannel, 
        isMessage: (type: string, id: string, message: Message) => boolean, 
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean, 
        extraMsg: 1): Promise<{messages: Message[], id: string, pathData: string[], paramData: {[k: string]: string[]}}[]>; 
    protected static async findExistingMessages(
        channel: TextChannel, 
        isMessage: (type: string, id: string, message: Message) => boolean, 
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean, 
        extraMsg: 2): Promise<{messages: Message[], id: string, pathData: string[], paramData: {[k: string]: string[]}}[]>; 
    protected static async findExistingMessages(
        channel: TextChannel, 
        isMessage: (type: string, id: string, message: Message) => boolean, 
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean, 
        extraMsg: number): Promise<{messages: Message | Message[], id: string, pathData: string[], paramData: {[k: string]: string[]}}[]>; 
    protected static async findExistingMessages(
        channel: TextChannel, 
        isMessage: (type: string, id: string, message: Message) => boolean, 
        stop: (lastMatching?: Message, lastMessage?: Message) => boolean, 
        extraMsg = 0): Promise<{messages: Message | Message[], id: string, pathData: string[], paramData: {[k: string]: string[]}}[]> {

        const matchFn = (m: Message) => {
            if (m.embeds.length !== 1) return false;

            const embed = m.embeds[0];
            const idUrl = embed.author?.url;

            if (idUrl == null) return false;

            // I think this is faster than parsing all url with URL() or even using a small regex
            // but is it robust enough ??
            const schemeEndIdx = idUrl[4] === 's' ? 8 : 7;
            const slashIdx = idUrl.indexOf('/', schemeEndIdx);
            
            const [id, type, ext] = idUrl.slice(schemeEndIdx, slashIdx === -1 ? undefined : slashIdx).split('.');
            if (ext !== DynamicEmbedMessage.ext) return false;

            return isMessage(type, id, m);
        }
        
        const messages = await lookupMessages(channel.messages, matchFn, stop);
     
        const res = (extraMsg === 0 ? 
            Promise.resolve(messages) : 
            Promise.all(messages.map(message =>
                // not sure if we need both cache and force
                channel.messages.fetch({after: message.id, limit: extraMsg}, true, true)
                    .then( fetched => {
                        if (fetched.every(m => m.author.id === CLIENT.user?.id && m.content === BLANK)) { 
                            return [message, ...fetched.array()/*values()*/];
                        } else {
                            // should we throw instead or trying to recover ?
                            logger.error('failed getting extra message for reactions');
                            return [message];
                        }
                    })
            ))
        );
        
        return (<Promise<Message[] | Message[][]>>res).then((messagesGroup: (Message | Message[])[]) => messagesGroup.map((messages: Message | Message[]) => {
            // ! usage : we're sure everything exists cause of the matchFn
            const {id, pathData, paramData} = decodeUrl((Array.isArray(messages) ? messages[0] : messages).embeds[0].author!.url!);

            return {
                messages,
                id: id.split('.')[0],
                pathData,
                paramData,
            };
        }));
    }
  
    private currentActions: ReactionAction<any>[] = [];

    /**
     * 
     * @param actions React emoji may not be in same order as action's array if some were already present on message
     */
    protected async setupReactions<T extends DynamicEmbedMessage>(actions: ReactionAction<T>[]) {        
        const reactToDo: ReactionAction<T>[] = [...actions];

        // -- clear previous reactions and keep track of which needs to be added --
        for (const m of this.messages) {
            //TODO fetch if needed
            
            for (const [_, r] of m.reactions.cache) {
                const actionIdx = reactToDo.findIndex(a => a.emoji === r.emoji || a.emoji === r.emoji.name);
    
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
        this.currentActions = [...actions];

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
        const action = this.currentActions.find(a => a.emoji === r.emoji || a.emoji === r.emoji.name);
        if (action == null) return;

        if (action.permision != null && !u.presence?.member?.permissions.has(action.permision)) {
            u.send('Tu n\'as pas les droits requis pour effectuer cette action.\nSi tu te rapelle plus ce que t\'as fais bha tant pis !\nTodo: donner plus d\'info sur quel action sur quel message :)')
            return true;
        }

        // if (action.role && )

        if (action.button && removed) return;

        if (action.listener.call(this, r, u, removed)) {
            this.render();
        }

        return action.button;
    }


    protected statusColor(status: number) {
        switch(status) {
            case STATUS.OPEN:
                return '#00ff00';
            case STATUS.DISCONNECTED:
                return '#ffa500';
            case STATUS.ERROR:
                return '#ff0000';
            case STATUS.CLOSE:
                return '#0000ff';
        }
    }

    public refresh() {
        this.render().catch(e => logger.error('error rendering', e));
    }

    protected static renderError(message: Message, errors: Error[]) {
        if (message.embeds.length < 1) throw 'no embed message';

        const msg = message.embeds[0];
        msg.setFooter(errors.reduce((str, e) => str + '\n' + e.message, '')) //TODO add an error image
        msg.setColor('#ff0000');

        return message.edit(msg);
    }

    private async render(): Promise<Message> {
        if (this.message.deleted) throw new Error('Message is deleted');

        let result;
        try {
            let msg: MessageEmbed;
            if (this.status === STATUS.ERROR) {
                return DynamicEmbedMessage.renderError(this.message, this.errors);
            }

            if (this.status === STATUS.DISCONNECTED){
                msg = this.message.embeds[0];
            } else {
                // todo should we clone the returned message ? new MessageEmbed(this.generateMessage)
                msg = this.generateMessage();

                const { pathData, paramData } = this.encodeData();
                msg.setAuthor(msg.author?.name || BLANK, msg.author?.iconURL, 
                    // we're encoding message.id in the url by default, not very useful...
                    //  either force id to be defined by subclass or make it optional
                    encodeToUrl(this.id + '.' + this.typeId + '.' + DynamicEmbedMessage.ext, pathData, paramData)
                );
            }     
            
            if (msg.footer !== null) {
                //only way to delete footer is to create a new MessageEmbed
               msg.setFooter('');
           }

            msg.setColor(this.statusColor(this.status) || this.statusColor(STATUS.ERROR)!);

            result = await this.message.edit(msg);
        } catch (e) {
            logger.error('error rendering message', e);

            if (this.status !== STATUS.ERROR) {                    
                this.status = STATUS.ERROR;
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
    protected abstract encodeData(): {pathData?: string[], paramData?: {[name: string]: string | string[]}};
    protected abstract generateMessage(): MessageEmbed;

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

