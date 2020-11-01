import { Snowflake } from 'discord.js';
import { WowSpec, WowSpecId } from '../../model';

export interface PlayerSpecs {
    mainSpec?: WowSpecId;
    offSpecs: WowSpecId[];
}

export interface RosterDataDict {
    [userId: string]: PlayerSpecs;
}

function getSpecId(specOrId: WowSpec | WowSpecId) {
    return (<WowSpec>specOrId).id || <string>specOrId;
}

// TODO immutable ?
export const RosterUtils = {
    userHasSpec(roster: RosterDataDict, userId: Snowflake, specId: WowSpecId): boolean {
        const playerSpecs = roster[userId];
        return (
            playerSpecs != null &&
            (playerSpecs.mainSpec === specId || playerSpecs.offSpecs.some(s => s === specId))
        );
    },

    getSpecs(roster: RosterDataDict, userId: Snowflake): PlayerSpecs {
        return roster[userId];
    },

    setMainSpecToUser(
        roster: RosterDataDict,
        userId: Snowflake,
        mainSpec?: WowSpecId | WowSpec
    ): void {
        const playerSpecs = roster[userId];
        const mainSpecId = mainSpec != null ? getSpecId(mainSpec) : undefined;

        if (playerSpecs == null) {
            roster[userId] = {
                mainSpec: mainSpecId,
                offSpecs: [],
            };
        } else {
            // remove main spec from offspecs if present
            playerSpecs.offSpecs = playerSpecs.offSpecs.filter(s => s !== mainSpecId);

            // set current main spec as offspec
            if (playerSpecs.mainSpec != null) {
                playerSpecs.offSpecs.push(playerSpecs.mainSpec);
            }

            // set new main spec
            playerSpecs.mainSpec = mainSpecId;
        }
    },

    addSpecToUser(
        roster: RosterDataDict,
        userId: Snowflake,
        specOrId: WowSpecId | WowSpec
    ): boolean {
        const specId = getSpecId(specOrId);

        if (RosterUtils.userHasSpec(roster, userId, specId)) {
            return false;
        }

        const playerSpecs = roster[userId];
        if (playerSpecs != null && playerSpecs.mainSpec != null) {
            playerSpecs.offSpecs.push(specId);
        } else {
            roster[userId] = {
                mainSpec: specId,
                offSpecs: [],
            };
        }

        return true;
    },

    removeSpecToUser(
        roster: RosterDataDict,
        userId: Snowflake,
        specOrId: WowSpecId | WowSpec
    ): boolean {
        const playerSpecs = roster[userId];
        const specId = getSpecId(specOrId);

        if (playerSpecs == null) {
            return false;
        }

        if (playerSpecs.mainSpec === specId) {
            playerSpecs.mainSpec = playerSpecs.offSpecs.shift();
            return true;
        }
        const oldOffSpecsNb = playerSpecs.offSpecs.length;
        playerSpecs.offSpecs = playerSpecs.offSpecs.filter(s => s !== specId);

        return playerSpecs.offSpecs.length < oldOffSpecsNb;
    },
};
