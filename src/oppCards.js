// Opponent card data (plain data, no logic). Oracle text checked against the
// web source in `source` on 2026-11-19 (see docs/card-sources.md).
//
// Field notes:
// - `cost` is the printed mana cost string ('' for lands); `mv` is the mana
//   value off the stack (X = 0).
// - `types` lowercase; `supertypes` (legendary/basic) added for convenience.
// - `power`/`toughness` are numbers, or strings for variable stats
//   ('*', '1+*'); null for non-creatures.
// - Double-faced cards carry the other face in `back`.
// - Apostrophes are normalised to ASCII ('). Some Scryfall pages were served
//   from an older cache and use the pre-2024 "enters the battlefield" template;
//   that is recorded as fetched and is functionally identical to "enters".

export const OPP_CARDS = Object.freeze({
  // ---- Counters / stack interaction -------------------------------------
  'Force of Will': {
    name: 'Force of Will', cost: '{3}{U}{U}', mv: 5, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.",
    verified: true, source: 'https://scryfall.com/card/dmr/50',
  },
  'Force of Negation': {
    name: 'Force of Negation', cost: '{1}{U}{U}', mv: 3, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
    verified: true, source: 'https://scryfall.com/card/mh1/52',
  },
  'Daze': {
    name: 'Daze', cost: '{1}{U}', mv: 2, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "You may return an Island you control to its owner's hand rather than pay this spell's mana cost.\nCounter target spell unless its controller pays {1}.",
    verified: true, source: 'https://mtgassist.com/cards/Eternal-Masters/Daze/',
  },
  'Stifle': {
    name: 'Stifle', cost: '{U}', mv: 1, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "Counter target activated or triggered ability. (Mana abilities can't be targeted.)",
    verified: true, source: 'https://scryfall.com/card/mp2/18',
  },
  'Consign to Memory': {
    name: 'Consign to Memory', cost: '{U}', mv: 1, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: 'Replicate {1} (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)\nCounter target triggered ability or colorless spell.',
    verified: true, source: 'https://scryfall.com/card/mh3/54',
  },
  "Kozilek's Command": {
    name: "Kozilek's Command", cost: '{X}{C}{C}', mv: 2, types: ['kindred', 'instant'], subtypes: ['Eldrazi'], colors: [],
    power: null, toughness: null,
    oracle: 'Choose two —\n• Target player creates X 0/1 colorless Eldrazi Spawn creature tokens with "Sacrifice this token: Add {C}."\n• Target player scries X, then draws a card.\n• Exile target creature with mana value X or less.\n• Exile up to X target cards from graveyards.',
    verified: true, source: 'https://mtgassist.com/cards/Modern-Horizons-3/Kozilek-s-Command/',
  },
  'Pyroblast': {
    name: 'Pyroblast', cost: '{R}', mv: 1, types: ['instant'], subtypes: [], colors: ['R'],
    power: null, toughness: null,
    oracle: "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue.",
    verified: true, source: 'https://scryfall.com/card/ice/213',
  },
  'Red Elemental Blast': {
    name: 'Red Elemental Blast', cost: '{R}', mv: 1, types: ['instant'], subtypes: [], colors: ['R'],
    power: null, toughness: null,
    oracle: 'Choose one —\n• Counter target blue spell.\n• Destroy target blue permanent.',
    verified: true, source: 'https://scryfall.com/card/3ed/171',
  },
  'Spell Pierce': {
    name: 'Spell Pierce', cost: '{U}', mv: 1, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: 'Counter target noncreature spell unless its controller pays {2}.',
    verified: true, source: 'https://scryfall.com/card/sld/41',
  },
  'Flusterstorm': {
    name: 'Flusterstorm', cost: '{U}', mv: 1, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: 'Counter target instant or sorcery spell unless its controller pays {1}.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)',
    verified: true, source: 'https://scryfall.com/card/cmd/46/flusterstorm',
  },
  'Spell Snare': {
    name: 'Spell Snare', cost: '{U}', mv: 1, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: 'Counter target spell with mana value 2.',
    verified: true, source: 'https://scryfall.com/card/mma/64',
  },
  'Pact of Negation': {
    name: 'Pact of Negation', cost: '{0}', mv: 0, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "Counter target spell.\nAt the beginning of your next upkeep, pay {3}{U}{U}. If you don't, you lose the game.",
    verified: true, source: 'https://scryfall.com/card/fut/42',
  },
  'Mindbreak Trap': {
    name: 'Mindbreak Trap', cost: '{2}{U}{U}', mv: 4, types: ['instant'], subtypes: ['Trap'], colors: ['U'],
    power: null, toughness: null,
    oracle: "If an opponent cast three or more spells this turn, you may pay {0} rather than pay this spell's mana cost.\nExile any number of target spells.",
    verified: true, source: 'https://scryfall.com/card/zen/57/mindbreak-trap',
  },
  'Mental Misstep': {
    name: 'Mental Misstep', cost: '{U/P}', mv: 1, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: '({U/P} can be paid with either {U} or 2 life.)\nCounter target spell with mana value 1.',
    verified: true, source: 'https://scryfall.com/card/nph/38',
  },
  'Sink into Stupor': {
    name: 'Sink into Stupor', cost: '{1}{U}{U}', mv: 3, types: ['instant'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "Return target spell or nonland permanent an opponent controls to its owner's hand.",
    back: {
      name: 'Soporific Springs', cost: '', types: ['land'], subtypes: [],
      oracle: "As Soporific Springs enters the battlefield, you may pay 3 life. If you don't, it enters the battlefield tapped.\n{T}: Add {U}.",
    },
    verified: true, source: 'https://scryfall.com/card/mh3/241',
  },
  'Veil of Summer': {
    name: 'Veil of Summer', cost: '{G}', mv: 1, types: ['instant'], subtypes: [], colors: ['G'],
    power: null, toughness: null,
    oracle: "Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn. (You and they can't be the targets of blue or black spells or abilities your opponents control.)",
    verified: true, source: 'https://scryfall.com/card/m20/198',
  },

  // ---- Removal / graveyard ----------------------------------------------
  'Swords to Plowshares': {
    name: 'Swords to Plowshares', cost: '{W}', mv: 1, types: ['instant'], subtypes: [], colors: ['W'],
    power: null, toughness: null,
    oracle: 'Exile target creature. Its controller gains life equal to its power.',
    verified: true, source: 'https://scryfall.com/card/dmr/31',
  },
  'Surgical Extraction': {
    name: 'Surgical Extraction', cost: '{B/P}', mv: 1, types: ['instant'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: "({B/P} can be paid with either {B} or 2 life.)\nChoose target card in a graveyard other than a basic land card. Search its owner's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles.",
    verified: true, source: 'https://scryfall.com/card/nph/74',
  },
  'Fatal Push': {
    name: 'Fatal Push', cost: '{B}', mv: 1, types: ['instant'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: 'Destroy target creature if it has mana value 2 or less.\nRevolt — Destroy that creature if it has mana value 4 or less instead if a permanent you controlled left the battlefield this turn.',
    verified: true, source: 'https://scryfall.com/card/f17/8',
  },
  'Snuff Out': {
    name: 'Snuff Out', cost: '{3}{B}', mv: 4, types: ['instant'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated.",
    verified: true, source: 'https://scryfall.com/card/gvl/53',
  },
  'Dismember': {
    name: 'Dismember', cost: '{1}{B/P}{B/P}', mv: 3, types: ['instant'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: '({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn.',
    verified: true, source: 'https://scryfall.com/card/spg/41',
  },
  'Solitude': {
    name: 'Solitude', cost: '{3}{W}{W}', mv: 5, types: ['creature'], subtypes: ['Elemental', 'Incarnation'], colors: ['W'],
    power: 3, toughness: 2,
    oracle: "Flash\nLifelink\nWhen this creature enters, exile up to one other target creature. That creature's controller gains life equal to its power.\nEvoke—Exile a white card from your hand.",
    verified: true, source: 'https://mtgassist.com/cards/Modern-Horizons-2/Solitude/',
  },
  'Prismatic Ending': {
    name: 'Prismatic Ending', cost: '{X}{W}', mv: 1, types: ['sorcery'], subtypes: [], colors: ['W'],
    power: null, toughness: null,
    oracle: 'Converge — Exile target nonland permanent if its mana value is less than or equal to the number of colors of mana spent to cast this spell.',
    verified: true, source: 'https://scryfall.com/card/mb2/16',
  },
  'Lightning Bolt': {
    name: 'Lightning Bolt', cost: '{R}', mv: 1, types: ['instant'], subtypes: [], colors: ['R'],
    power: null, toughness: null,
    oracle: 'Lightning Bolt deals 3 damage to any target.',
    verified: true, source: 'https://scryfall.com/card/pd2/17',
  },
  'Goblin Bombardment': {
    name: 'Goblin Bombardment', cost: '{1}{R}', mv: 2, types: ['enchantment'], subtypes: [], colors: ['R'],
    power: null, toughness: null,
    oracle: 'Sacrifice a creature: Goblin Bombardment deals 1 damage to any target.',
    verified: true, source: 'https://scryfall.com/card/tpr/136/goblin-bombardment',
  },
  "Tormod's Crypt": {
    name: "Tormod's Crypt", cost: '{0}', mv: 0, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: "{T}, Sacrifice Tormod's Crypt: Exile target player's graveyard.",
    verified: true, source: 'https://scryfall.com/card/dmr/235/tormods-crypt',
  },

  // ---- Discard ----------------------------------------------------------
  'Thoughtseize': {
    name: 'Thoughtseize', cost: '{B}', mv: 1, types: ['sorcery'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: 'Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.',
    verified: true, source: 'https://scryfall.com/card/akr/127/thoughtseize',
  },
  'Duress': {
    name: 'Duress', cost: '{B}', mv: 1, types: ['sorcery'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: 'Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.',
    verified: true, source: 'https://scryfall.com/card/usg/132/duress',
  },
  'Unmask': {
    name: 'Unmask', cost: '{3}{B}', mv: 4, types: ['sorcery'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: "You may exile a black card from your hand rather than pay this spell's mana cost.\nTarget player reveals their hand. You choose a nonland card from it. That player discards that card.",
    verified: true, source: 'https://mtgassist.com/cards/Mercadian-Masques/Unmask/',
  },
  'Cabal Therapy': {
    name: 'Cabal Therapy', cost: '{B}', mv: 1, types: ['sorcery'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: 'Choose a nonland card name. Target player reveals their hand and discards all cards with that name.\nFlashback—Sacrifice a creature. (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
    verified: true, source: 'https://scryfall.com/card/f05/5',
  },
  'Inquisition of Kozilek': {
    name: 'Inquisition of Kozilek', cost: '{B}', mv: 1, types: ['sorcery'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: 'Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card.',
    verified: true, source: 'https://scryfall.com/card/sta/31',
  },
  'Collective Brutality': {
    name: 'Collective Brutality', cost: '{1}{B}', mv: 2, types: ['sorcery'], subtypes: [], colors: ['B'],
    power: null, toughness: null,
    oracle: 'Escalate—Discard a card. (Pay this cost for each mode chosen beyond the first.)\nChoose one or more —\n• Target opponent reveals their hand. You choose an instant or sorcery card from it. That player discards that card.\n• Target creature gets -2/-2 until end of turn.\n• Target opponent loses 2 life and you gain 2 life.',
    verified: true, source: 'https://scryfall.com/card/sir/103',
  },

  // ---- Land destruction / land hate -------------------------------------
  'Wasteland': {
    name: 'Wasteland', cost: '', mv: 0, types: ['land'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: '{T}: Add {C}.\n{T}, Sacrifice Wasteland: Destroy target nonbasic land.',
    verified: true, source: 'https://scryfall.com/card/sld/178/wasteland',
  },
  'Ghost Quarter': {
    name: 'Ghost Quarter', cost: '', mv: 0, types: ['land'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: '{T}: Add {C}.\n{T}, Sacrifice Ghost Quarter: Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.',
    verified: true, source: 'https://scryfall.com/card/md1/26',
  },
  'Magus of the Moon': {
    name: 'Magus of the Moon', cost: '{2}{R}', mv: 3, types: ['creature'], subtypes: ['Human', 'Wizard'], colors: ['R'],
    power: 2, toughness: 2,
    oracle: 'Nonbasic lands are Mountains.',
    verified: true, source: 'https://scryfall.com/card/fut/101',
  },
  'Blood Moon': {
    name: 'Blood Moon', cost: '{2}{R}', mv: 3, types: ['enchantment'], subtypes: [], colors: ['R'],
    power: null, toughness: null,
    oracle: 'Nonbasic lands are Mountains.',
    verified: true, source: 'https://scryfall.com/card/sld/366',
  },
  'Back to Basics': {
    name: 'Back to Basics', cost: '{2}{U}', mv: 3, types: ['enchantment'], subtypes: [], colors: ['U'],
    power: null, toughness: null,
    oracle: "Nonbasic lands don't untap during their controllers' untap steps.",
    verified: true, source: 'https://scryfall.com/card/uma/46',
  },

  // ---- Taxes / rule-setting permanents ----------------------------------
  'Disruptor Flute': {
    name: 'Disruptor Flute', cost: '{2}', mv: 2, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: "Flash\nAs Disruptor Flute enters the battlefield, choose a card name.\nSpells with the chosen name cost {3} more to cast.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities.",
    verified: true, source: 'https://scryfall.com/card/mh3/209/disruptor-flute',
  },
  'Chalice of the Void': {
    name: 'Chalice of the Void', cost: '{X}{X}', mv: 0, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: 'Chalice of the Void enters the battlefield with X charge counters on it.\nWhenever a player casts a spell with mana value equal to the number of charge counters on Chalice of the Void, counter that spell.',
    verified: true, source: 'https://scryfall.com/card/j19/7',
  },
  'Sphere of Resistance': {
    name: 'Sphere of Resistance', cost: '{2}', mv: 2, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: 'Spells cost {1} more to cast.',
    verified: true, source: 'https://scryfall.com/card/exo/139',
  },
  'Trinisphere': {
    name: 'Trinisphere', cost: '{3}', mv: 3, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: 'As long as Trinisphere is untapped, each spell that would cost less than three mana to cast costs three mana to cast. (Additional mana in the cost may be paid with any color of mana or colorless mana. For example, a spell that would cost {1}{B} to cast costs {2}{B} to cast instead.)',
    verified: true, source: 'https://scryfall.com/card/mps/52',
  },
  'Thorn of Amethyst': {
    name: 'Thorn of Amethyst', cost: '{2}', mv: 2, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: 'Noncreature spells cost {1} more to cast.',
    verified: true, source: 'https://scryfall.com/card/brr/60',
  },
  'Damping Sphere': {
    name: 'Damping Sphere', cost: '{2}', mv: 2, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: 'If a land is tapped for two or more mana, it produces {C} instead of any other type and amount.\nEach spell a player casts costs {1} more to cast for each other spell that player has cast this turn.',
    verified: true, source: 'https://scryfall.com/card/dmr/377',
  },
  'Thalia, Guardian of Thraben': {
    name: 'Thalia, Guardian of Thraben', cost: '{1}{W}', mv: 2, types: ['creature'], supertypes: ['legendary'], subtypes: ['Human', 'Soldier'], colors: ['W'],
    power: 2, toughness: 1,
    oracle: 'First strike\nNoncreature spells cost {1} more to cast.',
    verified: true, source: 'https://scryfall.com/card/a25/36',
  },
  'Deafening Silence': {
    name: 'Deafening Silence', cost: '{W}', mv: 1, types: ['enchantment'], subtypes: [], colors: ['W'],
    power: null, toughness: null,
    oracle: "Each player can't cast more than one noncreature spell each turn.",
    verified: true, source: 'https://scryfall.com/card/eld/10',
  },
  'Gaddock Teeg': {
    name: 'Gaddock Teeg', cost: '{G}{W}', mv: 2, types: ['creature'], supertypes: ['legendary'], subtypes: ['Kithkin', 'Advisor'], colors: ['G', 'W'],
    power: 2, toughness: 2,
    oracle: "Noncreature spells with mana value 4 or greater can't be cast.\nNoncreature spells with {X} in their mana costs can't be cast.",
    verified: true, source: 'https://www.scryfall.com/card/j17/3/gaddock-teeg',
  },
  'Archon of Emeria': {
    name: 'Archon of Emeria', cost: '{2}{W}', mv: 3, types: ['creature'], subtypes: ['Archon'], colors: ['W'],
    power: 2, toughness: 3,
    oracle: "Flying\nEach player can't cast more than one spell each turn.\nNonbasic lands your opponents control enter tapped.",
    verified: true, source: 'https://scryfall.com/card/mb2/4',
  },
  'Pithing Needle': {
    name: 'Pithing Needle', cost: '{1}', mv: 1, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: "As Pithing Needle enters the battlefield, choose a card name.\nActivated abilities of sources with the chosen name can't be activated unless they're mana abilities.",
    verified: true, source: 'https://scryfall.com/card/sld/44',
  },
  "Grafdigger's Cage": {
    name: "Grafdigger's Cage", cost: '{1}', mv: 1, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: "Creature cards in graveyards and libraries can't enter the battlefield.\nPlayers can't cast spells from graveyards or libraries.",
    verified: true, source: 'https://scryfall.com/card/m20/227',
  },
  'Narset, Parter of Veils': {
    name: 'Narset, Parter of Veils', cost: '{1}{U}{U}', mv: 3, types: ['planeswalker'], supertypes: ['legendary'], subtypes: ['Narset'], colors: ['U'],
    power: null, toughness: null, loyalty: 5,
    oracle: "Each opponent can't draw more than one card each turn.\n−2: Look at the top four cards of your library. You may reveal a noncreature, nonland card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.",
    verified: true, source: 'https://scryfall.com/card/cmm/853/narset-parter-of-veils',
  },
  'Teferi, Time Raveler': {
    name: 'Teferi, Time Raveler', cost: '{1}{W}{U}', mv: 3, types: ['planeswalker'], supertypes: ['legendary'], subtypes: ['Teferi'], colors: ['W', 'U'],
    power: null, toughness: null, loyalty: 4,
    oracle: "Each opponent can cast spells only any time they could cast a sorcery.\n+1: Until your next turn, you may cast sorcery spells as though they had flash.\n−3: Return up to one target artifact, creature, or enchantment to its owner's hand. Draw a card.",
    verified: true, source: 'https://scryfall.com/card/blc/92',
  },
  'Hullbreacher': {
    name: 'Hullbreacher', cost: '{2}{U}', mv: 3, types: ['creature'], subtypes: ['Merfolk', 'Pirate'], colors: ['U'],
    power: 3, toughness: 2,
    oracle: 'Flash\nIf an opponent would draw a card except the first one they draw in each of their draw steps, instead you create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this artifact: Add one mana of any color.")',
    verified: true, source: 'https://scryfall.com/card/cmr/74/hullbreacher',
  },
  'Torpor Orb': {
    name: 'Torpor Orb', cost: '{2}', mv: 2, types: ['artifact'], subtypes: [], colors: [],
    power: null, toughness: null,
    oracle: "Creatures entering don't cause abilities to trigger.",
    verified: true, source: 'https://scryfall.com/card/big/92/torpor-orb',
  },
  'Collector Ouphe': {
    name: 'Collector Ouphe', cost: '{1}{G}', mv: 2, types: ['creature'], subtypes: ['Ouphe'], colors: ['G'],
    power: 2, toughness: 2,
    oracle: "Activated abilities of artifacts can't be activated.",
    verified: true, source: 'https://scryfall.com/card/mh1/158/collector-ouphe',
  },
  'Karn, the Great Creator': {
    name: 'Karn, the Great Creator', cost: '{4}', mv: 4, types: ['planeswalker'], supertypes: ['legendary'], subtypes: ['Karn'], colors: [],
    power: null, toughness: null, loyalty: 5,
    oracle: "Activated abilities of artifacts your opponents control can't be activated.\n+1: Until your next turn, up to one target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value.\n−2: You may reveal an artifact card you own from outside the game or choose a face-up artifact card you own in exile. Put that card into your hand.",
    verified: true, source: 'https://scryfall.com/card/war/1',
  },
  'Hexing Squelcher': {
    name: 'Hexing Squelcher', cost: '{1}{R}', mv: 2, types: ['creature'], subtypes: ['Goblin', 'Sorcerer'], colors: ['R'],
    power: 2, toughness: 2,
    oracle: "This spell can't be countered.\nWard—Pay 2 life.\nSpells you control can't be countered.\nOther creatures you control have \"Ward—Pay 2 life.\"",
    verified: true, source: 'https://iwantmymtg.net/card/ecl/145 (text); https://www.hareruyamtg.com/en/products/detail/186623?lang=EN (cost, P/T)',
  },
  'Quantum Riddler': {
    name: 'Quantum Riddler', cost: '{3}{U}{U}', mv: 5, types: ['creature'], subtypes: ['Sphinx'], colors: ['U'],
    power: 4, toughness: 6,
    oracle: 'Flying\nWhen this creature enters, draw a card.\nAs long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead.\nWarp {1}{U}',
    verified: true, source: 'https://www.mtg.wtf/card/eoe/72/Quantum-Riddler',
  },
  'Phelia, Exuberant Shepherd': {
    name: 'Phelia, Exuberant Shepherd', cost: '{1}{W}', mv: 2, types: ['creature'], supertypes: ['legendary'], subtypes: ['Dog'], colors: ['W'],
    power: 2, toughness: 2,
    oracle: "Flash\nWhenever Phelia, Exuberant Shepherd attacks, exile up to one other target nonland permanent. At the beginning of the next end step, return that card to the battlefield under its owner's control. If it entered under your control, put a +1/+1 counter on Phelia.",
    verified: true, source: 'https://scryfall.com/card/mh3/40',
  },
  'Tamiyo, Inquisitive Student': {
    name: 'Tamiyo, Inquisitive Student', cost: '{U}', mv: 1, types: ['creature'], supertypes: ['legendary'], subtypes: ['Moonfolk', 'Wizard'], colors: ['U'],
    power: 0, toughness: 3,
    oracle: "Flying\nWhenever Tamiyo, Inquisitive Student attacks, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this artifact: Draw a card.\")\nWhen you draw your third card in a turn, exile Tamiyo, then return her to the battlefield transformed under her owner's control.",
    back: {
      name: 'Tamiyo, Seasoned Scholar', cost: '', types: ['planeswalker'], supertypes: ['legendary'], subtypes: ['Tamiyo'], colors: ['U', 'G'],
      loyalty: null, // not shown on the pages checked
      oracle: "+2: Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -1/-0 until end of turn.\n−3: Return target instant or sorcery card from your graveyard to your hand. If it's a green card, add one mana of any color.\n−7: Draw cards equal to half the number of cards in your library, rounded up. You get an emblem with \"You have no maximum hand size.\"",
    },
    verified: true, source: 'https://scryfall.com/card/mh3/242 (text); https://mtg.wtf/card/mh3/242a/Tamiyo-Inquisitive-Student (P/T)',
  },

  // ---- Creatures (clock) ------------------------------------------------
  'Orcish Bowmasters': {
    name: 'Orcish Bowmasters', cost: '{1}{B}', mv: 2, types: ['creature'], subtypes: ['Orc', 'Archer'], colors: ['B'],
    power: 1, toughness: 1,
    oracle: 'Flash\nWhen this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1.',
    verified: true, source: 'https://scryfall.com/card/ltr/433/orcish-bowmasters',
  },
  'Ocelot Pride': {
    name: 'Ocelot Pride', cost: '{W}', mv: 1, types: ['creature'], subtypes: ['Cat'], colors: ['W'],
    power: 1, toughness: 1,
    oracle: "First strike, lifelink\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your end step, if you gained life this turn, create a 1/1 white Cat creature token. Then if you have the city's blessing, for each token you control that entered this turn, create a token that's a copy of it.",
    verified: true, source: 'https://scryfall.com/card/mh3/38',
  },
  'Guide of Souls': {
    name: 'Guide of Souls', cost: '{W}', mv: 1, types: ['creature'], subtypes: ['Human', 'Cleric'], colors: ['W'],
    power: 1, toughness: 2,
    oracle: 'Whenever another creature enters the battlefield under your control, you gain 1 life and get {E} (an energy counter).\nWhenever you attack, you may pay {E}{E}{E}. When you do, put two +1/+1 counters and a flying counter on target attacking creature. It becomes an Angel in addition to its other types.',
    verified: true, source: 'https://scryfall.com/card/mh3/29',
  },
  'Ajani, Nacatl Pariah': {
    name: 'Ajani, Nacatl Pariah', cost: '{1}{W}', mv: 2, types: ['creature'], supertypes: ['legendary'], subtypes: ['Cat', 'Warrior'], colors: ['W'],
    power: 1, toughness: 2,
    oracle: "When Ajani, Nacatl Pariah enters the battlefield, create a 2/1 white Cat Warrior creature token.\nWhenever one or more other Cats you control die, you may exile Ajani, then return him to the battlefield transformed under his owner's control.",
    back: {
      name: 'Ajani, Nacatl Avenger', cost: '', types: ['planeswalker'], supertypes: ['legendary'], subtypes: ['Ajani'],
      loyalty: null, // not shown on the pages checked
      oracle: '+2: Put a +1/+1 counter on each Cat you control.\n0: Create a 2/1 white Cat Warrior creature token. When you do, if you control a red permanent other than Ajani, Nacatl Avenger, he deals damage equal to the number of creatures you control to any target.\n−4: Each opponent chooses an artifact, a creature, an enchantment and a planeswalker from among the nonland permanents they control, then sacrifices the rest.',
    },
    verified: true, source: 'https://scryfall.com/card/mh3/237 (text); https://mtg.wtf/card/mh3/468a/Ajani-Nacatl-Pariah (P/T)',
  },
  'Endurance': {
    name: 'Endurance', cost: '{1}{G}{G}', mv: 3, types: ['creature'], subtypes: ['Elemental', 'Incarnation'], colors: ['G'],
    power: 3, toughness: 4,
    oracle: 'Flash\nReach\nWhen Endurance enters the battlefield, up to one target player puts all the cards from their graveyard on the bottom of their library in a random order.\nEvoke—Exile a green card from your hand.',
    verified: true, source: 'https://scryfall.com/card/h2r/14',
  },
  'Murktide Regent': {
    name: 'Murktide Regent', cost: '{5}{U}{U}', mv: 7, types: ['creature'], subtypes: ['Dragon'], colors: ['U'],
    power: 3, toughness: 3,
    oracle: 'Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nFlying\nMurktide Regent enters the battlefield with a +1/+1 counter on it for each instant and sorcery card exiled with it.\nWhenever an instant or sorcery card leaves your graveyard, put a +1/+1 counter on Murktide Regent.',
    verified: true, source: 'https://scryfall.com/card/slp/17',
  },
  'Nethergoyf': {
    name: 'Nethergoyf', cost: '{B}', mv: 1, types: ['creature'], subtypes: ['Lhurgoyf'], colors: ['B'],
    power: '*', toughness: '1+*',
    oracle: "Nethergoyf's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.\nEscape—{2}{B}, Exile any number of other cards from your graveyard with four or more card types among them. (You may cast this card from your graveyard for its escape cost.)",
    verified: true, source: 'https://scryfall.com/card/mh3/454',
  },
  "Dragon's Rage Channeler": {
    name: "Dragon's Rage Channeler", cost: '{R}', mv: 1, types: ['creature'], subtypes: ['Human', 'Shaman'], colors: ['R'],
    power: 1, toughness: 1,
    oracle: "Whenever you cast a noncreature spell, surveil 1. (Look at the top card of your library. You may put that card into your graveyard.)\nDelirium — As long as there are four or more card types among cards in your graveyard, Dragon's Rage Channeler gets +2/+2, has flying, and attacks each combat if able.",
    verified: true, source: 'https://scryfall.com/card/h2r/9',
  },
  'Delver of Secrets': {
    name: 'Delver of Secrets', cost: '{U}', mv: 1, types: ['creature'], subtypes: ['Human', 'Wizard'], colors: ['U'],
    power: 1, toughness: 1,
    oracle: 'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
    back: {
      name: 'Insectile Aberration', cost: '', types: ['creature'], subtypes: ['Human', 'Insect'], colors: ['U'],
      power: 3, toughness: 2, oracle: 'Flying',
    },
    verified: true, source: 'https://scryfall.com/card/isd/51',
  },
  'Badgermole Cub': {
    name: 'Badgermole Cub', cost: '{1}{G}', mv: 2, types: ['creature'], subtypes: ['Badger', 'Mole'], colors: ['G'],
    power: 2, toughness: 2,
    oracle: "When this creature enters, earthbend 1. (Target land you control becomes a 0/0 creature with haste that's still a land. Put a +1/+1 counter on it. When it dies or is exiled, return it to the battlefield tapped.)\nWhenever you tap a creature for mana, add an additional {G}.",
    verified: true, source: 'https://mtgassist.com/cards/Avatar-The-Last-Airbender/Badgermole-Cub/',
  },
  'Amped Raptor': {
    name: 'Amped Raptor', cost: '{1}{R}', mv: 2, types: ['creature'], subtypes: ['Dinosaur'], colors: ['R'],
    power: 2, toughness: 1,
    oracle: 'First strike\nWhen Amped Raptor enters, you get {E}{E} (two energy counters). Then if you cast it from your hand, exile cards from the top of your library until you exile a nonland card. You may cast that card by paying an amount of {E} equal to its mana value rather than paying its mana cost.',
    verified: true, source: 'https://scryfall.com/card/mh3/114',
  },
  'Voice of Victory': {
    name: 'Voice of Victory', cost: '{1}{W}', mv: 2, types: ['creature'], subtypes: ['Human', 'Bard'], colors: ['W'],
    power: 1, toughness: 3,
    oracle: "Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)\nYour opponents can't cast spells during your turn.",
    verified: true, source: 'https://www.mtg.wtf/card/tdm/33/Voice-of-Victory (cost, P/T, text); https://www.magecards.co.uk/cards/tarkir-dragonstorm/33/voice-of-victory (type line, Mobilize reminder)',
  },
  'It That Heralds the End': {
    name: 'It That Heralds the End', cost: '{1}{C}', mv: 2, types: ['creature'], subtypes: ['Eldrazi', 'Drone'], colors: [],
    power: 2, toughness: 2,
    oracle: 'Colorless spells you cast with mana value 7 or greater cost {1} less to cast.\nOther colorless creatures you control get +1/+1.',
    verified: true, source: 'https://scryfall.com/card/mh3/9',
  },
  'Glaring Fleshraker': {
    name: 'Glaring Fleshraker', cost: '{2}{C}', mv: 3, types: ['creature'], subtypes: ['Eldrazi', 'Drone'], colors: [],
    power: 2, toughness: 2,
    oracle: 'Whenever you cast a colorless spell, create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this creature: Add {C}."\nWhenever another colorless creature you control enters, Glaring Fleshraker deals 1 damage to each opponent.',
    verified: true, source: 'https://scryfall.com/card/mh3/7',
  },
  'Reality Smasher': {
    name: 'Reality Smasher', cost: '{4}{C}', mv: 5, types: ['creature'], subtypes: ['Eldrazi'], colors: [],
    power: 5, toughness: 5,
    oracle: '({C} represents colorless mana.)\nTrample, haste\nWhenever Reality Smasher becomes the target of a spell an opponent controls, counter that spell unless its controller discards a card.',
    verified: true, source: 'https://scryfall.com/card/ogw/7',
  },
  'Thought-Knot Seer': {
    name: 'Thought-Knot Seer', cost: '{3}{C}', mv: 4, types: ['creature'], subtypes: ['Eldrazi'], colors: [],
    power: 4, toughness: 4,
    oracle: '({C} represents colorless mana.)\nWhen Thought-Knot Seer enters the battlefield, target opponent reveals their hand. You choose a nonland card from it and exile that card.\nWhen Thought-Knot Seer leaves the battlefield, target opponent draws a card.',
    verified: true, source: 'https://scryfall.com/card/sld/720',
  },
  'Eldrazi Linebreaker': {
    name: 'Eldrazi Linebreaker', cost: '{1}{C}{R}', mv: 3, types: ['creature'], subtypes: ['Eldrazi'], colors: [],
    power: 3, toughness: 3,
    oracle: 'Devoid (This card has no color.)\nTrample\nAt the beginning of combat on your turn, target creature you control gains haste and gets +X/+0 until end of turn, where X is the number of Eldrazi you control.',
    verified: true, source: 'https://scryfall.com/card/mh3/117 (cross-checked https://mtg.wtf/card/mh3/117/Eldrazi-Linebreaker)',
  },
  'Noble Hierarch': {
    name: 'Noble Hierarch', cost: '{G}', mv: 1, types: ['creature'], subtypes: ['Human', 'Druid'], colors: ['G'],
    power: 0, toughness: 1,
    oracle: 'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\n{T}: Add {G}, {W}, or {U}.',
    verified: true, source: 'https://scryfall.com/card/j12/3',
  },
  'Ignoble Hierarch': {
    name: 'Ignoble Hierarch', cost: '{G}', mv: 1, types: ['creature'], subtypes: ['Goblin', 'Shaman'], colors: ['G'],
    power: 0, toughness: 1,
    oracle: 'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\n{T}: Add {B}, {R}, or {G}.',
    verified: true, source: 'https://scryfall.com/card/mh2/414',
  },
  'Goblin Guide': {
    name: 'Goblin Guide', cost: '{R}', mv: 1, types: ['creature'], subtypes: ['Goblin', 'Scout'], colors: ['R'],
    power: 2, toughness: 2,
    oracle: "Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.",
    verified: true, source: 'https://scryfall.com/card/2xm/127',
  },
  'Monastery Swiftspear': {
    name: 'Monastery Swiftspear', cost: '{R}', mv: 1, types: ['creature'], subtypes: ['Human', 'Monk'], colors: ['R'],
    power: 1, toughness: 2,
    oracle: 'Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
    verified: true, source: 'https://scryfall.com/card/bro/144/monastery-swiftspear',
  },
  'Dark Matter Manipulator': {
    name: 'Dark Matter Manipulator', cost: '{B}', mv: 1, types: ['creature'], subtypes: ['Human', 'Warlock'], colors: ['B'],
    power: 1, toughness: 2,
    oracle: 'When this creature enters, mill three cards. This creature gets +2/+0 for every seven cards in your graveyard.',
    verified: true, source: 'https://www.mtg.wtf/card/fra/52/Dark-Matter-Manipulator',
  },
  'Mockingbird': {
    name: 'Mockingbird', cost: '{X}{U}', mv: 1, types: ['creature'], subtypes: ['Bird', 'Bard'], colors: ['U'],
    power: 1, toughness: 1,
    oracle: "Flying\nYou may have Mockingbird enter as a copy of any creature on the battlefield with mana value less than or equal to the amount of mana spent to cast Mockingbird, except it's a Bird in addition to its other types and it has flying.",
    verified: true, source: 'https://scryfall.com/card/blb/61/mockingbird',
  },
  'Stoneforge Mystic': {
    name: 'Stoneforge Mystic', cost: '{1}{W}', mv: 2, types: ['creature'], subtypes: ['Kor', 'Artificer'], colors: ['W'],
    power: 1, toughness: 2,
    oracle: 'When Stoneforge Mystic enters the battlefield, you may search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{1}{W}, {T}: You may put an Equipment card from your hand onto the battlefield.',
    verified: true, source: 'https://scryfall.com/card/wwk/20',
  },
  'Snapcaster Mage': {
    name: 'Snapcaster Mage', cost: '{1}{U}', mv: 2, types: ['creature'], subtypes: ['Human', 'Wizard'], colors: ['U'],
    power: 2, toughness: 1,
    oracle: 'Flash\nWhen Snapcaster Mage enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)',
    verified: true, source: 'https://scryfall.com/card/mm3/50',
  },
  'Dauthi Voidwalker': {
    name: 'Dauthi Voidwalker', cost: '{B}{B}', mv: 2, types: ['creature'], subtypes: ['Dauthi', 'Rogue'], colors: ['B'],
    power: 3, toughness: 2,
    oracle: "Shadow (This creature can block or be blocked by only creatures with shadow.)\nIf a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it.\n{T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost.",
    verified: true, source: 'https://mtgassist.com/cards/Modern-Horizons-2/Dauthi-Voidwalker/',
  },
  'Scythecat Cub': {
    name: 'Scythecat Cub', cost: '{1}{G}', mv: 2, types: ['creature'], subtypes: ['Cat'], colors: ['G'],
    power: 2, toughness: 2,
    oracle: 'Trample\nLandfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control. If this is the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead.',
    verified: true, source: 'https://scryfall.com/card/j25/24/scythecat-cub',
  },
  'Kappa Cannoneer': {
    name: 'Kappa Cannoneer', cost: '{5}{U}', mv: 6, types: ['artifact', 'creature'], subtypes: ['Turtle', 'Warrior'], colors: ['U'],
    power: 4, toughness: 4,
    oracle: "Improvise (Your artifacts can help cast this spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)\nWard {4}\nWhenever an artifact enters the battlefield under your control, put a +1/+1 counter on Kappa Cannoneer and it can't be blocked this turn.",
    verified: true, source: 'https://scryfall.com/card/mh3/401/kappa-cannoneer',
  },
  'Hogaak, Arisen Necropolis': {
    name: 'Hogaak, Arisen Necropolis', cost: '{5}{B/G}{B/G}', mv: 7, types: ['creature'], supertypes: ['legendary'], subtypes: ['Avatar'], colors: ['B', 'G'],
    power: 8, toughness: 8,
    oracle: "You can't spend mana to cast this spell.\nConvoke, delve (Each creature you tap while casting this spell pays for {1} or one mana of that creature's color. Each card you exile from your graveyard pays for {1}.)\nYou may cast this card from your graveyard.\nTrample",
    verified: true, source: 'https://scryfall.com/card/mh1/202/hogaak-arisen-necropolis',
  },
  'Barrowgoyf': {
    name: 'Barrowgoyf', cost: '{2}{B}', mv: 3, types: ['creature'], subtypes: ['Lhurgoyf'], colors: ['B'],
    power: '*', toughness: '1+*',
    oracle: "Deathtouch, lifelink\nBarrowgoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.\nWhenever Barrowgoyf deals combat damage to a player, you may mill that many cards. If you do, you may put a creature card from among them into your hand.",
    verified: true, source: 'https://scryfall.com/card/m3c/50/barrowgoyf',
  },
  'Allosaurus Shepherd': {
    name: 'Allosaurus Shepherd', cost: '{G}', mv: 1, types: ['creature'], subtypes: ['Elf', 'Shaman'], colors: ['G'],
    power: 1, toughness: 1,
    oracle: "This spell can't be countered.\nGreen spells you control can't be countered.\n{4}{G}{G}: Until end of turn, each Elf creature you control has base power and toughness 5/5 and becomes a Dinosaur in addition to its other creature types.",
    verified: true, source: 'https://scryfall.com/card/jmp/28',
  },
  'Elvish Reclaimer': {
    name: 'Elvish Reclaimer', cost: '{G}', mv: 1, types: ['creature'], subtypes: ['Elf', 'Warrior'], colors: ['G'],
    power: 1, toughness: 2,
    oracle: 'Elvish Reclaimer gets +2/+2 as long as there are three or more land cards in your graveyard.\n{2}, {T}, Sacrifice a land: Search your library for a land card, put it onto the battlefield tapped, then shuffle.',
    verified: true, source: 'https://scryfall.com/card/m20/169',
  },
  'Wight of the Reliquary': {
    name: 'Wight of the Reliquary', cost: '{B}{G}', mv: 2, types: ['creature'], subtypes: ['Zombie', 'Knight'], colors: ['B', 'G'],
    power: 2, toughness: 2,
    oracle: 'Vigilance\nWight of the Reliquary gets +1/+1 for each creature card in your graveyard.\n{T}, Sacrifice another creature: Search your library for a land card, put it onto the battlefield tapped, then shuffle.',
    verified: true, source: 'https://scryfall.com/card/mh3/207/wight-of-the-reliquary',
  },
  'Knight of the Reliquary': {
    name: 'Knight of the Reliquary', cost: '{1}{G}{W}', mv: 3, types: ['creature'], subtypes: ['Human', 'Knight'], colors: ['G', 'W'],
    power: 2, toughness: 2,
    oracle: 'Knight of the Reliquary gets +1/+1 for each land card in your graveyard.\n{T}, Sacrifice a Forest or Plains: Search your library for a land card, put it onto the battlefield, then shuffle.',
    verified: true, source: 'https://scryfall.com/card/ddg/1',
  },
  'Emry, Lurker of the Loch': {
    name: 'Emry, Lurker of the Loch', cost: '{2}{U}', mv: 3, types: ['creature'], supertypes: ['legendary'], subtypes: ['Merfolk', 'Wizard'], colors: ['U'],
    power: 1, toughness: 2,
    oracle: 'Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nWhen Emry enters, mill four cards.\n{T}: Choose target artifact card in your graveyard. You may cast that card this turn. (You still pay its costs. Timing rules still apply.)',
    verified: true, source: 'https://mtg.wtf/card/mul/9/Emry-Lurker-of-the-Loch (cost, P/T, text); https://scrytics.com/cards/emry-lurker-of-the-loch-eld-bf4b9a8a (reminder text)',
  },
  'Goblin Welder': {
    name: 'Goblin Welder', cost: '{R}', mv: 1, types: ['creature'], subtypes: ['Goblin', 'Artificer'], colors: ['R'],
    power: 1, toughness: 1,
    oracle: "{T}: Choose target artifact a player controls and target artifact card in that player's graveyard. If both targets are still legal as this ability resolves, that player simultaneously sacrifices the artifact and returns the artifact card to the battlefield.",
    verified: true, source: 'https://scryfall.com/card/g11/8',
  },
  'Goblin Engineer': {
    name: 'Goblin Engineer', cost: '{1}{R}', mv: 2, types: ['creature'], subtypes: ['Goblin', 'Artificer'], colors: ['R'],
    power: 1, toughness: 2,
    oracle: 'When Goblin Engineer enters the battlefield, you may search your library for an artifact card, put it into your graveyard, then shuffle.\n{R}, {T}, Sacrifice an artifact: Return target artifact card with mana value 3 or less from your graveyard to the battlefield.',
    verified: true, source: 'https://scryfall.com/card/h1r/16',
  },
  'Sylvan Safekeeper': {
    name: 'Sylvan Safekeeper', cost: '{G}', mv: 1, types: ['creature'], subtypes: ['Human', 'Wizard'], colors: ['G'],
    power: 1, toughness: 1,
    oracle: "Sacrifice a land: Target creature you control gains shroud until end of turn. (It can't be the target of spells or abilities.)",
    verified: true, source: 'https://scryfall.com/card/jud/133',
  },
  'Quirion Ranger': {
    name: 'Quirion Ranger', cost: '{G}', mv: 1, types: ['creature'], subtypes: ['Elf', 'Ranger'], colors: ['G'],
    power: 1, toughness: 1,
    oracle: "Return a Forest you control to its owner's hand: Untap target creature. Activate only once each turn.",
    verified: true, source: 'https://scryfall.com/card/prm/36012',
  },
  'Formidable Speaker': {
    name: 'Formidable Speaker', cost: '{2}{G}', mv: 3, types: ['creature'], subtypes: ['Elf', 'Druid'], colors: ['G'],
    power: 2, toughness: 4,
    oracle: 'When this creature enters, you may discard a card. If you do, search your library for a creature card, reveal it, put it into your hand, then shuffle.\n{1}, {T}: Untap another target permanent.',
    verified: true, source: 'https://mtg.wtf/card/ecl/176/Formidable-Speaker',
  },
});
