// SPDX-License-Identifier: MIT
import path from 'node:path';
import { fieldText, flattenHierarchy } from '../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/records.js';
import { componentDesignator } from '../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/components.js';
import { applyChannelFormat } from './channels.mjs';

const key = text => String(text ?? '').trim().toUpperCase();
const uidKey = text => String(text ?? '').split(/[\\/]+/).filter(Boolean).map(key).join('/');
const basename = text => path.posix.basename(String(text).replaceAll('\\', '/')).toLowerCase();

export function parseAnnotation(text, source) {
  if (text.includes('\0') || text.includes('\ufffd')) throw new Error(`Unsupported annotation encoding: ${source}`);
  const rows = new Map();
  let active = false;
  for (const raw of text.replace(/^\ufeff/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { active = /^\[DesignatorManager\]$/i.test(line); continue; }
    if (!active) continue;
    const match = /^(LogicalDesignator|LogicalPartID|DocumentName|ChannelName|UniqueID|PhysicalDesignator)(\d+)=(.*)$/i.exec(line);
    if (!match) continue;
    const row = rows.get(match[2]) ?? { source, row: match[2] };
    const field = match[1].toLowerCase();
    if (field in row && row[field] !== match[3]) throw new Error(`Conflicting annotation field: ${source}:${match[2]}`);
    row[field] = match[3].trim();
    rows.set(match[2], row);
  }
  return [...rows.values()].map(row => {
    for (const field of ['logicaldesignator', 'logicalpartid', 'documentname', 'uniqueid', 'physicaldesignator']) {
      if (!row[field]) throw new Error(`Incomplete physical annotation ${source}:${row.row}: ${field}`);
    }
    return { ...row, uid: uidKey(row.uniqueid), document: basename(row.documentname) };
  });
}

export async function readAnnotations(files, projectPath, projectText) {
  const paths = new Set();
  for (const line of projectText.split(/\r?\n/)) {
    const raw = line.match(/^\s*DocumentPath=(.+)$/i)?.[1];
    if (!raw) continue;
    const relative = raw.trim().replace(/^"+|"+$/g, '').split('|')[0].trim().replaceAll('\\', '/');
    if (relative.toLowerCase().endsWith('.annotation')) paths.add(path.resolve(path.dirname(projectPath), relative));
  }
  const adjacent = path.resolve(path.dirname(projectPath), path.parse(projectPath).name + '.Annotation');
  if (await files.exists(adjacent)) paths.add(adjacent);
  const rows = [];
  for (const p of paths) rows.push(...parseAnnotation((await files.readFile(p)).toString('utf8'), p));
  return { rows, used: new Set(), identities: [], parts: new Map() };
}

/** Apply source identity before extracting nets, so both parts and pin-named nets stay distinct. */
export function instantiateRead(read, instance, annotation, format, repeated) {
  const copy = structuredClone(read);
  const chain = (instance?.path ?? []).map(level => fieldText(level.placement.symbol, 'UniqueID'));
  for (const part of flattenHierarchy(copy.hierarchical)) {
    if (part.RECORD !== '1') continue;
    const logical = componentDesignator(part);
    if (!logical) continue;
    const id = fieldText(part, 'UniqueID');
    const partId = fieldText(part, 'CurrentPartId') ?? '1';
    const uid = chain.every(Boolean) && id ? uidKey([...chain, id].join('/')) : undefined;
    const candidates = annotation.rows.filter(row => uid && row.uid === uid && row.document === read.name &&
      row.logicalpartid === partId && key(row.logicaldesignator) === key(logical));
    let exact = candidates.length > 1
      ? candidates.filter(row => key(row.channelname) === key(instance?.room)) : candidates;
    let migrated = false;
    // A sheet symbol can be replaced while its component IDs and named channel survive.
    // Require all of those independent fields; never fall back to a bare reference.
    if (!exact.length && id) {
      exact = annotation.rows.filter(row => row.uid.split('/').at(-1) === key(id) &&
        row.document === read.name && row.logicalpartid === partId &&
        key(row.logicaldesignator) === key(logical) && key(row.channelname) === key(instance?.room));
      migrated = exact.length > 0;
    }
    if (exact.length > 1) throw new Error(`Ambiguous physical annotation for ${read.name}:${logical}:${uid}`);
    const mapped = exact[0];
    const physical = mapped?.physicaldesignator ?? (repeated
      ? applyChannelFormat(format, logical, instance.room, instance.ordinal) : logical);
    if (mapped) {
      if (annotation.used.has(mapped)) throw new Error(`Annotation row reused across instances: ${mapped.source}:${mapped.row}`);
      annotation.used.add(mapped);
    }
    const identity = `${instance?.key ?? read.name}/${id ?? part.index}`;
    const packagePart = `${key(physical)}:${partId}`;
    const previous = annotation.parts.get(packagePart);
    if (previous && previous !== identity) throw new Error(`Physical designator collision for ${physical} part ${partId}; supply complete annotation`);
    annotation.parts.set(packagePart, identity);
    annotation.identities.push({ refdes: physical, logical_refdes: logical, part: partId,
      document: read.path, instance: instance?.key ?? read.name, uid_path: uid ?? null,
      annotation_uid_path: mapped?.uid ?? null,
      basis: mapped ? migrated ? 'saved_annotation_component_uid_and_channel' : 'saved_annotation_uid'
        : repeated ? 'channel_format' : 'schematic_designator' });
    const designator = part.children?.find(record => record.RECORD === '34');
    if (designator) designator.Text = physical;
  }
  return copy;
}

export function verifyAnnotations(annotation) {
  const unused = annotation.rows.filter(row => !annotation.used.has(row));
  if (unused.length) throw new Error(`Unresolved physical annotation rows: ${unused.map(row => `${row.source}:${row.row}`).join(', ')}`);
}
