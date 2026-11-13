// SPDX-License-Identifier: Apache-2.0
// Derived from Universal Netlist 1.14.4 by Valentino Zegna / IntelligentElectron.
// Modified: physical annotation before extraction and collision-safe hierarchy.
// See ../../THIRD_PARTY.md and ../../vendor/universal-netlist/LICENSE.
/**
 * An Altium project: every document instance parsed, and the instances merged into one
 * netlist across harnesses, ports, sheet entries, buses and power ports.
 */
import { readAnnotations, instantiateRead, verifyAnnotations } from "./annotation.mjs";
import { pinDesignator, pinNumber } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/components.js";
import { nodeFileReader, readText } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/context.js";
import { RECORD_TYPES } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/types.js";
import { fieldText, flattenHierarchy } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/records.js";
import { identifierKey } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/notation.js";
import { findAltiumSchDocs } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/discovery.js";
import { netLabelsAreGlobal, parseProjectOptions, powerPortsAreGlobal, resolveNetIdentifierScope, } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/project-options.js";
import { applyAltiumVariant, parseAltiumProjectVariants } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/project-variants.js";
import { nameRanks } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/net-naming.js";
import { collectNestedHarnessTypes, parseHarnessDefinitions } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/harness.js";
import { parseDocument, readDocument, renameDocumentNets, } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/document.js";
import { documentInstances, findSheetPlacements, } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/sheet-hierarchy.js";
import { channelDocument, channelNetScope, sharedEntryNames } from "./channels.mjs";
import { linkedNetGroups } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/links.js";
import { resolveBundles } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/bundles.js";
import { planLocalNetRenames } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/net-scoping.js";
import { LOCAL, PROVISIONAL, restoreLocalNames, applyNetRenames, canonicalNetName, mergeNetGroups, mergeNetlistInto, reconcileNetlist, settleProvisionalNames, } from "../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/netlist.js";
/** A sheet's `.Harness` file beside it, or no definitions. */
const readHarnessDefinitions = async (files, schdocPath) => {
    try {
        return parseHarnessDefinitions(await readText(files, schdocPath.replace(/\.SchDoc$/i, ".Harness")));
    }
    catch {
        return new Map();
    }
};
// The upstream query model discards isolated pins. Native compiled membership names
// them, so retain the extractor's generated singleton names as separate evidence.
const parseInstanceDocument = (read, naming, placement) => {
    const document = parseDocument(read, naming, placement);
    for (const net of document.nets) {
        if (!net.name || net.devices.length !== 1 || net.devices[0].RECORD !== RECORD_TYPES.PIN) continue;
        const pin = net.devices[0];
        const refdes = pinDesignator(pin, read.hierarchical), number = pinNumber(pin);
        const component = document.netlist.components[refdes];
        if (!component || !number || component.pins[number] === undefined) continue;
        const entry = component.pins[number];
        if (typeof entry === 'string') component.pins[number] = net.name;
        else entry.net = net.name;
        (document.netlist.nets[net.name] ??= {})[refdes] = [number];
    }
    return document;
};
const isHierarchical = scope => scope === 'hierarchical' || scope === 'strict-hierarchical';
const localPowerGroups = (document, strict = false) => document.links.filter(group =>
    group.keys.some(key => key.startsWith('power|')) && (strict || group.keys.some(key => key.startsWith('hier|'))));
/**
 * Parse each document once per instance. The channels of one symbol under a parent with
 * one instance share the signals the symbol's plain entries carry; no other instances
 * share anything by name.
 */
const parseInstances = async (files, documents, placements, instances, naming, channelFormat, scope, annotation) => {
    const parsed = [];
    for (const read of documents) {
        const channels = instances.get(read.name) ?? [];
        if (channels.length <= 1) {
            parsed.push(parseInstanceDocument(instantiateRead(read, channels[0], annotation, channelFormat, false), naming, channels[0]?.key));
            continue;
        }
        const placed = placements.get(read.name) ?? [];
        const [{ parent, symbol }] = placed;
        const sharedNames = placed.length === 1 && (instances.get(parent.name) ?? []).length <= 1
            ? sharedEntryNames(symbol, await readHarnessDefinitions(files, parent.path), collectNestedHarnessTypes(flattenHierarchy(parent.hierarchical)))
            : new Set();
        for (const channel of channels) {
            const physical = parseInstanceDocument(instantiateRead(read, channel, annotation, channelFormat, true), naming);
            const physicalScope = channelNetScope(physical.nets, sharedNames, powerPortsAreGlobal(scope));
            if (isHierarchical(scope)) for (const group of localPowerGroups(physical, scope === 'strict-hierarchical')) {
                physicalScope.powerNetNames.delete(group.net ?? group.name);
            }
            parsed.push(channelDocument(physical, channel, channelFormat, physicalScope, true));
        }
    }
    verifyAnnotations(annotation);
    return parsed;
};
/** Give names that differ only in case the one spelling the merged net would keep. */
const unifySpellings = (documents, ranks, unranked) => {
    const rank = new Map();
    for (const document of documents) {
        for (const [name, source] of document.nameSources) {
            if (source !== "pin")
                rank.set(name, Math.min(rank.get(name) ?? unranked, ranks[source]));
        }
    }
    const spellings = new Map();
    for (const name of rank.keys()) {
        const key = identifierKey(name);
        (spellings.get(key) ?? spellings.set(key, []).get(key)).push(name);
    }
    const respell = new Map();
    for (const names of spellings.values()) {
        const canonical = canonicalNetName(names, (name) => rank.get(name));
        for (const name of names)
            if (name !== canonical)
                respell.set(name, canonical);
    }
    for (const document of documents)
        renameDocumentNets(document, respell, ranks);
};
/** Parse an Altium project into one netlist. */
export const parseAltiumProject = async (projectPath, parseOptions) => {
    const files = parseOptions?.context?.files ?? nodeFileReader;
    const schdocPaths = await findAltiumSchDocs(projectPath, files);
    if (schdocPaths.length === 0) {
        throw new Error(`No schematic documents found for project ${projectPath}`);
    }
    const projectText = await readText(files, projectPath);
    const options = parseProjectOptions(projectText);
    const annotation = await readAnnotations(files, projectPath, projectText);
    if (annotation.rows.length && parseAltiumProjectVariants(projectText).length) {
        throw new Error('Physical annotation with assembly variants requires native qualification; use a native compiled export');
    }
    const naming = {
        allowPortNetNames: options.allowPortNetNames,
        powerPortNamesTakePriority: options.powerPortNamesTakePriority,
    };
    const ranks = nameRanks(naming);
    const unranked = ranks.pin + 1;
    const documents = await Promise.all(schdocPaths.map(async (schdocPath) => readDocument(schdocPath, await files.readFile(schdocPath))));
    if (new Set(documents.map(d => d.name)).size !== documents.length) {
        throw new Error('Duplicate schematic basenames make hierarchy ambiguous; use distinct document names');
    }
    const shape = { hasSheetEntries: false, hasPorts: false };
    const powerNames = new Set();
    for (const document of documents) {
        for (const record of flattenHierarchy(document.hierarchical)) {
            if (record.RECORD === RECORD_TYPES.SHEET_ENTRY)
                shape.hasSheetEntries = true;
            else if (record.RECORD === RECORD_TYPES.PORT)
                shape.hasPorts = true;
            else if (record.RECORD === RECORD_TYPES.POWER_PORT) {
                powerNames.add(identifierKey(fieldText(record, "Text") ?? ""));
            }
        }
    }
    const scope = resolveNetIdentifierScope(options, shape);
    const placements = findSheetPlacements(documents);
    const known = new Set(documents.map(d => d.name));
    for (const child of placements.keys()) if (!known.has(child)) throw new Error(`Missing hierarchy sheet: ${child}`);
    const complete = new Set();
    const visit = (name, visiting = new Set()) => {
        if (visiting.has(name)) throw new Error(`Cyclic sheet hierarchy: ${name}`);
        if (complete.has(name)) return;
        for (const placement of placements.get(name) ?? []) visit(placement.parent.name, new Set(visiting).add(name));
        complete.add(name);
    };
    for (const name of known) visit(name);
    const instances = documentInstances(documents, placements, options.roomNamingStyle);
    const pending = await parseInstances(files, documents, placements, instances, naming, options.channelFormat, scope, annotation);
    const supplies = new Set();
    if (powerPortsAreGlobal(scope)) for (const document of pending) {
        const local = new Set((isHierarchical(scope) ? localPowerGroups(document) : [])
            .flatMap(g => g.keys.filter(k => k.startsWith('power|'))).map(identifierKey));
        for (const group of document.links) for (const k of group.keys) {
            if (k.startsWith('power|') && !local.has(identifierKey(k))) supplies.add(identifierKey(k.slice(6)));
        }
    }
    unifySpellings(pending, ranks, unranked);
    // Same-named local nets on different sheets are one net unless the project numbers them.
    const sheetRenames = options.appendSheetNumberToLocalNets
        ? planLocalNetRenames(pending, scope, supplies)
        : pending.map(() => new Map());
    // Until links resolve, a name a port or entry gives under Hierarchical scope is its
    // sheet's own, and so is a local net label or supply: nets merge by these names only
    // after links join what they will.
    const namesAreSheetLocal = scope === "hierarchical" || scope === "strict-hierarchical";
    // A label spelled as a global supply names that supply.
    const localName = (name, source) => (source === "label" && !netLabelsAreGlobal(scope) && !supplies.has(identifierKey(name))) ||
        (source === "power" && !powerPortsAreGlobal(scope));
    const netlist = { nets: {}, components: {} };
    const nameRank = new Map();
    const rankOf = (name) => nameRank.get(name) ?? unranked;
    const pinNames = new Set();
    pending.forEach((document, index) => {
        const renames = new Map(sheetRenames[index]);
        // A power object wired to a port loses global scope in a hierarchical design.
        // Its only cross-sheet route is the explicit port/sheet-entry connection.
        const localGroups = isHierarchical(scope) ? localPowerGroups(document, scope === 'strict-hierarchical') : [];
        const localPower = new Set(localGroups.map(group => group.net ?? group.name));
        const localPowerKeys = new Set(localGroups.flatMap(group => group.keys.filter(key => key.startsWith('power|'))).map(identifierKey));
        document.links = document.links.map(group => ({ ...group, keys: group.keys.filter(key =>
            !localPowerKeys.has(identifierKey(key.replace(/^label\|/, 'power|')))) }));
        for (const [name, source] of document.nameSources) {
            const renamed = renames.get(name) ?? name;
            if ((namesAreSheetLocal && source === "port") || localPower.has(name)) {
                renames.set(name, `${renamed}${PROVISIONAL}${index}`);
            }
            else if (localName(name, source)) {
                renames.set(name, `${renamed}${LOCAL}${index}`);
            }
        }
        renameDocumentNets(document, renames, ranks);
        mergeNetlistInto(netlist, document.netlist);
        for (const [name, source] of document.nameSources) {
            if (ranks[source] < rankOf(name))
                nameRank.set(name, ranks[source]);
            if (source === "pin")
                pinNames.add(name);
        }
    });
    const symbolChannels = new Map();
    for (const placed of placements.values()) {
        for (const { parent, symbol, channels } of placed) {
            symbolChannels.set(`${parent.name}#${symbol.index}`, channels.map((channel) => channel.index));
        }
    }
    const resolveSignal = resolveBundles(pending, scope, symbolChannels);
    const links = pending.map((document) => ({
        placement: document.placement,
        document: document.name,
        groups: document.links.map((group) => ({
            ...group,
            keys: group.keys.map((key) => key.startsWith("harness|")
                ? `harness|${resolveSignal(document, key.slice("harness|".length))}`
                : key),
        })),
    }));
    mergeNetGroups(netlist, linkedNetGroups(links, scope, symbolChannels, supplies).values(), rankOf, (name) => pinNames.has(name));
    applyNetRenames(netlist, restoreLocalNames(netlist.nets));
    applyNetRenames(netlist, settleProvisionalNames(netlist.nets));
    reconcileNetlist(netlist);
    applyAltiumVariant(netlist.components, parseAltiumProjectVariants(projectText), parseOptions?.variant);
    return { ...netlist, physical_identities: annotation.identities };
};
