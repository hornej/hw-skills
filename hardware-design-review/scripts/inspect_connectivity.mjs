#!/usr/bin/env node
/** Saved-source evidence through Universal Netlist's library, without a server or auto-updater. */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createNetlistService, loadNetlist } from '@intelligentelectron/universal-netlist/service';

const PIN = '1.14.4';
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function membership(netlist) {
  const result = [];
  for (const [refdes, component] of Object.entries(netlist.components)) {
    for (const [pin, entry] of Object.entries(component.pins)) {
      result.push({ refdes, pin, net: typeof entry === 'string' ? entry : entry.net });
    }
  }
  return result.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
}

export function compareMembership(actual, expected) {
  if (!Array.isArray(expected) || !expected.length) throw new Error('Comparison requires a nonempty connections array');
  const key = row => {
    if (!row || ['refdes', 'pin', 'net'].some(k => typeof row[k] !== 'string' || !row[k])) {
      throw new Error('Every comparison row needs nonempty refdes, pin and net strings');
    }
    return JSON.stringify([row.refdes, row.pin, row.net]);
  };
  const a = new Map(actual.map(row => [key(row), row]));
  const e = new Map(expected.map(row => [key(row), row]));
  if (e.size !== expected.length) throw new Error('Comparison contains duplicate pin memberships');
  const missing = [...e].filter(([k]) => !a.has(k)).map(([, row]) => row);
  const extra = [...a].filter(([k]) => !e.has(k)).map(([, row]) => row);
  return { status: missing.length || extra.length ? 'different' : 'matches_supplied_membership', missing, extra };
}

export async function inspectConnectivity(design, variant, comparisonPath) {
  const packagePath = fileURLToPath(new URL('../node_modules/@intelligentelectron/universal-netlist/package.json', import.meta.url));
  const version = JSON.parse(await readFile(packagePath, 'utf8')).version;
  if (version !== PIN) throw new Error(`Expected universal-netlist ${PIN}, found ${version}`);
  const reads = new Map(), probes = new Map(), readErrors = new Map();
  const files = {
    async readFile(filename) {
      const absolute = path.resolve(filename);
      let bytes;
      try { bytes = await readFile(absolute); }
      catch (error) {
        if (error.code === 'ENOENT') probes.set(absolute, false);
        else readErrors.set(absolute, error.message);
        throw error;
      }
      const hash = sha256(bytes);
      if (reads.has(absolute) && reads.get(absolute).sha256 !== hash) throw new Error(`Source changed: ${absolute}`);
      reads.set(absolute, { path: absolute, sha256: hash, bytes: bytes.length });
      return bytes;
    },
    async exists(filename) {
      const absolute = path.resolve(filename);
      try { await stat(absolute); probes.set(absolute, true); return true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; probes.set(absolute, false); return false; }
    },
    listDir: filename => readdir(filename, { withFileTypes: true }),
  };
  // The engine's discovery skips missing/non-OLE/absolute project entries and can
  // fall back to directory discovery. Refuse that partial scope for Altium evidence.
  if (path.extname(design).toLowerCase() === '.prjpcb') {
    const projectBytes = await files.readFile(design);
    const projectText = projectBytes.toString('utf8');
    if (projectText.includes('\ufffd') || projectText.includes('\0')) throw new Error('Unsupported Altium project text encoding');
    let declared = 0;
    for (const line of projectText.split(/\r?\n/)) {
      const raw = line.match(/^\s*DocumentPath=(.+)$/i)?.[1];
      if (!raw) continue;
      const relative = raw.trim().replace(/^"+|"+$/g, '').split('|')[0].trim().replaceAll('\\', '/');
      if (!relative.toLowerCase().endsWith('.schdoc')) continue;
      declared++;
      if (path.win32.isAbsolute(relative) || path.posix.isAbsolute(relative)) {
        throw new Error(`Altium project uses an absolute SchDoc path unsupported by the engine: ${relative}`);
      }
      const filename = path.resolve(path.dirname(design), relative);
      const bytes = await files.readFile(filename);
      if (!bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) {
        throw new Error(`Declared SchDoc is not a supported OLE document: ${filename}`);
      }
    }
    if (!declared) throw new Error('Project declares no SchDoc files; directory fallback cannot establish project scope');
  }
  const service = createNetlistService({ files, cache: false, kicadCli: false });
  const parsed = await loadNetlist(path.resolve(design), variant, service.context);
  if ('error' in parsed) throw new Error(parsed.error);
  if (readErrors.size) throw new Error(`Unreadable source dependencies: ${JSON.stringify([...readErrors])}`);
  if (!Object.keys(parsed.components).length) throw new Error('Parser returned no components; connectivity coverage is empty');
  const connections = membership(parsed);
  if (!connections.length) throw new Error('Parser returned no pins; connectivity coverage is empty');
  let comparison = { status: 'not_supplied' };
  if (comparisonPath) {
    const bytes = await files.readFile(comparisonPath);
    const expected = JSON.parse(bytes.toString('utf8'));
    const designSource = reads.get(path.resolve(design));
    if (!expected.source || typeof expected.source !== 'string' ||
        expected.design_sha256 !== designSource?.sha256 || expected.design_variant !== parsed.design_variant) {
      throw new Error('Comparison must name its evidence source, exact design_sha256 and resolved design_variant');
    }
    comparison = { ...compareMembership(connections, expected.connections), evidence_source: expected.source,
                   note: 'Membership comparison only; native provenance and compile freshness require independent verification' };
  }
  for (const source of reads.values()) {
    if (sha256(await readFile(source.path)) !== source.sha256) throw new Error(`Source changed: ${source.path}`);
  }
  for (const [filename, existed] of probes) {
    let exists;
    try { await stat(filename); exists = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
    if (exists !== existed) throw new Error(`Source dependency changed: ${filename}`);
  }
  return { schema_version: 1, generated_at: new Date().toISOString(),
    engine: { name: '@intelligentelectron/universal-netlist', version },
    design: path.resolve(design), design_variant: parsed.design_variant, format: parsed.format,
    sources: [...reads.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')),
    components: parsed.components, nets: parsed.nets, connections,
    ...(parsed.netLabelSources ? { net_label_sources: parsed.netLabelSources } : {}), comparison,
    coverage: { saved_pin_net_membership: 'parsed', source_stability: 'unchanged',
      physical_instance_mapping: 'parser_derived_not_native_verified',
      unconnected_pin_semantics: 'engine_normalizes_unconnected_to_NC',
      native_compile: 'not_run', native_membership_equivalence: 'not_verified',
      pcb_geometry: 'not_read', electrical_qualification: 'not_performed' } };
}

async function main() {
  try {
    const { values } = parseArgs({ options: { design: { type: 'string' }, variant: { type: 'string' },
      out: { type: 'string' }, compare: { type: 'string' }, help: { type: 'boolean' } } });
    if (values.help) {
      console.log('node inspect_connectivity.mjs --design Board.PrjPcb --variant Assembly --out new-report.json [--compare membership.json]');
      return;
    }
    if (!values.design || !values.out) throw new Error('--design and --out are required');
    // Check early and use exclusive creation below as the definitive overwrite guard.
    try { await stat(values.out); throw new Error(`Output already exists: ${values.out}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const report = await inspectConnectivity(values.design, values.variant, values.compare);
    if (report.sources.some(s => path.resolve(s.path) === path.resolve(values.out))) throw new Error('Output aliases a source');
    await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({ report: path.resolve(values.out), components: Object.keys(report.components).length,
      nets: Object.keys(report.nets).length, pins: report.connections.length, comparison: report.comparison.status }));
    if (report.comparison.status === 'different') process.exitCode = 1;
  } catch (error) { console.error(`Connectivity inspection failed: ${error.message}`); process.exitCode = 2; }
}
if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) await main();
