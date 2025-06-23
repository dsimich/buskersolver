import {
  beretBuskingEffects,
  canEquip,
  Effect,
  equip, // Added
  getPower,
  equippedAmount, // Added
  Item,
  equippedItem, // Added
  Modifier,
  myPath,
  npcPrice,
  numericModifier,
  print,
  toEffect,
  toInt,
  Slot, // Added
  toSlot,
} from "kolmafia";
import { $effect, $familiar, $item, $path, $skill, $slot, clamp, get, have, sum } from "libram";
import { args } from "./main";

export interface Busk {
  effects: Effect[];
  score: number;
  buskIndex: number;
  daRaw: number; // Damage Absorption Raw Power
}

export interface BuskResult {
  score: number;
  busks: Busk[];
}

// eslint-disable-next-line libram/verify-constants
const beret = $item`prismatic beret`;

function multipliers(): [number, number] {
  const taoHatMultiplier = have($skill`Tao of the Terrapin`) ? 2 : 1;
  const taoPantsMultiplier = have($skill`Tao of the Terrapin`) ? 1 : 0;
  const hammerTimeMultiplier = have($effect`Hammertime`) || args.checkhammertime ? 3 : 0;
  const totalPantsMultiplier = 1 + hammerTimeMultiplier + taoPantsMultiplier;

  return [taoHatMultiplier, totalPantsMultiplier];
}

function scoreBusk(
  effects: Effect[],
  weightedModifiers: [Modifier, number][],
  uselessEffects: Effect[]
): number {
  const usefulEffects = effects.filter((ef) => !uselessEffects.includes(ef));

  return sum(
    weightedModifiers,
    ([modifier, weight]) => weight * sum(usefulEffects, (ef) => numericModifier(ef, modifier))
  );
}

export function findTopBusksFast(
  weightedModifiers: [Modifier, number][],
  uselessEffects: Effect[],
  busknumber?: number
): BuskResult | null {
  const BUSKNUM = args.allbusks ? 5 : clamp(5 - toInt(get("_beretBuskingUses")), 0, 5);
  const beretDASum = beretPowerSum();
  const startBuskIndex = 5 - BUSKNUM;
  const allBusks =
    busknumber !== undefined
      ? beretDASum.map((daRaw) => {
          const buskIndex = busknumber - 1;
          const rawEffects = beretBuskingEffects(daRaw, buskIndex);
          const effects: Effect[] = Array.from(
            new Set(
              Object.keys(rawEffects)
                .map((name) => {
                  try {
                    return toEffect(name);
                  } catch {
                    print(`Invalid effect name: ${name}`, "red");
                    return null;
                  }
                })
                .filter((e): e is Effect => e !== null)
            )
          );
          const score = scoreBusk(effects, weightedModifiers, uselessEffects);
          return { daRaw, effects, score, buskIndex };
        })
      : beretDASum.flatMap((daRaw) => {
          return Array(BUSKNUM)
            .fill(null)
            .map((_, i) => {
              const buskIndex = startBuskIndex + i;
              const rawEffects = beretBuskingEffects(daRaw, buskIndex);
              const effects: Effect[] = Array.from(
                new Set(
                  Object.keys(rawEffects)
                    .map((name) => {
                      try {
                        return toEffect(name);
                      } catch {
                        print(`Invalid effect name: ${name}`, "red");
                        return null;
                      }
                    })
                    .filter((e): e is Effect => e !== null)
                )
              );
              const score = scoreBusk(effects, weightedModifiers, uselessEffects);
              return { daRaw, effects, score, buskIndex };
            });
        });

  const bestBusksByIndex = new Map<number, Busk>();
  for (const busk of allBusks) {
    const existing = bestBusksByIndex.get(busk.buskIndex);
    if (!existing || busk.score > existing.score) {
      bestBusksByIndex.set(busk.buskIndex, busk);
    }
  }

  const topBusks = Array.from(bestBusksByIndex.values());

  const totalScore = sum(topBusks, "score");
  return { score: totalScore, busks: topBusks };
}

export function reconstructOutfit(daRaw: number): { hat?: Item; shirt?: Item; pants?: Item } {
  const [taoHatMultiplier, totalPantsMultiplier] = multipliers();
  const onHatTrickPath = myPath() === $path`Hat Trick`;
  // allHats, allShirts, allPants are items we have() or can buy from NPC shops, and canEquip()

  if (onHatTrickPath) {
    let actualEquippedHatBasePower = 0;
    // Sum power of all currently equipped hats.
    // `allItems` includes items we `have()` and `canEquip()`, plus `npcPrice > 0 && canEquip()` items.
    // `equippedAmount(item)` will be 0 for unowned shop items, so this correctly sums
    // power only from hats that are genuinely equipped (implying we have them).
    for (const item of allItems) {
      if (toSlot(item) === $slot`hat` && equippedAmount(item) > 0) {
        actualEquippedHatBasePower += getPower(item);
      }
    }
    const actualEquippedHatPowerContribution = taoHatMultiplier * actualEquippedHatBasePower;

    // Candidate hats to add: from allHats (items we have/can buy & can equip),
    // and are not currently equipped (i.e., equippedAmount === 0).
    const candidateHatsToAdd = allHats.filter((h) => equippedAmount(h) === 0);

    for (const shirt of allShirts) {
      const shirtPower = getPower(shirt);
      for (const pants of allPants) {
        const pantsPower = totalPantsMultiplier * getPower(pants);

        // Scenario 1: Check if daRaw matches with an *additional* hat
        for (const hatToAdd of candidateHatsToAdd) {
          const additionalHatPowerContribution = taoHatMultiplier * getPower(hatToAdd);
          if (
            actualEquippedHatPowerContribution +
              additionalHatPowerContribution +
              shirtPower +
              pantsPower ===
            daRaw
          ) {
            // This daRaw was formed by adding 'hatToAdd'
            return { hat: hatToAdd, shirt, pants };
          }
        }

        // Scenario 2: Check if daRaw matches with *only* currently equipped hats (no new hat added)
        if (actualEquippedHatPowerContribution + shirtPower + pantsPower === daRaw) {
          // This daRaw was formed without adding a new hat.
          // 'hat' property remains undefined.
          return { shirt, pants };
        }
      }
    }
    return {}; // Should ideally find a match if daRaw was generated correctly
  } else {
    // Original logic for non-Hat Trick paths
    for (const hat of allHats) {
      const hatPower = taoHatMultiplier * getPower(hat);
      for (const shirt of allShirts) {
        const shirtPower = getPower(shirt);
        for (const pants of allPants) {
          const pantsPower = totalPantsMultiplier * getPower(pants);
          if (shirtPower + hatPower + pantsPower === daRaw) {
            return { hat, shirt, pants };
          }
        }
      }
    }
    return {};
  }
}

export function printBuskResult(result: BuskResult | null, modifiers: Modifier[]): void {
  if (!result) {
    print("No result found.");
    return;
  }

  print(`Score: ${result.score}`);
  print("\nBusk Info:");
  const onHatTrickPath = myPath() === $path`Hat Trick`;

  const bestBusksByIndex = new Map<number, Busk>();
  for (const busk of result.busks) {
    const existing = bestBusksByIndex.get(busk.buskIndex);
    if (!existing || busk.score > existing.score) {
      bestBusksByIndex.set(busk.buskIndex, busk);
    }
  }

  const bestBusks = Array.from(bestBusksByIndex.values()).sort((a, b) => a.buskIndex - b.buskIndex);

  for (const { effects, daRaw, buskIndex } of bestBusks) {
    const effectNames = effects.map((e) => e.name).join(", ");
    const modifierValues = modifiers
      .map((mod) => {
        const total = sum(effects, (ef) => numericModifier(ef, mod));
        return `${mod.name}: ${total}`;
      })
      .join(", ");
    print(`Power ${daRaw} Busk ${buskIndex + 1}, Effects: ${effectNames}, ${modifierValues}`);

    if (onHatTrickPath) {
      const { hat, shirt, pants } = reconstructOutfit(daRaw);
      if (hat) {
        // A hat is being added/suggested
        print(
          `  - Equipment: Hat = ${hat.name}, Shirt = ${shirt?.name ?? "?"}, Pants = ${
            pants?.name ?? "?"
          }`
        );
      } else {
        // No hat is being added, only shirt and pants (hats are implicitly the already equipped ones)
        print(`  - Equipment: Shirt = ${shirt?.name ?? "?"}, Pants = ${pants?.name ?? "?"}`);
      }
    } else {
      const { hat, shirt, pants } = reconstructOutfit(daRaw);
      print(
        `  - Equipment: Hat = ${hat?.name ?? "?"}, Shirt = ${shirt?.name ?? "?"}, Pants = ${
          pants?.name ?? "?"
        }`
      );
    }
    print("    "); // Extra newline for spacing
  }
}

export function equipBuskOutfit(hat?: Item, shirt?: Item, pants?: Item): void {
  const itemsToEquip: [Slot, Item | undefined][] = [
    [$slot`hat`, hat],
    [$slot`shirt`, shirt],
    [$slot`pants`, pants],
  ];

  for (const [slot, item] of itemsToEquip) {
    if (item) {
      // Check if the item is already equipped in the target slot
      if (equippedItem(slot) !== item) {
        print(`Equipping ${item.name} in ${slot.toString()}...`, "green");
        if (!equip(slot, item)) {
          print(
            `Failed to equip ${
              item.name
            } in ${slot.toString()}. You may not have the item or cannot equip it.`,
            "red"
          );
        }
      } else {
        print(`${item.name} is already equipped in ${slot.toString()}.`, "gray");
      }
    }
    // If item is undefined, we don't unequip the slot.
    // This is important for Hat Trick path where an undefined hat means "use currently equipped hats".
  }
}

// allItems represents all items we could potentially equip.
// We only consider items that are currently in inventory and can be equipped.
const allItems: Item[] = Item.all().filter((i) => (have(i) || npcPrice(i) > 0) && canEquip(i));

export const allHats = have($familiar`Mad Hatrack`)
  ? allItems.filter((i) => toSlot(i) === $slot`hat`)
  : [beret];
export const allPants = allItems.filter((i) => toSlot(i) === $slot`pants`);
export const allShirts = allItems.filter((i) => toSlot(i) === $slot`shirt`);

function beretPowerSum(): number[] {
  const [hatMultiplier, pantsMultiplier] = multipliers();
  let hatPowerContributions: number[]; // Represents the total power contribution from hats for a given scenario

  if (myPath() === $path`Hat Trick`) {
    // On Hat Trick, calculate base power from currently equipped hats.
    let totalEquippedHatBasePower = 0;
    for (const item of allItems) {
      if (toSlot(item) === $slot`hat` && equippedAmount(item) > 0) {
        totalEquippedHatBasePower += getPower(item);
      }
    }
    const baseEquippedHatPowerContribution = hatMultiplier * totalEquippedHatBasePower;

    // Candidate hats to add: from allHats (items we have or can buy, and canEquip),
    // and are not currently equipped (i.e., equippedAmount === 0).
    const candidateHatsToAdd = allHats.filter((h) => equippedAmount(h) === 0);

    const uniqueHatPowerContributions = new Set<number>();

    // Scenario 1: Using only currently equipped hats (no additional hat is actively chosen here to add to base)
    uniqueHatPowerContributions.add(baseEquippedHatPowerContribution);

    // Scenario 2: Adding one additional unequipped hat from candidates to the base power
    for (const hatToAdd of candidateHatsToAdd) {
      uniqueHatPowerContributions.add(
        baseEquippedHatPowerContribution + hatMultiplier * getPower(hatToAdd)
      );
    }
    hatPowerContributions = Array.from(uniqueHatPowerContributions);
  } else {
    // Standard behavior: consider all available hats individually
    hatPowerContributions = [...new Set(allHats.map((i) => hatMultiplier * getPower(i)))];
  }

  const pantsPowers = [...new Set(allPants.map((i) => pantsMultiplier * getPower(i)))];
  const shirtPowers = [...new Set(allShirts.map((i) => getPower(i)))];

  return [
    ...new Set(
      hatPowerContributions.flatMap((hatPContribution) =>
        pantsPowers.flatMap((pantP) =>
          shirtPowers.flatMap((shirtP) => hatPContribution + pantP + shirtP)
        )
      )
    ),
  ];
}
