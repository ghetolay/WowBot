import { addMilliseconds, isPast, isValid, parse, set } from 'date-fns';
import {
    GuildMember,
    Message,
    MessageEmbed,
    MessageReaction,
    PartialUser,
    TextChannel,
    User,
} from 'discord.js';
import schedule from 'node-schedule';
import { startDMCommandForm } from '../../commands/dmCommands';
import { DynamicEmbedMessage, MSG_STATUS, ReactionAction } from '../../DynamicEmbed';
import { getSpecEmoji } from '../../utils/emojis';
import { toSpecTypePlus, isWowSpecId, SpecType, WowSpecs } from '../../model';
import {
    logger,
    BLANK,
    clear,
    EMQUAD,
    formatDate,
    formatList,
    formatObjective,
    getMember,
    localStartWith,
    notNull,
    sendDM,
} from '../../utils/utils';
import { Roster, RosterManager } from '../roster/rosterManager';

export enum ParticipantStatus {
    PRESENT,
    LATE,
    ABSENT,
    BENCH,
}

export interface CalendarLineup {
    [id: string]: {
        status: ParticipantStatus;
        benchable?: boolean;
    };
}

export interface EventSetup {
    tank: number;
    heal: number;
    dps: number;
}

const enum EMOJI {
    PRESENT = '👍',
    LATE = '⏲',
    ABSENT = '👎',
    BENCH = '🛋',
}

const typeId = 'ev';

export class CalendarEvent extends DynamicEmbedMessage {
    protected typeId = typeId;

    // getTime() is 13chars, can do <= 10 if we're really short on url chars encoding
    get id(): string {
        return this.date.getTime().toString();
    }

    private setPlayerStatusFromReact(
        r: MessageReaction,
        u: User | PartialUser,
        status: ParticipantStatus
    ) {
        const res = this.setPlayerStatus(u.id, status);
        if (res === null) {
            sendDM(
                u,
                'You must select at least one spec on the roster message before you can signup to events\n' +
                    this.specsRoster?.getLink()
            );
            return false;
        }

        return res;
    }

    private static readonly actions: ReactionAction<CalendarEvent>[] = [
        {
            emoji: EMOJI.PRESENT,
            button: true,
            listener: function (r, u) {
                if (this.status === MSG_STATUS.VALIDATED) {
                    sendDM(u, "You can't sign-up on a validated event, it's too late folk !");
                    return false;
                }

                return this.setPlayerStatusFromReact(r, u, ParticipantStatus.PRESENT);
            },
        },
        {
            emoji: EMOJI.ABSENT,
            button: true,
            listener: function (r, u) {
                if (this.status === MSG_STATUS.VALIDATED) {
                    sendDM(
                        u,
                        "You can't sign-off on a validated event, you have to contact an officier to do so."
                    );
                    return false;
                }

                return this.setPlayerStatusFromReact(r, u, ParticipantStatus.ABSENT);
            },
        },
        {
            emoji: EMOJI.LATE,
            button: true,
            listener: function (r, u) {
                return this.setPlayerStatusFromReact(r, u, ParticipantStatus.LATE);
            },
        },
        {
            emoji: EMOJI.BENCH,
            button: false,
            listener: function (r, u, removed) {
                return this.setPlayerMood(u.id, !removed);
            },
        },
        {
            emoji: '🛠️',
            permision: 'SEND_MESSAGES',
            button: true,
            listener: function (r, u) {
                // would need to return an observable cause configurationForm can make multiple changes
                // for the moment we use the refresh() function for each changes
                this.configurationForm(u);
                return false;
            },
        },
    ];

    // delay in ms at which the event should be considered closed (0 to be right on event time)
    private static closingDelay = 900000; //15 min after event started

    private scheduleClose: schedule.Job;

    constructor(
        channel: TextChannel,
        messages: Message[],
        private date: Date,
        private specsRoster: Roster | undefined,
        private setup: EventSetup = { tank: 2, heal: 4, dps: 14 },
        private desc?: string | null,
        status?: MSG_STATUS | null,
        private iconUrl?: string | null,
        private lineup: CalendarLineup = {}
    ) {
        super(channel, messages);

        if (status != null) {
            this.status = status;
        }

        if (this.specsRoster == null) {
            this.errors.push(new Error("Can't find roster"));
            this.status = MSG_STATUS.ERROR;
        }

        this.scheduleClose = schedule.scheduleJob(
            addMilliseconds(date, CalendarEvent.closingDelay),
            () => this.close()
        );
    }

    public static async create(
        channel: TextChannel,
        date: Date,
        specsRoster: Roster,
        setup?: EventSetup,
        desc?: string | null,
        status?: MSG_STATUS | null,
        iconUrl?: string | null
    ): Promise<CalendarEvent> {
        const instance = new CalendarEvent(
            channel,
            [await channel.send(BLANK)],
            date,
            specsRoster,
            setup,
            desc,
            status,
            iconUrl
        );
        await instance.init();

        return instance;
    }

    public static async load(channel: TextChannel): Promise<CalendarEvent[]> {
        const isOutdated = (dateStr: string) => isPast(new Date(parseInt(dateStr)));

        // first message outdated
        let stopId: string | null = null; // don't set undefined in case lastMatch.id is undefined

        const foundEvents = await DynamicEmbedMessage.findExistingMessages(
            channel,
            // create a real function rather than this cheaty oneliner
            (type, date, msg) => type === typeId && (!isOutdated(date) || !(stopId = msg.id)),
            lastMatch => lastMatch != null && lastMatch.id === stopId
        );
        return Promise.all(
            foundEvents
                .map(parsedRoster => {
                    try {
                        const data = CalendarEvent.decodeData(
                            parsedRoster.pathData,
                            parsedRoster.paramData
                        );

                        const instance = new CalendarEvent(
                            channel,
                            [parsedRoster.messages],
                            new Date(parseInt(parsedRoster.id)),
                            RosterManager.get().getRoster(data.specsRoster),
                            data.setup,
                            data.desc,
                            parseInt(data.status) || MSG_STATUS.OPEN,
                            // todo encode iconurl on url or keep this exception ?
                            parsedRoster.messages.embeds[0].thumbnail?.url,
                            data.lineup
                        );

                        return instance.init().then(() => instance);
                    } catch (e) {
                        logger.error('error loading event ' + parsedRoster.id);
                        DynamicEmbedMessage.renderError(parsedRoster.messages, [
                            new Error('Parsing error: %s' + e),
                        ]);
                    }
                })
                .filter(notNull)
        );
    }

    private async init() {
        this.refresh();

        await this.setupReactions(CalendarEvent.actions);
    }

    protected encodeData(): {
        pathData?: string[] | undefined;
        paramData?: { [name: string]: string | string[] } | undefined;
    } {
        return {
            pathData: [
                this.specsRoster?.id || '0',
                CalendarEvent.encodeSetup(this.setup),
                this.desc || '',
                String(this.status),
            ],
            paramData: CalendarEvent.encodeLineup(this.lineup),
        };
    }

    private static decodeData(pathData: string[], paramData: { [id: string]: string[] }) {
        return {
            specsRoster: pathData[0],
            setup: CalendarEvent.decodeSetup(pathData[1]),
            desc: pathData[2],
            status: pathData[3],

            lineup: CalendarEvent.decodeLineup(paramData),
        };
    }

    private static decodeLineup(params: { [name: string]: string[] }) {
        const lineup: CalendarLineup = {};

        for (const playerId in params) {
            const values = params[playerId];

            let status: ParticipantStatus;
            try {
                status = parseInt(values[0]);
                if (ParticipantStatus[status] == null) {
                    throw 'invalid status: ' + status;
                }
            } catch (e) {
                logger.error('failed decoding lineup for %s: %s', playerId, e);
                continue;
            }

            lineup[playerId] = {
                status,
                benchable: values.length > 1 && values[1] === 'benchable',
            };
        }

        return lineup;
    }

    private static encodeLineup(lineup: CalendarLineup) {
        const params: { [id: string]: string[] } = {};
        for (const playerId in lineup) {
            const status = lineup[playerId];

            const encodedStatus = [status.status.toString()];
            if (status.benchable) {
                encodedStatus.push('benchable');
            }

            params[playerId] = encodedStatus;
        }

        return params;
    }

    private static decodeSetup(setupStr: string) {
        try {
            const matchArray = Array.from(setupStr.matchAll(/(\d+)/g));

            // todo error prone, but we'll redo it once we handle setup with 4 values (rdps/mdps)
            return {
                tank: parseInt(matchArray[0][0]) || 0,
                heal: parseInt(matchArray[1][0]) || 0,
                dps: parseInt(matchArray[2][0]) || 0,
            };
        } catch (e) {
            logger.error('failed parsing setup: ', e);
            return { tank: 2, heal: 4, dps: 14 };
        }
    }

    private static encodeSetup(setup: EventSetup) {
        return setup.tank + '-' + setup.heal + '-' + setup.dps;
    }

    /* TODO we're using 3 returns, set as expected, not set cause already set and not set cause no spec could be found
     * using boolean + null atm but need to do better, number or boolean + throw
     */
    setPlayerStatus(userId: string, status: ParticipantStatus): boolean | null {
        if (this.lineup[userId]?.status !== status) {
            const spec = this.specsRoster?.getMainSpec(userId);
            if (spec == null) {
                return null;
            }

            this.lineup[userId] = {
                status,
                benchable: this.lineup[userId]?.benchable,
            };
            return true;
        }

        return false;
    }

    setPlayerMood(userId: string, benchable = true): boolean {
        if (this.lineup[userId]?.benchable !== benchable) {
            this.lineup[userId] = {
                status: this.lineup[userId]?.status,
                benchable,
            };
            return true;
        }

        return false;
    }

    /*eslint complexity: [warn, 12]*/
    protected async generateMessage(): Promise<MessageEmbed> {
        const present: string[][] = [[], [], [], []];
        const absent: string[] = [];
        const bench: string[] = [];

        const chan = this.message.channel as TextChannel;

        for (const playerId in this.lineup) {
            const status = this.lineup[playerId].status;
            /*eslint no-await-in-loop: off*/
            const user = (await getMember(chan, playerId))?.user;

            if (user == null) {
                logger.warn('missing user from server ' + playerId);
                continue;
            }

            switch (status) {
                case ParticipantStatus.LATE:
                case ParticipantStatus.PRESENT:
                    const specId = this.specsRoster?.getMainSpec(playerId);
                    // TODO
                    if (specId == null || !isWowSpecId(specId)) continue;

                    const extra =
                        (status === ParticipantStatus.LATE ? ' ' + EMOJI.LATE : '') +
                        (this.lineup[playerId].benchable === true ? ' ' + EMOJI.BENCH : '');

                    present[toSpecTypePlus(WowSpecs[specId])].push(
                        getSpecEmoji(WowSpecs[specId])?.toString() + ' ' + user.toString() + extra
                    );
                    break;
                case ParticipantStatus.ABSENT:
                    absent.push(user.toString());
                    break;
                case ParticipantStatus.BENCH:
                    bench.push(user.toString());
                    break;
            }
        }

        const presetnNb = present.reduce((v, a) => v + a.length, 0);
        const requiredNb = this.setup.tank + this.setup.heal + this.setup.dps;
        const missingNb = Math.max(0, requiredNb - presetnNb);

        const msg = new MessageEmbed().setTitle(formatDate(this.date));

        if (this.desc != null) {
            msg.setDescription(this.desc);
        }

        if (this.iconUrl != null) {
            msg.setThumbnail(this.iconUrl);
        }

        msg.addField(
            'Setup',
            formatObjective(this.setup.tank, present[SpecType.TANK].length, this.setup.tank) +
                '-' +
                formatObjective(this.setup.heal, present[SpecType.HEAL].length, this.setup.heal) +
                '-' +
                formatObjective(
                    this.setup.dps,
                    present[SpecType.DPS].length + present[SpecType.DPS + 1].length,
                    this.setup.dps
                ) +
                '\n\u200b',
            true
        )
            .addField('Present', formatObjective(presetnNb, presetnNb, requiredNb), true)
            .addField('Missing', missingNb, true);

        DynamicEmbedMessage.add3columnFields(
            msg,
            '**__TANKS__  (' + present[SpecType.TANK].length + ')**',
            present[SpecType.TANK],

            DynamicEmbedMessage.BLANK_LINE,

            ['**__HEALS__  (' + present[SpecType.HEAL].length + ')**'],
            present[SpecType.HEAL],

            DynamicEmbedMessage.BLANK_LINE,

            [
                '**__DPS__  (' +
                    (present[SpecType.DPS].length + present[SpecType.DPS + 1].length) +
                    ') *(c:' +
                    present[SpecType.DPS].length +
                    ',r:' +
                    present[SpecType.DPS + 1].length +
                    ')***',
            ],
            present[SpecType.DPS],
            present[SpecType.DPS + 1],

            DynamicEmbedMessage.BLANK_LINE
        );

        // using EM Quad to ease parsing, it's our separator between label and values. Also better visually.
        msg.addField(
            BLANK,
            '**Absents (' +
                absent.length +
                ')**' +
                EMQUAD +
                formatList(absent) +
                '\n**Bench (' +
                bench.length +
                ')**' +
                EMQUAD +
                formatList(bench)
        );

        return msg;
    }

    // Validate the event, meaning lineup respect setup
    // TODO not checking yet, because without flexible setup yet this would block some events
    // eslint-disable-next-line class-methods-use-this
    private validateEvent(): boolean {
        return true;
    }

    private async configurationForm(u: User | PartialUser) {
        logger.verbose('start configuration form with ' + u.id);

        await startDMCommandForm(u, {
            welcomeMessage: 'What changes do you want to apply to this event ?',
            commands: {
                set: {
                    description: '`set player1 player2 ... status? benchable?`',
                    helpMessage: `set player's status.
                    Player can be designed by name or id.
                    Players reffered by name does not need to be complete, a partial name is enough but if 
                    it matches several players only the first one in alphabetical order will be set.
                    Player's name can match either the *display name* on the server or *discord username*.
                    You can set one or several player with the same status (present/absent/late/bench).
                    'status' and 'benchable' are optional and are by default: present and non-benchable.
                    examples:
                        \`set nekros reck absent\`
                        \`set era wak absent benchable\`
                        \`set bamleprètre\`
                        \`set essa benchable\`
                        \`set 256696214754874677 present\`
                    `,
                    /*eslint complexity: [warn, 15]*/
                    callback: async (args: string[]) => {
                        // must be sync with ParticipantStatus, don't like that very much
                        const statusStr = ['present', 'late', 'absent', 'bench'];
                        const members = (this.message.channel as TextChannel).members;

                        let statusIdx = 0;
                        let status = ParticipantStatus.PRESENT;
                        let benchable = false;

                        const players: GuildMember[] = [];
                        const playersNotFound: string[] = [];

                        for (const w of args) {
                            if (w === 'benchable') {
                                benchable = true;
                            } else if ((statusIdx = statusStr.findIndex(v => v === w)) >= 0) {
                                status = statusIdx;
                            } else {
                                const matchingPlayers = members
                                    .filter(
                                        m =>
                                            m.id === w ||
                                            localStartWith(clear(m.displayName), w) ||
                                            localStartWith(clear(m.user.username), w)
                                    )
                                    .sort((a, b) =>
                                        clear(a.displayName).localeCompare(clear(b.displayName))
                                    );
                                if (matchingPlayers.size > 0) {
                                    players.push(matchingPlayers.first()!);
                                } else {
                                    playersNotFound.push(w);
                                }
                            }
                        }

                        if (players.length === 0) {
                            return 'No player found!';
                        }

                        const playerAdded = [];
                        const playerAlreadySet = [];
                        const playerNoSpec = [];

                        for (const p of players) {
                            // todo setMood ?
                            const result = this.setPlayerStatus(p.user.id, status);
                            this.setPlayerMood(p.user.id, benchable);

                            switch (result) {
                                case true:
                                    playerAdded.push(p.displayName);
                                    break;
                                case false:
                                    playerAlreadySet.push(p.displayName);
                                    break;
                                case null:
                                    playerNoSpec.push(p.displayName);
                            }
                        }

                        let feedback = '';

                        if (playerAdded.length > 0) {
                            feedback +=
                                'player added with status *' +
                                statusStr[status] +
                                '* ' +
                                (benchable ? 'and *benchable*' : '') +
                                ' : ' +
                                formatList(playerAdded);
                        }
                        // this one is optional
                        if (playerAlreadySet.length > 0) {
                            feedback +=
                                '\nPlayers not changed cause they already had the same status: ' +
                                formatList(playerAlreadySet);
                        }
                        if (playerNoSpec.length > 0) {
                            feedback +=
                                "\nPlayers not added because they're missing from the roster: " +
                                formatList(playerNoSpec);
                        }
                        if (playersNotFound.length > 0) {
                            feedback += '\nPlayer(s) not found: ' + formatList(playersNotFound);
                        }

                        return [await this.generateMessage(), feedback];
                    },
                },
                /*
                'setup': {
                    description: '`setup x-x-x`',
                    helpMessage: '',
                    callback: () => {},
                },
                */
                date: {
                    description: '`date jjmm`',
                    helpMessage: 'set day and month of event',
                    callback: ([dateStr]: string[]) => {
                        if (dateStr == null) {
                            return 'missing date';
                        }

                        const newDate = parse(dateStr, 'ddMM', this.date);
                        if (!isValid(newDate)) {
                            return 'invalid date';
                        }

                        this.date = set(this.date, {
                            date: newDate.getDate(),
                            month: newDate.getMonth(),
                        });

                        return this.generateMessage();
                    },
                },
                time: {
                    description: '`time hhmm`',
                    helpMessage: 'set hour and minutes of event',
                    callback: ([dateStr]: string[]) => {
                        if (dateStr == null) {
                            return 'missing date';
                        }

                        const newDate = parse(dateStr, 'hhmm', this.date);
                        if (!isValid(newDate)) {
                            return 'invalid date';
                        }

                        this.date = set(this.date, {
                            hours: newDate.getHours(),
                            minutes: newDate.getMinutes(),
                        });

                        return this.generateMessage();
                    },
                },
                desc: {
                    description: '`desc new description`',
                    helpMessage: 'set the new description. Only 1 line is permitted at the moment',
                    callback: (args: string[], answer) => {
                        if (args.length === 0) {
                            return 'missing description';
                        }

                        // /!\ 5 is linked to command name
                        this.desc = answer.slice(5);

                        return this.generateMessage();
                    },
                },
                status: {
                    description: '`status validated`',
                    helpMessage:
                        "change the event satus, must be one of 'open', 'closed', 'validated' or 'error'",
                    callback: ([status]: string[]) => {
                        switch (status) {
                            case 'open':
                                this.status = MSG_STATUS.OPEN;
                                break;
                            case 'closed':
                                this.status = MSG_STATUS.CLOSE;
                                break;
                            case 'validated':
                                this.status = MSG_STATUS.VALIDATED;
                                break;
                            case 'error':
                                this.status = MSG_STATUS.ERROR;
                                break;
                            default:
                                return "Invalid status, must be one of 'open', 'closed', 'validated' or 'error'";
                        }

                        return this.generateMessage();
                    },
                },
            },
        });

        // TODO only if we actually did changes
        this.refresh();
    }

    public async cancel(): Promise<void> {
        this.scheduleClose.cancel();
        await this.disconnect();
        await this.message.delete();
    }

    private close() {
        this.status = MSG_STATUS.CLOSE;
        this.refresh();
        this.disconnect();
    }

    protected async disconnect(): Promise<void> {
        await super.disconnect();
        if (!this.message.deleted) {
            await this.message.reactions.removeAll();
        }
    }
}
