# Card text sources

Checked 2026-11-19. Data lives in `src/oppCards.js` (`OPP_CARDS`, 99 cards, all `verified: true`).

**Method.** For each card: a web search to find a card page, then a fetch of that page with the Oracle text quoted clause by clause. Scryfall card pages were used where reachable. Otherwise the source was mtg.wtf, mtgassist, iwantmymtg, hareruyamtg or magecards. Scryfall search pages and api.scryfall.com could not be fetched.

**Caveats.**
- Some Scryfall pages came from an older cache. For example, the Wight of the Reliquary page still said "unreleased". Those pages use the pre-2024 "enters the battlefield" wording instead of "enters". The text is recorded as fetched; the rules meaning is the same.
- Two pages left out reminder text that current Oracle text includes: Bowmasters' "amass" and Solitude's "evoke". The rules meaning is unchanged.
- Back-face loyalty for Tamiyo, Seasoned Scholar and Ajani, Nacatl Avenger did not appear on any page checked, so it is stored as `null`.

**Notes key.** *Oracle* means my Thassa's Oracle. Its ETB trigger counts devotion when it **resolves**. So any removal or bounce of Oracle while the trigger is on the stack lowers X by 2, and with no other blue permanents X becomes 0. That still wins only if my library is empty at that point.

| Card | Verified | Source | Notes for a Doomsday player |
|---|---|---|---|
| Force of Will | yes | https://scryfall.com/card/dmr/50 | Alt cost / free. Hard counter: Doomsday, Oracle (unless Cavern). |
| Force of Negation | yes | https://scryfall.com/card/mh1/52 | Free only when it's not their turn, so it's free on my turn. Noncreature only, so it can't hit Oracle. Exiles the spell. |
| Daze | yes | https://mtgassist.com/cards/Eternal-Masters/Daze/ | Alt cost / free (return an Island). Soft counter: pay {1}. |
| Stifle | yes | https://scryfall.com/card/mp2/18 | Can counter an activated or triggered ability: Oracle trigger, cycling (Street Wraith, Unearth, Edge of Autumn), fetchland activation. Can't target mana abilities (LED, Petal, lands). |
| Swords to Plowshares | yes | https://scryfall.com/card/dmr/31 | Instant-speed removal. Exiling Oracle with its trigger on the stack drops devotion by 2. |
| Thoughtseize | yes | https://scryfall.com/card/akr/127/thoughtseize | Takes any nonland card. Sorcery speed. |
| Orcish Bowmasters | yes | https://scryfall.com/card/ltr/433/orcish-bowmasters | Flash. Pings 1 for each extra draw I make (Brainstorm = 3, cycling = 1). Doesn't kill Oracle (1/3) alone. Life loss matters after Doomsday halves my life. |
| Disruptor Flute | yes | https://scryfall.com/card/mh3/209/disruptor-flute | Flash, so it can name a card in response. Taxes the named spell {3}. Stops non-mana activated abilities: cycling, fetch activation. LED/Petal are mana abilities, so they still work. |
| Chalice of the Void | yes | https://scryfall.com/card/j19/7 | X=0 counters Petal/LED. X=1 counters cantrips, Ritual, Unearth, Duress. X=2 counters Oracle and Flow State. Uses a counter trigger, so Cavern beats it. |
| Consign to Memory | yes | https://scryfall.com/card/mh3/54 | Can counter a triggered ability (Oracle ETB) **or a colorless spell** (Lotus Petal, LED). Not activated abilities. Replicate can hit several. |
| Kozilek's Command | yes | https://mtgassist.com/cards/Modern-Horizons-3/Kozilek-s-Command/ | Instant. Can exile Oracle (MV 2) with the trigger on the stack. Can exile graveyard cards (Unearth targets). The "target player scries X, then draws" mode can target **me** and force a draw from my pile. |
| Pyroblast | yes | https://scryfall.com/card/ice/213 | Counters blue spells (Brainstorm, Oracle, Personal Tutor, Flow State). Can destroy Oracle at instant speed with the trigger on the stack. |
| Red Elemental Blast | yes | https://scryfall.com/card/3ed/171 | Same as Pyroblast, except it must target a blue spell or permanent. |
| Surgical Extraction | yes | https://scryfall.com/card/nph/74 | Free (2 life). Instant. Exiles every copy of a card from my graveyard, hand **and library**, so it can pull pile cards and then shuffle my library. |
| Spell Pierce | yes | https://scryfall.com/card/sld/41 | Soft counter, noncreature: pay {2}. Can't hit Oracle. |
| Flusterstorm | yes | https://scryfall.com/card/cmd/46/flusterstorm | Soft counter for instants and sorceries; storm copies scale with my spell count. Can't hit Oracle. |
| Fatal Push | yes | https://scryfall.com/card/f17/8 | Instant removal; kills Oracle (MV 2) with the trigger on the stack. |
| Snuff Out | yes | https://scryfall.com/card/gvl/53 | Alt cost / free (4 life, needs a Swamp). Instant. Oracle is nonblack, so it's a legal target. |
| Dismember | yes | https://scryfall.com/card/spg/41 | Can cost {1} and 4 life. Instant. Kills Oracle. |
| Solitude | yes | https://mtgassist.com/cards/Modern-Horizons-2/Solitude/ | Flash. Free via evoke. Its ETB exiles Oracle; resolves before the Oracle trigger if cast in response. |
| Spell Snare | yes | https://scryfall.com/card/mma/64 | Counters MV 2 exactly: **Oracle**, Flow State. |
| Pact of Negation | yes | https://scryfall.com/card/fut/42 | Free hard counter. If I win on the stack, they never pay the upkeep cost. |
| Mindbreak Trap | yes | https://scryfall.com/card/zen/57/mindbreak-trap | Free once I've cast 3+ spells in a turn (normal for a Doomsday turn). **Exiles** spells instead of countering them, so Cavern of Souls does not protect Oracle. |
| Duress | yes | https://scryfall.com/card/usg/132/duress | Takes noncreature, nonland cards only. Oracle and Street Wraith are safe. |
| Unmask | yes | https://mtgassist.com/cards/Mercadian-Masques/Unmask/ | Alt cost / free (exile a black card). Sorcery speed. |
| Cabal Therapy | yes | https://scryfall.com/card/f05/5 | Names a card; takes every copy. Flashback by sacrificing a creature. |
| Inquisition of Kozilek | yes | https://scryfall.com/card/sta/31 | MV 3 or less. Hits Doomsday (MV 3). |
| Collective Brutality | yes | https://scryfall.com/card/sir/103 | Sorcery. Discards an instant or sorcery. The -2/-2 mode doesn't kill Oracle (1/3). |
| Wasteland | yes | https://scryfall.com/card/sld/178/wasteland | Affects nonbasic lands: Underground Sea, Cavern, Undercity Sewers. Can be activated in response to a fetch. |
| Ghost Quarter | yes | https://scryfall.com/card/md1/26 | Hits any land. I may fetch a basic, which shuffles my library and **destroys a Doomsday pile order**; the search is optional. |
| Sphere of Resistance | yes | https://scryfall.com/card/exo/139 | Taxes all spells {1}, including Oracle. |
| Trinisphere | yes | https://scryfall.com/card/mps/52 | Every spell costs at least 3 while untapped (Petal, LED, Ritual, cantrips, Oracle). |
| Thorn of Amethyst | yes | https://scryfall.com/card/brr/60 | Taxes noncreature spells {1}. Oracle is unaffected. |
| Damping Sphere | yes | https://scryfall.com/card/dmr/377 | Taxes {1} per spell I've already cast this turn. Doesn't change my lands (each makes 1 mana). |
| Thalia, Guardian of Thraben | yes | https://scryfall.com/card/a25/36 | Taxes noncreature spells (affects both players). First strike 2/1. Legendary. |
| Deafening Silence | yes | https://scryfall.com/card/eld/10 | Limits me to one noncreature spell per turn (affects both players). Oracle is a creature, so it is still castable. |
| Gaddock Teeg | yes | https://www.scryfall.com/card/j17/3/gaddock-teeg | Bans noncreature spells with MV 4+ or {X}. Doomsday (MV 3) is still legal. |
| Archon of Emeria | yes | https://scryfall.com/card/mb2/4 | Limits each player to **one spell per turn**, including creature spells, so Oracle counts too. My nonbasic lands enter tapped, including fetched Underground Sea. Flying 2/3. |
| Pithing Needle | yes | https://scryfall.com/card/sld/44 | Stops a named card's non-mana activated abilities: fetchland, cycling. LED/Petal are mana abilities and still work. |
| Grafdigger's Cage | yes | https://scryfall.com/card/m20/227 | **Unearth can't return Oracle**: creature cards in graveyards can't enter the battlefield. Also blocks casting from the graveyard. |
| Narset, Parter of Veils | yes | https://scryfall.com/card/cmm/853/narset-parter-of-veils | Limits draws to one per turn. Brainstorm draws 1 and still puts back 2; a second cantrip or cycle draws 0. |
| Teferi, Time Raveler | yes | https://scryfall.com/card/blc/92 | I can only cast at sorcery speed: no responses, no Brainstorm on their turn. Its −3 bounces Oracle (sorcery speed, their turn). |
| Hullbreacher | yes | https://scryfall.com/card/cmr/74/hullbreacher | Flash. **Replaces** each of my extra draws with a Treasure for them; Brainstorm draws 0 then puts back 2. |
| Torpor Orb | yes | https://scryfall.com/card/big/92/torpor-orb | Stops ETB triggers: **Oracle's trigger never happens**. |
| Collector Ouphe | yes | https://scryfall.com/card/mh1/158/collector-ouphe | Stops all activated abilities of artifacts, **including mana abilities**: Lotus Petal and LED can't be activated. |
| Karn, the Great Creator | yes | https://scryfall.com/card/war/1 | Same artifact lock as Ouphe, but only for opponents' artifacts: Petal and LED are dead. |
| Magus of the Moon | yes | https://scryfall.com/card/fut/101 | Affects nonbasic lands. Sea, Cavern and fetches become Mountains that tap for {R}; fetches lose their search ability. |
| Blood Moon | yes | https://scryfall.com/card/sld/366 | Same as Magus. |
| Back to Basics | yes | https://scryfall.com/card/uma/46 | Affects nonbasic lands: they don't untap. |
| Tormod's Crypt | yes | https://scryfall.com/card/dmr/235/tormods-crypt | Free and instant-speed (activated ability). Exiles my graveyard, removing Unearth targets. |
| Hexing Squelcher | yes | https://iwantmymtg.net/card/ecl/145 + https://www.hareruyamtg.com/en/products/detail/186623?lang=EN | Their spells can't be countered. Ward—Pay 2 life on their creatures (matters for Fatal Push). |
| Quantum Riddler | yes | https://www.mtg.wtf/card/eoe/72/Quantum-Riddler | Only boosts their own draws. 4/6 flier clock. |
| Phelia, Exuberant Shepherd | yes | https://scryfall.com/card/mh3/40 | Flash. On attack, exiles a nonland permanent until end step; it returns under its owner's control. Flickering my Oracle re-triggers its ETB at end of turn. |
| Tamiyo, Inquisitive Student | yes | https://scryfall.com/card/mh3/242 + https://mtg.wtf/card/mh3/242a/Tamiyo-Inquisitive-Student | 0/3 flier. Little interaction. |
| Sink into Stupor | yes | https://scryfall.com/card/mh3/241 | Instant. **Bounces a spell** (Doomsday, Oracle) back to hand. It isn't a counter, so Cavern doesn't stop it. Can also bounce Oracle with the trigger on the stack. Back face is a land. |
| Prismatic Ending | yes | https://scryfall.com/card/mb2/16 | Sorcery. Exiles a permanent of low MV. |
| Lightning Bolt | yes | https://scryfall.com/card/pd2/17 | Instant. Kills Oracle (3 toughness) with the trigger on the stack. |
| Goblin Bombardment | yes | https://scryfall.com/card/tpr/136/goblin-bombardment | Free instant-speed damage, 1 per creature sacrificed. Can finish me after Doomsday halves my life. |
| Veil of Summer | yes | https://scryfall.com/card/m20/198 | Their spells can't be countered; hexproof from blue and black. Blanks my Duress/Thoughtseize/Daze/FoW for that turn. |
| Mental Misstep | yes | https://scryfall.com/card/nph/38 | Free (2 life). Counters MV 1: Brainstorm, Ponder, Consider, Ritual, Unearth, Personal Tutor, Duress. |
| Ocelot Pride | yes | https://scryfall.com/card/mh3/38 | 1/1 first strike, lifelink. Makes tokens. |
| Guide of Souls | yes | https://scryfall.com/card/mh3/29 | 1/2. Energy. |
| Ajani, Nacatl Pariah | yes | https://scryfall.com/card/mh3/237 + https://mtg.wtf/card/mh3/468a/Ajani-Nacatl-Pariah | 1/2 plus a 2/1 token: 3 power for 2 mana. Back face loyalty not verified. |
| Endurance | yes | https://scryfall.com/card/h2r/14 | Flash, 3/4, free via evoke. **Can target me**: puts my whole graveyard on the bottom of my library. In response to the Oracle trigger, that adds cards to my library, so X may fall short. Also removes Unearth targets. |
| Murktide Regent | yes | https://scryfall.com/card/slp/17 | Variable size: 3/3 plus counters. Flier. |
| Nethergoyf | yes | https://scryfall.com/card/mh3/454 | P/T is `*/1+*`, counting card types in their own graveyard. |
| Dragon's Rage Channeler | yes | https://scryfall.com/card/h2r/9 | 1/1, or 3/3 flier with delirium. |
| Delver of Secrets | yes | https://scryfall.com/card/isd/51 | 1/1; flips to a 3/2 flier. |
| Badgermole Cub | yes | https://mtgassist.com/cards/Avatar-The-Last-Airbender/Badgermole-Cub/ | 2/2, plus a land that becomes a 1/1 haste creature (earthbend). |
| Amped Raptor | yes | https://scryfall.com/card/mh3/114 | 2/1 first strike. Cascades into a free spell. |
| Voice of Victory | yes | https://www.mtg.wtf/card/tdm/33/Voice-of-Victory + https://www.magecards.co.uk/cards/tarkir-dragonstorm/33/voice-of-victory | **I can't cast spells during their turn**: no end-of-turn Brainstorm, no instant-speed Doomsday setup. 1/3 plus two 1/1 attackers. Type is **Human Bard**. |
| It That Heralds the End | yes | https://scryfall.com/card/mh3/9 | Colorless 2/2 lord. |
| Glaring Fleshraker | yes | https://scryfall.com/card/mh3/7 | Colorless 2/2. Pings when colorless creatures enter. |
| Reality Smasher | yes | https://scryfall.com/card/ogw/7 | 5/5 trample, haste. My targeted spells (Fatal Push) cost a discard. |
| Thought-Knot Seer | yes | https://scryfall.com/card/sld/720 | 4/4. ETB exiles a nonland card from my hand. When it leaves, I draw. |
| Eldrazi Linebreaker | yes | https://scryfall.com/card/mh3/117 (cross-checked mtg.wtf) | Devoid (colorless) 3/3 trample. Gives haste and pump. |
| Noble Hierarch | yes | https://scryfall.com/card/j12/3 | 0/1, exalted. |
| Ignoble Hierarch | yes | https://scryfall.com/card/mh2/414 | 0/1, exalted. |
| Goblin Guide | yes | https://scryfall.com/card/2xm/127 | 2/2 haste. **On attack it reveals my top card; if that's a land it goes to my hand**, which breaks a Doomsday pile that has a land on top. |
| Monastery Swiftspear | yes | https://scryfall.com/card/bro/144/monastery-swiftspear | 1/2 haste, prowess. |
| Dark Matter Manipulator | yes | https://www.mtg.wtf/card/fra/52/Dark-Matter-Manipulator | 1/2, +2/+0 per 7 cards in their own graveyard. Only source found was mtg.wtf (Reality Fracture). |
| Mockingbird | yes | https://scryfall.com/card/blb/61/mockingbird | Variable (copies a creature); 1/1 flier base. |
| Stoneforge Mystic | yes | https://scryfall.com/card/wwk/20 | 1/2. Puts equipment into play at instant speed. |
| Snapcaster Mage | yes | https://scryfall.com/card/mm3/50 | Flash 2/1. Re-buys a counter or removal spell. |
| Dauthi Voidwalker | yes | https://mtgassist.com/cards/Modern-Horizons-2/Dauthi-Voidwalker/ | 3/2 shadow, unblockable in practice. **My cards go to exile instead of my graveyard**: Oracle can't be Unearthed, and Flow State's instant-and-sorcery check fails. They can sacrifice it to cast one of my exiled cards (even Doomsday or Oracle). |
| Scythecat Cub | yes | https://scryfall.com/card/j25/24/scythecat-cub | 2/2 trample that grows with landfall. |
| Kappa Cannoneer | yes | https://scryfall.com/card/mh3/401/kappa-cannoneer | 4/4 with ward {4}, grows. |
| Hogaak, Arisen Necropolis | yes | https://scryfall.com/card/mh1/202/hogaak-arisen-necropolis | 8/8 trample. |
| Barrowgoyf | yes | https://scryfall.com/card/m3c/50/barrowgoyf | `*/1+*`, counting card types in **all** graveyards, so my graveyard grows it. Deathtouch, lifelink. |
| Allosaurus Shepherd | yes | https://scryfall.com/card/jmp/28 | Their green spells can't be countered. 1/1. |
| Elvish Reclaimer | yes | https://scryfall.com/card/m20/169 | 1/2, or 3/4 with 3+ lands in their graveyard. |
| Wight of the Reliquary | yes | https://scryfall.com/card/mh3/207/wight-of-the-reliquary | 2/2 vigilance, +1/+1 per creature card in their graveyard. |
| Knight of the Reliquary | yes | https://scryfall.com/card/ddg/1 | 2/2, +1/+1 per land in their graveyard. |
| Emry, Lurker of the Loch | yes | https://mtg.wtf/card/mul/9/Emry-Lurker-of-the-Loch + scrytics (reminder text) | 1/2. |
| Goblin Welder | yes | https://scryfall.com/card/g11/8 | 1/1. Its ability can target my artifacts (Petal or LED in play swapped with one in my graveyard). |
| Goblin Engineer | yes | https://scryfall.com/card/h1r/16 | 1/2. |
| Sylvan Safekeeper | yes | https://scryfall.com/card/jud/133 | 1/1. Gives their creatures shroud, which fizzles my Fatal Push. |
| Quirion Ranger | yes | https://scryfall.com/card/prm/36012 | 1/1. |
| Formidable Speaker | yes | https://mtg.wtf/card/ecl/176/Formidable-Speaker | 2/4. Untaps a permanent. |

## My deck re-verification

Each card's current Oracle text compared with `src/cards.js` (`oracle` field) and SPEC.md §7. Neither file was edited.

| Card | Verified | Source | Matches `src/cards.js`? | Notes / discrepancy |
|---|---|---|---|---|
| Brainstorm | yes | https://scryfall.com/card/f04/12/brainstorm | yes | |
| Ponder | yes | https://scryfall.com/card/slp/19/ponder | yes | |
| Consider | yes | https://scryfall.com/card/dbl/44 | **no (reminder text)** | Oracle: "Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\nDraw a card." cards.js says "put **that card** into your graveyard". |
| Dark Ritual | yes | https://scryfall.com/card/mir/116 | yes | |
| Lotus Petal | yes | https://scryfall.com/card/tpr/225/lotus-petal | yes | Cost {0}, artifact. |
| Lion's Eye Diamond | yes | https://scryfall.com/card/vma/271 | yes | Mana ability, so Stifle/Needle/Flute can't stop it. Ouphe and Karn can. |
| Street Wraith | yes | https://scryfall.com/card/mma/99 | **no (reminder text)** | Oracle includes Swampwalk's reminder text: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)". cards.js has bare "Swampwalk". P/T 3/4 is not stored in cards.js. |
| Unearth | yes | https://mtgassist.com/cards/Urza-s-Legacy/Unearth/ | yes | |
| Cavern of Souls | yes | https://scryfall.com/card/zne/22 | yes | It makes the spell **uncounterable**. It does not stop exile (Mindbreak Trap), bounce (Sink into Stupor) or ETB-trigger counters (Stifle, Consign). |
| Island | yes | https://scryfall.com/card/lci/396/island | yes | Basic Land — Island, "({T}: Add {U}.)" |
| Underground Sea | yes | https://scryfall.com/card/3ed/290/underground-sea | yes | Land — Island Swamp. |
| Polluted Delta | yes | https://scryfall.com/card/g09/8 | yes | "{T}, Pay 1 life, Sacrifice Polluted Delta: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle." |
| Fetchland family pattern | yes | https://scryfall.com/card/mh2/250/misty-rainforest | yes | Misty Rainforest reads "a Forest or Island card", which matches the `fetch()` template's type order and "a"/"an" choice. The other four fetches were not fetched individually. |
| Duress | yes | https://scryfall.com/card/usg/132/duress | yes | |
| Thoughtseize | yes | https://scryfall.com/card/akr/127/thoughtseize | yes | SPEC §7 says "target opponent"; the card says **"Target player"**. This is a modelling simplification, not a text error. |
| Fatal Push | yes | https://scryfall.com/card/f17/8 | **no** | Oracle revolt clause: "...if a permanent **you controlled left the battlefield** this turn." cards.js says "...if a permanent **left the battlefield under your control** this turn." SPEC §7's "target opponent creature" is a modelling limit; the card can target any creature. |
| Daze | yes | https://mtgassist.com/cards/Eternal-Masters/Daze/ | yes | |
| Force of Will | yes | https://scryfall.com/card/dmr/50 | yes | |
| (also checked) Force of Negation | yes | https://scryfall.com/card/mh1/52 | yes | |
| (also checked) Flusterstorm | yes | https://scryfall.com/card/cmd/46/flusterstorm | **no (reminder text)** | Oracle has "Storm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)". cards.js has bare "Storm". |
| (also checked) Barrowgoyf | yes | https://scryfall.com/card/m3c/50/barrowgoyf | yes | |
| (also checked) Voice of Victory | yes | https://www.mtg.wtf/card/tdm/33/Voice-of-Victory + https://www.magecards.co.uk/cards/tarkir-dragonstorm/33/voice-of-victory | **no** | Type line is **Creature — Human Bard**; cards.js has subtypes `['Human', 'Monk']`. Oracle also includes the Mobilize reminder text. Cost {1}{W} matches. |

SPEC §6 static effects (Deafening Silence, Thalia, Gaddock Teeg, Chalice, Disruptor Flute) match the verified Oracle text. Two notes:
- Thalia and Deafening Silence affect both players; the model only applies them to me.
- Chalice counters with a triggered ability. Cavern's "can't be countered" beats it, as SPEC says.
