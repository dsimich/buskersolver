import { Args } from "grimoire-kolmafia";
import {
  Busk,
  equipBuskOutfit,
  findTopBusksFast,
  printBuskResult,
  reconstructOutfit,
} from "./utils";
import { Effect, Modifier, print, toEffect, toModifier } from "kolmafia";
import { $effects, sinceKolmafiaRevision } from "libram";

export const args = Args.create("Beret_Busk_Tester", "Be good, be kind", {
  modifiers: Args.string({
    help: `Numeric Modifiers to check; these can be singular like modifiers="Meat Drop", multiple like modifiers="Meat Drop, Familiar Weight" or weighted like modifiers="5 Meat Drop, 10 Familiar Weight"`,
    default: "Meat Drop",
  }),
  uselesseffects: Args.string({
    help: `Effects that aren't helpful for you, for instance uselesseffects="Leash of Linguini, Empathy, Thoughtful Empathy"`,
    default: "",
  }),
  allbusks: Args.boolean({
    help: `Set allbusks to "true" to check all busk levels; default behavior is only to test available busks`,
    default: false,
  }),
  busk: Args.number({
    help: `Check a specific busk by passing a number to check (1-5)`,
  }),
  checkhammertime: Args.boolean({
    help: `Pretend we have effect hammertime to widen the pants scope`,
    default: false,
  }),
  equipOutfit: Args.boolean({
    help: "Equip the outfit for the determined best busk (or specified busk).",
    default: false,
  }),
});

function parseWeightedModifiers(input: string): [Modifier, number][] {
  return input
    .split(",")
    .map((s) => s.trim())
    .map((entry) => {
      const match = entry.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const [, weightStr, modStr] = match;
        const mod = toModifier(modStr.trim());
        const weight = parseFloat(weightStr);
        if (mod && !isNaN(weight)) return [mod, weight];
      } else {
        const mod = toModifier(entry);
        if (mod) return [mod, 1]; // default weight = 1
      }
      return null;
    })
    .filter((m): m is [Modifier, number] => m !== null);
}

function parseEffects(input: string): Effect[] {
  const effectList = input
    .split(",")
    .map((entry) => toEffect(entry.trim()))
    .filter((e): e is Effect => e !== null); // Remove invalid entries
  return effectList.length > 0 ? effectList : $effects``;
}

export function main(command?: string): void {
  sinceKolmafiaRevision(28549);
  Args.fill(args, command);

  if (args.help) {
    Args.showHelp(args);
    return;
  }

  const weightedModifiers = parseWeightedModifiers(args.modifiers);
  const uselesseffects = parseEffects(args.uselesseffects);

  const result = findTopBusksFast(weightedModifiers, uselesseffects, args.busk);

  print(
    `DEBUG: Parsed modifiers = ${weightedModifiers.map(([m, w]) => `${w}×${m.name}`).join(", ")}`
  );
  printBuskResult(
    result,
    weightedModifiers.map(([m]) => m)
  );

  if (args.equipOutfit && result && result.busks.length > 0) {
    let buskToEquipFor: Busk | undefined = undefined;

    // Sort busks by index to ensure consistent selection
    const busksSortedByIndex = [...result.busks].sort((a, b) => a.buskIndex - b.buskIndex);

    if (args.busk !== undefined) {
      // User specified a busk number
      buskToEquipFor = busksSortedByIndex.find((b) => b.buskIndex === (args.busk as number) - 1);
      if (!buskToEquipFor) {
        print(
          `Could not find data for busk ${args.busk} to equip. Ensure it's an available busk number.`,
          "red"
        );
      }
    } else {
      // No specific busk chosen, pick the first available (lowest index)
      if (busksSortedByIndex.length > 0) {
        buskToEquipFor = busksSortedByIndex[0];
      }
    }

    if (buskToEquipFor) {
      print(
        `Equipping outfit for Busk ${buskToEquipFor.buskIndex + 1} (Power ${
          buskToEquipFor.daRaw
        })...`,
        "blue"
      );
      const { hats, shirt, pants } = reconstructOutfit(buskToEquipFor.daRaw);
      equipBuskOutfit(hats, shirt, pants);
    } else if (args.busk === undefined && busksSortedByIndex.length === 0) {
      print("No busks found in results to equip for.", "yellow");
    }
  }
}
