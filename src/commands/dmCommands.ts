import { Message, MessageEmbed, PartialUser, User } from 'discord.js';
import { logger, promisifyFnCall, sendDM } from '../utils/utils';

export interface DMCommand {
    description?: string;
    helpMessage: string;
    // allow async function ?
    callback: (
        commandArgs: string[],
        answer: string,
        message: Message
    ) =>
        | string
        | MessageEmbed
        | (string | MessageEmbed)[]
        | Promise<string | MessageEmbed | (string | MessageEmbed)[]>
        | void;
}

export interface DMCommands {
    [commandName: string]: DMCommand;
}

export interface DMCommandConfig {
    welcomeMessage: string;
    exitMessage?: string;
    // shouldn't those be a guild wide constant settings, to not confuse users ?
    exitCommand?: string;
    helpCommand?: string;

    commands: DMCommands;
}

const awaitOptions = {
    max: 1,
    idle: 30000,
    errors: ['timeout'],
};

const defaultHelpCommand = 'help';
const defaultExitCommand = 'fu';
const defaultExitMessage = 'bye bye';

// TODO LOW prevent user to start a form while there is already one going on
/*eslint complexity: [warn, 15]*/
/**
 * Starts a DM with an user, listen to commands input by user and call according callback
 * @param _this this to be set for all callbacks
 * @param u user to start DM with
 * @param config config defining commands and messages to display
 */
export async function startDMCommandForm(
    u: User | PartialUser,
    config: DMCommandConfig
): Promise<void> {
    const user = u.partial ? await u.fetch() : u;
    const dmChannel = await user.createDM();

    await sendDM(
        dmChannel,
        config.welcomeMessage +
            '\n For more information about a command you can type `' +
            (config.helpCommand || defaultHelpCommand) +
            ' command_name`' +
            Object.values(config.commands).reduce(
                (p, c) => (c.description != null ? p + '\n\t' + c.description : p),
                ''
            ) +
            '\n to leave just type`' +
            (config.exitCommand || defaultExitCommand) +
            '` or session will automatically end after 30s of inactivity.'
    );
    try {
        // two ways out, exit command found or error raised
        /*eslint no-await-in-loop: off*/
        out: while (true) {
            // We're on DM so testing for message.bot should do the trick no need to check message.id to see who's really sending the message
            const answers = (
                await dmChannel.awaitMessages((m: Message) => !m.author.bot, awaitOptions)
            ).first();
            if (answers == null) throw 'empty answers';

            logger.verbose(
                'received mp message from %s : \n%s',
                answers.author.id,
                answers.content
            );

            const splitAnswers = answers.content.split('\n');
            for (const answerLine of splitAnswers) {
                const words = answerLine.trim().split(' ');
                const commandName = words[0];

                if (commandName === (config.exitCommand || defaultExitCommand)) {
                    await sendDM(dmChannel, config.exitMessage || defaultExitMessage);
                    break out;
                }

                const dmCommand = config.commands[commandName];
                if (dmCommand == null) {
                    await sendDM(dmChannel, 'command not found');
                } else {
                    const commandArguments = words.slice(1);
                    const feedback = await promisifyFnCall(() =>
                        dmCommand.callback(commandArguments, answerLine, answers)
                    );

                    if (feedback != null) {
                        const feedbackArr = Array.isArray(feedback) ? feedback : [feedback];

                        /*eslint no-await-in-loop: off*/
                        // await in loop cause we want to respect message order
                        for (const f of feedbackArr) {
                            await sendDM(dmChannel, f);
                        }
                    }
                }
            }
        }
    } catch (e) {
        logger.verbose('terminating DM Command seesion: %s', e);
    }

    await sendDM(dmChannel, 'Session ended.');
}
