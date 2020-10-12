import { parse, SuccessfulParsedMessage } from 'discord-command-parser';
import { Constants, Message, MessageReaction, PartialMessage, PartialUser, User } from 'discord.js';
import { CLIENT } from '..';
import { PREFIX, promisifyFnCall, sendDM, logger } from './utils';

export type ReactionEventListener = (
    r: MessageReaction,
    user: User | PartialUser,
    removed: boolean
) => boolean | void | Promise<boolean | void>;
export type CommandEventListener = (
    parsed: SuccessfulParsedMessage<Message>
) => void | string | Promise<string | void>;

export class FeedbackError {
    constructor(public reason: string) {}
}

let _eventManager: EventManager;

/* Nodejs is angry when we add more than 10 listeners to an event (warning about memory leaks)
 * we can change the maximum number of listener but we choose to create this little manager to handle our listeners
 * that way we keep the warning in case something really goes wrong
 */
export class EventManager {
    reactListeners: { [id: string]: ReactionEventListener } = {};
    commandListeners: { [id: string]: CommandEventListener } = {};
    lifecycleListeners: {
        [id: string]: (m: Message | PartialMessage) => void;
    } = {};

    private constructor() {
        const catchCb = (e: Error) => logger.error('Error occured running listener %s', e);

        const handleReaction = (r: MessageReaction, u: User | PartialUser, removed: boolean) => {
            // if user is partial we use id check so we don't need to fetch anything (won't work if it's another bot but very unlikely)
            if (r.message.channel.type === 'dm' || u.bot || u.id === CLIENT.user?.id) return;

            const listener = this.reactListeners[r.message.id];
            if (listener == null) return;

            promisifyFnCall(() => listener(r, u, removed))
                .then(v => {
                    if (v === true) r.users.remove(u.id);
                })
                .catch(catchCb);
        };

        CLIENT.on(Constants.Events.MESSAGE_REACTION_ADD, (r, u) => {
            handleReaction(r, u, false);
        });

        CLIENT.on(Constants.Events.MESSAGE_REACTION_REMOVE, (r, u) => {
            handleReaction(r, u, true);
        });

        CLIENT.on(Constants.Events.MESSAGE_CREATE, m => {
            if (m.channel.type === 'dm') return;
            const parsed = parse(m, PREFIX);

            if (parsed.success) {
                const listener = this.commandListeners[parsed.command];
                if (listener == null) return;

                m.delete();

                promisifyFnCall(() => listener(parsed)).catch(errorFeedback => {
                    sendDM(
                        m.author,
                        errorFeedback instanceof FeedbackError
                            ? errorFeedback.reason
                            : 'An error occured during your command'
                    );
                });
                //.finally(() => m.delete());
            } else {
                logger.verbose('message parsed failed : %s', parsed.error);
            }
        });

        CLIENT.on(Constants.Events.MESSAGE_DELETE, m => {
            if (m.channel.type === 'dm') return;
            const listener = this.lifecycleListeners[m.id];
            if (listener == null) return;

            promisifyFnCall(() => listener(m)).catch(catchCb);

            this.unregisterLifecycle(m);
        });
    }

    registerToReaction(
        messages: (Message | PartialMessage)[],
        listener: ReactionEventListener
    ): this {
        for (const m of messages) {
            this.reactListeners[m.id] = listener;
        }
        return this;
    }

    unregisterToReaction(messages: (Message | PartialMessage)[]): this {
        for (const m of messages) {
            delete this.reactListeners[m.id];
        }
        return this;
    }

    // TODO restriction to ROLE/Permission
    registerCommand(command: string, listener: CommandEventListener): this {
        if (this.commandListeners[command]) {
            // afraid throw could break bot (especially once we'll have modules/extension)
            // throw 'command already exists';
            logger.error('command already exists');
        }

        this.commandListeners[command] = listener;
        return this;
    }

    unregisterCommand(command: string): this {
        delete this.commandListeners[command];
        return this;
    }

    registerLifecycle(
        message: Message | PartialMessage | (Message | PartialMessage)[],
        listener: () => void
    ): this {
        if (Array.isArray(message)) {
            message.forEach(m => (this.lifecycleListeners[m.id] = listener));
        } else {
            this.lifecycleListeners[message.id] = listener;
        }

        return this;
    }

    unregisterLifecycle(message: Message | PartialMessage | (Message | PartialMessage)[]): this {
        if (Array.isArray(message)) {
            message.forEach(m => delete this.lifecycleListeners[m.id]);
        } else {
            delete this.lifecycleListeners[message.id];
        }

        return this;
    }

    /*
     * Singleton on lazy loading
     * todo: cleanup if listeners are empty ? could this even really happen ?
     */
    static get(): EventManager {
        return _eventManager || (_eventManager = new EventManager());
    }
}
