import { DH_CHECK_P_NOT_PRIME } from 'constants'
import { GuildEmoji, Guild } from 'discord.js';

export const enum SpecType {
    TANK = 0,
    HEAL,
    DPS,
}

export const enum SpecTypePlus {
    TANK = 0,
    HEAL,
    MDPS,
    RDPS,
}

export function getSpecTypePlus(spec: WowSpec) {
    return spec.type === SpecType.DPS ? SpecType.DPS + (spec.range ? 1 : 0) : spec.type;
}

// TODO link to class, waiting till I really need it to do it => lazy loading :D
export interface WowSpec {
    id: WowSpecId;
    name: string;
    type: SpecType;
    range: boolean;
    emojiName: string;
}

export interface WowClass {
    name: string;
    emojiName: string;
    specs: {[name: string]: WowSpec};
}

// key must be same as spec id
// TODO LOW find a better way to narrow down id type to the string literal
const _WowSpecs = {
    // Death Knight
    dk_blood: {
        id: 'dk_blood',
        name: 'Blood',
        emojiName: 'deathknight_blood',
        type: SpecType.TANK,
        range: false,
    },
    dk_frost: {
        id: 'dk_frost',
        name: 'Frost',
        emojiName: 'deathknight_frost',
        type: SpecType.DPS,
        range: false,
    },
    dk_unholy: {
        id: 'dk_unholy',
        name: 'Unholy',
        emojiName: 'deathknight_unholy',
        type: SpecType.DPS,
        range: false,
    },

    dk_dps: {
        id: 'dk_dps',
        name: 'deathknight_dps',
        emojiName: 'deathknight_dps',
        type: SpecType.DPS,
        range: false,
    },

    // Demon Hunter
    dh_vengeance: {
        id: 'dh_vengeance',
        name: 'Vengeance',
        emojiName: 'demonhunter_vengeance',
        type: SpecType.TANK,
        range: false,
    },
    dh_havoc: {
        id: 'dh_havoc',
        name: 'Havoc',
        emojiName: 'demonhunter_havoc',
        type: SpecType.DPS,
        range: false,
    },

    // Druid
    druid_guardian: {
        id: 'druid_guardian',
        name: 'Guardian',
        emojiName: 'druid_guardian',
        type: SpecType.TANK,
        range: false,
    },
    druid_resto: {
        id: 'druid_resto',
        name: 'Restoration',
        emojiName: 'druid_restoration',
        type: SpecType.HEAL,
        range: true,
    },
    druid_balance: {
        id: 'druid_balance',
        name: 'Balance',
        emojiName: 'druid_balance',
        type: SpecType.DPS,
        range: true,
    },
    druid_feral: {
        id: 'druid_feral',
        name: 'Feral',
        emojiName: 'druid_feral',
        type: SpecType.DPS,
        range: false,
    },

    // Hunter
    hunt_bm: {
        id: 'hunt_bm',
        name: 'Beast Mastery',
        emojiName: 'huner_beast_mastery',
        type: SpecType.DPS,
        range: true,
    },
    hunt_marksman: {
        id: 'hunt_marksman',
        name: 'Marksmanship',
        emojiName: 'hunter_marksmanship',
        type: SpecType.DPS,
        range: true,
    },
    hunt_survival: {
        id: 'hunt_survival',
        name: 'Survival',
        emojiName: 'hunter_survival',
        type: SpecType.DPS,
        range: false,
    },

    hunt_rdps: {
        id: 'hunt_rdps',
        name: 'hunter',
        emojiName: 'hunter',
        type: SpecType.DPS,
        range: true,
    },

    // Mage
    mage_frost: {
        id: 'mage_frost',
        name: 'Frost',
        emojiName: 'mage_frost',
        type: SpecType.DPS,
        range: true,
    },
    mage_fire: {
        id: 'mage_fire',
        name: 'Fire',
        emojiName: 'mage_fire',
        type: SpecType.DPS,
        range: true,
    },
    mage_arcane: {
        id: 'mage_arcane',
        name: 'Arcane',
        emojiName: 'mage_arcane',
        type: SpecType.DPS,
        range: true,
    },
     
    mage_dps: {
        id: 'mage_dps',
        name: 'mage',
        emojiName: 'mage',
        type: SpecType.DPS,
        range: true,
    },

    // Monk
    monk_brewmaster: {
        id: 'monk_brewmaster',
        name: 'Brewmaster',
        emojiName: 'monk_brewmaster',
        type: SpecType.TANK,
        range: false,
    },
    monk_mistweaver: {
        id: 'monk_mistweaver',
        name: 'Mistweaver',
        emojiName: 'monk_mistweaver',
        type: SpecType.HEAL,
        range: false,
    },
    monk_windwalker: {
        id: 'monk_windwalker',
        name: 'Windwalker',
        emojiName: 'monk_windwalker',
        type: SpecType.DPS,
        range: false,
    },

    // Paladin
    pal_prot: {
        id: 'pal_prot',
        name: 'Protection',
        emojiName: 'paladin_protection',
        type: SpecType.TANK,
        range: false,
    },
    pal_holy: {
        id: 'pal_holy',
        name: 'Holy',
        emojiName: 'paladin_holy',
        type: SpecType.HEAL,
        range: false,
    },
    pal_ret: {
        id: 'pal_ret',
        name: 'Retribution',
        emojiName: 'paladin_retribution',
        type: SpecType.DPS,
        range: false,
    },

    // Priest
    priest_holy: {
        id: 'priest_holy',
        name: 'Holy',
        emojiName: 'priest_holy',
        type: SpecType.HEAL,
        range: true,
    },
    priest_disci: {
        id: 'priest_disci',
        name: 'Discipline',
        emojiName: 'priest_discipline',
        type: SpecType.HEAL,
        range: true,
    },
    priest_shadow: {
        id: 'priest_shadow',
        name: 'Shadow',
        emojiName: 'priest_shadow',
        type: SpecType.DPS,
        range: true,
    },

    priest_heal: {
        id: 'priest_heal',
        name: 'priest_heal',
        emojiName: 'priest',
        type: SpecType.HEAL,
        range: true,
    },

    // Rogue
    rogue_assa: {
        id: 'rogue_assa',
        name: 'Assassination',
        emojiName: 'rogue_assassination',
        type: SpecType.DPS,
        range: false,
    },
    rogue_outlaw: {
        id: 'rogue_outlaw',
        name: 'Outlaw',
        emojiName: 'rogue_outlaw',
        type: SpecType.DPS,
        range: false,
    },
    rogue_sub: {
        id: 'rogue_sub',
        name: 'Subtlety',
        emojiName: 'rogue_subtlety',
        type: SpecType.DPS,
        range: false,
    },

    rogue_dps: {
        id: 'rogue_dps',
        name: 'rogue',
        emojiName: 'rogue',
        type: SpecType.DPS,
        range: false,
    },

    // Shaman
    shaman_resto: {
        id: 'shaman_resto',
        name: 'Restoration',
        emojiName: 'shaman_restoration',
        type: SpecType.HEAL,
        range: true,
    },
    shaman_elem: {
        id: 'shaman_elem',
        name: 'Elemental',
        emojiName: 'shaman_elemental',
        type: SpecType.DPS,
        range: true,
    },
    shaman_enhancement: {
        id: 'shaman_enhancement',
        name: 'Enhancement',
        emojiName: 'shaman_enhancement',
        type: SpecType.DPS,
        range: false,
    },

    // Warlock
    warlock_affli: {
        id: 'warlock_affli',
        name: 'Affliction',
        emojiName: 'warlock_affliction',
        type: SpecType.DPS,
        range: true,
    },
    warlock_demono: {
        id: 'warlock_demono',
        name: 'Demonology',
        emojiName: 'warlock_demonology',
        type: SpecType.DPS,
        range: true,
    },
    warlock_destru: {
        id: 'warlock_destru',
        name: 'Destruction',
        emojiName: 'warlock_destruction',
        type: SpecType.DPS,
        range: true,
    },

    warlock_dps: {
        id: 'warlock_dps',
        name: 'warlock',
        emojiName: 'warlock',
        type: SpecType.DPS,
        range: true,
    },

    // Warrior
    war_prot: {
        id: 'war_prot',
        name: 'Protection',
        emojiName: 'warrior_protection',
        type: SpecType.TANK,
        range: false,
    },
    war_arm: {
        id: 'war_arm',
        name: 'Arm',
        emojiName: 'warrior_arm',
        type: SpecType.DPS,
        range: false,
    } as const,
    war_fury: {
        id: 'war_fury',
        name: 'Fury',
        emojiName: 'warrior_fury',
        type: SpecType.DPS,
        range: false,
    },
    war_dps: {
        id: 'war_dps',
        name: 'warrior_dps',
        emojiName: 'warrior',
        type: SpecType.DPS,
        range: false,
    },
} as const;

// to get good typings without much effort
export type WowSpecId = keyof typeof _WowSpecs;
export const WowSpecs: Record<WowSpecId, WowSpec> = _WowSpecs;

export function isWowSpecId(id: string): id is WowSpecId {
    return WowSpecs[id as WowSpecId] !== null;
}

export function getWowSpec(id: string): WowSpec | undefined {
    return WowSpecs[id as WowSpecId];
}

export namespace WowClasses {
    export const DK = {
        name: 'DeathKnight',
        emojiName: 'deathknight',
        specs: {
            Blood:  WowSpecs.dk_blood,
            Frost:  WowSpecs.dk_frost,
            Unholy: WowSpecs.dk_unholy,
        },
    }

    export const DH = {
        name: 'DemonHunter',
        emojiName: 'demonhunter',
        specs: {
            Vengeance: WowSpecs.dh_vengeance,
            Havoc: WowSpecs.dh_havoc,
        },
    };

    export const Druid = {
        name: 'Druid',
        emojiName: 'druid',
        specs: {
            Guardian: WowSpecs.druid_guardian,
            Restoration: WowSpecs.druid_resto,
            Balance: WowSpecs.druid_balance,
            Feral: WowSpecs.druid_feral,
        }
    };

    export const Hunt = {
        name: 'Hunter',
        emojiName: 'hunter',
        specs: {
            BeastMastery: WowSpecs.hunt_bm,
            Marksmanship: WowSpecs.hunt_marksman,
            Survival: WowSpecs.hunt_survival,
        },
    };

    export const Mage = {
        name: 'Mage',
        emojiName: 'mage',
        specs: {
            Frost: WowSpecs.mage_frost,
            Fire: WowSpecs.mage_fire,
            Arcane: WowSpecs.mage_arcane,
        }
    };

    export const Monk = {
        name: 'Monk',
        emojiName: 'monk',
        specs: {
            Brewmaster: WowSpecs.monk_brewmaster,
            Mistweaver: WowSpecs.monk_mistweaver,
            Windwalker: WowSpecs.monk_windwalker,
        },
    };

    export const Pal = {
        name: 'Paladin',
        emojiName: 'paladin',
        specs: {
            Protection: WowSpecs.pal_prot,
            Holy: WowSpecs.pal_holy,
            Retribution: WowSpecs.pal_ret,
        },
    };

    export const Priest = {
        name: 'Priest',
        emojiName: 'priest',
        specs: {
            Holy: WowSpecs.priest_holy,
            Discipline: WowSpecs.priest_disci,
            Shadow: WowSpecs.priest_shadow,
        },
    };

    export const Rogue = {
        name: 'Rogue',
        emojiName: 'rogue',
        specs: {
            Assassination: WowSpecs.rogue_assa,
            Outlaw: WowSpecs.rogue_outlaw,
            Subtlety: WowSpecs.rogue_sub,
        },
    };

    export const Sham = {
        name: 'Shaman',
        emojiName: 'shaman',
        specs: {
            Restoration: WowSpecs.shaman_resto,
            Elemental: WowSpecs.shaman_elem,
            Enhancement: WowSpecs.shaman_enhancement,
        },
    };

    export const Warlock = {
        name: 'Warlock',
        emojiName: 'warlock',
        specs: {
            Affliction: WowSpecs.warlock_affli,
            Demonology: WowSpecs.warlock_demono,
            Destruction: WowSpecs.warlock_destru,
        },
    };

    export const War = {
        name: 'Warrior',
        emojiName: 'warrior',
        specs: {
            Protection: WowSpecs.war_prot,
            Arm: WowSpecs.war_arm,
            Fury: WowSpecs.war_fury,
        },
    };
}

// grrr same name
export type WowClasseNames = keyof typeof WowClasses;
export const WowClasseNames = Object.keys(WowClasses) as WowClasseNames[];