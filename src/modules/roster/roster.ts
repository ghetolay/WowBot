import { Snowflake } from 'discord.js';
import { WowSpec, WowSpecId } from '../../model';

export interface RosterData {
    [userId: string]: {
        mainSpec?: WowSpecId; 
        offSpecs: WowSpecId[];
    }
}

// TODO immutable ?
export namespace RosterUtils {

    function getSpecId(specOrId: WowSpec | WowSpecId) {
        return (<WowSpec>specOrId).id || <string>specOrId;
    }

    export function userHasSpec(roster: RosterData, userId: Snowflake, specId: WowSpecId) {
        const playerSpecs = roster[userId];
        return playerSpecs != null && (playerSpecs.mainSpec === specId || playerSpecs.offSpecs.some(s => s === specId));
    }

    export function getSpecs(roster: RosterData, userId: Snowflake) {
        return roster[userId];
    }

    export function setMainSpecToUser(roster: RosterData, userId: Snowflake, mainSpec?: WowSpecId | WowSpec) {
        const playerSpecs = roster[userId];
        const mainSpecId = mainSpec != null ? getSpecId(mainSpec) : undefined;

        if (playerSpecs == null) {
            roster[userId] = {
                mainSpec: mainSpecId,
                offSpecs: [],
            };
        } else {
            playerSpecs.mainSpec = mainSpecId;
        }
    }

    export function addSpecToUser(roster: RosterData, userId: Snowflake, specOrId: WowSpecId | WowSpec, forceMain = false) {
        const specId = getSpecId(specOrId);

        if (userHasSpec(roster, userId, specId)){
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
    }

    export function removeSpecToUser(roster: RosterData, userId: Snowflake, specOrId: WowSpecId | WowSpec) {
        const playerSpecs = roster[userId];
        const specId = getSpecId(specOrId);

        if (playerSpecs == null) {
            return false;
        }

        if (playerSpecs.mainSpec === specId) {
            playerSpecs.mainSpec = playerSpecs.offSpecs.shift();
            return true;
        } else {
            const oldOffSpecsNb = playerSpecs.offSpecs.length;
            playerSpecs.offSpecs = playerSpecs.offSpecs.filter(s => s !== specId);

            return playerSpecs.offSpecs.length < oldOffSpecsNb;
        }
    }

    /*
    public forEachUser(callback: (id: Snowflake, specs: {mainSpec?: WowSpecId, offSpecs: WowSpecId[]}) => void) {
        for (const id in this.roster) {
            callback(id, this.roster[id]);
        }
    }    
    */
}